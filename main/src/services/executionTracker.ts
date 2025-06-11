import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger';
import type { SessionManager } from './sessionManager';
import { GitDiffManager, type GitDiffResult } from './gitDiffManager';
import type { CreateExecutionDiffData } from '../database/models';
import { execSync } from '../utils/commandExecutor';

interface ExecutionContext {
  sessionId: string;
  worktreePath: string;
  promptMarkerId?: number;
  beforeCommitHash: string;
  executionSequence: number;
  prompt?: string;
}

export class ExecutionTracker extends EventEmitter {
  private activeExecutions: Map<string, ExecutionContext> = new Map();

  constructor(
    private sessionManager: any,
    private gitDiffManager: GitDiffManager,
    private logger?: Logger
  ) {
    super();
  }

  /**
   * Start tracking a new prompt execution
   */
  async startExecution(sessionId: string, worktreePath: string, promptMarkerId?: number, prompt?: string): Promise<void> {
    try {
      this.logger?.verbose(`Starting execution tracking for session ${sessionId}`);
      
      // Get next execution sequence
      const executionSequence = await this.sessionManager.getNextExecutionSequence(sessionId);
      
      // Capture the current commit hash as the starting point
      const beforeCommitHash = this.gitDiffManager.getCurrentCommitHash(worktreePath);
      this.logger?.verbose(`Starting from commit: ${beforeCommitHash}`);
      
      const context: ExecutionContext = {
        sessionId,
        worktreePath,
        promptMarkerId,
        beforeCommitHash,
        executionSequence,
        prompt
      };
      
      this.activeExecutions.set(sessionId, context);
      this.emit('execution-started', { sessionId, executionSequence });
      
    } catch (error) {
      this.logger?.error(`Failed to start execution tracking for session ${sessionId}:`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * End execution tracking and capture final diff
   */
  async endExecution(sessionId: string): Promise<void> {
    try {
      const context = this.activeExecutions.get(sessionId);
      if (!context) {
        this.logger?.warn(`No active execution found for session ${sessionId}`);
        return;
      }

      this.logger?.verbose(`Ending execution tracking for session ${sessionId}`);
      
      // Auto-commit any uncommitted changes
      try {
        // Check if there are uncommitted changes
        const statusOutput = execSync('git status --porcelain', { 
          cwd: context.worktreePath, 
          encoding: 'utf8' 
        }).trim();
        
        if (statusOutput) {
          this.logger?.verbose(`Found uncommitted changes, auto-committing...`);
          
          // Stage all changes
          execSync('git add -A', { cwd: context.worktreePath });
          
          // Create commit message from prompt or use default
          const commitMessage = context.prompt || `Claude Code execution ${context.executionSequence}`;
          
          // Commit with the prompt as the message
          execSync(`git commit -m ${JSON.stringify(commitMessage)}`, { cwd: context.worktreePath });
          
          this.logger?.verbose(`Auto-committed changes with message: ${commitMessage}`);
        }
      } catch (commitError: any) {
        this.logger?.error(`Failed to auto-commit changes:`, commitError instanceof Error ? commitError : undefined);
        
        // Add error to session output so users can see what went wrong
        const errorDetails = commitError.stderr || commitError.stdout || commitError.message || 'Unknown error';
        const timestamp = new Date().toLocaleTimeString();
        
        const errorMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[41m\x1b[37m ❌ GIT COMMIT FAILED \x1b[0m\r\n` +
                           `\x1b[91mFailed to auto-commit changes during Claude Code execution.\x1b[0m\r\n` +
                           `\x1b[91mThis usually means a pre-commit hook failed.\x1b[0m\r\n\r\n` +
                           `\x1b[90mCommand: git commit -m "${context.prompt || `Claude Code execution ${context.executionSequence}`}"\x1b[0m\r\n\r\n` +
                           `\x1b[91mError output:\x1b[0m\r\n${errorDetails}\r\n\r\n` +
                           `\x1b[93m⚠️  Changes remain uncommitted. You may need to fix the issues and commit manually.\x1b[0m\r\n\r\n`;
        
        this.sessionManager.addSessionOutput(sessionId, {
          type: 'stderr',
          data: errorMessage,
          timestamp: new Date()
        });
        
        // Continue with diff capture even if commit fails
      }
      
      // Get the current commit hash after auto-commit
      const afterCommitHash = this.gitDiffManager.getCurrentCommitHash(context.worktreePath);
      
      let executionDiff: GitDiffResult;
      
      // Always get the diff between the before and after commits
      if (afterCommitHash === context.beforeCommitHash) {
        // No changes at all
        executionDiff = await this.gitDiffManager.captureWorkingDirectoryDiff(context.worktreePath);
        this.logger?.verbose(`No changes made during execution`);
      } else {
        // Get the diff between commits
        executionDiff = await this.gitDiffManager.captureCommitDiff(
          context.worktreePath, 
          context.beforeCommitHash, 
          afterCommitHash
        );
        this.logger?.verbose(`Captured diff between commits ${context.beforeCommitHash} and ${afterCommitHash}`);
      }
      
      // Always create execution diff record, even if there are no changes
      const diffData: CreateExecutionDiffData = {
        session_id: sessionId,
        prompt_marker_id: context.promptMarkerId,
        execution_sequence: context.executionSequence,
        git_diff: executionDiff.diff,
        files_changed: executionDiff.changedFiles,
        stats_additions: executionDiff.stats.additions,
        stats_deletions: executionDiff.stats.deletions,
        stats_files_changed: executionDiff.stats.filesChanged,
        before_commit_hash: executionDiff.beforeHash,
        after_commit_hash: executionDiff.afterHash
      };

      const createdDiff = await this.sessionManager.createExecutionDiff(diffData);
      
      if (executionDiff.stats.filesChanged > 0) {
        this.logger?.verbose(`Created execution diff ${createdDiff.id}: ${createdDiff.stats_files_changed} files, +${createdDiff.stats_additions} -${createdDiff.stats_deletions}`);
      } else {
        this.logger?.verbose(`Created execution diff ${createdDiff.id} with no changes for execution ${context.executionSequence} in session ${sessionId}`);
      }
      
      this.emit('execution-completed', { 
        sessionId, 
        executionSequence: context.executionSequence,
        diffId: createdDiff.id,
        stats: executionDiff.stats
      });
      
      this.activeExecutions.delete(sessionId);
      
    } catch (error) {
      this.logger?.error(`Failed to end execution tracking for session ${sessionId}:`, error instanceof Error ? error : undefined);
      this.activeExecutions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Cancel execution tracking (e.g., if Claude Code process fails)
   */
  cancelExecution(sessionId: string): void {
    const context = this.activeExecutions.get(sessionId);
    if (context) {
      this.logger?.verbose(`Cancelling execution tracking for session ${sessionId}`);
      this.activeExecutions.delete(sessionId);
      this.emit('execution-cancelled', { sessionId, executionSequence: context.executionSequence });
    }
  }

  /**
   * Check if execution is being tracked for a session
   */
  isTracking(sessionId: string): boolean {
    return this.activeExecutions.has(sessionId);
  }

  /**
   * Get execution context for a session
   */
  getExecutionContext(sessionId: string): ExecutionContext | undefined {
    return this.activeExecutions.get(sessionId);
  }

  /**
   * Get combined diff for multiple executions
   */
  async getCombinedDiff(sessionId: string, executionIds?: number[]): Promise<GitDiffResult> {
    const executions = await this.sessionManager.getExecutionDiffs(sessionId);
    
    // Commented out verbose logging
    // console.log(`[ExecutionTracker] getCombinedDiff for session ${sessionId}, found ${executions.length} executions`);
    
    let filteredExecutions = executions;
    if (executionIds && executionIds.length > 0) {
      filteredExecutions = executions.filter((exec: any) => executionIds.includes(exec.id));
      // console.log(`[ExecutionTracker] Filtered to ${filteredExecutions.length} executions`);
    }
    
    const diffs: GitDiffResult[] = filteredExecutions
      .filter((exec: any) => exec.git_diff) // Only include executions with actual diffs
      .map((exec: any) => ({
        diff: exec.git_diff!,
        stats: {
          additions: exec.stats_additions,
          deletions: exec.stats_deletions,
          filesChanged: exec.stats_files_changed
        },
        changedFiles: exec.files_changed || [],
        beforeHash: exec.before_commit_hash,
        afterHash: exec.after_commit_hash
      }));
    
    // console.log(`[ExecutionTracker] Found ${diffs.length} diffs to combine`);
    
    return this.gitDiffManager.combineDiffs(diffs);
  }

  async getExecutionDiffs(sessionId: string): Promise<any[]> {
    const diffs = await this.sessionManager.getExecutionDiffs(sessionId);
    // Commented out verbose logging
    // console.log(`[ExecutionTracker] getExecutionDiffs returned ${diffs.length} diffs for session ${sessionId}`);
    // if (diffs.length > 0) {
    //   console.log(`[ExecutionTracker] First diff:`, {
    //     id: diffs[0].id,
    //     hasGitDiff: !!diffs[0].git_diff,
    //     gitDiffLength: diffs[0].git_diff?.length || 0,
    //     stats: {
    //       additions: diffs[0].stats_additions,
    //       deletions: diffs[0].stats_deletions,
    //       filesChanged: diffs[0].stats_files_changed
    //     }
    //   });
    // }
    return diffs;
  }
}
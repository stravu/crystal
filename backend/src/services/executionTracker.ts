import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger';
import type { SessionManager } from './sessionManager';
import { GitDiffManager, type GitDiffResult } from './gitDiffManager';
import type { CreateExecutionDiffData } from '../database/models';

interface ExecutionContext {
  sessionId: string;
  worktreePath: string;
  promptMarkerId?: number;
  beforeDiff?: GitDiffResult;
  executionSequence: number;
}

export class ExecutionTracker extends EventEmitter {
  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private gitDiffManager: GitDiffManager;

  constructor(
    private sessionManager: SessionManager,
    private logger?: Logger
  ) {
    super();
    this.gitDiffManager = new GitDiffManager(logger);
  }

  /**
   * Start tracking a new prompt execution
   */
  async startExecution(sessionId: string, worktreePath: string, promptMarkerId?: number): Promise<void> {
    try {
      this.logger?.verbose(`Starting execution tracking for session ${sessionId}`);
      
      // Get next execution sequence
      const executionSequence = await this.sessionManager.getNextExecutionSequence(sessionId);
      
      // Capture before state if there are any changes
      let beforeDiff: GitDiffResult | undefined;
      if (this.gitDiffManager.hasChanges(worktreePath)) {
        beforeDiff = await this.gitDiffManager.captureWorkingDirectoryDiff(worktreePath);
        this.logger?.verbose(`Captured before state: ${beforeDiff.stats.filesChanged} files changed`);
      }
      
      const context: ExecutionContext = {
        sessionId,
        worktreePath,
        promptMarkerId,
        beforeDiff,
        executionSequence
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
      
      // Capture after state
      const afterDiff = await this.gitDiffManager.captureWorkingDirectoryDiff(context.worktreePath);
      
      // If we had a before state, calculate the net diff
      // Otherwise, use the after diff as the execution diff
      let executionDiff: GitDiffResult;
      if (context.beforeDiff) {
        // For now, we'll just use the after diff
        // In the future, we might want to calculate a more sophisticated net diff
        executionDiff = afterDiff;
      } else {
        executionDiff = afterDiff;
      }
      
      // Only create execution diff if there are actual changes
      if (executionDiff.stats.filesChanged > 0) {
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
        this.logger?.verbose(`Created execution diff ${createdDiff.id}: ${createdDiff.stats_files_changed} files, +${createdDiff.stats_additions} -${createdDiff.stats_deletions}`);
        
        this.emit('execution-completed', { 
          sessionId, 
          executionSequence: context.executionSequence,
          diffId: createdDiff.id,
          stats: executionDiff.stats
        });
      } else {
        this.logger?.verbose(`No changes detected for execution ${context.executionSequence} in session ${sessionId}`);
        this.emit('execution-completed', { 
          sessionId, 
          executionSequence: context.executionSequence,
          stats: { additions: 0, deletions: 0, filesChanged: 0 }
        });
      }
      
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
    
    let filteredExecutions = executions;
    if (executionIds && executionIds.length > 0) {
      filteredExecutions = executions.filter(exec => executionIds.includes(exec.id));
    }
    
    const diffs: GitDiffResult[] = filteredExecutions
      .filter(exec => exec.git_diff) // Only include executions with actual diffs
      .map(exec => ({
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
    
    return this.gitDiffManager.combineDiffs(diffs);
  }
}
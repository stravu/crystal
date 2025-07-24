import { EventEmitter } from 'events';
import { execSync } from '../utils/commandExecutor';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Logger } from '../utils/logger';
import type { GitStatus } from '../types/session';
import type { SessionManager } from './sessionManager';
import type { WorktreeManager } from './worktreeManager';
import type { GitDiffManager } from './gitDiffManager';
import { GitStatusLogger } from './gitStatusLogger';

interface GitStatusCache {
  [sessionId: string]: {
    status: GitStatus;
    lastChecked: number;
  };
}

/**
 * Result of a git command execution
 */
interface GitCommandResult<T = string> {
  success: boolean;
  output?: T;
  error?: Error;
}

/**
 * Git diff statistics
 */
interface GitDiffStats {
  filesChanged: number;
  additions: number;
  deletions: number;
}

/**
 * Git rev-list count result
 */
interface RevListCount {
  ahead: number;
  behind: number;
}

export class GitStatusManager extends EventEmitter {
  private cache: GitStatusCache = {};
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 60000; // 60 seconds - reduced frequency to minimize unnecessary loads
  private readonly CACHE_TTL_MS = 5000; // 5 seconds cache
  private isPolling = true; // Default to true so initial poll works
  private refreshDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 500; // 500ms debounce for rapid refresh requests
  private gitLogger: GitStatusLogger;
  
  // Throttling for UI events
  private eventThrottleTimer: NodeJS.Timeout | null = null;
  private pendingEvents: Map<string, { type: 'loading' | 'updated', data?: GitStatus }> = new Map();
  private readonly EVENT_THROTTLE_MS = 100; // Throttle UI events to prevent flooding
  
  // Concurrent operation limiting
  private activeOperations = 0;
  private readonly MAX_CONCURRENT_OPERATIONS = 3;
  private operationQueue: Array<() => Promise<void>> = [];

  constructor(
    private sessionManager: SessionManager,
    private worktreeManager: WorktreeManager,
    private gitDiffManager: GitDiffManager,
    private logger?: Logger
  ) {
    super();
    this.gitLogger = new GitStatusLogger(logger);
  }

  /**
   * Execute a git command with proper error handling
   * @param command The git command to execute
   * @param cwd The working directory
   * @returns GitCommandResult with success status and output
   */
  private executeGitCommand(command: string, cwd: string): GitCommandResult<string> {
    try {
      const output = execSync(command, { cwd });
      return {
        success: true,
        output: output.toString().trim()
      };
    } catch (error) {
      // Log unexpected errors (non-git command failures)
      if (error instanceof Error && !error.message.includes('Command failed')) {
        this.logger?.error(`[GitStatus] Unexpected error executing git command: ${command}`, error);
      }
      return {
        success: false,
        error: error as Error
      };
    }
  }

  /**
   * Get untracked files in the repository
   */
  private getUntrackedFiles(cwd: string): GitCommandResult<boolean> {
    const result = this.executeGitCommand('git ls-files --others --exclude-standard', cwd);
    return {
      success: result.success,
      output: result.success && result.output ? result.output.length > 0 : false,
      error: result.error
    };
  }

  /**
   * Get ahead/behind count compared to a branch
   */
  private getRevListCount(cwd: string, baseBranch: string): GitCommandResult<RevListCount> {
    const result = this.executeGitCommand(`git rev-list --left-right --count ${baseBranch}...HEAD`, cwd);
    if (result.success && result.output) {
      const [behind, ahead] = result.output.split('\t').map(n => parseInt(n, 10));
      return {
        success: true,
        output: {
          ahead: ahead || 0,
          behind: behind || 0
        }
      };
    }
    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Get diff statistics between branches
   */
  private getDiffStats(cwd: string, baseBranch: string): GitCommandResult<GitDiffStats> {
    const result = this.executeGitCommand(`git diff --shortstat ${baseBranch}...HEAD`, cwd);
    if (result.success && result.output) {
      const statLine = result.output;
      
      // Parse the stat line: "X files changed, Y insertions(+), Z deletions(-)"
      const filesMatch = statLine.match(/(\d+) files? changed/);
      const additionsMatch = statLine.match(/(\d+) insertions?\(\+\)/);
      const deletionsMatch = statLine.match(/(\d+) deletions?\(-\)/);
      
      return {
        success: true,
        output: {
          filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
          additions: additionsMatch ? parseInt(additionsMatch[1], 10) : 0,
          deletions: deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0
        }
      };
    }
    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Check for merge conflicts in the repository
   */
  private checkMergeConflicts(cwd: string): GitCommandResult<boolean> {
    const result = this.executeGitCommand('git status --porcelain=v1', cwd);
    if (result.success && result.output) {
      const hasConflicts = result.output.includes('UU ') || result.output.includes('AA ') || 
                          result.output.includes('DD ') || result.output.includes('AU ') || 
                          result.output.includes('UA ') || result.output.includes('UD ') || 
                          result.output.includes('DU ');
      return {
        success: true,
        output: hasConflicts
      };
    }
    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Get total commit count ahead of a branch
   */
  private getTotalCommitCount(cwd: string, baseBranch: string): GitCommandResult<number> {
    const result = this.executeGitCommand(`git rev-list --count ${baseBranch}..HEAD`, cwd);
    if (result.success && result.output) {
      return {
        success: true,
        output: parseInt(result.output, 10)
      };
    }
    return {
      success: false,
      error: result.error
    };
  }

  /**
   * Start polling for git status updates
   */
  startPolling(): void {
    if (this.pollInterval) {
      return; // Already polling
    }

    // Initial poll will log its own start message
    
    // Initial poll
    this.pollAllSessions();
    
    // Set up interval
    this.pollInterval = setInterval(() => {
      this.pollAllSessions();
    }, this.POLL_INTERVAL_MS);

    // Note: In Electron main process, we don't have access to document
    // Window visibility changes should be handled via IPC from renderer
  }

  /**
   * Stop polling for git status updates
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      // Log summary on stop
      this.gitLogger.logSummary();
    }

    // Clear any pending debounce timers
    this.refreshDebounceTimers.forEach(timer => clearTimeout(timer));
    this.refreshDebounceTimers.clear();

    // Clear event throttle timer
    if (this.eventThrottleTimer) {
      clearTimeout(this.eventThrottleTimer);
      this.eventThrottleTimer = null;
    }
    this.pendingEvents.clear();

    // Note: In Electron main process, we don't have access to document
    // Window visibility changes should be handled via IPC from renderer
  }

  // Called when window focus changes
  handleVisibilityChange(isHidden: boolean): void {
    this.isPolling = !isHidden;
    this.gitLogger.logFocusChange(!isHidden);
    if (!isHidden) {
      // Immediately poll when window becomes visible again to get fresh status
      this.pollAllSessions();
    }
  }

  /**
   * Get git status for a specific session (with caching)
   */
  async getGitStatus(sessionId: string): Promise<GitStatus | null> {
    // Check cache first
    const cached = this.cache[sessionId];
    if (cached && Date.now() - cached.lastChecked < this.CACHE_TTL_MS) {
      this.gitLogger.logSessionFetch(sessionId, true);
      return cached.status;
    }

    // Fetch fresh status
    const status = await this.fetchGitStatus(sessionId);
    if (status) {
      this.updateCache(sessionId, status);
    }
    return status;
  }

  /**
   * Force refresh git status for a specific session (with debouncing)
   * @param sessionId - The session ID to refresh
   * @param isUserInitiated - Whether this refresh was triggered by user action (shows loading spinner)
   */
  async refreshSessionGitStatus(sessionId: string, isUserInitiated = false): Promise<GitStatus | null> {
    // Clear any existing debounce timer for this session
    const existingTimer = this.refreshDebounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.refreshDebounceTimers.delete(sessionId);
      this.gitLogger.logDebounce(sessionId, 'cancelled');
    }

    // Create a promise that will be resolved after debounce
    this.gitLogger.logDebounce(sessionId, 'start');
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        this.refreshDebounceTimers.delete(sessionId);
        this.gitLogger.logDebounce(sessionId, 'complete');
        
        // Only emit loading event for user-initiated refreshes
        if (isUserInitiated) {
          this.emitThrottled(sessionId, 'loading');
        }
        
        const status = await this.fetchGitStatus(sessionId);
        if (status) {
          this.updateCache(sessionId, status);
          this.emitThrottled(sessionId, 'updated', status);
        }
        resolve(status);
      }, this.DEBOUNCE_MS);

      this.refreshDebounceTimers.set(sessionId, timer);
    });
  }

  /**
   * Poll all active sessions for git status
   */
  private async pollAllSessions(): Promise<void> {
    if (!this.isPolling) {
      return; // Skip polling when paused
    }

    try {
      const sessions = await this.sessionManager.getAllSessions();
      const activeSessions = sessions.filter(s => 
        !s.archived && s.status !== 'error' && s.worktreePath
      );

      this.gitLogger.logPollStart(activeSessions.length);

      // Don't emit loading events during automatic polling
      // Loading spinners are distracting during background updates

      // Process sessions with concurrent limiting
      let successCount = 0;
      let errorCount = 0;
      
      const results = await Promise.allSettled(
        activeSessions.map(session => 
          this.executeWithLimit(() => this.refreshSessionGitStatus(session.id, false)) // false = not user initiated
        )
      );
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
        } else {
          errorCount++;
        }
      });
      
      this.gitLogger.logPollComplete(successCount, errorCount);
    } catch (error) {
      this.logger?.error('[GitStatus] Critical error during poll cycle:', error as Error);
    }
  }

  /**
   * Fetch git status for a session
   */
  private async fetchGitStatus(sessionId: string): Promise<GitStatus | null> {
    try {
      const session = await this.sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return null;
      }
      
      this.gitLogger.logSessionFetch(sessionId, false);

      const project = this.sessionManager.getProjectForSession(sessionId);
      if (!project?.path) {
        return null;
      }

      // Get uncommitted changes
      const uncommittedDiff = await this.gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
      const hasUncommittedChanges = uncommittedDiff.stats.filesChanged > 0;
      
      // Check for untracked files
      const untrackedResult = this.getUntrackedFiles(session.worktreePath);
      const hasUntrackedFiles = untrackedResult.success ? untrackedResult.output! : false;
      
      // Get ahead/behind status
      const mainBranch = await this.worktreeManager.getProjectMainBranch(project.path);
      
      const revListResult = this.getRevListCount(session.worktreePath, mainBranch);
      const ahead = revListResult.success ? revListResult.output!.ahead : 0;
      const behind = revListResult.success ? revListResult.output!.behind : 0;

      // Get total additions/deletions for all commits in the branch (compared to main)
      let totalCommitAdditions = 0;
      let totalCommitDeletions = 0;
      let totalCommitFilesChanged = 0;
      if (ahead > 0) {
        const diffStatsResult = this.getDiffStats(session.worktreePath, mainBranch);
        if (diffStatsResult.success && diffStatsResult.output) {
          totalCommitFilesChanged = diffStatsResult.output.filesChanged;
          totalCommitAdditions = diffStatsResult.output.additions;
          totalCommitDeletions = diffStatsResult.output.deletions;
        }
      }

      // Check for rebase or merge conflicts
      let isRebasing = false;
      const conflictResult = this.checkMergeConflicts(session.worktreePath);
      const hasMergeConflicts = conflictResult.success ? conflictResult.output! : false;
      
      // Check for rebase in progress using filesystem APIs
      const rebaseMergeExists = existsSync(join(session.worktreePath, '.git', 'rebase-merge'));
      const rebaseApplyExists = existsSync(join(session.worktreePath, '.git', 'rebase-apply'));
      isRebasing = rebaseMergeExists || rebaseApplyExists;

      // Determine the overall state and secondary states
      let state: GitStatus['state'] = 'clean';
      const secondaryStates: GitStatus['secondaryStates'] = [];
      
      // Priority order for primary state: conflict > diverged > modified > ahead > behind > untracked > clean
      if (hasMergeConflicts) {
        state = 'conflict';
      } else if (ahead > 0 && behind > 0) {
        state = 'diverged';
      } else if (hasUncommittedChanges) {
        state = 'modified';
        if (ahead > 0) secondaryStates.push('ahead');
        if (behind > 0) secondaryStates.push('behind');
      } else if (ahead > 0) {
        state = 'ahead';
        if (hasUntrackedFiles) secondaryStates.push('untracked');
      } else if (behind > 0) {
        state = 'behind';
        if (hasUncommittedChanges) secondaryStates.push('modified');
        if (hasUntrackedFiles) secondaryStates.push('untracked');
      } else if (hasUntrackedFiles) {
        state = 'untracked';
      }
      
      // IMPORTANT: Even if state is 'clean', we still want to show commit count
      // A 'clean' branch can still have commits not in main!

      // Determine if ready to merge (ahead with no uncommitted changes or untracked files)
      const isReadyToMerge = ahead > 0 && !hasUncommittedChanges && !hasUntrackedFiles && behind === 0;

      // Get total number of commits in the branch
      const commitCountResult = this.getTotalCommitCount(session.worktreePath, mainBranch);
      const totalCommits = commitCountResult.success ? commitCountResult.output! : ahead;

      const result = {
        state,
        ahead: ahead > 0 ? ahead : undefined,
        behind: behind > 0 ? behind : undefined,
        additions: uncommittedDiff.stats.additions > 0 ? uncommittedDiff.stats.additions : undefined,
        deletions: uncommittedDiff.stats.deletions > 0 ? uncommittedDiff.stats.deletions : undefined,
        filesChanged: uncommittedDiff.stats.filesChanged > 0 ? uncommittedDiff.stats.filesChanged : undefined,
        lastChecked: new Date().toISOString(),
        isReadyToMerge,
        hasUncommittedChanges,
        hasUntrackedFiles,
        secondaryStates: secondaryStates.length > 0 ? secondaryStates : undefined,
        // Include commit statistics if ahead of main
        commitAdditions: totalCommitAdditions > 0 ? totalCommitAdditions : undefined,
        commitDeletions: totalCommitDeletions > 0 ? totalCommitDeletions : undefined,
        commitFilesChanged: totalCommitFilesChanged > 0 ? totalCommitFilesChanged : undefined,
        // Total commits in branch
        totalCommits: totalCommits > 0 ? totalCommits : undefined
      };
      
      this.gitLogger.logSessionSuccess(sessionId);
      return result;
    } catch (error) {
      this.gitLogger.logSessionError(sessionId, error as Error);
      return {
        state: 'unknown',
        lastChecked: new Date().toISOString()
      };
    }
  }

  /**
   * Update cache with new status
   */
  private updateCache(sessionId: string, status: GitStatus): void {
    const previousStatus = this.cache[sessionId]?.status;
    const hasChanged = !previousStatus || JSON.stringify(previousStatus) !== JSON.stringify(status);
    
    this.cache[sessionId] = {
      status,
      lastChecked: Date.now()
    };

    // Only emit event if status actually changed
    if (hasChanged) {
      this.emitThrottled(sessionId, 'updated', status);
    }
  }

  /**
   * Clear cache for a session
   */
  clearSessionCache(sessionId: string): void {
    delete this.cache[sessionId];
  }

  /**
   * Clear all cached status
   */
  clearAllCache(): void {
    this.cache = {};
  }

  /**
   * Emit a throttled event to prevent UI flooding
   * @param sessionId The session ID
   * @param type The event type (loading or updated)
   * @param data Optional data for updated events
   */
  private emitThrottled(sessionId: string, type: 'loading' | 'updated', data?: GitStatus): void {
    // Store the pending event
    this.pendingEvents.set(sessionId, { type, data });
    
    // If we don't have a throttle timer, start one
    if (!this.eventThrottleTimer) {
      this.eventThrottleTimer = setTimeout(() => {
        // Batch emit all pending events
        const eventsToEmit = new Map(this.pendingEvents);
        this.pendingEvents.clear();
        this.eventThrottleTimer = null;
        
        // Group events by type for batch emission
        const loadingEvents: string[] = [];
        const updatedEvents: Array<{ sessionId: string; status: GitStatus }> = [];
        
        eventsToEmit.forEach((event, id) => {
          if (event.type === 'loading') {
            loadingEvents.push(id);
          } else if (event.type === 'updated' && event.data) {
            updatedEvents.push({ sessionId: id, status: event.data });
          }
        });
        
        // Emit batch events
        if (loadingEvents.length > 0) {
          this.emit('git-status-loading-batch', loadingEvents);
        }
        if (updatedEvents.length > 0) {
          this.emit('git-status-updated-batch', updatedEvents);
        }
        
        // Also emit individual events for backward compatibility
        eventsToEmit.forEach((event, id) => {
          if (event.type === 'loading') {
            this.emit('git-status-loading', id);
          } else if (event.type === 'updated' && event.data) {
            this.emit('git-status-updated', id, event.data);
          }
        });
      }, this.EVENT_THROTTLE_MS);
    }
  }

  /**
   * Execute an operation with concurrency limiting
   * @param operation The operation to execute
   */
  private async executeWithLimit<T>(operation: () => Promise<T>): Promise<T> {
    // Wait if we're at the limit
    while (this.activeOperations >= this.MAX_CONCURRENT_OPERATIONS) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    this.activeOperations++;
    try {
      return await operation();
    } finally {
      this.activeOperations--;
      
      // Process queued operations
      if (this.operationQueue.length > 0) {
        const nextOp = this.operationQueue.shift();
        if (nextOp) {
          nextOp().catch(error => {
            this.logger?.error('[GitStatus] Queued operation failed:', error as Error);
          });
        }
      }
    }
  }
}
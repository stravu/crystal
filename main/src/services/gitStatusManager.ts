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
import { GitFileWatcher } from './gitFileWatcher';
import { fastCheckWorkingDirectory, fastGetAheadBehind, fastGetDiffStats } from './gitPlumbingCommands';

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
  // Smart visibility-aware polling for active sessions only
  private readonly CACHE_TTL_MS = 5000; // 5 seconds cache
  private refreshDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 5000; // Increased to 5 seconds minimum interval between requests
  private gitLogger: GitStatusLogger;
  private fileWatcher: GitFileWatcher;
  
  // Throttling for UI events
  private eventThrottleTimer: NodeJS.Timeout | null = null;
  private pendingEvents: Map<string, { type: 'loading' | 'updated', data?: GitStatus }> = new Map();
  private readonly EVENT_THROTTLE_MS = 100; // Throttle UI events to prevent flooding
  
  // Concurrent operation limiting
  private activeOperations = 0;
  private readonly MAX_CONCURRENT_OPERATIONS = 3; // Reduced to limit CPU usage
  private operationQueue: Array<() => Promise<void>> = [];
  
  // Cancellation support
  private abortControllers: Map<string, AbortController> = new Map();
  
  // Initial load management
  private isInitialLoadInProgress = false;
  private initialLoadQueue: string[] = [];
  private readonly INITIAL_LOAD_DELAY_MS = 200; // Increased to 200ms for better staggering
  
  // Smart polling for active/visible sessions only
  private activeSessionId: string | null = null;
  private visibilityAwareInterval: (() => void) | null = null;
  private isWindowVisible = true;
  private readonly ACTIVE_SESSION_POLL_MS = 10000; // 10 seconds for active session
  private readonly BACKGROUND_SESSION_POLL_MS = 60000; // 60 seconds for background sessions

  constructor(
    private sessionManager: SessionManager,
    private worktreeManager: WorktreeManager,
    private gitDiffManager: GitDiffManager,
    private logger?: Logger
  ) {
    super();
    // Increase max listeners to prevent warnings when many components listen to git status events
    // This is expected since each SessionListItem listens for git status updates
    this.setMaxListeners(100);
    this.gitLogger = new GitStatusLogger(logger);
    
    // Initialize file watcher for smart refresh detection
    this.fileWatcher = new GitFileWatcher(logger);
    this.fileWatcher.on('needs-refresh', (sessionId: string) => {
      // File watcher detected changes, refresh git status
      this.logger?.info(`[GitStatus] File watcher triggered refresh for session ${sessionId}`);
      this.refreshSessionGitStatus(sessionId, false).catch(error => {
        this.logger?.error(`[GitStatus] Failed to refresh after file change for session ${sessionId}:`, error);
      });
    });
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
   * Set the currently active session for smart polling
   */
  setActiveSession(sessionId: string | null): void {
    const previousActive = this.activeSessionId;
    this.activeSessionId = sessionId;
    
    if (previousActive !== sessionId) {
      console.log(`[GitStatus] Active session changed from ${previousActive} to ${sessionId}`);
      
      // Start watching the active session's files if we have one
      if (sessionId) {
        this.startWatchingSession(sessionId);
        
        // If window is visible, also refresh immediately
        if (this.isWindowVisible) {
          this.refreshSessionGitStatus(sessionId, false).catch(error => {
            console.warn(`[GitStatus] Failed to refresh active session ${sessionId}:`, error);
          });
        }
      }
      
      // Stop watching the previous active session if it exists
      if (previousActive) {
        this.stopWatchingSession(previousActive);
      }
    }
  }
  
  /**
   * Start file watching for a session
   */
  private async startWatchingSession(sessionId: string): Promise<void> {
    try {
      const session = await this.sessionManager.getSession(sessionId);
      if (session?.worktreePath) {
        this.fileWatcher.startWatching(sessionId, session.worktreePath);
        this.logger?.info(`[GitStatus] Started file watching for session ${sessionId}`);
      }
    } catch (error) {
      this.logger?.error(`[GitStatus] Failed to start file watching for session ${sessionId}:`, error as Error);
    }
  }
  
  /**
   * Stop file watching for a session
   */
  private stopWatchingSession(sessionId: string): void {
    this.fileWatcher.stopWatching(sessionId);
    this.logger?.info(`[GitStatus] Stopped file watching for session ${sessionId}`);
  }
  
  /**
   * Start smart git status polling (only for active session when visible)
   */
  startPolling(): void {
    // Start visibility-aware polling for active session only
    if (this.visibilityAwareInterval) {
      this.visibilityAwareInterval(); // Clean up existing interval
    }
    
    this.visibilityAwareInterval = this.createVisibilityAwareInterval(
      () => this.pollActiveSession(),
      this.ACTIVE_SESSION_POLL_MS,
      this.BACKGROUND_SESSION_POLL_MS
    );
    
    this.gitLogger.logPollStart(1); // Log that we're polling 1 session (active)
  }

  /**
   * Stop git status manager
   */
  stopPolling(): void {
    // Stop visibility-aware polling
    if (this.visibilityAwareInterval) {
      this.visibilityAwareInterval();
      this.visibilityAwareInterval = null;
    }
    
    // Stop all file watchers
    this.fileWatcher.stopAll();
    
    this.gitLogger.logSummary();

    // Clear any pending debounce timers
    this.refreshDebounceTimers.forEach(timer => clearTimeout(timer));
    this.refreshDebounceTimers.clear();

    // Clear event throttle timer
    if (this.eventThrottleTimer) {
      clearTimeout(this.eventThrottleTimer);
      this.eventThrottleTimer = null;
    }
    this.pendingEvents.clear();
    
    // Cancel all active operations
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }

  // Called when window focus changes
  handleVisibilityChange(isHidden: boolean): void {
    this.isWindowVisible = !isHidden;
    this.gitLogger.logFocusChange(!isHidden);
    
    // If window becomes visible and we have an active session, refresh it
    if (!isHidden && this.activeSessionId) {
      this.refreshSessionGitStatus(this.activeSessionId, false).catch(error => {
        console.warn(`[GitStatus] Failed to refresh active session on focus:`, error);
      });
    }
  }

  /**
   * Get cached status without fetching
   */
  private getCachedStatus(sessionId: string): { status: GitStatus; lastChecked: number } | null {
    return this.cache[sessionId] || null;
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
        
        // Fast path: check if git status actually changed before doing expensive operations
        const session = await this.sessionManager.getSession(sessionId);
        if (session?.worktreePath) {
          const hasChanged = await this.hasGitStatusChanged(sessionId, session.worktreePath);
          if (!hasChanged) {
            this.logger?.info(`[GitStatus] Quick check: no changes for session ${sessionId}, skipping refresh`);
            resolve(this.cache[sessionId]?.status || null);
            return;
          }
        }
        
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
   * Queue a session for initial git status loading with staggered execution
   * This prevents UI lock when many sessions load at once
   */
  async queueInitialLoad(sessionId: string): Promise<GitStatus | null> {
    // Check cache first
    const cached = this.getCachedStatus(sessionId);
    if (cached && Date.now() - cached.lastChecked < this.CACHE_TTL_MS) {
      return cached.status;
    }

    // Add to initial load queue if not already there
    if (!this.initialLoadQueue.includes(sessionId)) {
      this.initialLoadQueue.push(sessionId);
    }

    // Start processing queue if not already running
    if (!this.isInitialLoadInProgress) {
      this.processInitialLoadQueue();
    }

    // Return cached status immediately (UI will update when fresh data arrives via events)
    return cached?.status || null;
  }

  /**
   * Process the initial load queue with staggering to prevent UI lock
   */
  private async processInitialLoadQueue(): Promise<void> {
    if (this.isInitialLoadInProgress || this.initialLoadQueue.length === 0) {
      return;
    }

    this.isInitialLoadInProgress = true;
    
    while (this.initialLoadQueue.length > 0) {
      // Take a batch of sessions to process
      const batchSize = Math.min(this.MAX_CONCURRENT_OPERATIONS, this.initialLoadQueue.length);
      const batch = this.initialLoadQueue.splice(0, batchSize);
      
      // Process batch concurrently
      const promises = batch.map(sessionId => 
        this.executeWithLimit(async () => {
          try {
            const status = await this.fetchGitStatus(sessionId);
            if (status) {
              this.updateCache(sessionId, status);
              this.emitThrottled(sessionId, 'updated', status);
            }
          } catch (error) {
            this.logger?.error(`[GitStatus] Error fetching status for session ${sessionId}:`, error as Error);
          }
        })
      );
      
      await Promise.allSettled(promises);
      
      // Small delay between batches to keep UI responsive
      if (this.initialLoadQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.INITIAL_LOAD_DELAY_MS));
      }
    }
    
    this.isInitialLoadInProgress = false;
  }

  /**
   * Refresh git status for all active sessions (called manually, not on a timer)
   */
  async refreshAllSessions(): Promise<void> {
    try {
      const sessions = await this.sessionManager.getAllSessions();
      const activeSessions = sessions.filter(s => 
        !s.archived && s.status !== 'error' && s.worktreePath
      );

      this.gitLogger.logPollStart(activeSessions.length);

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
      this.logger?.error('[GitStatus] Critical error during refresh:', error as Error);
    }
  }

  /**
   * Cancel git status operations for a session
   */
  cancelSessionGitStatus(sessionId: string): void {
    // Cancel any active fetch for this session
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
    }
    
    // Clear from loading state by emitting loading false
    this.setGitStatusLoading(sessionId, false);
    
    // Clear any pending debounce timer
    const timer = this.refreshDebounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.refreshDebounceTimers.delete(sessionId);
    }
  }
  
  /**
   * Helper to set git status loading state
   */
  private setGitStatusLoading(sessionId: string, loading: boolean): void {
    if (!loading) {
      // Emit that loading has stopped
      this.emit('git-status-loading', sessionId);
    }
  }

  /**
   * Cancel git status operations for multiple sessions
   */
  cancelMultipleGitStatus(sessionIds: string[]): void {
    sessionIds.forEach(id => this.cancelSessionGitStatus(id));
  }

  /**
   * Quick check if git status actually changed using fast plumbing commands
   * Returns true if status is different from cached, false if unchanged
   */
  private async hasGitStatusChanged(sessionId: string, worktreePath: string): Promise<boolean> {
    const cached = this.cache[sessionId];
    if (!cached) return true;
    
    try {
      // Quick check using plumbing commands
      const quickStatus = fastCheckWorkingDirectory(worktreePath);
      
      // Compare with cached status
      const cachedHasChanges = cached.status.hasUncommittedChanges || cached.status.hasUntrackedFiles;
      const currentHasChanges = quickStatus.hasModified || quickStatus.hasStaged || quickStatus.hasUntracked;
      
      // If the basic state differs, we need to refresh
      if (cachedHasChanges !== currentHasChanges) {
        return true;
      }
      
      // If both have no changes, check if ahead/behind changed
      if (!currentHasChanges) {
        const project = this.sessionManager.getProjectForSession(sessionId);
        if (project?.path) {
          const mainBranch = await this.worktreeManager.getProjectMainBranch(project.path);
          const { ahead, behind } = fastGetAheadBehind(worktreePath, mainBranch);
          
          if ((cached.status.ahead || 0) !== ahead || (cached.status.behind || 0) !== behind) {
            return true;
          }
        }
      }
      
      return false;
    } catch {
      // On any error, assume we need to refresh
      return true;
    }
  }

  /**
   * Fetch git status for a session
   */
  private async fetchGitStatus(sessionId: string): Promise<GitStatus | null> {
    // Create abort controller for this operation
    const abortController = new AbortController();
    this.abortControllers.set(sessionId, abortController);
    
    try {
      const session = await this.sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        this.abortControllers.delete(sessionId);
        return null;
      }
      
      // Check if operation was cancelled
      if (abortController.signal.aborted) {
        this.abortControllers.delete(sessionId);
        return null;
      }
      
      this.gitLogger.logSessionFetch(sessionId, false);

      const project = this.sessionManager.getProjectForSession(sessionId);
      if (!project?.path) {
        return null;
      }

      // Use fast plumbing commands for initial checks
      const quickStatus = fastCheckWorkingDirectory(session.worktreePath);
      const hasUncommittedChanges = quickStatus.hasModified || quickStatus.hasStaged;
      const hasUntrackedFiles = quickStatus.hasUntracked;
      const hasMergeConflicts = quickStatus.hasConflicts;
      
      // Get uncommitted changes details only if needed
      let uncommittedDiff = { stats: { filesChanged: 0, additions: 0, deletions: 0 } };
      if (hasUncommittedChanges) {
        // Use fast diff stats instead of full diff capture when possible
        const quickStats = fastGetDiffStats(session.worktreePath);
        uncommittedDiff = {
          stats: {
            filesChanged: quickStats.filesChanged,
            additions: quickStats.additions,
            deletions: quickStats.deletions
          }
        };
      }
      
      // Get ahead/behind status using fast plumbing command
      const mainBranch = await this.worktreeManager.getProjectMainBranch(project.path);
      const { ahead, behind } = fastGetAheadBehind(session.worktreePath, mainBranch);

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

      // Check for rebase in progress
      let isRebasing = false;
      
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
      this.abortControllers.delete(sessionId);
      return result;
    } catch (error) {
      this.abortControllers.delete(sessionId);
      
      // Check if this was a cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        this.gitLogger.logSessionFetch(sessionId, true); // cancelled
        return null;
      }
      
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
  
  /**
   * Poll only the active session (smart polling)
   */
  private async pollActiveSession(): Promise<void> {
    if (!this.activeSessionId || !this.isWindowVisible) {
      return;
    }
    
    try {
      await this.refreshSessionGitStatus(this.activeSessionId, false);
    } catch (error) {
      console.warn(`[GitStatus] Failed to poll active session ${this.activeSessionId}:`, error);
    }
  }
  
  /**
   * Creates a visibility-aware interval that polls less frequently when window is not visible
   */
  private createVisibilityAwareInterval(
    callback: () => void,
    activeInterval: number,
    inactiveInterval: number
  ): () => void {
    let intervalId: NodeJS.Timeout | null = null;
    
    const updateInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      
      const interval = this.isWindowVisible ? activeInterval : inactiveInterval;
      intervalId = setInterval(callback, interval);
    };
    
    // Initial setup
    updateInterval();
    
    // Return cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }
}
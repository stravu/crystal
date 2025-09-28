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


export class GitStatusManager extends EventEmitter {
  private cache: GitStatusCache = {};
  // Smart visibility-aware polling for active sessions only
  private readonly CACHE_TTL_MS = 5000; // 5 seconds cache
  private refreshDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce to batch rapid changes
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
  
  // Track active session and window visibility for optimized refreshes
  private activeSessionId: string | null = null;
  private isWindowVisible = true;

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
   * Start git status manager (initializes file watching)
   */
  startPolling(): void {
    // File watching is started per-session in setActiveSession
    // This method is kept for backward compatibility
    this.gitLogger.logPollStart(1);
  }

  /**
   * Stop git status manager
   */
  stopPolling(): void {
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
   * Refresh git status for all sessions in a project
   * @param projectId - The project ID to refresh sessions for
   */
  private async refreshGitStatusForProject(projectId: number): Promise<void> {
    try {
      const sessions = await this.sessionManager.getAllSessions();
      const projectSessions = sessions.filter(s => s.projectId === projectId && !s.archived && s.status !== 'error');
      
      // Refresh all sessions in parallel
      await Promise.all(projectSessions.map(session => 
        this.refreshSessionGitStatus(session.id, false).catch(() => {
          // Individual failures are logged by GitStatusManager
        })
      ));
    } catch (error) {
      this.logger?.error(`[GitStatus] Failed to refresh git status for project ${projectId}:`, error as Error);
    }
  }

  /**
   * Update git status for all sessions in a project after main branch was updated
   * @param projectId - The project ID to update sessions for
   * @param updatedBySessionId - The session ID that caused the update (e.g. rebased to main)
   */
  async updateProjectGitStatusAfterMainUpdate(projectId: number, updatedBySessionId?: string): Promise<void> {
    try {
      const sessions = await this.sessionManager.getAllSessions();
      const projectSessions = sessions.filter(s => s.projectId === projectId && !s.archived && s.status !== 'error');
      
      // Update all sessions in parallel
      await Promise.all(projectSessions.map(async (session) => {
        if (session.id === updatedBySessionId) {
          // The session that rebased to main is now in sync with main
          await this.updateGitStatusAfterRebase(session.id, 'to_main');
        } else {
          // Other sessions may now be behind main
          const cached = this.cache[session.id];
          if (cached && session.worktreePath) {
            try {
              // Quick check for new ahead/behind status
              const project = this.sessionManager.getProjectForSession(session.id);
              if (project?.path) {
                const mainBranch = await this.worktreeManager.getProjectMainBranch(project.path);
                const { ahead, behind } = fastGetAheadBehind(session.worktreePath, mainBranch);
                
                const updatedStatus = { ...cached.status };
                updatedStatus.ahead = ahead;
                updatedStatus.behind = behind;
                
                // Update cache and emit
                this.updateCache(session.id, updatedStatus);
                this.emitThrottled(session.id, 'updated', updatedStatus);
              }
            } catch {
              // Fall back to full refresh on error
              await this.refreshSessionGitStatus(session.id, false);
            }
          } else {
            // No cache, do a full refresh
            await this.refreshSessionGitStatus(session.id, false);
          }
        }
      }));
      
      this.logger?.info(`[GitStatus] Updated all sessions in project ${projectId} after main branch update`);
    } catch (error) {
      this.logger?.error(`[GitStatus] Error updating project statuses after main update:`, error as Error);
      // Fall back to refreshing all
      await this.refreshGitStatusForProject(projectId);
    }
  }

  /**
   * Update git status after a rebase operation without running git commands
   * @param sessionId - The session ID to update
   * @param rebaseType - 'from_main' or 'to_main' 
   */
  async updateGitStatusAfterRebase(sessionId: string, rebaseType: 'from_main' | 'to_main'): Promise<void> {
    try {
      const cached = this.cache[sessionId];
      if (!cached) {
        // No cached status, fall back to refresh
        await this.refreshSessionGitStatus(sessionId, false);
        return;
      }

      const session = await this.sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return;
      }

      const project = this.sessionManager.getProjectForSession(sessionId);
      if (!project?.path) {
        return;
      }

      const mainBranch = await this.worktreeManager.getProjectMainBranch(project.path);
      
      // Create updated status based on rebase type
      const updatedStatus = { ...cached.status };
      
      if (rebaseType === 'from_main') {
        // After rebasing from main, we're no longer behind
        updatedStatus.behind = 0;
        // ahead count stays the same or might change if there were conflicts resolved
        // hasUncommittedChanges might be true if there were conflicts
        // We'll do a quick check for uncommitted changes
        try {
          const quickStatus = fastCheckWorkingDirectory(session.worktreePath);
          updatedStatus.hasUncommittedChanges = quickStatus.hasModified || quickStatus.hasStaged;
          updatedStatus.hasUntrackedFiles = quickStatus.hasUntracked;
          // Update state based on conflicts
          if (quickStatus.hasConflicts) {
            updatedStatus.state = 'conflict';
          }
          
          if (updatedStatus.hasUncommittedChanges) {
            // Get updated diff stats
            const quickStats = fastGetDiffStats(session.worktreePath);
            updatedStatus.additions = quickStats.additions;
            updatedStatus.deletions = quickStats.deletions;
            updatedStatus.filesChanged = quickStats.filesChanged;
          } else {
            updatedStatus.additions = 0;
            updatedStatus.deletions = 0;
            updatedStatus.filesChanged = 0;
          }
        } catch {
          // If quick check fails, fall back to full refresh
          await this.refreshSessionGitStatus(sessionId, false);
          return;
        }
      } else if (rebaseType === 'to_main') {
        // After rebasing to main, we're ahead of main with our changes
        // and no longer behind (since we just rebased onto it)
        updatedStatus.behind = 0;
        // ahead count would be the number of commits we have
        // hasUncommittedChanges should be false (we just rebased cleanly)
        updatedStatus.hasUncommittedChanges = false;
        updatedStatus.hasUntrackedFiles = false;
        updatedStatus.state = 'ahead'; // We're ahead after rebasing to main
        updatedStatus.additions = 0;
        updatedStatus.deletions = 0;
        updatedStatus.filesChanged = 0;
      }

      // Update cache and emit
      this.updateCache(sessionId, updatedStatus);
      this.emitThrottled(sessionId, 'updated', updatedStatus);
      
      this.logger?.info(`[GitStatus] Updated status after ${rebaseType} rebase for session ${sessionId}`);
    } catch (error) {
      this.logger?.error(`[GitStatus] Error updating status after rebase for session ${sessionId}:`, error as Error);
      // Fall back to full refresh on error
      await this.refreshSessionGitStatus(sessionId, false);
    }
  }

  /**
   * Force refresh git status for a specific session (with debouncing)
   * @param sessionId - The session ID to refresh
   * @param isUserInitiated - Whether this refresh was triggered by user action (shows loading spinner)
   */
  async refreshSessionGitStatus(sessionId: string, isUserInitiated = false): Promise<GitStatus | null> {
    // Immediately emit loading state so user sees refresh is happening
    // This provides immediate visual feedback
    this.emitThrottled(sessionId, 'loading');
    
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
            // Still emit updated to clear loading state even if no changes
            const cached = this.cache[sessionId]?.status || null;
            if (cached) {
              this.emitThrottled(sessionId, 'updated', cached);
            }
            resolve(cached);
            return;
          }
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
      // Show loading immediately for this session
      this.emitThrottled(sessionId, 'loading');
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
      
      // Immediately show loading for all sessions so user sees refresh happening
      activeSessions.forEach(session => {
        this.emitThrottled(session.id, 'loading');
      });

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
        // Use git diff --shortstat for commit statistics
        try {
          const statLine = execSync(`git diff --shortstat ${mainBranch}...HEAD`, { cwd: session.worktreePath }).toString().trim();
          if (statLine) {
            const filesMatch = statLine.match(/(\d+) files? changed/);
            const additionsMatch = statLine.match(/(\d+) insertions?\(\+\)/);
            const deletionsMatch = statLine.match(/(\d+) deletions?\(-\)/);
            
            totalCommitFilesChanged = filesMatch ? parseInt(filesMatch[1], 10) : 0;
            totalCommitAdditions = additionsMatch ? parseInt(additionsMatch[1], 10) : 0;
            totalCommitDeletions = deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0;
          }
        } catch {
          // Keep defaults of 0 if command fails
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
      let totalCommits = ahead;
      try {
        const countStr = execSync(`git rev-list --count ${mainBranch}..HEAD`, { cwd: session.worktreePath }).toString().trim();
        totalCommits = parseInt(countStr, 10) || ahead;
      } catch {
        // Keep default of ahead if command fails
      }

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
}
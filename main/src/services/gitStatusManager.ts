import { EventEmitter } from 'events';
import { execSync } from '../utils/commandExecutor';
import type { Logger } from '../utils/logger';
import type { GitStatus } from '../types/session';
import type { SessionManager } from './sessionManager';
import type { WorktreeManager } from './worktreeManager';
import type { GitDiffManager } from './gitDiffManager';

interface GitStatusCache {
  [sessionId: string]: {
    status: GitStatus;
    lastChecked: number;
  };
}

export class GitStatusManager extends EventEmitter {
  private cache: GitStatusCache = {};
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 10000; // 10 seconds
  private readonly CACHE_TTL_MS = 5000; // 5 seconds cache
  private isPolling = false;

  constructor(
    private sessionManager: SessionManager,
    private worktreeManager: WorktreeManager,
    private gitDiffManager: GitDiffManager,
    private logger?: Logger
  ) {
    super();
  }

  /**
   * Start polling for git status updates
   */
  startPolling(): void {
    if (this.pollInterval) {
      return; // Already polling
    }

    this.logger?.info('Starting git status polling');
    
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
      this.logger?.info('Stopped git status polling');
    }

    // Note: In Electron main process, we don't have access to document
    // Window visibility changes should be handled via IPC from renderer
  }

  // Note: This method can be called via IPC when renderer detects visibility change
  handleVisibilityChange(isHidden: boolean): void {
    if (isHidden) {
      this.isPolling = false;
    } else {
      this.isPolling = true;
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
   * Force refresh git status for a specific session
   */
  async refreshSessionGitStatus(sessionId: string): Promise<GitStatus | null> {
    const status = await this.fetchGitStatus(sessionId);
    if (status) {
      this.updateCache(sessionId, status);
      this.emit('git-status-updated', sessionId, status);
    }
    return status;
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

      this.logger?.verbose(`Polling git status for ${activeSessions.length} active sessions`);

      // Process sessions in parallel with a limit
      const batchSize = 3; // Limit concurrent Git operations
      for (let i = 0; i < activeSessions.length; i += batchSize) {
        const batch = activeSessions.slice(i, i + batchSize);
        await Promise.all(
          batch.map(session => this.refreshSessionGitStatus(session.id))
        );
      }
    } catch (error) {
      this.logger?.error('Error polling git status:', error as Error);
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

      const project = this.sessionManager.getProjectForSession(sessionId);
      if (!project?.path) {
        return null;
      }

      // Get uncommitted changes
      const uncommittedDiff = await this.gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
      const hasUncommittedChanges = uncommittedDiff.stats.filesChanged > 0;
      
      // Check for untracked files
      let hasUntrackedFiles = false;
      try {
        const untrackedOutput = execSync('git ls-files --others --exclude-standard', { cwd: session.worktreePath });
        hasUntrackedFiles = untrackedOutput.toString().trim().length > 0;
      } catch (error) {
        this.logger?.warn(`Failed to check untracked files for session ${sessionId}:`, error as Error);
      }
      
      // Get ahead/behind status
      const mainBranch = await this.worktreeManager.getProjectMainBranch(project.path);
      
      let ahead = 0;
      let behind = 0;
      try {
        const revListOutput = execSync(`git rev-list --left-right --count ${mainBranch}...HEAD`, {
          cwd: session.worktreePath
        });
        const [behindCount, aheadCount] = revListOutput.toString().trim().split('\t').map((n: string) => parseInt(n, 10));
        ahead = aheadCount || 0;
        behind = behindCount || 0;
      } catch (error) {
        this.logger?.warn(`Failed to get ahead/behind status for session ${sessionId}:`, error as Error);
      }

      // Get total additions/deletions for all commits in the branch (compared to main)
      let totalCommitAdditions = 0;
      let totalCommitDeletions = 0;
      let totalCommitFilesChanged = 0;
      if (ahead > 0) {
        try {
          // Get diff stats for all commits ahead of main
          const diffStatOutput = execSync(`git diff --shortstat ${mainBranch}...HEAD`, {
            cwd: session.worktreePath
          });
          const statLine = diffStatOutput.toString().trim();
          
          // Parse the stat line: "X files changed, Y insertions(+), Z deletions(-)"
          const filesMatch = statLine.match(/(\d+) files? changed/);
          const additionsMatch = statLine.match(/(\d+) insertions?\(\+\)/);
          const deletionsMatch = statLine.match(/(\d+) deletions?\(-\)/);
          
          if (filesMatch) totalCommitFilesChanged = parseInt(filesMatch[1], 10);
          if (additionsMatch) totalCommitAdditions = parseInt(additionsMatch[1], 10);
          if (deletionsMatch) totalCommitDeletions = parseInt(deletionsMatch[1], 10);
        } catch (error) {
          this.logger?.warn(`Failed to get commit diff stats for session ${sessionId}:`, error as Error);
        }
      }

      // Check for rebase or merge conflicts
      let isRebasing = false;
      let hasMergeConflicts = false;
      try {
        const gitStatus = execSync('git status --porcelain=v1', { cwd: session.worktreePath });
        hasMergeConflicts = gitStatus.includes('UU ') || gitStatus.includes('AA ') || 
                          gitStatus.includes('DD ') || gitStatus.includes('AU ') || 
                          gitStatus.includes('UA ') || gitStatus.includes('UD ') || 
                          gitStatus.includes('DU ');
        
        // Check for rebase in progress
        const rebaseMergeExists = execSync('test -d .git/rebase-merge && echo 1 || echo 0', { cwd: session.worktreePath }).toString().trim() === '1';
        const rebaseApplyExists = execSync('test -d .git/rebase-apply && echo 1 || echo 0', { cwd: session.worktreePath }).toString().trim() === '1';
        isRebasing = rebaseMergeExists || rebaseApplyExists;
      } catch (error) {
        this.logger?.warn(`Failed to check rebase/merge status for session ${sessionId}:`, error as Error);
      }

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
      let totalCommits = 0;
      try {
        // Get all commits that are unique to this branch (not in main)
        // This matches how the View Diff tab counts commits
        const output = execSync(`git rev-list --count ${mainBranch}..HEAD`, { cwd: session.worktreePath });
        totalCommits = parseInt(output.toString().trim(), 10);
      } catch (error) {
        this.logger?.verbose(`Failed to get total commit count for session ${sessionId}: ${(error as Error).message}`);
        // Fallback to just using ahead count if we can't calculate total
        totalCommits = ahead;
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
      
      return result;
    } catch (error) {
      this.logger?.error(`Error fetching git status for session ${sessionId}:`, error as Error);
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
      this.emit('git-status-updated', sessionId, status);
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
}
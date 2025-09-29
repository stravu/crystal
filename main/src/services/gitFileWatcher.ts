import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'fs';
import { join, relative } from 'path';
import { execSync, ExtendedExecSyncOptions } from '../utils/commandExecutor';
import type { Logger } from '../utils/logger';

interface WatchedSession {
  sessionId: string;
  worktreePath: string;
  watcher?: FSWatcher;
  lastModified: number;
  pendingRefresh: boolean;
}

/**
 * Smart file watcher that detects when git status actually needs refreshing
 * 
 * Key optimizations:
 * 1. Uses native fs.watch for efficient file monitoring
 * 2. Filters out events that don't affect git status
 * 3. Batches rapid file changes
 * 4. Uses git update-index to quickly check if index is dirty
 */
export class GitFileWatcher extends EventEmitter {
  private watchedSessions: Map<string, WatchedSession> = new Map();
  private refreshDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 1500; // 1.5 second debounce for file changes
  private readonly IGNORE_PATTERNS = [
    '.git/',
    'node_modules/',
    '.DS_Store',
    'thumbs.db',
    '*.swp',
    '*.swo',
    '*~',
    '.#*',
    '#*#'
  ];

  constructor(private logger?: Logger) {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Start watching a session's worktree for changes
   */
  startWatching(sessionId: string, worktreePath: string): void {
    // Stop existing watcher if any
    this.stopWatching(sessionId);

    this.logger?.info(`[GitFileWatcher] Starting watch for session ${sessionId} at ${worktreePath}`);

    try {
      // Create a watcher for the worktree directory
      const watcher = watch(worktreePath, { recursive: true }, (eventType, filename) => {
        if (filename) {
          this.handleFileChange(sessionId, filename, eventType);
        }
      });

      this.watchedSessions.set(sessionId, {
        sessionId,
        worktreePath,
        watcher,
        lastModified: Date.now(),
        pendingRefresh: false
      });
    } catch (error) {
      this.logger?.error(`[GitFileWatcher] Failed to start watching session ${sessionId}:`, error as Error);
    }
  }

  /**
   * Stop watching a session's worktree
   */
  stopWatching(sessionId: string): void {
    const session = this.watchedSessions.get(sessionId);
    if (session) {
      session.watcher?.close();
      this.watchedSessions.delete(sessionId);
      
      // Clear any pending refresh timer
      const timer = this.refreshDebounceTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
        this.refreshDebounceTimers.delete(sessionId);
      }
      
      this.logger?.info(`[GitFileWatcher] Stopped watching session ${sessionId}`);
    }
  }

  /**
   * Stop all watchers
   */
  stopAll(): void {
    for (const sessionId of this.watchedSessions.keys()) {
      this.stopWatching(sessionId);
    }
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(sessionId: string, filename: string, eventType: string): void {
    // Ignore changes to files that don't affect git status
    if (this.shouldIgnoreFile(filename)) {
      return;
    }

    const session = this.watchedSessions.get(sessionId);
    if (!session) return;

    // Update last modified time
    session.lastModified = Date.now();
    session.pendingRefresh = true;

    // Debounce the refresh to batch rapid changes
    this.scheduleRefreshCheck(sessionId);
  }

  /**
   * Check if a file should be ignored
   */
  private shouldIgnoreFile(filename: string): boolean {
    // Check against ignore patterns
    for (const pattern of this.IGNORE_PATTERNS) {
      if (pattern.endsWith('/')) {
        // Directory pattern
        if (filename.startsWith(pattern) || filename.includes('/' + pattern)) {
          return true;
        }
      } else if (pattern.startsWith('*.')) {
        // Extension pattern
        const ext = pattern.slice(1);
        if (filename.endsWith(ext)) {
          return true;
        }
      } else if (pattern.startsWith('.#') || pattern.startsWith('#')) {
        // Editor temp file patterns
        const basename = filename.split('/').pop() || '';
        if (basename.startsWith('.#') || (basename.startsWith('#') && basename.endsWith('#'))) {
          return true;
        }
      } else if (pattern.endsWith('~')) {
        // Backup file pattern
        if (filename.endsWith('~')) {
          return true;
        }
      } else {
        // Exact match
        if (filename === pattern || filename.endsWith('/' + pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Schedule a refresh check for a session
   */
  private scheduleRefreshCheck(sessionId: string): void {
    // Clear existing timer
    const existingTimer = this.refreshDebounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.refreshDebounceTimers.delete(sessionId);
      this.performRefreshCheck(sessionId);
    }, this.DEBOUNCE_MS);

    this.refreshDebounceTimers.set(sessionId, timer);
  }

  /**
   * Perform the actual refresh check using git plumbing commands
   */
  private performRefreshCheck(sessionId: string): void {
    const session = this.watchedSessions.get(sessionId);
    if (!session || !session.pendingRefresh) {
      return;
    }

    session.pendingRefresh = false;

    try {
      // Quick check if the index is dirty using git update-index
      // This is much faster than running full git status
      const needsRefresh = this.checkIfRefreshNeeded(session.worktreePath);
      
      if (needsRefresh) {
        this.logger?.info(`[GitFileWatcher] Session ${sessionId} needs refresh`);
        this.emit('needs-refresh', sessionId);
      } else {
        this.logger?.info(`[GitFileWatcher] Session ${sessionId} no refresh needed`);
      }
    } catch (error) {
      this.logger?.error(`[GitFileWatcher] Error checking session ${sessionId}:`, error as Error);
      // On error, emit refresh to be safe
      this.emit('needs-refresh', sessionId);
    }
  }

  /**
   * Quick check if git status needs refreshing
   * Returns true if there are changes, false if working tree is clean
   */
  private checkIfRefreshNeeded(worktreePath: string): boolean {
    try {
      // First, refresh the index to ensure it's up to date
      // This is very fast and updates git's internal cache
      execSync('git update-index --refresh --ignore-submodules', { cwd: worktreePath, encoding: 'utf8', silent: true });

      // Check for unstaged changes (modified files)
      try {
        execSync('git diff-files --quiet --ignore-submodules', { cwd: worktreePath, encoding: 'utf8', silent: true });
      } catch {
        // Non-zero exit means there are unstaged changes
        return true;
      }

      // Check for staged changes
      try {
        execSync('git diff-index --cached --quiet HEAD --ignore-submodules', { cwd: worktreePath, encoding: 'utf8', silent: true });
      } catch {
        // Non-zero exit means there are staged changes
        return true;
      }
      
      // Check for untracked files
      const untrackedOutput = execSync('git ls-files --others --exclude-standard', { cwd: worktreePath })
        .toString()
        .trim();
      
      if (untrackedOutput) {
        return true;
      }
      
      // Working tree is clean
      return false;
    } catch (error) {
      // If any command fails unexpectedly, assume refresh is needed
      this.logger?.error('[GitFileWatcher] Error in checkIfRefreshNeeded:', error as Error);
      return true;
    }
  }

  /**
   * Get statistics about watched sessions
   */
  getStats(): { totalWatched: number; sessionsNeedingRefresh: number } {
    let sessionsNeedingRefresh = 0;
    for (const session of this.watchedSessions.values()) {
      if (session.pendingRefresh) {
        sessionsNeedingRefresh++;
      }
    }
    
    return {
      totalWatched: this.watchedSessions.size,
      sessionsNeedingRefresh
    };
  }
}
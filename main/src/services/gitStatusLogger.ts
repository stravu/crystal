import type { Logger } from '../utils/logger';

/**
 * Centralized logging helper for git status operations
 * Groups related logs and reduces verbosity
 */
export class GitStatusLogger {
  private pollCycle = 0;
  private sessionErrors: Map<string, number> = new Map();
  private readonly ERROR_THRESHOLD = 3; // Log individual errors only after this many failures

  constructor(private logger?: Logger) {}

  // 1. Polling Cycle Logs
  logPollStart(sessionCount: number): void {
    this.pollCycle++;
    this.logger?.verbose(`[GitStatus#${this.pollCycle}] Starting poll for ${sessionCount} sessions`);
  }

  logPollComplete(successCount: number, errorCount: number): void {
    if (errorCount > 0) {
      this.logger?.warn(`[GitStatus#${this.pollCycle}] Poll complete: ${successCount} OK, ${errorCount} failed`);
    } else {
      this.logger?.verbose(`[GitStatus#${this.pollCycle}] Poll complete: ${successCount} sessions updated`);
    }
  }

  // 2. Session-level Operations
  logSessionFetch(sessionId: string, cached: boolean): void {
    // Only log cache hits in verbose mode
    if (cached && this.logger) {
      // Removed debug cache logging for production
    }
  }

  logSessionError(sessionId: string, error: Error): void {
    const errorCount = (this.sessionErrors.get(sessionId) || 0) + 1;
    this.sessionErrors.set(sessionId, errorCount);

    // Only log individual errors after threshold or for new error types
    if (errorCount === 1 || errorCount === this.ERROR_THRESHOLD) {
      this.logger?.error(`[GitStatus] Failed for session ${sessionId} (${errorCount}x): ${error.message}`);
    } else if (errorCount > this.ERROR_THRESHOLD && errorCount % 10 === 0) {
      this.logger?.error(`[GitStatus] Still failing for session ${sessionId} (${errorCount}x)`);
    }
  }

  logSessionSuccess(sessionId: string): void {
    // Clear error count on success
    if (this.sessionErrors.has(sessionId)) {
      this.sessionErrors.delete(sessionId);
      this.logger?.info(`[GitStatus] Session ${sessionId} recovered from previous errors`);
    }
  }

  // 3. Git Operations
  logGitOperation(operation: string, sessionId: string, projectId?: number): void {
    if (projectId !== undefined) {
      this.logger?.info(`[GitStatus] ${operation} triggered for project ${projectId}`);
    } else {
      this.logger?.verbose(`[GitStatus] ${operation} triggered for session ${sessionId}`);
    }
  }

  // 4. Window Focus Events
  logFocusChange(focused: boolean): void {
    this.logger?.info(`[GitStatus] Polling ${focused ? 'resumed' : 'paused'} (window ${focused ? 'focused' : 'blurred'})`);
  }

  // 5. Summary Statistics
  logSummary(): void {
    if (this.sessionErrors.size > 0) {
      const errorSummary = Array.from(this.sessionErrors.entries())
        .map(([id, count]) => `${id}: ${count}`)
        .join(', ');
      this.logger?.warn(`[GitStatus] Sessions with errors: ${errorSummary}`);
    }
  }

  // 6. Debounce Events
  logDebounce(sessionId: string, action: 'start' | 'complete' | 'cancelled'): void {
    // Only log in verbose mode
    this.logger?.verbose(`[GitStatus] Debounce ${action} for session ${sessionId}`);
  }
}
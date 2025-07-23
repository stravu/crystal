/**
 * Frontend git status logging utility
 * Provides consistent, grouped logging for git status operations
 */

interface GitStatusLogContext {
  operation: 'poll' | 'refresh' | 'update' | 'load';
  count?: number;
  sessionId?: string;
  projectName?: string;
  state?: string;
}

class FrontendGitStatusLogger {
  private updateCount = 0;
  private lastLogTime = 0;
  private readonly LOG_THROTTLE_MS = 1000; // Throttle repeated logs

  /**
   * Log git status operations with appropriate verbosity
   */
  log(context: GitStatusLogContext): void {
    const now = Date.now();
    
    // Throttle repeated update logs
    if (context.operation === 'update' && now - this.lastLogTime < this.LOG_THROTTLE_MS) {
      this.updateCount++;
      return;
    }

    // Flush any accumulated updates
    if (this.updateCount > 0) {
      console.log(`[GitStatus] ${this.updateCount} status updates (throttled)`);
      this.updateCount = 0;
    }

    this.lastLogTime = now;

    switch (context.operation) {
      case 'poll':
        if (context.count && context.count > 0) {
          console.log(`[GitStatus] Polling ${context.count} sessions`);
        }
        break;

      case 'refresh':
        if (context.count && context.count > 0) {
          const target = context.projectName ? `project "${context.projectName}"` : 'sessions';
          console.log(`[GitStatus] Refreshed ${context.count} sessions in ${target}`);
        }
        break;

      case 'update':
        // Only log non-clean states or in development
        if (context.state && (context.state !== 'clean' || process.env.NODE_ENV === 'development')) {
          const shortId = context.sessionId ? context.sessionId.substring(0, 8) : 'unknown';
          console.log(`[GitStatus] ${shortId} → ${context.state}`);
        }
        break;

      case 'load':
        if (context.count) {
          console.log(`[GitStatus] Loaded ${context.count} sessions`);
        }
        break;
    }
  }

  /**
   * Log errors with deduplication
   */
  private errorCache = new Map<string, number>();
  
  logError(error: string, context?: string): void {
    const key = `${context || 'general'}:${error}`;
    const count = (this.errorCache.get(key) || 0) + 1;
    this.errorCache.set(key, count);

    // Log first occurrence and then every 10th
    if (count === 1 || count % 10 === 0) {
      const suffix = count > 1 ? ` (${count}x)` : '';
      console.error(`[GitStatus${context ? `:${context}` : ''}] ${error}${suffix}`);
    }
  }

  /**
   * Clear error cache (e.g., on successful recovery)
   */
  clearErrors(context?: string): void {
    if (context) {
      // Clear specific context
      for (const key of this.errorCache.keys()) {
        if (key.startsWith(`${context}:`)) {
          this.errorCache.delete(key);
        }
      }
    } else {
      // Clear all
      this.errorCache.clear();
    }
  }
}

// Export singleton instance
export const gitStatusLogger = new FrontendGitStatusLogger();
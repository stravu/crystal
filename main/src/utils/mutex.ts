import { Logger } from './logger';

// Use console logging for mutex operations since logger might not be available
const logger = {
  debug: (msg: string) => console.log(`[Mutex] ${msg}`),
  warn: (msg: string) => console.warn(`[Mutex] ${msg}`)
};

/**
 * A simple async mutex implementation for preventing race conditions
 * in critical sections of code. Supports named locks and timeouts.
 */
export class Mutex {
  private locks = new Map<string, Promise<void>>();
  private lockCounts = new Map<string, number>();
  private defaultTimeout = 30000; // 30 seconds

  /**
   * Acquire a lock for the given resource name
   * @param resourceName - Unique name for the resource to lock
   * @param timeout - Optional timeout in milliseconds (default: 30 seconds)
   * @returns Promise<() => void> - Release function to unlock the resource
   */
  async acquire(resourceName: string, timeout: number = this.defaultTimeout): Promise<() => void> {
    const startTime = Date.now();
    
    // If there's already a lock for this resource, wait for it
    while (this.locks.has(resourceName)) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Mutex timeout after ${timeout}ms waiting for lock: ${resourceName}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Create a new lock promise
    let releaseLock: (() => void) | null = null;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });

    // Store the lock
    this.locks.set(resourceName, lockPromise);
    this.lockCounts.set(resourceName, (this.lockCounts.get(resourceName) || 0) + 1);
    
    const lockId = this.lockCounts.get(resourceName);

    // Return the release function
    return () => {
      if (this.locks.get(resourceName) === lockPromise) {
        this.locks.delete(resourceName);
      }
      
      if (releaseLock) {
        releaseLock();
      }
    };
  }

  /**
   * Execute a function with a mutex lock
   * @param resourceName - Unique name for the resource to lock
   * @param fn - Function to execute while holding the lock
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise<T> - Result of the function execution
   */
  async withLock<T>(
    resourceName: string, 
    fn: () => Promise<T> | T, 
    timeout?: number
  ): Promise<T> {
    const release = await this.acquire(resourceName, timeout);
    
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Check if a resource is currently locked
   * @param resourceName - Name of the resource to check
   * @returns boolean - True if the resource is locked
   */
  isLocked(resourceName: string): boolean {
    return this.locks.has(resourceName);
  }

  /**
   * Get the current number of active locks
   * @returns number - Number of active locks
   */
  getActiveLockCount(): number {
    return this.locks.size;
  }

  /**
   * Get all currently locked resource names
   * @returns string[] - Array of locked resource names
   */
  getLockedResources(): string[] {
    return Array.from(this.locks.keys());
  }

  /**
   * Force release all locks (use with caution)
   */
  releaseAll(): void {
    logger.warn(`[Mutex] Force releasing all locks (${this.locks.size} active locks)`);
    this.locks.clear();
    this.lockCounts.clear();
  }
}

// Global mutex instance for the application
export const mutex = new Mutex();

/**
 * Convenience function to execute code with a named lock
 * @param resourceName - Unique name for the resource to lock
 * @param fn - Function to execute while holding the lock
 * @param timeout - Optional timeout in milliseconds
 * @returns Promise<T> - Result of the function execution
 */
export async function withLock<T>(
  resourceName: string, 
  fn: () => Promise<T> | T, 
  timeout?: number
): Promise<T> {
  return mutex.withLock(resourceName, fn, timeout);
}

/**
 * Convenience function to acquire a named lock
 * @param resourceName - Unique name for the resource to lock
 * @param timeout - Optional timeout in milliseconds
 * @returns Promise<() => void> - Release function to unlock the resource
 */
export async function acquireLock(resourceName: string, timeout?: number): Promise<() => void> {
  return mutex.acquire(resourceName, timeout);
}

/**
 * Check if a resource is currently locked
 * @param resourceName - Name of the resource to check
 * @returns boolean - True if the resource is locked
 */
export function isLocked(resourceName: string): boolean {
  return mutex.isLocked(resourceName);
}
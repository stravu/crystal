/**
 * Database adapter interface for abstracting database operations
 * across different database engines (SQLite, PostgreSQL, etc.)
 */

export interface MigrationRecord {
  name: string;
  executedAt: Date;
}

export interface DatabaseAdapter {
  /**
   * Execute a SQL query with optional parameters
   */
  exec(sql: string, params?: any[]): void;

  /**
   * Execute a query and return all rows
   */
  all<T = any>(sql: string, params?: any[]): T[];

  /**
   * Execute a query and return the first row
   */
  get<T = any>(sql: string, params?: any[]): T | undefined;

  /**
   * Run a query and return info about changes
   */
  run(sql: string, params?: any[]): { changes: number; lastInsertRowid: number | bigint };

  /**
   * Begin a transaction
   */
  transaction<T>(fn: () => T): T;

  /**
   * Get list of executed migrations
   */
  getExecutedMigrations(): Promise<MigrationRecord[]>;

  /**
   * Record a migration as executed
   */
  recordMigration(name: string): Promise<void>;

  /**
   * Remove a migration record
   */
  removeMigration(name: string): Promise<void>;

  /**
   * Ensure migration tracking table exists
   */
  ensureMigrationTable(): Promise<void>;

  /**
   * Acquire a migration lock
   * @returns true if lock was acquired, false if another migration is running
   */
  acquireMigrationLock(): Promise<boolean>;

  /**
   * Release the migration lock
   */
  releaseMigrationLock(): Promise<void>;

  /**
   * Close the database connection
   */
  close(): void;
}
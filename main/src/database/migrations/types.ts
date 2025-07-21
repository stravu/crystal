import { DatabaseAdapter } from '../adapters/DatabaseAdapter';

export interface MigrationContext {
  adapter: DatabaseAdapter;
  /**
   * Helper to get the current timestamp in SQLite format
   */
  now: () => string;
  /**
   * Helper to check if a table exists
   */
  tableExists: (tableName: string) => boolean;
  /**
   * Helper to check if a column exists
   */
  columnExists: (tableName: string, columnName: string) => boolean;
}

export interface Migration {
  name: string;
  up: (context: MigrationContext) => Promise<void> | void;
  down: (context: MigrationContext) => Promise<void> | void;
}
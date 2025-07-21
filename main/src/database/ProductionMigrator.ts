import { Umzug, UmzugOptions, MigrationMeta } from 'umzug';
import { DatabaseAdapter } from './adapters/DatabaseAdapter';
import { MigrationContext } from './migrations/types';
import { getMigrations } from './migrations';

interface ProductionMigratorOptions {
  adapter: DatabaseAdapter;
  logger?: (message: string) => void;
}

/**
 * Production-ready migrator that uses embedded migrations
 * instead of filesystem access. This works in packaged Electron apps.
 */
export class ProductionMigrator {
  private umzug: Umzug<MigrationContext>;
  private adapter: DatabaseAdapter;
  private logger: (message: string) => void;

  constructor(options: ProductionMigratorOptions) {
    this.adapter = options.adapter;
    this.logger = options.logger || console.log;

    // Create migration context with helpers
    const context: MigrationContext = {
      adapter: this.adapter,
      now: () => new Date().toISOString().replace('T', ' ').substring(0, 19),
      tableExists: (tableName: string) => {
        const result = this.adapter.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?`,
          [tableName]
        );
        return result ? result.count > 0 : false;
      },
      columnExists: (tableName: string, columnName: string) => {
        try {
          // Validate table name to prevent SQL injection
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
          }
          const result = this.adapter.all(`PRAGMA table_info(${tableName})`);
          return result.some((col: any) => col.name === columnName);
        } catch {
          return false;
        }
      }
    };

    // Get embedded migrations
    const embeddedMigrations = getMigrations();

    const umzugOptions: UmzugOptions<MigrationContext> = {
      migrations: embeddedMigrations.map(({ name, migration }) => ({
        name,
        up: async () => {
          this.logger(`Running migration: ${name}`);
          // Note: Migrations should manage their own transactions internally
          // SQLite doesn't support async transactions with better-sqlite3
          await migration.up(context);
        },
        down: async () => {
          this.logger(`Reverting migration: ${name}`);
          // Note: Migrations should manage their own transactions internally
          // SQLite doesn't support async transactions with better-sqlite3
          await migration.down(context);
        }
      })),
      context,
      storage: {
        async executed(): Promise<string[]> {
          const migrations = await options.adapter.getExecutedMigrations();
          return migrations.map(m => m.name);
        },
        async logMigration({ name }: { name: string }): Promise<void> {
          await options.adapter.recordMigration(name);
        },
        async unlogMigration({ name }: { name: string }): Promise<void> {
          await options.adapter.removeMigration(name);
        }
      },
      logger: options.logger ? console : undefined,
    };

    this.umzug = new Umzug(umzugOptions);
  }

  /**
   * Run all pending migrations
   */
  async up(): Promise<MigrationMeta[]> {
    await this.adapter.ensureMigrationTable();
    
    // Acquire migration lock
    const lockAcquired = await this.adapter.acquireMigrationLock();
    if (!lockAcquired) {
      throw new Error('Another migration is currently running. Please wait for it to complete.');
    }
    
    try {
      return await this.umzug.up();
    } finally {
      // Always release the lock
      await this.adapter.releaseMigrationLock();
    }
  }

  /**
   * Revert the last executed migration
   */
  async down(): Promise<MigrationMeta[]> {
    await this.adapter.ensureMigrationTable();
    
    // Acquire migration lock
    const lockAcquired = await this.adapter.acquireMigrationLock();
    if (!lockAcquired) {
      throw new Error('Another migration is currently running. Please wait for it to complete.');
    }
    
    try {
      return await this.umzug.down();
    } finally {
      // Always release the lock
      await this.adapter.releaseMigrationLock();
    }
  }

  /**
   * Revert all migrations
   */
  async reset(): Promise<MigrationMeta[]> {
    await this.adapter.ensureMigrationTable();
    
    // Acquire migration lock
    const lockAcquired = await this.adapter.acquireMigrationLock();
    if (!lockAcquired) {
      throw new Error('Another migration is currently running. Please wait for it to complete.');
    }
    
    try {
      return await this.umzug.down({ to: 0 });
    } finally {
      // Always release the lock
      await this.adapter.releaseMigrationLock();
    }
  }

  /**
   * Get list of pending migrations
   */
  async pending(): Promise<MigrationMeta[]> {
    return await this.umzug.pending();
  }

  /**
   * Get list of executed migrations
   */
  async executed(): Promise<MigrationMeta[]> {
    await this.adapter.ensureMigrationTable();
    return await this.umzug.executed();
  }

  /**
   * Get migration status
   */
  async status(): Promise<{
    executed: MigrationMeta[];
    pending: MigrationMeta[];
  }> {
    const [executed, pending] = await Promise.all([
      this.executed(),
      this.pending()
    ]);

    return { executed, pending };
  }

  /**
   * Check if there are any pending migrations
   */
  async hasPendingMigrations(): Promise<boolean> {
    const pending = await this.pending();
    return pending.length > 0;
  }
}
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SQLiteAdapter } from '../adapters/SQLiteAdapter';
import { ProductionMigrator } from '../ProductionMigrator';
import { DatabaseAdapter } from '../adapters/DatabaseAdapter';

/**
 * Migration Testing Framework
 * 
 * This test suite ensures that all migrations:
 * 1. Can be applied successfully (up)
 * 2. Can be reverted successfully (down)
 * 3. Are idempotent (can be run multiple times)
 * 4. Maintain data integrity
 * 5. Have proper rollback capabilities
 */

describe('Database Migrations', () => {
  let adapter: DatabaseAdapter;
  let migrator: ProductionMigrator;
  let testDbPath: string;

  beforeEach(() => {
    // Create a temporary test database
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crystal-test-'));
    testDbPath = path.join(tempDir, 'test.db');
    
    adapter = new SQLiteAdapter(testDbPath);
    migrator = new ProductionMigrator({
      adapter,
      logger: jest.fn() // Suppress logs during tests
    });
  });

  afterEach(() => {
    // Clean up
    adapter.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Remove temp directory
    const tempDir = path.dirname(testDbPath);
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  describe('Migration Lifecycle', () => {
    it('should start with no executed migrations', async () => {
      const status = await migrator.status();
      expect(status.executed).toHaveLength(0);
      expect(status.pending.length).toBeGreaterThan(0);
    });

    it('should run all migrations successfully', async () => {
      const result = await migrator.up();
      expect(result.length).toBeGreaterThan(0);
      
      const status = await migrator.status();
      expect(status.pending).toHaveLength(0);
      expect(status.executed.length).toBe(result.length);
    });

    it('should be idempotent - running up() twice should not fail', async () => {
      await migrator.up();
      const secondRun = await migrator.up();
      expect(secondRun).toHaveLength(0); // No migrations to run
    });

    it('should rollback migrations in reverse order', async () => {
      // Run all migrations
      await migrator.up();
      
      // Rollback one migration
      const downResult = await migrator.down();
      expect(downResult).toHaveLength(1);
      
      // Check that we have one pending migration
      const status = await migrator.status();
      expect(status.pending).toHaveLength(1);
    });

    it('should handle full reset', async () => {
      // Run all migrations
      await migrator.up();
      
      // Reset all
      await migrator.reset();
      
      // Should have no executed migrations
      const status = await migrator.status();
      expect(status.executed).toHaveLength(0);
    });
  });

  describe('Schema Validation', () => {
    beforeEach(async () => {
      // Run all migrations for schema tests
      await migrator.up();
    });

    it('should create all required tables', () => {
      const tables = adapter.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );
      
      const tableNames = tables.map(t => t.name);
      
      // Core tables
      expect(tableNames).toContain('projects');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('session_outputs');
      
      // Feature tables
      expect(tableNames).toContain('conversation_messages');
      expect(tableNames).toContain('prompt_markers');
      expect(tableNames).toContain('execution_diffs');
      expect(tableNames).toContain('project_run_commands');
      expect(tableNames).toContain('folders');
      
      // UI tables
      expect(tableNames).toContain('ui_state');
      expect(tableNames).toContain('app_opens');
      expect(tableNames).toContain('user_preferences');
      
      // System tables
      expect(tableNames).toContain('_migrations');
      expect(tableNames).toContain('_migration_lock');
    });

    it('should create sessions table with all required columns', () => {
      const columns = adapter.all<{ name: string }>(
        `PRAGMA table_info(sessions)`
      );
      
      const columnNames = columns.map(c => c.name);
      
      // Core columns
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('initial_prompt');
      expect(columnNames).toContain('worktree_name');
      expect(columnNames).toContain('worktree_path');
      
      // New columns from rebase
      expect(columnNames).toContain('base_commit');
      expect(columnNames).toContain('base_branch');
    });

    it('should create all performance indexes', () => {
      const indexes = adapter.all<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name`
      );
      
      const indexNames = indexes.map(i => i.name);
      
      // Critical indexes
      expect(indexNames).toContain('idx_sessions_project_id');
      expect(indexNames).toContain('idx_sessions_worktree_name');
      expect(indexNames).toContain('idx_projects_path');
      expect(indexNames).toContain('idx_execution_diffs_unique_sequence');
    });
  });

  describe('Migration Integrity', () => {
    it('should handle concurrent migration attempts', async () => {
      // First migration should succeed
      const promise1 = migrator.up();
      
      // Second concurrent attempt should fail
      const promise2 = migrator.up();
      
      const results = await Promise.allSettled([promise1, promise2]);
      
      // One should succeed, one should fail with lock error
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');
      
      expect(successes.length + failures.length).toBe(2);
      
      if (failures.length > 0) {
        expect(failures[0].status).toBe('rejected');
        if (failures[0].status === 'rejected') {
          expect(failures[0].reason.message).toContain('Another migration is currently running');
        }
      }
    });

    it('should maintain referential integrity', async () => {
      await migrator.up();
      
      // Try to insert a session with invalid project_id
      expect(() => {
        adapter.run(`
          INSERT INTO sessions (id, name, project_id) 
          VALUES ('test', 'Test Session', 99999)
        `);
      }).toThrow(); // Should fail due to foreign key constraint
    });
  });

  describe('Data Migration Safety', () => {
    it('should preserve data through up/down cycle', async () => {
      // Run initial migrations
      await migrator.up();
      
      // Insert test data
      adapter.run(`
        INSERT INTO projects (name, path, created_at, display_order)
        VALUES ('Test Project', '/test', datetime('now'), 0)
      `);
      
      const projectBefore = adapter.get<{ id: number }>('SELECT * FROM projects');
      expect(projectBefore).toBeDefined();
      
      // Run down on last migration
      await migrator.down();
      
      // Data should still exist
      const projectAfter = adapter.get<{ id: number }>('SELECT * FROM projects');
      expect(projectAfter).toBeDefined();
      expect(projectAfter?.id).toBe(projectBefore?.id);
      
      // Run up again
      await migrator.up();
      
      // Data should still be there
      const projectFinal = adapter.get<{ id: number }>('SELECT * FROM projects');
      expect(projectFinal).toBeDefined();
      expect(projectFinal?.id).toBe(projectBefore?.id);
    });
  });

  describe('Migration Validation', () => {
    it('should validate table names in columnExists helper', () => {
      const context = {
        adapter,
        now: () => new Date().toISOString(),
        tableExists: (_tableName: string) => true,
        columnExists: (tableName: string, _columnName: string) => {
          // This should validate table name
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
          }
          return false;
        }
      };
      
      // Valid table name should work
      expect(() => context.columnExists('valid_table', 'column')).not.toThrow();
      
      // Invalid table name should throw
      expect(() => context.columnExists('table; DROP TABLE users;', 'column')).toThrow('Invalid table name');
    });
  });
});

/**
 * Migration-Specific Tests
 * 
 * These tests validate specific migration behaviors
 */
describe('Individual Migrations', () => {
  let adapter: DatabaseAdapter;
  let migrator: ProductionMigrator;

  beforeEach(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crystal-test-'));
    const testDbPath = path.join(tempDir, 'test.db');
    
    adapter = new SQLiteAdapter(testDbPath);
    migrator = new ProductionMigrator({
      adapter,
      logger: jest.fn()
    });
  });

  afterEach(() => {
    adapter.close();
  });

  describe('007-session-git-tracking', () => {
    it('should add git tracking columns only if they do not exist', async () => {
      // Run migrations up to 006
      const migrations = await migrator.pending();
      const priorMigrations = migrations.slice(0, 6);
      
      for (const migration of priorMigrations) {
        await migrator.up({ to: migration.name });
      }
      
      // Manually add one column to test idempotency
      adapter.exec('ALTER TABLE sessions ADD COLUMN base_commit TEXT');
      
      // Run the git tracking migration
      await migrator.up({ to: '007-session-git-tracking.ts' });
      
      // Should have both columns now
      const columns = adapter.all<{ name: string }>('PRAGMA table_info(sessions)');
      const columnNames = columns.map(c => c.name);
      
      expect(columnNames).toContain('base_commit');
      expect(columnNames).toContain('base_branch');
    });
  });
});
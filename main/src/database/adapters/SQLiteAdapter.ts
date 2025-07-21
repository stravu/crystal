import Database from 'better-sqlite3';
import { DatabaseAdapter, MigrationRecord } from './DatabaseAdapter';
import * as path from 'path';
import * as fs from 'fs';

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    // WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
  }

  exec(sql: string, params?: any[]): void {
    if (params && params.length > 0) {
      this.db.prepare(sql).run(...params);
    } else {
      this.db.exec(sql);
    }
  }

  all<T = any>(sql: string, params?: any[]): T[] {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.all(...params) : stmt.all()) as T[];
  }

  get<T = any>(sql: string, params?: any[]): T | undefined {
    const stmt = this.db.prepare(sql);
    return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
  }

  run(sql: string, params?: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.db.prepare(sql);
    const result = params ? stmt.run(...params) : stmt.run();
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid
    };
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  async getExecutedMigrations(): Promise<MigrationRecord[]> {
    await this.ensureMigrationTable();
    
    const rows = this.all<{ name: string; executed_at: string }>(
      'SELECT name, executed_at FROM _migrations ORDER BY executed_at ASC'
    );

    return rows.map(row => ({
      name: row.name,
      executedAt: new Date(row.executed_at)
    }));
  }

  async recordMigration(name: string): Promise<void> {
    await this.ensureMigrationTable();
    
    this.run(
      'INSERT INTO _migrations (name, executed_at) VALUES (?, datetime(\'now\'))',
      [name]
    );
  }

  async removeMigration(name: string): Promise<void> {
    await this.ensureMigrationTable();
    
    this.run('DELETE FROM _migrations WHERE name = ?', [name]);
  }

  async ensureMigrationTable(): Promise<void> {
    this.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        executed_at TEXT NOT NULL
      )
    `);
    
    // Also create migration lock table
    this.exec(`
      CREATE TABLE IF NOT EXISTS _migration_lock (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        locked BOOLEAN NOT NULL DEFAULT 0,
        locked_at TEXT,
        pid INTEGER
      )
    `);
    
    // Insert initial lock record if it doesn't exist
    this.run(`
      INSERT OR IGNORE INTO _migration_lock (id, locked) VALUES (1, 0)
    `);
  }

  async acquireMigrationLock(): Promise<boolean> {
    try {
      // Try to acquire lock in a transaction
      return this.transaction(() => {
        const lock = this.get<{ locked: number; pid: number | null }>(
          'SELECT locked, pid FROM _migration_lock WHERE id = 1'
        );
        
        if (lock && lock.locked === 1) {
          // Check if the process that holds the lock is still alive
          // For now, we'll just assume it's still running
          // In a production system, you'd check if the PID is still active
          return false;
        }
        
        // Acquire the lock
        this.run(`
          UPDATE _migration_lock 
          SET locked = 1, locked_at = datetime('now'), pid = ?
          WHERE id = 1
        `, [process.pid]);
        
        return true;
      });
    } catch (error) {
      console.error('Failed to acquire migration lock:', error);
      return false;
    }
  }

  async releaseMigrationLock(): Promise<void> {
    try {
      this.run(`
        UPDATE _migration_lock 
        SET locked = 0, locked_at = NULL, pid = NULL
        WHERE id = 1
      `);
    } catch (error) {
      console.error('Failed to release migration lock:', error);
    }
  }

  close(): void {
    this.db.close();
  }
}
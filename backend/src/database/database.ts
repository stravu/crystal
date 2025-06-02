import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import type { Session, SessionOutput, CreateSessionData, UpdateSessionData, ConversationMessage } from './models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseService {
  private db: sqlite3.Database;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbRun: (sql: string, params?: any[]) => Promise<{ lastID?: number; changes?: number }>;

  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath);
    
    // Promisify database methods
    this.dbAll = promisify(this.db.all.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
    
    // Custom wrapper for run to properly return results
    this.dbRun = (sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }> => {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    };
  }

  async initialize(): Promise<void> {
    await this.initializeSchema();
    await this.runMigrations();
  }

  private async initializeSchema(): Promise<void> {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute schema in parts (sqlite3 doesn't support multiple statements in exec)
    const statements = schema.split(';').filter(stmt => stmt.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.dbRun(statement.trim());
      }
    }
  }

  private async runMigrations(): Promise<void> {
    // Check if archived column exists
    const tableInfo = await this.dbAll("PRAGMA table_info(sessions)");
    const hasArchivedColumn = tableInfo.some((col: any) => col.name === 'archived');
    const hasInitialPromptColumn = tableInfo.some((col: any) => col.name === 'initial_prompt');
    
    if (!hasArchivedColumn) {
      // Run migration to add archived column
      await this.dbRun("ALTER TABLE sessions ADD COLUMN archived BOOLEAN DEFAULT 0");
      await this.dbRun("CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived)");
    }

    // Check if we need to rename prompt to initial_prompt
    if (!hasInitialPromptColumn) {
      const hasPromptColumn = tableInfo.some((col: any) => col.name === 'prompt');
      if (hasPromptColumn) {
        await this.dbRun("ALTER TABLE sessions RENAME COLUMN prompt TO initial_prompt");
      }
      
      // Create conversation messages table if it doesn't exist
      const tables = await this.dbAll("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_messages'");
      if (tables.length === 0) {
        await this.dbRun(`
          CREATE TABLE conversation_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            message_type TEXT NOT NULL CHECK (message_type IN ('user', 'assistant')),
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          )
        `);
        await this.dbRun("CREATE INDEX idx_conversation_messages_session_id ON conversation_messages(session_id)");
        await this.dbRun("CREATE INDEX idx_conversation_messages_timestamp ON conversation_messages(timestamp)");
      }
    }
  }

  // Session operations
  async createSession(data: CreateSessionData): Promise<Session> {
    await this.dbRun(`
      INSERT INTO sessions (id, name, initial_prompt, worktree_name, worktree_path, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [data.id, data.name, data.initial_prompt, data.worktree_name, data.worktree_path]);
    
    const session = await this.getSession(data.id);
    if (!session) {
      throw new Error('Failed to create session');
    }
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    return await this.dbGet('SELECT * FROM sessions WHERE id = ?', [id]) as Session | undefined;
  }

  async getAllSessions(): Promise<Session[]> {
    return await this.dbAll('SELECT * FROM sessions WHERE archived = 0 OR archived IS NULL ORDER BY created_at DESC') as Session[];
  }

  async getAllSessionsIncludingArchived(): Promise<Session[]> {
    return await this.dbAll('SELECT * FROM sessions ORDER BY created_at DESC') as Session[];
  }

  async updateSession(id: string, data: UpdateSessionData): Promise<Session | undefined> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.last_output !== undefined) {
      updates.push('last_output = ?');
      values.push(data.last_output);
    }
    if (data.exit_code !== undefined) {
      updates.push('exit_code = ?');
      values.push(data.exit_code);
    }
    if (data.pid !== undefined) {
      updates.push('pid = ?');
      values.push(data.pid);
    }

    if (updates.length === 0) {
      return await this.getSession(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await this.dbRun(`
      UPDATE sessions 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `, values);
    
    return await this.getSession(id);
  }

  async archiveSession(id: string): Promise<boolean> {
    const result = await this.dbRun('UPDATE sessions SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return (result.changes || 0) > 0;
  }

  // Session output operations
  async addSessionOutput(sessionId: string, type: 'stdout' | 'stderr' | 'system' | 'json', data: string): Promise<void> {
    await this.dbRun(`
      INSERT INTO session_outputs (session_id, type, data)
      VALUES (?, ?, ?)
    `, [sessionId, type, data]);
  }

  async getSessionOutputs(sessionId: string, limit?: number): Promise<SessionOutput[]> {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    return await this.dbAll(`
      SELECT * FROM session_outputs 
      WHERE session_id = ? 
      ORDER BY timestamp ASC 
      ${limitClause}
    `, [sessionId]) as SessionOutput[];
  }

  async getRecentSessionOutputs(sessionId: string, since?: Date): Promise<SessionOutput[]> {
    if (since) {
      return await this.dbAll(`
        SELECT * FROM session_outputs 
        WHERE session_id = ? AND timestamp > ? 
        ORDER BY timestamp ASC
      `, [sessionId, since.toISOString()]) as SessionOutput[];
    } else {
      return await this.getSessionOutputs(sessionId);
    }
  }

  async clearSessionOutputs(sessionId: string): Promise<void> {
    await this.dbRun('DELETE FROM session_outputs WHERE session_id = ?', [sessionId]);
  }

  // Conversation message operations
  async addConversationMessage(sessionId: string, messageType: 'user' | 'assistant', content: string): Promise<void> {
    await this.dbRun(`
      INSERT INTO conversation_messages (session_id, message_type, content)
      VALUES (?, ?, ?)
    `, [sessionId, messageType, content]);
  }

  async getConversationMessages(sessionId: string): Promise<ConversationMessage[]> {
    return await this.dbAll(`
      SELECT * FROM conversation_messages 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `, [sessionId]) as ConversationMessage[];
  }

  async clearConversationMessages(sessionId: string): Promise<void> {
    await this.dbRun('DELETE FROM conversation_messages WHERE session_id = ?', [sessionId]);
  }

  // Cleanup operations
  async getActiveSessions(): Promise<Session[]> {
    return await this.dbAll("SELECT * FROM sessions WHERE status IN ('running', 'pending')") as Session[];
  }

  async markSessionsAsStopped(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    
    const placeholders = sessionIds.map(() => '?').join(',');
    await this.dbRun(`
      UPDATE sessions 
      SET status = 'stopped', updated_at = CURRENT_TIMESTAMP 
      WHERE id IN (${placeholders})
    `, sessionIds);
  }

  close(): void {
    this.db.close();
  }
}
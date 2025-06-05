import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import type { Session, SessionOutput, CreateSessionData, UpdateSessionData, ConversationMessage, PromptMarker, ExecutionDiff, CreateExecutionDiffData } from './models.js';

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

    // Check if prompt_markers table exists
    const promptMarkersTable = await this.dbAll("SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_markers'");
    if (promptMarkersTable.length === 0) {
      await this.dbRun(`
        CREATE TABLE prompt_markers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_text TEXT NOT NULL,
          output_index INTEGER NOT NULL,
          output_line INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `);
      await this.dbRun("CREATE INDEX idx_prompt_markers_session_id ON prompt_markers(session_id)");
      await this.dbRun("CREATE INDEX idx_prompt_markers_timestamp ON prompt_markers(timestamp)");
    } else {
      // Check if the table has the correct column name
      const promptMarkersInfo = await this.dbAll("PRAGMA table_info(prompt_markers)");
      const hasOutputLineColumn = promptMarkersInfo.some((col: any) => col.name === 'output_line');
      const hasTerminalLineColumn = promptMarkersInfo.some((col: any) => col.name === 'terminal_line');
      
      if (hasTerminalLineColumn && !hasOutputLineColumn) {
        // Rename the column from terminal_line to output_line
        await this.dbRun(`
          ALTER TABLE prompt_markers RENAME COLUMN terminal_line TO output_line
        `);
      }
    }

    // Check if execution_diffs table exists
    const executionDiffsTable = await this.dbAll("SELECT name FROM sqlite_master WHERE type='table' AND name='execution_diffs'");
    if (executionDiffsTable.length === 0) {
      await this.dbRun(`
        CREATE TABLE execution_diffs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_marker_id INTEGER,
          execution_sequence INTEGER NOT NULL,
          git_diff TEXT,
          files_changed TEXT,
          stats_additions INTEGER DEFAULT 0,
          stats_deletions INTEGER DEFAULT 0,
          stats_files_changed INTEGER DEFAULT 0,
          before_commit_hash TEXT,
          after_commit_hash TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
          FOREIGN KEY (prompt_marker_id) REFERENCES prompt_markers(id) ON DELETE SET NULL
        )
      `);
      await this.dbRun("CREATE INDEX idx_execution_diffs_session_id ON execution_diffs(session_id)");
      await this.dbRun("CREATE INDEX idx_execution_diffs_prompt_marker_id ON execution_diffs(prompt_marker_id)");
      await this.dbRun("CREATE INDEX idx_execution_diffs_timestamp ON execution_diffs(timestamp)");
      await this.dbRun("CREATE INDEX idx_execution_diffs_sequence ON execution_diffs(session_id, execution_sequence)");
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

  // Prompt marker operations
  async addPromptMarker(sessionId: string, promptText: string, outputIndex: number, outputLine?: number): Promise<number> {
    const result = await this.dbRun(`
      INSERT INTO prompt_markers (session_id, prompt_text, output_index, output_line)
      VALUES (?, ?, ?, ?)
    `, [sessionId, promptText, outputIndex, outputLine]);
    
    return result.lastID!;
  }

  async getPromptMarkers(sessionId: string): Promise<PromptMarker[]> {
    return await this.dbAll(`
      SELECT * FROM prompt_markers 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `, [sessionId]) as PromptMarker[];
  }

  async updatePromptMarkerLine(id: number, outputLine: number): Promise<void> {
    await this.dbRun(`
      UPDATE prompt_markers 
      SET output_line = ? 
      WHERE id = ?
    `, [outputLine, id]);
  }

  // Execution diff operations
  async createExecutionDiff(data: CreateExecutionDiffData): Promise<ExecutionDiff> {
    const result = await this.dbRun(`
      INSERT INTO execution_diffs (
        session_id, prompt_marker_id, execution_sequence, git_diff, 
        files_changed, stats_additions, stats_deletions, stats_files_changed,
        before_commit_hash, after_commit_hash
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      data.session_id,
      data.prompt_marker_id || null,
      data.execution_sequence,
      data.git_diff || null,
      data.files_changed ? JSON.stringify(data.files_changed) : null,
      data.stats_additions || 0,
      data.stats_deletions || 0,
      data.stats_files_changed || 0,
      data.before_commit_hash || null,
      data.after_commit_hash || null
    ]);

    const diff = await this.dbGet('SELECT * FROM execution_diffs WHERE id = ?', [result.lastID!]);
    return this.convertDbExecutionDiff(diff);
  }

  async getExecutionDiffs(sessionId: string): Promise<ExecutionDiff[]> {
    const rows = await this.dbAll(`
      SELECT * FROM execution_diffs 
      WHERE session_id = ? 
      ORDER BY execution_sequence ASC
    `, [sessionId]);
    
    return rows.map(this.convertDbExecutionDiff);
  }

  async getExecutionDiff(id: number): Promise<ExecutionDiff | undefined> {
    const row = await this.dbGet('SELECT * FROM execution_diffs WHERE id = ?', [id]);
    return row ? this.convertDbExecutionDiff(row) : undefined;
  }

  async getNextExecutionSequence(sessionId: string): Promise<number> {
    const result = await this.dbGet(`
      SELECT MAX(execution_sequence) as max_seq 
      FROM execution_diffs 
      WHERE session_id = ?
    `, [sessionId]);
    
    return (result?.max_seq || 0) + 1;
  }

  private convertDbExecutionDiff(row: any): ExecutionDiff {
    return {
      id: row.id,
      session_id: row.session_id,
      prompt_marker_id: row.prompt_marker_id,
      execution_sequence: row.execution_sequence,
      git_diff: row.git_diff,
      files_changed: row.files_changed ? JSON.parse(row.files_changed) : [],
      stats_additions: row.stats_additions,
      stats_deletions: row.stats_deletions,
      stats_files_changed: row.stats_files_changed,
      before_commit_hash: row.before_commit_hash,
      after_commit_hash: row.after_commit_hash,
      timestamp: row.timestamp
    };
  }

  close(): void {
    this.db.close();
  }
}
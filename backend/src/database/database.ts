import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Session, SessionOutput, CreateSessionData, UpdateSessionData, ConversationMessage, PromptMarker, ExecutionDiff, CreateExecutionDiffData } from './models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  initialize(): void {
    this.initializeSchema();
    this.runMigrations();
  }

  private initializeSchema(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute schema in parts (sqlite3 doesn't support multiple statements in exec)
    const statements = schema.split(';').filter(stmt => stmt.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        this.db.prepare(statement.trim()).run();
      }
    }
  }

  private runMigrations(): void {
    // Check if archived column exists
    const tableInfo = this.db.prepare("PRAGMA table_info(sessions)").all();
    const hasArchivedColumn = tableInfo.some((col: any) => col.name === 'archived');
    const hasInitialPromptColumn = tableInfo.some((col: any) => col.name === 'initial_prompt');
    const hasLastViewedAtColumn = tableInfo.some((col: any) => col.name === 'last_viewed_at');
    
    if (!hasArchivedColumn) {
      // Run migration to add archived column
      this.db.prepare("ALTER TABLE sessions ADD COLUMN archived BOOLEAN DEFAULT 0").run();
      this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived)").run();
    }

    // Check if we need to rename prompt to initial_prompt
    if (!hasInitialPromptColumn) {
      const hasPromptColumn = tableInfo.some((col: any) => col.name === 'prompt');
      if (hasPromptColumn) {
        this.db.prepare("ALTER TABLE sessions RENAME COLUMN prompt TO initial_prompt").run();
      }
      
      // Create conversation messages table if it doesn't exist
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_messages'").all();
      if (tables.length === 0) {
        this.db.prepare(`
          CREATE TABLE conversation_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            message_type TEXT NOT NULL CHECK (message_type IN ('user', 'assistant')),
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          )
        `).run();
        this.db.prepare("CREATE INDEX idx_conversation_messages_session_id ON conversation_messages(session_id)").run();
        this.db.prepare("CREATE INDEX idx_conversation_messages_timestamp ON conversation_messages(timestamp)").run();
      }
    }

    // Check if prompt_markers table exists
    const promptMarkersTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_markers'").all();
    if (promptMarkersTable.length === 0) {
      this.db.prepare(`
        CREATE TABLE prompt_markers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_text TEXT NOT NULL,
          output_index INTEGER NOT NULL,
          output_line INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `).run();
      this.db.prepare("CREATE INDEX idx_prompt_markers_session_id ON prompt_markers(session_id)").run();
      this.db.prepare("CREATE INDEX idx_prompt_markers_timestamp ON prompt_markers(timestamp)").run();
    } else {
      // Check if the table has the correct column name
      const promptMarkersInfo = this.db.prepare("PRAGMA table_info(prompt_markers)").all();
      const hasOutputLineColumn = promptMarkersInfo.some((col: any) => col.name === 'output_line');
      const hasTerminalLineColumn = promptMarkersInfo.some((col: any) => col.name === 'terminal_line');
      
      if (hasTerminalLineColumn && !hasOutputLineColumn) {
        // Rename the column from terminal_line to output_line
        this.db.prepare(`
          ALTER TABLE prompt_markers RENAME COLUMN terminal_line TO output_line
        `).run();
      }
    }

    // Check if execution_diffs table exists
    const executionDiffsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='execution_diffs'").all();
    if (executionDiffsTable.length === 0) {
      this.db.prepare(`
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
      `).run();
      this.db.prepare("CREATE INDEX idx_execution_diffs_session_id ON execution_diffs(session_id)").run();
      this.db.prepare("CREATE INDEX idx_execution_diffs_prompt_marker_id ON execution_diffs(prompt_marker_id)").run();
      this.db.prepare("CREATE INDEX idx_execution_diffs_timestamp ON execution_diffs(timestamp)").run();
      this.db.prepare("CREATE INDEX idx_execution_diffs_sequence ON execution_diffs(session_id, execution_sequence)").run();
    }

    // Add last_viewed_at column if it doesn't exist
    if (!hasLastViewedAtColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN last_viewed_at TEXT").run();
    }

    // Check if claude_session_id column exists
    const sessionTableInfo = this.db.prepare("PRAGMA table_info(sessions)").all();
    const hasClaudeSessionIdColumn = sessionTableInfo.some((col: any) => col.name === 'claude_session_id');
    
    if (!hasClaudeSessionIdColumn) {
      // Add claude_session_id column to store Claude's actual session ID
      this.db.prepare("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT").run();
    }
  }

  // Session operations
  createSession(data: CreateSessionData): Session {
    this.db.prepare(`
      INSERT INTO sessions (id, name, initial_prompt, worktree_name, worktree_path, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(data.id, data.name, data.initial_prompt, data.worktree_name, data.worktree_path);
    
    const session = this.getSession(data.id);
    if (!session) {
      throw new Error('Failed to create session');
    }
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  }

  getAllSessions(): Session[] {
    return this.db.prepare('SELECT * FROM sessions WHERE archived = 0 OR archived IS NULL ORDER BY created_at DESC').all() as Session[];
  }

  getAllSessionsIncludingArchived(): Session[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as Session[];
  }

  updateSession(id: string, data: UpdateSessionData): Session | undefined {
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
    if (data.claude_session_id !== undefined) {
      updates.push('claude_session_id = ?');
      values.push(data.claude_session_id);
    }

    if (updates.length === 0) {
      return this.getSession(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    this.db.prepare(`
      UPDATE sessions 
      SET ${updates.join(', ')} 
      WHERE id = ?
    `).run(...values);
    
    return this.getSession(id);
  }

  markSessionAsViewed(id: string): Session | undefined {
    this.db.prepare(`
      UPDATE sessions 
      SET last_viewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(id);
    
    return this.getSession(id);
  }

  archiveSession(id: string): boolean {
    const result = this.db.prepare('UPDATE sessions SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Session output operations
  addSessionOutput(sessionId: string, type: 'stdout' | 'stderr' | 'system' | 'json', data: string): void {
    this.db.prepare(`
      INSERT INTO session_outputs (session_id, type, data)
      VALUES (?, ?, ?)
    `).run(sessionId, type, data);
  }

  getSessionOutputs(sessionId: string, limit?: number): SessionOutput[] {
    const limitClause = limit ? `LIMIT ${limit}` : '';
    return this.db.prepare(`
      SELECT * FROM session_outputs 
      WHERE session_id = ? 
      ORDER BY timestamp ASC 
      ${limitClause}
    `).all(sessionId) as SessionOutput[];
  }

  getRecentSessionOutputs(sessionId: string, since?: Date): SessionOutput[] {
    if (since) {
      return this.db.prepare(`
        SELECT * FROM session_outputs 
        WHERE session_id = ? AND timestamp > ? 
        ORDER BY timestamp ASC
      `).all(sessionId, since.toISOString()) as SessionOutput[];
    } else {
      return this.getSessionOutputs(sessionId);
    }
  }

  clearSessionOutputs(sessionId: string): void {
    this.db.prepare('DELETE FROM session_outputs WHERE session_id = ?').run(sessionId);
  }

  // Conversation message operations
  addConversationMessage(sessionId: string, messageType: 'user' | 'assistant', content: string): void {
    this.db.prepare(`
      INSERT INTO conversation_messages (session_id, message_type, content)
      VALUES (?, ?, ?)
    `).run(sessionId, messageType, content);
  }

  getConversationMessages(sessionId: string): ConversationMessage[] {
    return this.db.prepare(`
      SELECT * FROM conversation_messages 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `).all(sessionId) as ConversationMessage[];
  }

  clearConversationMessages(sessionId: string): void {
    this.db.prepare('DELETE FROM conversation_messages WHERE session_id = ?').run(sessionId);
  }

  // Cleanup operations
  getActiveSessions(): Session[] {
    return this.db.prepare("SELECT * FROM sessions WHERE status IN ('running', 'pending')").all() as Session[];
  }

  markSessionsAsStopped(sessionIds: string[]): void {
    if (sessionIds.length === 0) return;
    
    const placeholders = sessionIds.map(() => '?').join(',');
    this.db.prepare(`
      UPDATE sessions 
      SET status = 'stopped', updated_at = CURRENT_TIMESTAMP 
      WHERE id IN (${placeholders})
    `).run(...sessionIds);
  }

  // Prompt marker operations
  addPromptMarker(sessionId: string, promptText: string, outputIndex: number, outputLine?: number): number {
    const result = this.db.prepare(`
      INSERT INTO prompt_markers (session_id, prompt_text, output_index, output_line)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, promptText, outputIndex, outputLine);
    
    return result.lastInsertRowid as number;
  }

  getPromptMarkers(sessionId: string): PromptMarker[] {
    return this.db.prepare(`
      SELECT * FROM prompt_markers 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `).all(sessionId) as PromptMarker[];
  }

  updatePromptMarkerLine(id: number, outputLine: number): void {
    this.db.prepare(`
      UPDATE prompt_markers 
      SET output_line = ? 
      WHERE id = ?
    `).run(outputLine, id);
  }

  // Execution diff operations
  createExecutionDiff(data: CreateExecutionDiffData): ExecutionDiff {
    const result = this.db.prepare(`
      INSERT INTO execution_diffs (
        session_id, prompt_marker_id, execution_sequence, git_diff, 
        files_changed, stats_additions, stats_deletions, stats_files_changed,
        before_commit_hash, after_commit_hash
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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
    );

    const diff = this.db.prepare('SELECT * FROM execution_diffs WHERE id = ?').get(result.lastInsertRowid);
    return this.convertDbExecutionDiff(diff);
  }

  getExecutionDiffs(sessionId: string): ExecutionDiff[] {
    const rows = this.db.prepare(`
      SELECT * FROM execution_diffs 
      WHERE session_id = ? 
      ORDER BY execution_sequence ASC
    `).all(sessionId);
    
    return rows.map(this.convertDbExecutionDiff);
  }

  getExecutionDiff(id: number): ExecutionDiff | undefined {
    const row = this.db.prepare('SELECT * FROM execution_diffs WHERE id = ?').get(id);
    return row ? this.convertDbExecutionDiff(row) : undefined;
  }

  getNextExecutionSequence(sessionId: string): number {
    const result = this.db.prepare(`
      SELECT MAX(execution_sequence) as max_seq 
      FROM execution_diffs 
      WHERE session_id = ?
    `).get(sessionId) as any;
    
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
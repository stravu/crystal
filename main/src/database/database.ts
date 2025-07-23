import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { Project, ProjectRunCommand, Folder, Session, SessionOutput, CreateSessionData, UpdateSessionData, ConversationMessage, PromptMarker, ExecutionDiff, CreateExecutionDiffData } from './models';
import { SQLiteAdapter } from './adapters/SQLiteAdapter';
import { Migrator } from './Migrator';
import { ProductionMigrator } from './ProductionMigrator';

export class DatabaseService {
  private db: Database.Database;
  private adapter: SQLiteAdapter;
  private migrator: Migrator | ProductionMigrator;

  constructor(dbPath: string) {
    // Ensure the directory exists before creating the database
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    
    this.db = new Database(dbPath);
    
    // Emergency fallback for legacy system
    if (process.env.USE_NEW_MIGRATIONS === 'false') {
      throw new Error(
        'Legacy migration system has been removed. Please remove USE_NEW_MIGRATIONS=false and use the new migration system. See /src/database/MIGRATION_ROADMAP.md for details.'
      );
    }
    
    // Always use new migration system
    this.adapter = new SQLiteAdapter(dbPath);
    
    // Check if we're running in a packaged app
    const isPackaged = process.mainModule?.filename.indexOf('app.asar') !== -1 || 
                      process.env.NODE_ENV === 'production';
    
    if (isPackaged) {
      // Use embedded migrations for packaged apps
      this.migrator = new ProductionMigrator({
        adapter: this.adapter,
        logger: (message) => console.log(`[Migration] ${message}`)
      });
    } else {
      // Use filesystem migrations for development
      // Check if running via ts-node (development) or compiled JS
      const isTypescript = __filename.endsWith('.ts');
      const migrationsPath = isTypescript 
        ? join(__dirname, 'migrations')  // src/database/migrations for ts-node
        : join(__dirname, 'migrations');  // dist/main/src/database/migrations for compiled
      
      this.migrator = new Migrator({
        adapter: this.adapter,
        migrationsPath,
        logger: (message) => console.log(`[Migration] ${message}`)
      });
    }
  }

  async initialize(): Promise<void> {
    // Run all pending migrations
    await this.runMigrations();
  }

  private async runMigrations(): Promise<void> {
    try {
      // Run all pending migrations - they handle existing tables gracefully
      const pending = await this.migrator.pending();
      if (pending.length > 0) {
        console.log(`[Database] Running ${pending.length} pending migrations...`);
        const executed = await this.migrator.up();
        console.log(`[Database] Successfully ran ${executed.length} migrations`);
      } else {
        console.log('[Database] No pending migrations');
      }
    } catch (error) {
      console.error('[Database] Migration failed:', error);
      throw error;
    }

    // All database migrations are now handled by the migration system above.
    // No additional manual schema changes should be added here.
  }

  // Project operations
  createProject(name: string, path: string, systemPrompt?: string, runScript?: string, buildScript?: string, defaultPermissionMode?: 'approve' | 'ignore', openIdeCommand?: string, commitMode?: 'structured' | 'checkpoint' | 'disabled', commitStructuredPromptTemplate?: string, commitCheckpointPrefix?: string): Project {
    // Get the max display_order for projects
    const maxOrderResult = this.db.prepare(`
      SELECT MAX(display_order) as max_order 
      FROM projects
    `).get() as { max_order: number | null };
    
    const displayOrder = (maxOrderResult?.max_order ?? -1) + 1;
    
    const result = this.db.prepare(`
      INSERT INTO projects (name, path, system_prompt, run_script, build_script, default_permission_mode, open_ide_command, display_order, commit_mode, commit_structured_prompt_template, commit_checkpoint_prefix)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, path, systemPrompt || null, runScript || null, buildScript || null, defaultPermissionMode || 'ignore', openIdeCommand || null, displayOrder, commitMode || 'checkpoint', commitStructuredPromptTemplate || null, commitCheckpointPrefix || 'checkpoint: ');
    
    const project = this.getProject(result.lastInsertRowid as number);
    if (!project) {
      throw new Error('Failed to create project');
    }
    return project;
  }

  getProject(id: number): Project | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  }

  getProjectByPath(path: string): Project | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as Project | undefined;
  }

  getActiveProject(): Project | undefined {
    const project = this.db.prepare('SELECT * FROM projects WHERE active = 1 LIMIT 1').get() as Project | undefined;
    if (project) {
      console.log(`[Database] Retrieved active project:`, {
        id: project.id,
        name: project.name,
        build_script: project.build_script,
        run_script: project.run_script
      });
    }
    return project;
  }

  getAllProjects(): Project[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY display_order ASC, created_at ASC').all() as Project[];
  }

  updateProject(id: number, updates: Partial<Omit<Project, 'id' | 'created_at'>>): Project | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.path !== undefined) {
      fields.push('path = ?');
      values.push(updates.path);
    }
    if (updates.system_prompt !== undefined) {
      fields.push('system_prompt = ?');
      values.push(updates.system_prompt);
    }
    if (updates.run_script !== undefined) {
      fields.push('run_script = ?');
      values.push(updates.run_script);
    }
    if (updates.build_script !== undefined) {
      fields.push('build_script = ?');
      values.push(updates.build_script);
    }
    if (updates.default_permission_mode !== undefined) {
      fields.push('default_permission_mode = ?');
      values.push(updates.default_permission_mode);
    }
    if (updates.open_ide_command !== undefined) {
      fields.push('open_ide_command = ?');
      values.push(updates.open_ide_command);
    }
    if (updates.worktree_folder !== undefined) {
      fields.push('worktree_folder = ?');
      values.push(updates.worktree_folder);
    }
    if (updates.lastUsedModel !== undefined) {
      fields.push('lastUsedModel = ?');
      values.push(updates.lastUsedModel);
    }
    if (updates.active !== undefined) {
      fields.push('active = ?');
      values.push(updates.active ? 1 : 0);
    }
    if (updates.commit_mode !== undefined) {
      fields.push('commit_mode = ?');
      values.push(updates.commit_mode);
    }
    if (updates.commit_structured_prompt_template !== undefined) {
      fields.push('commit_structured_prompt_template = ?');
      values.push(updates.commit_structured_prompt_template);
    }
    if (updates.commit_checkpoint_prefix !== undefined) {
      fields.push('commit_checkpoint_prefix = ?');
      values.push(updates.commit_checkpoint_prefix);
    }

    if (fields.length === 0) {
      return this.getProject(id);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    this.db.prepare(`
      UPDATE projects 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `).run(...values);
    
    return this.getProject(id);
  }

  setActiveProject(id: number): Project | undefined {
    // First deactivate all projects
    this.db.prepare('UPDATE projects SET active = 0').run();
    
    // Then activate the selected project
    this.db.prepare('UPDATE projects SET active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    
    return this.getProject(id);
  }

  deleteProject(id: number): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // Folder operations
  createFolder(name: string, projectId: number, parentFolderId?: string | null): Folder {
    // Validate inputs
    if (!name || typeof name !== 'string') {
      throw new Error('Folder name must be a non-empty string');
    }
    if (!projectId || typeof projectId !== 'number' || projectId <= 0) {
      throw new Error('Project ID must be a positive number');
    }
    
    // Validate parent folder if provided
    if (parentFolderId) {
      const parentFolder = this.getFolder(parentFolderId);
      if (!parentFolder) {
        throw new Error('Parent folder not found');
      }
      if (parentFolder.project_id !== projectId) {
        throw new Error('Parent folder belongs to a different project');
      }
      
      // Check nesting depth
      const depth = this.getFolderDepth(parentFolderId);
      if (depth >= 4) { // Parent is at depth 4, so child would be at depth 5
        throw new Error('Maximum nesting depth (5 levels) reached');
      }
    }
    
    const id = `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('[Database] Creating folder:', { id, name, projectId, parentFolderId });
    
    // Get the max display_order for folders in this project at the same level
    const maxOrder = this.db.prepare(`
      SELECT MAX(display_order) as max_order 
      FROM folders 
      WHERE project_id = ? 
      AND (parent_folder_id ${parentFolderId ? '= ?' : 'IS NULL'})
    `).get(parentFolderId ? [projectId, parentFolderId] : projectId) as { max_order: number | null };
    
    const displayOrder = (maxOrder?.max_order ?? -1) + 1;
    
    const stmt = this.db.prepare(`
      INSERT INTO folders (id, name, project_id, parent_folder_id, display_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, name, projectId, parentFolderId || null, displayOrder);
    
    const folder = this.getFolder(id);
    console.log('[Database] Created folder:', folder);
    
    return folder!;
  }

  getFolder(id: string): Folder | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM folders WHERE id = ?
    `);
    
    const folder = stmt.get(id) as Folder | undefined;
    console.log(`[Database] Getting folder by id ${id}:`, folder);
    return folder;
  }

  getFoldersForProject(projectId: number): Folder[] {
    const stmt = this.db.prepare(`
      SELECT * FROM folders 
      WHERE project_id = ? 
      ORDER BY display_order ASC, name ASC
    `);
    
    const folders = stmt.all(projectId) as Folder[];
    console.log(`[Database] Getting folders for project ${projectId}:`, folders);
    return folders;
  }

  updateFolder(id: string, updates: { name?: string; display_order?: number; parent_folder_id?: string | null }): void {
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    
    if (updates.display_order !== undefined) {
      fields.push('display_order = ?');
      values.push(updates.display_order);
    }
    
    if (updates.parent_folder_id !== undefined) {
      fields.push('parent_folder_id = ?');
      values.push(updates.parent_folder_id);
    }
    
    if (fields.length === 0) return;
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    
    const stmt = this.db.prepare(`
      UPDATE folders 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);
    
    stmt.run(...values);
  }

  deleteFolder(id: string): void {
    // Sessions will have their folder_id set to NULL due to ON DELETE SET NULL
    const stmt = this.db.prepare('DELETE FROM folders WHERE id = ?');
    stmt.run(id);
  }

  updateFolderDisplayOrder(folderId: string, newOrder: number): void {
    const stmt = this.db.prepare(`
      UPDATE folders 
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    stmt.run(newOrder, folderId);
  }

  reorderFolders(projectId: number, folderIds: string[]): void {
    const stmt = this.db.prepare(`
      UPDATE folders 
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND project_id = ?
    `);
    
    const transaction = this.db.transaction(() => {
      folderIds.forEach((id, index) => {
        stmt.run(index, id, projectId);
      });
    });
    
    transaction();
  }

  // Helper method to get the depth of a folder in the hierarchy
  getFolderDepth(folderId: string): number {
    let depth = 0;
    let currentId: string | null = folderId;
    
    while (currentId) {
      const folder = this.getFolder(currentId);
      if (!folder || !folder.parent_folder_id) break;
      depth++;
      currentId = folder.parent_folder_id;
      
      // Safety check to prevent infinite loops
      if (depth > 10) {
        console.error('[Database] Circular reference detected in folder hierarchy');
        break;
      }
    }
    
    return depth;
  }

  // Check if moving a folder would create a circular reference
  wouldCreateCircularReference(folderId: string, proposedParentId: string): boolean {
    // Check if proposedParentId is a descendant of folderId
    let currentId: string | null = proposedParentId;
    const visited = new Set<string>();
    
    while (currentId) {
      // If we find the folder we're trying to move in the parent chain, it's circular
      if (currentId === folderId) {
        return true;
      }
      
      // Safety check for circular references in existing data
      if (visited.has(currentId)) {
        console.error('[Database] Existing circular reference detected in folder hierarchy');
        return true;
      }
      visited.add(currentId);
      
      const folder = this.getFolder(currentId);
      if (!folder) break;
      currentId = folder.parent_folder_id || null;
    }
    
    return false;
  }

  // Project run commands operations
  createRunCommand(projectId: number, command: string, displayName?: string, orderIndex?: number): ProjectRunCommand {
    const result = this.db.prepare(`
      INSERT INTO project_run_commands (project_id, command, display_name, order_index)
      VALUES (?, ?, ?, ?)
    `).run(projectId, command, displayName || null, orderIndex || 0);
    
    const runCommand = this.getRunCommand(result.lastInsertRowid as number);
    if (!runCommand) {
      throw new Error('Failed to create run command');
    }
    return runCommand;
  }

  getRunCommand(id: number): ProjectRunCommand | undefined {
    return this.db.prepare('SELECT * FROM project_run_commands WHERE id = ?').get(id) as ProjectRunCommand | undefined;
  }

  getProjectRunCommands(projectId: number): ProjectRunCommand[] {
    return this.db.prepare('SELECT * FROM project_run_commands WHERE project_id = ? ORDER BY order_index ASC, id ASC').all(projectId) as ProjectRunCommand[];
  }

  updateRunCommand(id: number, updates: { command?: string; display_name?: string; order_index?: number }): ProjectRunCommand | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.command !== undefined) {
      fields.push('command = ?');
      values.push(updates.command);
    }
    if (updates.display_name !== undefined) {
      fields.push('display_name = ?');
      values.push(updates.display_name);
    }
    if (updates.order_index !== undefined) {
      fields.push('order_index = ?');
      values.push(updates.order_index);
    }

    if (fields.length === 0) {
      return this.getRunCommand(id);
    }

    values.push(id);

    this.db.prepare(`
      UPDATE project_run_commands 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `).run(...values);
    
    return this.getRunCommand(id);
  }

  deleteRunCommand(id: number): boolean {
    const result = this.db.prepare('DELETE FROM project_run_commands WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteProjectRunCommands(projectId: number): boolean {
    const result = this.db.prepare('DELETE FROM project_run_commands WHERE project_id = ?').run(projectId);
    return result.changes > 0;
  }

  // Session operations
  createSession(data: CreateSessionData): Session {
    // Get the max display_order for sessions in this project
    const maxOrderResult = this.db.prepare(`
      SELECT MAX(display_order) as max_order 
      FROM sessions 
      WHERE project_id = ? AND (archived = 0 OR archived IS NULL)
    `).get(data.project_id) as { max_order: number | null };
    
    const displayOrder = (maxOrderResult?.max_order ?? -1) + 1;
    
    this.db.prepare(`
      INSERT INTO sessions (id, name, initial_prompt, worktree_name, worktree_path, status, project_id, folder_id, permission_mode, is_main_repo, display_order, auto_commit, model, base_commit, base_branch, commit_mode, commit_mode_settings)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.id, data.name, data.initial_prompt, data.worktree_name, data.worktree_path, data.project_id, data.folder_id || null, data.permission_mode || 'ignore', data.is_main_repo ? 1 : 0, displayOrder, data.auto_commit !== undefined ? (data.auto_commit ? 1 : 0) : 1, data.model || 'claude-sonnet-4-20250514', data.base_commit || null, data.base_branch || null, data.commit_mode || null, data.commit_mode_settings || null);
    
    const session = this.getSession(data.id);
    if (!session) {
      throw new Error('Failed to create session');
    }
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  }

  getAllSessions(projectId?: number): Session[] {
    if (projectId !== undefined) {
      return this.db.prepare('SELECT * FROM sessions WHERE project_id = ? AND (archived = 0 OR archived IS NULL) AND (is_main_repo = 0 OR is_main_repo IS NULL) ORDER BY display_order ASC, created_at DESC').all(projectId) as Session[];
    }
    return this.db.prepare('SELECT * FROM sessions WHERE (archived = 0 OR archived IS NULL) AND (is_main_repo = 0 OR is_main_repo IS NULL) ORDER BY display_order ASC, created_at DESC').all() as Session[];
  }

  getAllSessionsIncludingArchived(): Session[] {
    return this.db.prepare('SELECT * FROM sessions WHERE (is_main_repo = 0 OR is_main_repo IS NULL) ORDER BY created_at DESC').all() as Session[];
  }

  getArchivedSessions(projectId?: number): Session[] {
    if (projectId !== undefined) {
      return this.db.prepare('SELECT * FROM sessions WHERE project_id = ? AND archived = 1 AND (is_main_repo = 0 OR is_main_repo IS NULL) ORDER BY updated_at DESC').all(projectId) as Session[];
    }
    return this.db.prepare('SELECT * FROM sessions WHERE archived = 1 AND (is_main_repo = 0 OR is_main_repo IS NULL) ORDER BY updated_at DESC').all() as Session[];
  }

  getMainRepoSession(projectId: number): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE project_id = ? AND is_main_repo = 1 AND (archived = 0 OR archived IS NULL)').get(projectId) as Session | undefined;
  }

  updateSession(id: string, data: UpdateSessionData): Session | undefined {
    console.log(`[Database] Updating session ${id} with data:`, data);
    
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.folder_id !== undefined) {
      console.log(`[Database] Setting folder_id to: ${data.folder_id}`);
      updates.push('folder_id = ?');
      values.push(data.folder_id);
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
    if (data.run_started_at !== undefined) {
      if (data.run_started_at === 'CURRENT_TIMESTAMP') {
        updates.push('run_started_at = CURRENT_TIMESTAMP');
      } else {
        updates.push('run_started_at = ?');
        values.push(data.run_started_at);
      }
    }
    if (data.is_favorite !== undefined) {
      updates.push('is_favorite = ?');
      values.push(data.is_favorite ? 1 : 0);
    }
    if (data.auto_commit !== undefined) {
      updates.push('auto_commit = ?');
      values.push(data.auto_commit ? 1 : 0);
    }
    if (data.model !== undefined) {
      updates.push('model = ?');
      values.push(data.model);
    }

    if (updates.length === 0) {
      return this.getSession(id);
    }

    // Only update the updated_at timestamp if we're changing something other than is_favorite, auto_commit, or model
    // This prevents the session from showing as "unviewed" when just toggling these settings
    const isOnlyToggleUpdate = updates.length === 1 && (updates[0] === 'is_favorite = ?' || updates[0] === 'auto_commit = ?' || updates[0] === 'model = ?');
    if (!isOnlyToggleUpdate) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
    }
    values.push(id);

    const sql = `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`;
    console.log('[Database] Executing SQL:', sql);
    console.log('[Database] With values:', values);
    
    try {
      this.db.prepare(sql).run(...values);
      console.log('[Database] Update successful');
    } catch (error) {
      console.error('[Database] Update failed:', error);
      throw error;
    }
    
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

  restoreSession(id: string): boolean {
    const result = this.db.prepare('UPDATE sessions SET archived = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
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
    console.log('[Database] Adding prompt marker:', { sessionId, promptText, outputIndex, outputLine });
    
    try {
      // Use datetime('now') to ensure UTC timestamp
      const result = this.db.prepare(`
        INSERT INTO prompt_markers (session_id, prompt_text, output_index, output_line, timestamp)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(sessionId, promptText, outputIndex, outputLine);
      
      console.log('[Database] Prompt marker added successfully, ID:', result.lastInsertRowid);
      return result.lastInsertRowid as number;
    } catch (error) {
      console.error('[Database] Failed to add prompt marker:', error);
      throw error;
    }
  }

  getPromptMarkers(sessionId: string): PromptMarker[] {
    const markers = this.db.prepare(`
      SELECT 
        id,
        session_id,
        prompt_text,
        output_index,
        output_line,
        datetime(timestamp) || 'Z' as timestamp,
        CASE 
          WHEN completion_timestamp IS NOT NULL 
          THEN datetime(completion_timestamp) || 'Z'
          ELSE NULL
        END as completion_timestamp
      FROM prompt_markers 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `).all(sessionId) as PromptMarker[];
    
    return markers;
  }

  updatePromptMarkerLine(id: number, outputLine: number): void {
    this.db.prepare(`
      UPDATE prompt_markers 
      SET output_line = ? 
      WHERE id = ?
    `).run(outputLine, id);
  }

  updatePromptMarkerCompletion(sessionId: string, timestamp?: string): void {
    // Update the most recent prompt marker for this session with completion timestamp
    // Use datetime() to ensure proper UTC timestamp handling
    if (timestamp) {
      // If timestamp is provided, use datetime() to normalize it
      this.db.prepare(`
        UPDATE prompt_markers 
        SET completion_timestamp = datetime(?) 
        WHERE session_id = ? 
        AND id = (
          SELECT id FROM prompt_markers 
          WHERE session_id = ? 
          ORDER BY timestamp DESC 
          LIMIT 1
        )
      `).run(timestamp, sessionId, sessionId);
    } else {
      // If no timestamp, use current UTC time
      this.db.prepare(`
        UPDATE prompt_markers 
        SET completion_timestamp = datetime('now') 
        WHERE session_id = ? 
        AND id = (
          SELECT id FROM prompt_markers 
          WHERE session_id = ? 
          ORDER BY timestamp DESC 
          LIMIT 1
        )
      `).run(sessionId, sessionId);
    }
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

  // Display order operations
  updateProjectDisplayOrder(projectId: number, displayOrder: number): void {
    this.db.prepare(`
      UPDATE projects 
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(displayOrder, projectId);
  }

  updateSessionDisplayOrder(sessionId: string, displayOrder: number): void {
    this.db.prepare(`
      UPDATE sessions 
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(displayOrder, sessionId);
  }

  reorderProjects(projectOrders: Array<{ id: number; displayOrder: number }>): void {
    const stmt = this.db.prepare(`
      UPDATE projects 
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    
    const updateMany = this.db.transaction((orders: Array<{ id: number; displayOrder: number }>) => {
      for (const { id, displayOrder } of orders) {
        stmt.run(displayOrder, id);
      }
    });
    
    updateMany(projectOrders);
  }

  reorderSessions(sessionOrders: Array<{ id: string; displayOrder: number }>): void {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    
    const updateMany = this.db.transaction((orders: Array<{ id: string; displayOrder: number }>) => {
      for (const { id, displayOrder } of orders) {
        stmt.run(displayOrder, id);
      }
    });
    
    updateMany(sessionOrders);
  }

  // Debug method to check table structure
  getTableStructure(tableName: 'folders' | 'sessions'): { 
    columns: Array<{ 
      cid: number; 
      name: string; 
      type: string; 
      notnull: number; 
      dflt_value: any; 
      pk: number 
    }>;
    foreignKeys: Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;
    indexes: Array<{
      name: string;
      tbl_name: string;
      sql: string;
    }>;
  } {
    console.log(`[Database] Getting structure for table: ${tableName}`);
    
    // Get column information
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }>;
    
    // Get foreign key information
    const foreignKeys = this.db.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as Array<{
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
      match: string;
    }>;
    
    // Get indexes
    const indexes = this.db.prepare(`
      SELECT name, tbl_name, sql 
      FROM sqlite_master 
      WHERE type = 'index' AND tbl_name = ?
    `).all(tableName) as Array<{
      name: string;
      tbl_name: string;
      sql: string;
    }>;
    
    const structure = { columns, foreignKeys, indexes };
    
    console.log(`[Database] Table structure for ${tableName}:`, JSON.stringify(structure, null, 2));
    
    return structure;
  }

  // UI State operations
  getUIState(key: string): string | undefined {
    const result = this.db.prepare('SELECT value FROM ui_state WHERE key = ?').get(key) as { value: string } | undefined;
    return result?.value;
  }

  setUIState(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO ui_state (key, value, updated_at) 
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET 
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  }

  deleteUIState(key: string): void {
    this.db.prepare('DELETE FROM ui_state WHERE key = ?').run(key);
  }

  // App opens operations
  recordAppOpen(welcomeHidden: boolean, discordShown: boolean = false): void {
    this.db.prepare(`
      INSERT INTO app_opens (welcome_hidden, discord_shown)
      VALUES (?, ?)
    `).run(welcomeHidden ? 1 : 0, discordShown ? 1 : 0);
  }

  getLastAppOpen(): { opened_at: string; welcome_hidden: boolean; discord_shown: boolean } | null {
    const result = this.db.prepare(`
      SELECT opened_at, welcome_hidden, discord_shown
      FROM app_opens
      ORDER BY opened_at DESC
      LIMIT 1
    `).get() as any;

    if (!result) return null;
    
    return {
      opened_at: result.opened_at,
      welcome_hidden: Boolean(result.welcome_hidden),
      discord_shown: Boolean(result.discord_shown)
    };
  }

  updateLastAppOpenDiscordShown(): void {
    this.db.prepare(`
      UPDATE app_opens
      SET discord_shown = 1
      WHERE id = (SELECT id FROM app_opens ORDER BY opened_at DESC LIMIT 1)
    `).run();
  }

  // User preferences operations
  getUserPreference(key: string): string | null {
    const result = this.db.prepare(`
      SELECT value FROM user_preferences WHERE key = ?
    `).get(key) as { value: string } | undefined;
    
    return result?.value || null;
  }

  setUserPreference(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO user_preferences (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET 
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  }

  getUserPreferences(): Record<string, string> {
    const rows = this.db.prepare(`
      SELECT key, value FROM user_preferences
    `).all() as Array<{ key: string; value: string }>;
    
    const preferences: Record<string, string> = {};
    for (const row of rows) {
      preferences[row.key] = row.value;
    }
    return preferences;
  }

  close(): void {
    // Close adapter connection
    this.adapter.close();
    // Close main database connection
    this.db.close();
  }
}
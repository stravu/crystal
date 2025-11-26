import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { Project, ProjectRunCommand, Folder, Session, SessionOutput, CreateSessionData, UpdateSessionData, ConversationMessage, PromptMarker, ExecutionDiff, CreateExecutionDiffData, CreatePanelExecutionDiffData } from './models';
import type { ToolPanel, ToolPanelType, ToolPanelState, ToolPanelMetadata } from '../../../shared/types/panels';

// Interface for legacy claude_panel_settings during migration
interface ClaudePanelSetting {
  id: number;
  panel_id: string;
  model?: string;
  commit_mode?: boolean;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
  created_at: string;
  updated_at: string;
}

// Interface for tool panel database rows
interface ToolPanelRow {
  id: string;
  session_id: string;
  type: string;
  title: string;
  state: string | null;
  metadata: string | null;
  created_at: string;
}

// Interface for execution diff database rows
interface ExecutionDiffRow {
  id: number;
  session_id: string;
  prompt_marker_id?: number;
  execution_sequence: number;
  git_diff?: string;
  files_changed?: string;
  stats_additions: number;
  stats_deletions: number;
  stats_files_changed: number;
  before_commit_hash?: string;
  after_commit_hash?: string;
  commit_message?: string;
  timestamp: string;
}

export class DatabaseService {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure the directory exists before creating the database
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    
    this.db = new Database(dbPath);
  }

  /**
   * Execute a function within a database transaction with automatic rollback on error
   * @param fn Function to execute within the transaction
   * @returns Result of the function
   * @throws Error if transaction fails
   */
  private transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(() => {
      return fn();
    });
    
    return transaction();
  }

  /**
   * Execute an async function within a database transaction with automatic rollback on error
   * @param fn Async function to execute within the transaction
   * @returns Promise with result of the function
   * @throws Error if transaction fails
   */
  private async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(() => {
        fn().then(resolve).catch(reject);
      });
      
      try {
        transaction();
      } catch (error) {
        reject(error);
      }
    });
  }

  initialize(): void {
    this.initializeSchema();
    this.runMigrations();
  }

  private initializeSchema(): void {
    this.transaction(() => {
      const schemaPath = join(__dirname, 'schema.sql');
      const schema = readFileSync(schemaPath, 'utf-8');
      
      // Execute schema in parts (sqlite3 doesn't support multiple statements in exec)
      const statements = schema.split(';').filter(stmt => stmt.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          this.db.prepare(statement.trim()).run();
        }
      }
    });
  }

  private runMigrations(): void {
    // Check if archived column exists
    interface SqliteTableInfo {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: unknown;
      pk: number;
    }
    
    // Legacy project_folders table structure for migration
    interface LegacyProjectFolder {
      id: number;
      name: string;
      project_id: number;
      display_order?: number;
      created_at?: string;
      updated_at?: string;
    }
    const tableInfo = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasArchivedColumn = tableInfo.some((col: SqliteTableInfo) => col.name === 'archived');
    const hasInitialPromptColumn = tableInfo.some((col: SqliteTableInfo) => col.name === 'initial_prompt');
    const hasLastViewedAtColumn = tableInfo.some((col: SqliteTableInfo) => col.name === 'last_viewed_at');
    const hasStatusMessageColumn = tableInfo.some((col: SqliteTableInfo) => col.name === 'status_message');

    if (!hasArchivedColumn) {
      // Run migration to add archived column
      this.db.prepare("ALTER TABLE sessions ADD COLUMN archived BOOLEAN DEFAULT 0").run();
      this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived)").run();
    }

    if (!hasStatusMessageColumn) {
      // Run migration to add status_message column
      this.db.prepare("ALTER TABLE sessions ADD COLUMN status_message TEXT").run();
    }

    // Check if we need to rename prompt to initial_prompt
    if (!hasInitialPromptColumn) {
      const hasPromptColumn = tableInfo.some((col: SqliteTableInfo) => col.name === 'prompt');
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
      const promptMarkersInfo = this.db.prepare("PRAGMA table_info(prompt_markers)").all() as SqliteTableInfo[];
      const hasOutputLineColumn = promptMarkersInfo.some((col: SqliteTableInfo) => col.name === 'output_line');
      const hasTerminalLineColumn = promptMarkersInfo.some((col: SqliteTableInfo) => col.name === 'terminal_line');
      
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

    // Add commit_message column to execution_diffs if it doesn't exist
    const executionDiffsTableInfo = this.db.prepare("PRAGMA table_info(execution_diffs)").all() as SqliteTableInfo[];
    const hasCommitMessageColumn = executionDiffsTableInfo.some((col: SqliteTableInfo) => col.name === 'commit_message');
    if (!hasCommitMessageColumn) {
      this.db.prepare("ALTER TABLE execution_diffs ADD COLUMN commit_message TEXT").run();
    }

    // Check if claude_session_id column exists
    const sessionTableInfoClaude = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasClaudeSessionIdColumn = sessionTableInfoClaude.some((col: SqliteTableInfo) => col.name === 'claude_session_id');
    
    if (!hasClaudeSessionIdColumn) {
      // Add claude_session_id column to store Claude's actual session ID
      this.db.prepare("ALTER TABLE sessions ADD COLUMN claude_session_id TEXT").run();
    }

    // Check if permission_mode column exists
    const hasPermissionModeColumn = sessionTableInfoClaude.some((col: SqliteTableInfo) => col.name === 'permission_mode');
    
    if (!hasPermissionModeColumn) {
      // Add permission_mode column to sessions table
      this.db.prepare("ALTER TABLE sessions ADD COLUMN permission_mode TEXT DEFAULT 'ignore' CHECK(permission_mode IN ('approve', 'ignore'))").run();
    }

    // Add project support migration (wrapped in transaction)
    const projectsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").all();
    if (projectsTable.length === 0) {
      this.transaction(() => {
        // Create projects table
        this.db.prepare(`
          CREATE TABLE projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            system_prompt TEXT,
            run_script TEXT,
            active BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        
        // Add project_id to sessions table
        const sessionsTableInfoProjects = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
        const hasProjectIdColumn = sessionsTableInfoProjects.some((col: SqliteTableInfo) => col.name === 'project_id');
        
        if (!hasProjectIdColumn) {
          this.db.prepare("ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE").run();
          this.db.prepare("CREATE INDEX idx_sessions_project_id ON sessions(project_id)").run();
        }

        // Import existing config as default project if it exists
        try {
          const configManager = require('../services/configManager').configManager;
          const gitRepoPath = configManager.getGitRepoPath();
          
          if (gitRepoPath) {
            const projectName = gitRepoPath.split('/').pop() || 'Default Project';
            const result = this.db.prepare(`
              INSERT INTO projects (name, path, active)
              VALUES (?, ?, 1)
            `).run(projectName, gitRepoPath);
            
            // Update existing sessions to use this project
            if (result.lastInsertRowid) {
              this.db.prepare(`
                UPDATE sessions 
                SET project_id = ?
                WHERE project_id IS NULL
              `).run(result.lastInsertRowid);
            }
          }
        } catch {
          // Config manager not available during initial setup
          console.log('Skipping default project creation during initial setup');
        }
      });
    }

    // Add is_main_repo column to sessions table if it doesn't exist
    const sessionTableInfoForMainRepo = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasIsMainRepoColumn = sessionTableInfoForMainRepo.some((col: SqliteTableInfo) => col.name === 'is_main_repo');
    
    if (!hasIsMainRepoColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN is_main_repo BOOLEAN DEFAULT 0").run();
      this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_is_main_repo ON sessions(is_main_repo, project_id)").run();
    }

    // Add main_branch column to projects table if it doesn't exist
    const projectsTableInfo = this.db.prepare("PRAGMA table_info(projects)").all() as SqliteTableInfo[];
    const hasMainBranchColumn = projectsTableInfo.some((col: SqliteTableInfo) => col.name === 'main_branch');
    
    if (!hasMainBranchColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN main_branch TEXT").run();
    }

    // Add build_script column to projects table if it doesn't exist
    const hasBuildScriptColumn = projectsTableInfo.some((col: SqliteTableInfo) => col.name === 'build_script');
    
    if (!hasBuildScriptColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN build_script TEXT").run();
    }

    // Add default_permission_mode column to projects table if it doesn't exist
    const hasDefaultPermissionModeColumn = projectsTableInfo.some((col: SqliteTableInfo) => col.name === 'default_permission_mode');
    
    if (!hasDefaultPermissionModeColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN default_permission_mode TEXT DEFAULT 'ignore' CHECK(default_permission_mode IN ('approve', 'ignore'))").run();
    }

    // Add open_ide_command column to projects table if it doesn't exist
    const hasOpenIdeCommandColumn = projectsTableInfo.some((col: SqliteTableInfo) => col.name === 'open_ide_command');
    
    if (!hasOpenIdeCommandColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN open_ide_command TEXT").run();
    }

    // Create project_run_commands table if it doesn't exist
    const runCommandsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_run_commands'").all();
    if (runCommandsTable.length === 0) {
      this.db.prepare(`
        CREATE TABLE project_run_commands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          command TEXT NOT NULL,
          display_name TEXT,
          order_index INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `).run();
      this.db.prepare("CREATE INDEX idx_project_run_commands_project_id ON project_run_commands(project_id)").run();
      
      // Migrate existing run_script data to the new table
      const projectsWithRunScripts = this.db.prepare("SELECT id, run_script FROM projects WHERE run_script IS NOT NULL").all() as Array<{id: number; run_script: string}>;
      for (const project of projectsWithRunScripts) {
        if (project.run_script) {
          this.db.prepare(`
            INSERT INTO project_run_commands (project_id, command, display_name, order_index)
            VALUES (?, ?, 'Default Run Command', 0)
          `).run(project.id, project.run_script);
        }
      }
    }
    
    // Check if display_order columns exist
    const projectsTableInfo2 = this.db.prepare("PRAGMA table_info(projects)").all() as SqliteTableInfo[];
    const sessionsTableInfo2 = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasProjectsDisplayOrder = projectsTableInfo2.some((col: SqliteTableInfo) => col.name === 'display_order');
    const hasSessionsDisplayOrder = sessionsTableInfo2.some((col: SqliteTableInfo) => col.name === 'display_order');
    
    if (!hasProjectsDisplayOrder) {
      // Add display_order to projects
      this.db.prepare("ALTER TABLE projects ADD COLUMN display_order INTEGER").run();
      
      // Initialize display_order for existing projects
      this.db.prepare(`
        UPDATE projects 
        SET display_order = (
          SELECT COUNT(*) 
          FROM projects p2 
          WHERE p2.created_at <= projects.created_at OR (p2.created_at = projects.created_at AND p2.id <= projects.id)
        ) - 1
        WHERE display_order IS NULL
      `).run();
      
      this.db.prepare("CREATE INDEX IF NOT EXISTS idx_projects_display_order ON projects(display_order)").run();
    }
    
    if (!hasSessionsDisplayOrder) {
      // Add display_order to sessions
      this.db.prepare("ALTER TABLE sessions ADD COLUMN display_order INTEGER").run();
      
      // Initialize display_order for existing sessions within each project
      this.db.prepare(`
        UPDATE sessions 
        SET display_order = (
          SELECT COUNT(*) 
          FROM sessions s2 
          WHERE s2.project_id = sessions.project_id 
          AND (s2.created_at < sessions.created_at OR (s2.created_at = sessions.created_at AND s2.id <= sessions.id))
        ) - 1
        WHERE display_order IS NULL
      `).run();
      
      this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_display_order ON sessions(project_id, display_order)").run();
    }
    
    // Normalize timestamp fields migration
    // Check if last_viewed_at is still TEXT type
    const sessionTableInfoTimestamp = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const lastViewedAtColumn = sessionTableInfoTimestamp.find((col: SqliteTableInfo) => col.name === 'last_viewed_at');
    
    // Skip this migration if last_viewed_at_new already exists (migration partially completed)
    const hasLastViewedAtNew = sessionTableInfoTimestamp.some((col: SqliteTableInfo) => col.name === 'last_viewed_at_new');
    
    if (lastViewedAtColumn && lastViewedAtColumn.type === 'TEXT' && !hasLastViewedAtNew) {
      console.log('[Database] Running timestamp normalization migration...');
      
      try {
        // Check if the new columns already exist (from a previous failed migration)
        const hasLastViewedAtNew = sessionTableInfoTimestamp.some((col: SqliteTableInfo) => col.name === 'last_viewed_at_new');
        const hasRunStartedAtNew = sessionTableInfoTimestamp.some((col: SqliteTableInfo) => col.name === 'run_started_at_new');
        
        // Create new temporary columns with DATETIME type if they don't exist
        if (!hasLastViewedAtNew) {
          this.db.prepare("ALTER TABLE sessions ADD COLUMN last_viewed_at_new DATETIME").run();
        }
        if (!hasRunStartedAtNew) {
          this.db.prepare("ALTER TABLE sessions ADD COLUMN run_started_at_new DATETIME").run();
        }
        
        // Copy and convert existing data
        this.db.prepare("UPDATE sessions SET last_viewed_at_new = datetime(last_viewed_at) WHERE last_viewed_at IS NOT NULL").run();
        // Note: run_started_at column doesn't exist in the original schema, skip this update
        
        // Create a backup of the table with proper schema
        this.db.prepare(`
          CREATE TABLE sessions_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            initial_prompt TEXT NOT NULL,
            worktree_name TEXT NOT NULL,
            worktree_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_output TEXT,
            exit_code INTEGER,
            pid INTEGER,
            claude_session_id TEXT,
            archived BOOLEAN DEFAULT 0,
            last_viewed_at DATETIME,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            permission_mode TEXT DEFAULT 'ignore' CHECK(permission_mode IN ('approve', 'ignore')),
            run_started_at DATETIME,
            is_main_repo BOOLEAN DEFAULT 0,
            display_order INTEGER
          )
        `).run();
        
        // Copy all data to new table
        this.db.prepare(`
          INSERT INTO sessions_new 
          SELECT id, name, initial_prompt, worktree_name, worktree_path, status, 
                 created_at, updated_at, last_output, exit_code, pid, claude_session_id,
                 archived, last_viewed_at_new, project_id, permission_mode, 
                 run_started_at_new, is_main_repo, display_order
          FROM sessions
        `).run();
        
        // Drop old table and rename new one
        this.db.prepare("DROP TABLE sessions").run();
        this.db.prepare("ALTER TABLE sessions_new RENAME TO sessions").run();
        
        // Recreate indexes
        this.db.prepare("CREATE INDEX idx_sessions_archived ON sessions(archived)").run();
        this.db.prepare("CREATE INDEX idx_sessions_project_id ON sessions(project_id)").run();
        this.db.prepare("CREATE INDEX idx_sessions_is_main_repo ON sessions(is_main_repo, project_id)").run();
        this.db.prepare("CREATE INDEX idx_sessions_display_order ON sessions(project_id, display_order)").run();
        
        console.log('[Database] Timestamp normalization migration completed successfully');
      } catch (error) {
        console.error('[Database] Failed to normalize timestamps:', error);
        // Don't throw - allow app to continue with TEXT fields
      }
    }
    
    // Add missing completion_timestamp to prompt_markers if it doesn't exist
    const promptMarkersInfo = this.db.prepare("PRAGMA table_info(prompt_markers)").all() as SqliteTableInfo[];
    const hasCompletionTimestamp = promptMarkersInfo.some((col: SqliteTableInfo) => col.name === 'completion_timestamp');
    
    if (!hasCompletionTimestamp) {
      this.db.prepare("ALTER TABLE prompt_markers ADD COLUMN completion_timestamp DATETIME").run();
    }
    
    // Add is_favorite column to sessions table if it doesn't exist
    const sessionTableInfoFavorite = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasIsFavoriteColumn = sessionTableInfoFavorite.some((col: SqliteTableInfo) => col.name === 'is_favorite');
    
    if (!hasIsFavoriteColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN is_favorite BOOLEAN DEFAULT 0").run();
      console.log('[Database] Added is_favorite column to sessions table');
    }

    // Add auto_commit column to sessions table if it doesn't exist
    const hasAutoCommitColumn = sessionTableInfoFavorite.some((col: SqliteTableInfo) => col.name === 'auto_commit');
    
    if (!hasAutoCommitColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN auto_commit BOOLEAN DEFAULT 1").run();
      console.log('[Database] Added auto_commit column to sessions table');
    }

    // Add skip_continue_next column to sessions table if it doesn't exist
    const hasSkipContinueNextColumn = sessionTableInfoFavorite.some((col: SqliteTableInfo) => col.name === 'skip_continue_next');
    
    if (!hasSkipContinueNextColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN skip_continue_next BOOLEAN DEFAULT 0").run();
      console.log('[Database] Added skip_continue_next column to sessions table');
    }

    // Handle folder table migration
    // First, check if project_folders table exists (old schema)
    const projectFoldersExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_folders'").all().length > 0;
    const foldersExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='folders'").all().length > 0;
    
    if (projectFoldersExists) {
      console.log('[Database] Found legacy project_folders table, migrating to new folders schema...');
      
      // Check if the old folders table has INTEGER id
      if (foldersExists) {
        const foldersInfo = this.db.prepare("PRAGMA table_info(folders)").all() as SqliteTableInfo[];
        const idColumn = foldersInfo.find((col: SqliteTableInfo) => col.name === 'id');
        
        if (idColumn && idColumn.type === 'INTEGER') {
          // Old folders table with INTEGER id exists, drop it
          console.log('[Database] Dropping old folders table with INTEGER id...');
          this.db.prepare('DROP TABLE IF EXISTS folders').run();
        }
      }
      
      // Create new folders table with TEXT id
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          project_id INTEGER NOT NULL,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `).run();
      
      // Migrate data from project_folders to folders
      const projectFolders = this.db.prepare('SELECT * FROM project_folders').all() as LegacyProjectFolder[];
      console.log(`[Database] Migrating ${projectFolders.length} folders from project_folders to folders table...`);
      
      for (const folder of projectFolders) {
        const newId = `folder-${folder.id}-${Date.now()}`;
        this.db.prepare(`
          INSERT INTO folders (id, name, project_id, display_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(newId, folder.name, folder.project_id, folder.display_order || 0, folder.created_at, folder.updated_at);
        
        // Update sessions that reference this folder
        this.db.prepare(`
          UPDATE sessions 
          SET folder_id = ? 
          WHERE folder_id = ?
        `).run(newId, folder.id);
      }
      
      // Drop the old project_folders table
      this.db.prepare('DROP TABLE project_folders').run();
      console.log('[Database] Dropped legacy project_folders table');
      
      // Update sessions table folder_id column type if needed
      const sessionTableInfo = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
      const folderIdColumn = sessionTableInfo.find((col: SqliteTableInfo) => col.name === 'folder_id');
      
      if (folderIdColumn && folderIdColumn.type === 'INTEGER') {
        console.log('[Database] Converting sessions.folder_id from INTEGER to TEXT...');
        
        // Create new sessions table with correct schema
        this.db.prepare(`
          CREATE TABLE sessions_folders_migration (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            initial_prompt TEXT NOT NULL,
            worktree_name TEXT NOT NULL,
            worktree_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_output TEXT,
            exit_code INTEGER,
            pid INTEGER,
            claude_session_id TEXT,
            archived BOOLEAN DEFAULT 0,
            last_viewed_at DATETIME,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
            permission_mode TEXT DEFAULT 'ignore' CHECK(permission_mode IN ('approve', 'ignore')),
            run_started_at DATETIME,
            is_main_repo BOOLEAN DEFAULT 0,
            display_order INTEGER,
            is_favorite BOOLEAN DEFAULT 0,
            folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
            auto_commit BOOLEAN DEFAULT 1
          )
        `).run();
        
        // Copy data, folder_id has already been converted to TEXT values above
        this.db.prepare(`
          INSERT INTO sessions_folders_migration 
          SELECT * FROM sessions
        `).run();
        
        // Drop old table and rename new one
        this.db.prepare('DROP TABLE sessions').run();
        this.db.prepare('ALTER TABLE sessions_folders_migration RENAME TO sessions').run();
        
        // Recreate indexes
        this.db.prepare("CREATE INDEX idx_sessions_archived ON sessions(archived)").run();
        this.db.prepare("CREATE INDEX idx_sessions_project_id ON sessions(project_id)").run();
        this.db.prepare("CREATE INDEX idx_sessions_is_main_repo ON sessions(is_main_repo, project_id)").run();
        this.db.prepare("CREATE INDEX idx_sessions_display_order ON sessions(project_id, display_order)").run();
        this.db.prepare("CREATE INDEX idx_sessions_folder_id ON sessions(folder_id)").run();
        
        console.log('[Database] Successfully converted sessions.folder_id to TEXT type');
      }
    } else {
      // No project_folders table, create folders table normally
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          project_id INTEGER NOT NULL,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `).run();
    }

    // Create index on folders project_id
    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_folders_project_id 
      ON folders(project_id)
    `).run();
    
    // Create additional index for display order
    this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_folders_display_order 
      ON folders(project_id, display_order)
    `).run();

    // Add folder_id column to sessions table if it doesn't exist
    const hasFolderIdColumn = sessionTableInfoFavorite.some((col: SqliteTableInfo) => col.name === 'folder_id');
    
    if (!hasFolderIdColumn) {
      this.db.prepare('ALTER TABLE sessions ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL').run();
      console.log('[Database] Added folder_id column to sessions table');
      
      // Create index on sessions folder_id
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_sessions_folder_id 
        ON sessions(folder_id)
      `).run();
    }

    // Add parent_folder_id column to folders table for nested folders support
    const foldersTableInfo = this.db.prepare("PRAGMA table_info(folders)").all() as SqliteTableInfo[];
    const hasParentFolderIdColumn = foldersTableInfo.some((col: SqliteTableInfo) => col.name === 'parent_folder_id');
    
    if (!hasParentFolderIdColumn) {
      this.db.prepare('ALTER TABLE folders ADD COLUMN parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE').run();
      console.log('[Database] Added parent_folder_id column to folders table for nested folders support');
      
      // Create index on parent_folder_id for efficient hierarchy queries
      this.db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_folders_parent_id 
        ON folders(parent_folder_id)
      `).run();
    }

    // Add UI state table if it doesn't exist
    const uiStateTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ui_state'").all();
    if (uiStateTable.length === 0) {
      this.db.prepare(`
        CREATE TABLE ui_state (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      this.db.prepare("CREATE INDEX idx_ui_state_key ON ui_state(key)").run();
      console.log('[Database] Created ui_state table');
    }

    // Add app_opens table to track application launches
    const appOpensTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_opens'").all();
    if (appOpensTable.length === 0) {
      this.db.prepare(`
        CREATE TABLE app_opens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          welcome_hidden BOOLEAN DEFAULT 0,
          discord_shown BOOLEAN DEFAULT 0,
          app_version TEXT
        )
      `).run();
      this.db.prepare("CREATE INDEX idx_app_opens_opened_at ON app_opens(opened_at)").run();
      console.log('[Database] Created app_opens table');
    }

    // Add app_version column to app_opens table if it doesn't exist
    const appOpensTableInfo = this.db.prepare("PRAGMA table_info(app_opens)").all() as SqliteTableInfo[];
    const hasAppVersionColumn = appOpensTableInfo.some((col: SqliteTableInfo) => col.name === 'app_version');

    if (!hasAppVersionColumn) {
      this.db.prepare("ALTER TABLE app_opens ADD COLUMN app_version TEXT").run();
      console.log('[Database] Added app_version column to app_opens table');
    }

    // Remove model column from sessions table if it exists (moved to panel level)
    const sessionTableInfoModel = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasModelColumn = sessionTableInfoModel.some((col: SqliteTableInfo) => col.name === 'model');
    
    if (hasModelColumn) {
      // Note: SQLite doesn't support DROP COLUMN in older versions
      // We'll leave the column but stop using it
      console.log('[Database] Model column exists in sessions table but will be ignored (moved to panel level)');
    }

    // Add tool_type column to sessions table if it doesn't exist
    const sessionTableInfoToolType = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasToolTypeColumn = sessionTableInfoToolType.some((col: SqliteTableInfo) => col.name === 'tool_type');

    if (!hasToolTypeColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN tool_type TEXT DEFAULT 'claude'").run();
      console.log('[Database] Added tool_type column to sessions table');

      // Best effort: mark known Codex sessions (removed model-based detection)
      try {
        // No longer detecting based on model since it's panel-level now
      } catch (error) {
        // Migration error handling removed - empty try/catch serves no purpose
      }
    }

    // Add user_preferences table to store all user preferences
    const userPreferencesTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'").all();
    if (userPreferencesTable.length === 0) {
      this.db.prepare(`
        CREATE TABLE user_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      this.db.prepare("CREATE INDEX idx_user_preferences_key ON user_preferences(key)").run();
      console.log('[Database] Created user_preferences table');
      
      // Set default preferences
      this.db.prepare(`
        INSERT INTO user_preferences (key, value) VALUES 
        ('hide_welcome', 'false'),
        ('hide_discord', 'false'),
        ('welcome_shown', 'false')
      `).run();
    } else {
      // For existing users, ensure default preferences exist
      const defaultPreferences = [
        { key: 'hide_welcome', value: 'false' },
        { key: 'hide_discord', value: 'false' },
        { key: 'welcome_shown', value: 'false' }
      ];
      
      for (const pref of defaultPreferences) {
        const existing = this.db.prepare('SELECT value FROM user_preferences WHERE key = ?').get(pref.key);
        if (!existing) {
          this.db.prepare('INSERT INTO user_preferences (key, value) VALUES (?, ?)').run(pref.key, pref.value);
          console.log(`[Database] Added missing default preference: ${pref.key} = ${pref.value}`);
        }
      }
    }

    // Add worktree_folder column to projects table if it doesn't exist
    const projectsTableInfoWorktree = this.db.prepare("PRAGMA table_info(projects)").all() as SqliteTableInfo[];
    const hasWorktreeFolderColumn = projectsTableInfoWorktree.some((col: SqliteTableInfo) => col.name === 'worktree_folder');
    
    if (!hasWorktreeFolderColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN worktree_folder TEXT").run();
      console.log('[Database] Added worktree_folder column to projects table');
    }

    // Add lastUsedModel column to projects table if it doesn't exist
    const projectsTableInfoModel = this.db.prepare("PRAGMA table_info(projects)").all() as SqliteTableInfo[];
    const hasLastUsedModelColumn = projectsTableInfoModel.some((col: SqliteTableInfo) => col.name === 'lastUsedModel');
    
    if (!hasLastUsedModelColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN lastUsedModel TEXT DEFAULT 'sonnet'").run();
      console.log('[Database] Added lastUsedModel column to projects table');
    }

    // Add base_commit and base_branch columns to sessions table if they don't exist
    const sessionsTableInfoBase = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasBaseCommitColumn = sessionsTableInfoBase.some((col: SqliteTableInfo) => col.name === 'base_commit');
    const hasBaseBranchColumn = sessionsTableInfoBase.some((col: SqliteTableInfo) => col.name === 'base_branch');
    
    if (!hasBaseCommitColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN base_commit TEXT").run();
      console.log('[Database] Added base_commit column to sessions table');
    }
    
    if (!hasBaseBranchColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN base_branch TEXT").run();
      console.log('[Database] Added base_branch column to sessions table');
    }

    // Add commit mode settings columns to projects table if they don't exist
    const projectsTableInfoCommit = this.db.prepare("PRAGMA table_info(projects)").all() as SqliteTableInfo[];
    const hasCommitModeColumn = projectsTableInfoCommit.some((col: SqliteTableInfo) => col.name === 'commit_mode');
    const hasCommitStructuredPromptTemplateColumn = projectsTableInfoCommit.some((col: SqliteTableInfo) => col.name === 'commit_structured_prompt_template');
    const hasCommitCheckpointPrefixColumn = projectsTableInfoCommit.some((col: SqliteTableInfo) => col.name === 'commit_checkpoint_prefix');
    
    if (!hasCommitModeColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN commit_mode TEXT DEFAULT 'checkpoint'").run();
      console.log('[Database] Added commit_mode column to projects table');
    }
    
    if (!hasCommitStructuredPromptTemplateColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN commit_structured_prompt_template TEXT").run();
      console.log('[Database] Added commit_structured_prompt_template column to projects table');
    }
    
    if (!hasCommitCheckpointPrefixColumn) {
      this.db.prepare("ALTER TABLE projects ADD COLUMN commit_checkpoint_prefix TEXT DEFAULT 'checkpoint: '").run();
      console.log('[Database] Added commit_checkpoint_prefix column to projects table');
    }

    // Add commit mode settings columns to sessions table if they don't exist
    const sessionsTableInfoCommit = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasSessionCommitModeColumn = sessionsTableInfoCommit.some((col: SqliteTableInfo) => col.name === 'commit_mode');
    const hasSessionCommitModeSettingsColumn = sessionsTableInfoCommit.some((col: SqliteTableInfo) => col.name === 'commit_mode_settings');
    
    if (!hasSessionCommitModeColumn) {
      try {
        this.db.prepare("ALTER TABLE sessions ADD COLUMN commit_mode TEXT").run();
        console.log('[Database] Added commit_mode column to sessions table');
      } catch (error) {
        console.error('[Database] Error adding commit_mode column:', error);
      }
    }
    
    if (!hasSessionCommitModeSettingsColumn) {
      try {
        this.db.prepare("ALTER TABLE sessions ADD COLUMN commit_mode_settings TEXT").run();
        console.log('[Database] Added commit_mode_settings column to sessions table');
      } catch (error) {
        console.error('[Database] Error adding commit_mode_settings column:', error);
      }
    }

    // Migrate existing auto_commit boolean to commit_mode
    const hasAutoCommitMigrated = this.db.prepare("SELECT value FROM user_preferences WHERE key = 'auto_commit_migrated'").get();
    if (!hasAutoCommitMigrated) {
      console.log('[Database] Migrating auto_commit boolean to commit_mode...');
      
      // Update sessions: auto_commit=true -> commit_mode='checkpoint', auto_commit=false -> commit_mode='disabled'
      this.db.prepare(`
        UPDATE sessions 
        SET commit_mode = CASE 
          WHEN auto_commit = 1 THEN 'checkpoint'
          ELSE 'disabled'
        END
        WHERE commit_mode IS NULL
      `).run();
      
      // Mark migration as complete
      this.db.prepare("INSERT INTO user_preferences (key, value) VALUES ('auto_commit_migrated', 'true')").run();
      console.log('[Database] Completed auto_commit migration');
    }

    // Add tool panels table if it doesn't exist
    const toolPanelsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_panels'").all();
    if (toolPanelsTable.length === 0) {
      this.db.prepare(`
        CREATE TABLE tool_panels (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          state TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `).run();
      this.db.prepare("CREATE INDEX idx_tool_panels_session_id ON tool_panels(session_id)").run();
      this.db.prepare("CREATE INDEX idx_tool_panels_type ON tool_panels(type)").run();
      console.log('[Database] Created tool_panels table');
    }

    // Add active_panel_id column to sessions table if it doesn't exist
    const sessionsTableInfoPanel = this.db.prepare("PRAGMA table_info(sessions)").all() as SqliteTableInfo[];
    const hasActivePanelIdColumn = sessionsTableInfoPanel.some((col: SqliteTableInfo) => col.name === 'active_panel_id');
    
    if (!hasActivePanelIdColumn) {
      this.db.prepare("ALTER TABLE sessions ADD COLUMN active_panel_id TEXT").run();
      console.log('[Database] Added active_panel_id column to sessions table');
    }

    // Migration 004: Claude panels migration
    const claudePanelsMigrated = this.db.prepare("SELECT value FROM user_preferences WHERE key = 'claude_panels_migrated'").get();
    if (!claudePanelsMigrated) {
      console.log('[Database] Running Claude panels migration 004...');
      
      try {
        // Step 1: Add panel_id columns to Claude tables if they don't exist
        const sessionOutputsInfo = this.db.prepare("PRAGMA table_info(session_outputs)").all() as SqliteTableInfo[];
        const conversationMessagesInfo = this.db.prepare("PRAGMA table_info(conversation_messages)").all() as SqliteTableInfo[];
        const promptMarkersInfo = this.db.prepare("PRAGMA table_info(prompt_markers)").all() as SqliteTableInfo[];
        const executionDiffsInfo = this.db.prepare("PRAGMA table_info(execution_diffs)").all() as SqliteTableInfo[];

        const hasSessionOutputsPanelId = sessionOutputsInfo.some((col: SqliteTableInfo) => col.name === 'panel_id');
        const hasConversationMessagesPanelId = conversationMessagesInfo.some((col: SqliteTableInfo) => col.name === 'panel_id');
        const hasPromptMarkersPanelId = promptMarkersInfo.some((col: SqliteTableInfo) => col.name === 'panel_id');
        const hasExecutionDiffsPanelId = executionDiffsInfo.some((col: SqliteTableInfo) => col.name === 'panel_id');

        if (!hasSessionOutputsPanelId) {
          this.db.prepare("ALTER TABLE session_outputs ADD COLUMN panel_id TEXT").run();
          console.log('[Database] Added panel_id column to session_outputs');
        }

        if (!hasConversationMessagesPanelId) {
          this.db.prepare("ALTER TABLE conversation_messages ADD COLUMN panel_id TEXT").run();
          console.log('[Database] Added panel_id column to conversation_messages');
        }

        if (!hasPromptMarkersPanelId) {
          this.db.prepare("ALTER TABLE prompt_markers ADD COLUMN panel_id TEXT").run();
          console.log('[Database] Added panel_id column to prompt_markers');
        }

        if (!hasExecutionDiffsPanelId) {
          this.db.prepare("ALTER TABLE execution_diffs ADD COLUMN panel_id TEXT").run();
          console.log('[Database] Added panel_id column to execution_diffs');
        }

        // Step 2: Create claude_panel_settings table if it doesn't exist
        const claudePanelSettingsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='claude_panel_settings'").all();
        if (claudePanelSettingsTable.length === 0) {
          this.db.prepare(`
            CREATE TABLE claude_panel_settings (
              panel_id TEXT PRIMARY KEY,
              model TEXT DEFAULT 'claude-3-opus-20240229',
              commit_mode BOOLEAN DEFAULT 0,
              system_prompt TEXT,
              max_tokens INTEGER DEFAULT 4096,
              temperature REAL DEFAULT 0.7,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (panel_id) REFERENCES tool_panels(id) ON DELETE CASCADE
            )
          `).run();
          console.log('[Database] Created claude_panel_settings table');
        }

        // Step 3: Create indexes for efficient queries
        this.db.prepare("CREATE INDEX IF NOT EXISTS idx_session_outputs_panel_id ON session_outputs(panel_id)").run();
        this.db.prepare("CREATE INDEX IF NOT EXISTS idx_conversation_messages_panel_id ON conversation_messages(panel_id)").run();
        this.db.prepare("CREATE INDEX IF NOT EXISTS idx_prompt_markers_panel_id ON prompt_markers(panel_id)").run();
        this.db.prepare("CREATE INDEX IF NOT EXISTS idx_execution_diffs_panel_id ON execution_diffs(panel_id)").run();

        // Step 4: Data migration - Create Claude panels for existing sessions and migrate data
        const sessionsWithClaude = this.db.prepare(`
          SELECT id, claude_session_id FROM sessions 
          WHERE claude_session_id IS NOT NULL 
          AND NOT EXISTS (
            SELECT 1 FROM tool_panels 
            WHERE session_id = sessions.id 
            AND type = 'claude'
          )
        `).all() as Array<{id: string, claude_session_id: string}>;

        console.log(`[Database] Found ${sessionsWithClaude.length} sessions with Claude data to migrate`);

        for (const session of sessionsWithClaude) {
          // Generate a unique panel ID
          const panelId = `claude-panel-${session.id}-${Date.now()}`;
          
          // Create Claude panel in tool_panels table
          this.db.prepare(`
            INSERT INTO tool_panels (id, session_id, type, title, metadata)
            VALUES (?, ?, 'claude', 'Claude', ?)
          `).run(
            panelId, 
            session.id, 
            JSON.stringify({ claudeResumeId: session.claude_session_id })
          );

          // Create Claude panel settings with default model from config
          const { configManager } = require('../services/configManager');
          const defaultModel = configManager.getDefaultModel() || 'claude-3-opus-20240229';
          this.db.prepare(`
            INSERT INTO claude_panel_settings (panel_id, model)
            VALUES (?, ?)
          `).run(panelId, defaultModel);

          // Update all Claude data tables to link to the new panel
          this.db.prepare(`
            UPDATE session_outputs 
            SET panel_id = ? 
            WHERE session_id = ? AND panel_id IS NULL
          `).run(panelId, session.id);

          this.db.prepare(`
            UPDATE conversation_messages 
            SET panel_id = ? 
            WHERE session_id = ? AND panel_id IS NULL
          `).run(panelId, session.id);

          this.db.prepare(`
            UPDATE prompt_markers 
            SET panel_id = ? 
            WHERE session_id = ? AND panel_id IS NULL
          `).run(panelId, session.id);

          this.db.prepare(`
            UPDATE execution_diffs 
            SET panel_id = ? 
            WHERE session_id = ? AND panel_id IS NULL
          `).run(panelId, session.id);

          // Set this as the active panel for the session
          this.db.prepare(`
            UPDATE sessions 
            SET active_panel_id = ? 
            WHERE id = ? AND active_panel_id IS NULL
          `).run(panelId, session.id);

          console.log(`[Database] Created Claude panel ${panelId} for session ${session.id}`);
        }

        // Mark migration as complete
        this.db.prepare("INSERT INTO user_preferences (key, value) VALUES ('claude_panels_migrated', 'true')").run();
        console.log('[Database] Completed Claude panels migration 004');

      } catch (error) {
        console.error('[Database] Failed to run Claude panels migration:', error);
        // Don't throw - allow app to continue
      }
    }
    
    // Migration 005: Ensure all sessions have diff panels
    const diffPanelsMigrationComplete = this.db.prepare(
      "SELECT value FROM user_preferences WHERE key = 'diff_panels_migrated'"
    ).get() as { value: string } | undefined;
    
    if (!diffPanelsMigrationComplete) {
      console.log('[Database] Running diff panels migration 005: Ensure all sessions have diff panels');
      
      try {
        // Get all sessions
        const sessions = this.db.prepare("SELECT id FROM sessions WHERE archived = 0").all() as { id: string }[];
        
        for (const session of sessions) {
          // Check if session already has a diff panel
          const hasDiffPanel = this.db.prepare(
            "SELECT id FROM tool_panels WHERE session_id = ? AND type = 'diff'"
          ).get(session.id);
          
          if (!hasDiffPanel) {
            // Create diff panel for this session
            const panelId = require('uuid').v4();
            const now = new Date().toISOString();
            
            this.db.prepare(`
              INSERT INTO tool_panels (id, session_id, type, title, state, metadata)
              VALUES (?, ?, 'diff', 'Diff', ?, ?)
            `).run(
              panelId,
              session.id,
              JSON.stringify({
                isActive: false,
                hasBeenViewed: false,
                customState: {}
              }),
              JSON.stringify({
                createdAt: now,
                lastActiveAt: now,
                position: 0,
                permanent: true
              })
            );
            
            console.log(`[Database] Created diff panel for session ${session.id}`);
          }
        }
        
        // Mark migration as complete
        this.db.prepare("INSERT INTO user_preferences (key, value) VALUES ('diff_panels_migrated', 'true')").run();
        console.log('[Database] Completed diff panels migration 005');
        
      } catch (error) {
        console.error('[Database] Failed to run diff panels migration:', error);
        // Don't throw - allow app to continue
      }
    }

    // Migration 006: Unified panel settings storage
    const unifiedSettingsMigrationComplete = this.db.prepare(
      "SELECT value FROM user_preferences WHERE key = 'unified_panel_settings_migrated'"
    ).get() as { value: string } | undefined;
    
    if (!unifiedSettingsMigrationComplete) {
      console.log('[Database] Running migration 006: Unified panel settings storage');
      
      try {
        // Step 1: Add settings column to tool_panels if it doesn't exist
        const toolPanelsInfo = this.db.prepare("PRAGMA table_info(tool_panels)").all() as SqliteTableInfo[];
        const hasSettingsColumn = toolPanelsInfo.some((col: SqliteTableInfo) => col.name === 'settings');
        
        if (!hasSettingsColumn) {
          this.db.prepare("ALTER TABLE tool_panels ADD COLUMN settings TEXT DEFAULT '{}'").run();
          console.log('[Database] Added settings column to tool_panels table');
        }

        // Step 2: Check if claude_panel_settings table exists
        const claudePanelSettingsExists = this.db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='claude_panel_settings'"
        ).get();

        if (claudePanelSettingsExists) {
          // Migrate data from claude_panel_settings to unified settings
          const claudeSettings = this.db.prepare("SELECT * FROM claude_panel_settings").all() as ClaudePanelSetting[];
          
          for (const setting of claudeSettings) {
            const unifiedSettings = {
              model: setting.model || 'auto',
              commitMode: Boolean(setting.commit_mode),
              systemPrompt: setting.system_prompt,
              maxTokens: setting.max_tokens || 4096,
              temperature: setting.temperature || 0.7,
              createdAt: setting.created_at,
              updatedAt: setting.updated_at
            };
            
            this.db.prepare(`
              UPDATE tool_panels 
              SET settings = ?
              WHERE id = ? AND type = 'claude'
            `).run(JSON.stringify(unifiedSettings), setting.panel_id);
            
            console.log(`[Database] Migrated settings for Claude panel ${setting.panel_id}`);
          }
          
          // Drop the old table
          this.db.prepare("DROP TABLE claude_panel_settings").run();
          console.log('[Database] Dropped claude_panel_settings table');
        }

        // Mark migration as complete
        this.db.prepare("INSERT INTO user_preferences (key, value) VALUES ('unified_panel_settings_migrated', 'true')").run();
        console.log('[Database] Completed unified panel settings migration 006');

      } catch (error) {
        console.error('[Database] Failed to run unified panel settings migration:', error);
        // Don't throw - allow app to continue
      }
    }

    // Fix overlapping displayOrder values between folders and sessions
    // This migration is needed ONLY for databases from before folders and sessions
    // were merged into one unified ordering system. It should NOT run on databases
    // where users have manually reordered items via drag-and-drop.
    const overlappingOrderFixApplied = this.db.prepare("SELECT value FROM user_preferences WHERE key = 'folder_session_order_fix_applied'").get();
    if (!overlappingOrderFixApplied) {
      console.log('[Database] Checking for old-style folder/session ordering that needs migration...');

      try {
        // Get all projects
        const projects = this.db.prepare('SELECT id FROM projects').all() as Array<{ id: number }>;
        let projectsNeedingMigration = 0;

        for (const project of projects) {
          // Check if this project has the OLD pattern: folders with low displayOrder (0-10)
          // AND sessions also with low displayOrder (0-10), indicating separate ordering systems
          // Exclude main repo sessions as they have separate handling
          const folderStats = this.db.prepare(`
            SELECT MIN(display_order) as min_order, MAX(display_order) as max_order, COUNT(*) as count
            FROM folders
            WHERE project_id = ? AND parent_folder_id IS NULL
          `).get(project.id) as { min_order: number | null; max_order: number | null; count: number };

          const sessionStats = this.db.prepare(`
            SELECT MIN(display_order) as min_order, MAX(display_order) as max_order, COUNT(*) as count
            FROM sessions
            WHERE project_id = ?
              AND (archived = 0 OR archived IS NULL)
              AND folder_id IS NULL
              AND (is_main_repo = 0 OR is_main_repo IS NULL)
          `).get(project.id) as { min_order: number | null; max_order: number | null; count: number };

          // Only migrate if BOTH folders and sessions start near 0 and have overlapping ranges
          // This indicates the old separate ordering system
          const needsMigration =
            folderStats.count > 0 &&
            sessionStats.count > 0 &&
            folderStats.min_order !== null &&
            sessionStats.min_order !== null &&
            folderStats.min_order <= 5 &&  // Folders start near beginning
            sessionStats.min_order <= 5 &&  // Sessions also start near beginning
            folderStats.max_order! < sessionStats.count + folderStats.count - 5;  // Range overlap indicates old system

          if (needsMigration) {
            projectsNeedingMigration++;
            console.log(`[Database] Fixing Folder Ordering for project ${project.id}: Detected old ordering system (${folderStats.count} folders, ${sessionStats.count} sessions)`);

            // Get all root-level sessions and folders for this project
            const rootSessions = this.db.prepare(`
              SELECT id, display_order, created_at
              FROM sessions
              WHERE project_id = ?
                AND (archived = 0 OR archived IS NULL)
                AND folder_id IS NULL
                AND (is_main_repo = 0 OR is_main_repo IS NULL)
              ORDER BY created_at ASC
            `).all(project.id) as Array<{ id: string; display_order: number; created_at: string }>;

            const allFolders = this.db.prepare(`
              SELECT id, display_order, created_at
              FROM folders
              WHERE project_id = ?
                AND parent_folder_id IS NULL
              ORDER BY created_at ASC
            `).all(project.id) as Array<{ id: string; display_order: number; created_at: string }>;

            // Combine and sort by creation timestamp to determine proper order
            type OrderedItem = { type: 'session' | 'folder'; id: string; createdAt: Date };
            const allItems: OrderedItem[] = [
              ...rootSessions.map(s => ({ type: 'session' as const, id: s.id, createdAt: new Date(s.created_at) })),
              ...allFolders.map(f => ({ type: 'folder' as const, id: f.id, createdAt: new Date(f.created_at) }))
            ];

            // Sort by creation timestamp (oldest first)
            allItems.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

            // Reassign displayOrder sequentially
            allItems.forEach((item, index) => {
              if (item.type === 'session') {
                this.db.prepare('UPDATE sessions SET display_order = ? WHERE id = ?').run(index, item.id);
              } else {
                this.db.prepare('UPDATE folders SET display_order = ? WHERE id = ?').run(index, item.id);
              }
            });

            console.log(`[Database] Fixed ordering for project ${project.id}: Reassigned displayOrder for ${allItems.length} items`);
          }
        }

        // Always mark migration as complete, even if no projects needed it
        // This prevents the check from running on every startup
        this.db.prepare("INSERT INTO user_preferences (key, value) VALUES ('folder_session_order_fix_applied', 'true')").run();
        if (projectsNeedingMigration > 0) {
          console.log(`[Database] Completed folder/session ordering fix migration for ${projectsNeedingMigration} project(s)`);
        } else {
          console.log('[Database] No projects needed ordering migration (already using unified system)');
        }

      } catch (error) {
        console.error('[Database] Failed to fix folder/session ordering:', error);
        // Don't throw - allow app to continue
      }
    }
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
    const values: (string | number | boolean | null)[] = [];

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

    // Get the max display_order - if this is a root-level folder (no parent),
    // we need to consider both folders and sessions since they share the same space
    let displayOrder: number;
    if (!parentFolderId) {
      // Root-level folder: check both folders and sessions
      const maxFolderOrder = this.db.prepare(`
        SELECT MAX(display_order) as max_order
        FROM folders
        WHERE project_id = ? AND parent_folder_id IS NULL
      `).get(projectId) as { max_order: number | null };

      const maxSessionOrder = this.db.prepare(`
        SELECT MAX(display_order) as max_order
        FROM sessions
        WHERE project_id = ? AND (archived = 0 OR archived IS NULL) AND folder_id IS NULL
      `).get(projectId) as { max_order: number | null };

      // Use the maximum of both to ensure no overlap
      const maxOrder = Math.max(
        maxFolderOrder?.max_order ?? -1,
        maxSessionOrder?.max_order ?? -1
      );
      displayOrder = maxOrder + 1;
    } else {
      // Nested folder: only check folders at the same level
      const maxOrder = this.db.prepare(`
        SELECT MAX(display_order) as max_order
        FROM folders
        WHERE project_id = ? AND parent_folder_id = ?
      `).get(projectId, parentFolderId) as { max_order: number | null };

      displayOrder = (maxOrder?.max_order ?? -1) + 1;
    }
    
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
    const values: (string | number | boolean | null)[] = [];
    
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

  reorderFolders(projectId: number, folderOrders: Array<{ id: string; displayOrder: number }>): void {
    const stmt = this.db.prepare(`
      UPDATE folders
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `);

    const transaction = this.db.transaction(() => {
      folderOrders.forEach(({ id, displayOrder }) => {
        stmt.run(displayOrder, id, projectId);
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
    const values: (string | number | boolean | null)[] = [];

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
    return this.transaction(() => {
      // Get the max display_order for both sessions and folders in this project
      // Sessions and folders share the same display_order space within a project
      // Exclude main repo sessions as they have separate handling
      const maxSessionOrder = this.db.prepare(`
        SELECT MAX(display_order) as max_order
        FROM sessions
        WHERE project_id = ?
          AND (archived = 0 OR archived IS NULL)
          AND folder_id IS NULL
          AND (is_main_repo = 0 OR is_main_repo IS NULL)
      `).get(data.project_id) as { max_order: number | null };

      const maxFolderOrder = this.db.prepare(`
        SELECT MAX(display_order) as max_order
        FROM folders
        WHERE project_id = ? AND parent_folder_id IS NULL
      `).get(data.project_id) as { max_order: number | null };

      // Use the maximum of both to ensure no overlap
      const maxOrder = Math.max(
        maxSessionOrder?.max_order ?? -1,
        maxFolderOrder?.max_order ?? -1
      );
      const displayOrder = maxOrder + 1;
      
      this.db.prepare(`
        INSERT INTO sessions (id, name, initial_prompt, worktree_name, worktree_path, status, project_id, folder_id, permission_mode, is_main_repo, display_order, auto_commit, tool_type, base_commit, base_branch, commit_mode, commit_mode_settings)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.id,
        data.name,
        data.initial_prompt,
        data.worktree_name,
        data.worktree_path,
        data.project_id,
        data.folder_id || null,
        data.permission_mode || 'ignore',
        data.is_main_repo ? 1 : 0,
        displayOrder,
        data.auto_commit !== undefined ? (data.auto_commit ? 1 : 0) : 1,
        data.tool_type || 'claude',
        data.base_commit || null,
        data.base_branch || null,
        data.commit_mode || null,
        data.commit_mode_settings || null
      );
      
      const session = this.getSession(data.id);
      if (!session) {
        throw new Error('Failed to create session');
      }
      return session;
    });
  }

  getSession(id: string): Session | undefined {
    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
    if (session && session.skip_continue_next !== undefined) {
      console.log(`[Database] Retrieved session ${id} with skip_continue_next:`, {
        raw_value: session.skip_continue_next,
        type: typeof session.skip_continue_next,
        is_truthy: !!session.skip_continue_next
      });
    }
    return session;
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

  checkSessionNameExists(name: string): boolean {
    const result = this.db.prepare('SELECT id FROM sessions WHERE (name = ? OR worktree_name = ?) LIMIT 1').get(name, name);
    return result !== undefined;
  }

  updateSession(id: string, data: UpdateSessionData): Session | undefined {
    console.log(`[Database] Updating session ${id} with data:`, data);
    
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.status_message !== undefined) {
      updates.push('status_message = ?');
      values.push(data.status_message);
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
    if (data.skip_continue_next !== undefined) {
      updates.push('skip_continue_next = ?');
      const boolValue = data.skip_continue_next ? 1 : 0;
      values.push(boolValue);
      console.log(`[Database] Setting skip_continue_next to ${boolValue} (from ${data.skip_continue_next}) for session ${id}`);
    }
    if (data.commit_mode !== undefined) {
      updates.push('commit_mode = ?');
      values.push(data.commit_mode);
    }
    if (data.commit_mode_settings !== undefined) {
      updates.push('commit_mode_settings = ?');
      values.push(data.commit_mode_settings);
    }

    if (updates.length === 0) {
      return this.getSession(id);
    }

    // Only update the updated_at timestamp if we're changing something other than is_favorite, auto_commit, skip_continue_next, commit_mode, or commit_mode_settings
    // This prevents the session from showing as "unviewed" when just toggling these settings
    const isOnlyToggleUpdate = updates.length === 1 && (updates[0] === 'is_favorite = ?' || updates[0] === 'auto_commit = ?' || updates[0] === 'skip_continue_next = ?' || updates[0] === 'commit_mode = ?' || updates[0] === 'commit_mode_settings = ?');
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
  addSessionOutput(sessionId: string, type: 'stdout' | 'stderr' | 'system' | 'json' | 'error', data: string): void {
    this.db.prepare(`
      INSERT INTO session_outputs (session_id, type, data)
      VALUES (?, ?, ?)
    `).run(sessionId, type, data);
  }

  getSessionOutputs(sessionId: string, limit?: number): SessionOutput[] {
    const effectiveLimit = typeof limit === 'number' ? limit : Number(limit);
    if (Number.isFinite(effectiveLimit) && effectiveLimit > 0) {
      const rows = this.db.prepare(`
        SELECT * FROM session_outputs 
        WHERE session_id = ? 
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(sessionId, effectiveLimit) as SessionOutput[];
      return rows.reverse();
    }

    return this.db.prepare(`
      SELECT * FROM session_outputs 
      WHERE session_id = ? 
      ORDER BY timestamp ASC, id ASC
    `).all(sessionId) as SessionOutput[];
  }

  getSessionOutputsForPanel(panelId: string, limit?: number): SessionOutput[] {
    const effectiveLimit = typeof limit === 'number' ? limit : Number(limit);
    if (Number.isFinite(effectiveLimit) && effectiveLimit > 0) {
      const rows = this.db.prepare(`
        SELECT * FROM session_outputs 
        WHERE panel_id = ? 
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(panelId, effectiveLimit) as SessionOutput[];
      return rows.reverse();
    }

    return this.db.prepare(`
      SELECT * FROM session_outputs 
      WHERE panel_id = ? 
      ORDER BY timestamp ASC, id ASC
    `).all(panelId) as SessionOutput[];
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

  // Claude panel output operations - use panel_id for Claude-specific data
  addPanelOutput(panelId: string, type: 'stdout' | 'stderr' | 'system' | 'json' | 'error', data: string): void {
    // Get the session_id from the panel
    const panel = this.getPanel(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }
    
    this.db.prepare(`
      INSERT INTO session_outputs (session_id, panel_id, type, data)
      VALUES (?, ?, ?, ?)
    `).run(panel.sessionId, panelId, type, data);
  }

  getPanelOutputs(panelId: string, limit?: number): SessionOutput[] {
    const effectiveLimit = typeof limit === 'number' ? limit : Number(limit);
    if (Number.isFinite(effectiveLimit) && effectiveLimit > 0) {
      const rows = this.db.prepare(`
        SELECT * FROM session_outputs 
        WHERE panel_id = ? 
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      `).all(panelId, effectiveLimit) as SessionOutput[];
      return rows.reverse();
    }

    return this.db.prepare(`
      SELECT * FROM session_outputs 
      WHERE panel_id = ? 
      ORDER BY timestamp ASC, id ASC
    `).all(panelId) as SessionOutput[];
  }

  getRecentPanelOutputs(panelId: string, since?: Date): SessionOutput[] {
    if (since) {
      return this.db.prepare(`
        SELECT * FROM session_outputs 
        WHERE panel_id = ? AND timestamp > ? 
        ORDER BY timestamp ASC
      `).all(panelId, since.toISOString()) as SessionOutput[];
    } else {
      return this.getPanelOutputs(panelId);
    }
  }

  clearPanelOutputs(panelId: string): void {
    this.db.prepare('DELETE FROM session_outputs WHERE panel_id = ?').run(panelId);
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

  // Claude panel conversation message operations - use panel_id for Claude-specific data
  addPanelConversationMessage(panelId: string, messageType: 'user' | 'assistant', content: string): void {
    // Get the session_id from the panel
    const panel = this.getPanel(panelId);
    if (!panel) {
      throw new Error(`Panel not found: ${panelId}`);
    }
    
    this.db.prepare(`
      INSERT INTO conversation_messages (session_id, panel_id, message_type, content)
      VALUES (?, ?, ?, ?)
    `).run(panel.sessionId, panelId, messageType, content);
  }

  getPanelConversationMessages(panelId: string): ConversationMessage[] {
    return this.db.prepare(`
      SELECT * FROM conversation_messages 
      WHERE panel_id = ? 
      ORDER BY timestamp ASC
    `).all(panelId) as ConversationMessage[];
  }

  clearPanelConversationMessages(panelId: string): void {
    this.db.prepare('DELETE FROM conversation_messages WHERE panel_id = ?').run(panelId);
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

  getPanelPromptMarkers(panelId: string): PromptMarker[] {
    const markers = this.db.prepare(`
      SELECT 
        id,
        session_id,
        panel_id,
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
      WHERE panel_id = ? 
      ORDER BY timestamp ASC
    `).all(panelId) as PromptMarker[];
    
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

  // Claude panel prompt marker operations - use panel_id for Claude-specific data
  addPanelPromptMarker(panelId: string, promptText: string, outputIndex: number, outputLine?: number): number {
    console.log('[Database] Adding panel prompt marker:', { panelId, promptText, outputIndex, outputLine });
    
    try {
      // Get the session_id from the panel
      const panel = this.getPanel(panelId);
      if (!panel) {
        throw new Error(`Panel not found: ${panelId}`);
      }
      
      // Use datetime('now') to ensure UTC timestamp
      const result = this.db.prepare(`
        INSERT INTO prompt_markers (session_id, panel_id, prompt_text, output_index, output_line, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(panel.sessionId, panelId, promptText, outputIndex, outputLine);
      
      console.log('[Database] Panel prompt marker added successfully, ID:', result.lastInsertRowid);
      return result.lastInsertRowid as number;
    } catch (error) {
      console.error('[Database] Failed to add panel prompt marker:', error);
      throw error;
    }
  }


  updatePanelPromptMarkerCompletion(panelId: string, timestamp?: string): void {
    // Update the most recent prompt marker for this panel with completion timestamp
    // Use datetime() to ensure proper UTC timestamp handling
    if (timestamp) {
      // If timestamp is provided, use datetime() to normalize it
      this.db.prepare(`
        UPDATE prompt_markers 
        SET completion_timestamp = datetime(?) 
        WHERE panel_id = ? 
        AND id = (
          SELECT id FROM prompt_markers 
          WHERE panel_id = ? 
          ORDER BY timestamp DESC 
          LIMIT 1
        )
      `).run(timestamp, panelId, panelId);
    } else {
      // If no timestamp, use current UTC time
      this.db.prepare(`
        UPDATE prompt_markers 
        SET completion_timestamp = datetime('now') 
        WHERE panel_id = ? 
        AND id = (
          SELECT id FROM prompt_markers 
          WHERE panel_id = ? 
          ORDER BY timestamp DESC 
          LIMIT 1
        )
      `).run(panelId, panelId);
    }
  }

  // Execution diff operations
  createExecutionDiff(data: CreateExecutionDiffData): ExecutionDiff {
    const result = this.db.prepare(`
      INSERT INTO execution_diffs (
        session_id, prompt_marker_id, execution_sequence, git_diff, 
        files_changed, stats_additions, stats_deletions, stats_files_changed,
        before_commit_hash, after_commit_hash, commit_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.after_commit_hash || null,
      data.commit_message || null
    );

    const diff = this.db.prepare('SELECT * FROM execution_diffs WHERE id = ?').get(result.lastInsertRowid) as ExecutionDiffRow | undefined;
    if (!diff) {
      throw new Error('Failed to retrieve created execution diff');
    }
    return this.convertDbExecutionDiff(diff);
  }

  getExecutionDiffs(sessionId: string): ExecutionDiff[] {
    const rows = this.db.prepare(`
      SELECT * FROM execution_diffs 
      WHERE session_id = ? 
      ORDER BY execution_sequence ASC
    `).all(sessionId) as ExecutionDiffRow[];
    
    return rows.map(this.convertDbExecutionDiff.bind(this));
  }

  getExecutionDiff(id: number): ExecutionDiff | undefined {
    const row = this.db.prepare('SELECT * FROM execution_diffs WHERE id = ?').get(id) as ExecutionDiffRow | undefined;
    return row ? this.convertDbExecutionDiff(row) : undefined;
  }

  getNextExecutionSequence(sessionId: string): number {
    const result = this.db.prepare(`
      SELECT MAX(execution_sequence) as max_seq 
      FROM execution_diffs 
      WHERE session_id = ?
    `).get(sessionId) as { max_seq: number | null } | undefined;
    
    return (result?.max_seq || 0) + 1;
  }

  private convertDbExecutionDiff(row: ExecutionDiffRow): ExecutionDiff {
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
      commit_message: row.commit_message,
      timestamp: row.timestamp
    };
  }

  // Claude panel execution diff operations - use panel_id for Claude-specific data
  createPanelExecutionDiff(data: CreatePanelExecutionDiffData): ExecutionDiff {
    const result = this.db.prepare(`
      INSERT INTO execution_diffs (
        panel_id, prompt_marker_id, execution_sequence, git_diff, 
        files_changed, stats_additions, stats_deletions, stats_files_changed,
        before_commit_hash, after_commit_hash, commit_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.panel_id,
      data.prompt_marker_id || null,
      data.execution_sequence,
      data.git_diff || null,
      data.files_changed ? JSON.stringify(data.files_changed) : null,
      data.stats_additions || 0,
      data.stats_deletions || 0,
      data.stats_files_changed || 0,
      data.before_commit_hash || null,
      data.after_commit_hash || null,
      data.commit_message || null
    );

    const diff = this.db.prepare('SELECT * FROM execution_diffs WHERE id = ?').get(result.lastInsertRowid) as ExecutionDiffRow | undefined;
    if (!diff) {
      throw new Error('Failed to retrieve created panel execution diff');
    }
    return this.convertDbExecutionDiff(diff);
  }

  getPanelExecutionDiffs(panelId: string): ExecutionDiff[] {
    const rows = this.db.prepare(`
      SELECT * FROM execution_diffs 
      WHERE panel_id = ? 
      ORDER BY execution_sequence ASC
    `).all(panelId) as ExecutionDiffRow[];
    
    return rows.map(this.convertDbExecutionDiff.bind(this));
  }

  getNextPanelExecutionSequence(panelId: string): number {
    const result = this.db.prepare(`
      SELECT MAX(execution_sequence) as max_seq 
      FROM execution_diffs 
      WHERE panel_id = ?
    `).get(panelId) as { max_seq: number | null } | undefined;
    
    return (result?.max_seq || 0) + 1;
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
      dflt_value: unknown; 
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
      dflt_value: unknown;
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
  recordAppOpen(welcomeHidden: boolean, discordShown: boolean = false, appVersion?: string): void {
    this.db.prepare(`
      INSERT INTO app_opens (welcome_hidden, discord_shown, app_version)
      VALUES (?, ?, ?)
    `).run(welcomeHidden ? 1 : 0, discordShown ? 1 : 0, appVersion || null);
  }

  getLastAppOpen(): { opened_at: string; welcome_hidden: boolean; discord_shown: boolean; app_version?: string } | null {
    const result = this.db.prepare(`
      SELECT opened_at, welcome_hidden, discord_shown, app_version
      FROM app_opens
      ORDER BY opened_at DESC
      LIMIT 1
    `).get() as { opened_at: string; welcome_hidden: number; discord_shown: number; app_version?: string } | undefined;

    if (!result) return null;

    return {
      opened_at: result.opened_at,
      welcome_hidden: Boolean(result.welcome_hidden),
      discord_shown: Boolean(result.discord_shown),
      app_version: result.app_version
    };
  }

  getLastAppVersion(): string | null {
    const result = this.db.prepare(`
      SELECT app_version
      FROM app_opens
      WHERE app_version IS NOT NULL
      ORDER BY opened_at DESC
      LIMIT 1
    `).get() as { app_version: string } | undefined;

    return result?.app_version || null;
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

  // Panel operations
  createPanel(data: {
    id: string;
    sessionId: string;
    type: string;
    title: string;
    state?: unknown;
    metadata?: unknown;
  }): void {
    this.transaction(() => {
      const stateJson = data.state ? JSON.stringify(data.state) : null;
      const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;
      
      this.db.prepare(`
        INSERT INTO tool_panels (id, session_id, type, title, state, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(data.id, data.sessionId, data.type, data.title, stateJson, metadataJson);
    });
  }

  updatePanel(panelId: string, updates: {
    title?: string;
    state?: unknown;
    metadata?: unknown;
  }): void {
    // Get existing panel first to merge state
    const existingPanel = this.getPanel(panelId);

    // Add debug logging to track panel state changes
    if (updates.state !== undefined) {
      console.log(`[DB-DEBUG] updatePanel called for ${panelId} with state:`, JSON.stringify(updates.state));
      if (existingPanel) {
        console.log(`[DB-DEBUG] Existing panel state before update:`, JSON.stringify(existingPanel.state));
      }
    }

    this.transaction(() => {
      const setClauses: string[] = [];
      const values: (string | number | boolean | null)[] = [];

      if (updates.title !== undefined) {
        setClauses.push('title = ?');
        values.push(updates.title);
      }

      if (updates.state !== undefined) {
        // Merge with existing state instead of replacing
        const existingState = existingPanel?.state || {};
        const mergedState = {
          ...existingState,
          ...updates.state
        };

        // If there's a customState in either, merge that too
        if (typeof existingState === 'object' && existingState !== null && 'customState' in existingState) {
          const existingCustomState = (existingState as { customState?: unknown }).customState;
          const updatesCustomState = typeof updates.state === 'object' && updates.state !== null && 'customState' in updates.state
            ? (updates.state as { customState?: unknown }).customState
            : undefined;

          if (existingCustomState !== undefined || updatesCustomState !== undefined) {
            (mergedState as { customState: unknown }).customState = {
              ...(typeof existingCustomState === 'object' && existingCustomState !== null ? existingCustomState : {}),
              ...(typeof updatesCustomState === 'object' && updatesCustomState !== null ? updatesCustomState : {})
            };
          }
        }

        console.log(`[DB-DEBUG] Merged state:`, JSON.stringify(mergedState));

        setClauses.push('state = ?');
        values.push(JSON.stringify(mergedState));
      }
      
      if (updates.metadata !== undefined) {
        setClauses.push('metadata = ?');
        values.push(JSON.stringify(updates.metadata));
      }
      
      if (setClauses.length > 0) {
        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(panelId);
        
        const result = this.db.prepare(`
          UPDATE tool_panels
          SET ${setClauses.join(', ')}
          WHERE id = ?
        `).run(...values);
        
        console.log(`[DB-DEBUG] Update result for panel ${panelId}: ${result.changes} rows affected`);
        
        if (updates.state !== undefined && result.changes > 0) {
          const afterPanel = this.getPanel(panelId);
          console.log(`[DB-DEBUG] Panel state after update:`, JSON.stringify(afterPanel?.state));
        }
      }
    });
  }

  deletePanel(panelId: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM tool_panels WHERE id = ?').run(panelId);
    });
  }

  /**
   * Create a panel and set it as the active panel for the session in a single transaction
   */
  createPanelAndSetActive(data: {
    id: string;
    sessionId: string;
    type: string;
    title: string;
    state?: unknown;
    metadata?: unknown;
  }): void {
    this.transaction(() => {
      // Create the panel
      const stateJson = data.state ? JSON.stringify(data.state) : null;
      const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;
      
      this.db.prepare(`
        INSERT INTO tool_panels (id, session_id, type, title, state, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(data.id, data.sessionId, data.type, data.title, stateJson, metadataJson);

      // Set as active panel
      this.db.prepare('UPDATE sessions SET active_panel_id = ? WHERE id = ?').run(data.id, data.sessionId);
    });
  }

  getPanel(panelId: string): ToolPanel | null {
    const row = this.db.prepare('SELECT * FROM tool_panels WHERE id = ?').get(panelId) as ToolPanelRow | undefined;
    
    if (!row) return null;
    
    // Check if this panel is the active one for its session
    const activePanel = this.db.prepare('SELECT active_panel_id FROM sessions WHERE id = ?').get(row.session_id) as { active_panel_id: string | null } | undefined;
    const isActive = activePanel?.active_panel_id === panelId;
    
    const state = row.state ? JSON.parse(row.state) as ToolPanelState : { isActive: false, hasBeenViewed: false, customState: {} };
    // Update isActive based on whether this panel is the active one
    state.isActive = isActive;
    
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type as ToolPanelType,
      title: row.title,
      state,
      metadata: row.metadata ? JSON.parse(row.metadata) as ToolPanelMetadata : { createdAt: row.created_at, lastActiveAt: row.created_at, position: 0 }
    };
  }

  getPanelsForSession(sessionId: string): ToolPanel[] {
    const rows = this.db.prepare('SELECT * FROM tool_panels WHERE session_id = ? ORDER BY created_at').all(sessionId) as ToolPanelRow[];
    
    // Get the active panel ID for this session
    const activePanel = this.db.prepare('SELECT active_panel_id FROM sessions WHERE id = ?').get(sessionId) as { active_panel_id: string | null } | undefined;
    const activePanelId = activePanel?.active_panel_id;
    
    return rows.map(row => {
      const state = row.state ? JSON.parse(row.state) as ToolPanelState : { isActive: false, hasBeenViewed: false, customState: {} };
      // Update isActive based on whether this panel is the active one
      state.isActive = row.id === activePanelId;
      
      return {
        id: row.id,
        sessionId: row.session_id,
        type: row.type as ToolPanelType,
        title: row.title,
        state,
        metadata: row.metadata ? JSON.parse(row.metadata) as ToolPanelMetadata : { createdAt: row.created_at, lastActiveAt: row.created_at, position: 0 }
      };
    });
  }

  getAllPanels(): ToolPanel[] {
    const rows = this.db.prepare('SELECT * FROM tool_panels ORDER BY created_at').all() as ToolPanelRow[];
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.type as ToolPanelType,
      title: row.title,
      state: row.state ? JSON.parse(row.state) as ToolPanelState : { isActive: false },
      metadata: row.metadata ? JSON.parse(row.metadata) as ToolPanelMetadata : { createdAt: row.created_at, lastActiveAt: row.created_at, position: 0 }
    }));
  }

  getActivePanels(): ToolPanel[] {
    const rows = this.db.prepare(`
      SELECT tp.* FROM tool_panels tp
      JOIN sessions s ON tp.session_id = s.id
      WHERE s.archived = 0 OR s.archived IS NULL
      ORDER BY tp.created_at
    `).all() as ToolPanelRow[];
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.type as ToolPanelType,
      title: row.title,
      state: row.state ? JSON.parse(row.state) as ToolPanelState : { isActive: false },
      metadata: row.metadata ? JSON.parse(row.metadata) as ToolPanelMetadata : { createdAt: row.created_at, lastActiveAt: row.created_at, position: 0 }
    }));
  }

  setActivePanel(sessionId: string, panelId: string | null): void {
    this.db.prepare('UPDATE sessions SET active_panel_id = ? WHERE id = ?').run(panelId, sessionId);
  }

  getActivePanel(sessionId: string): ToolPanel | null {
    const row = this.db.prepare(`
      SELECT tp.* FROM tool_panels tp
      JOIN sessions s ON s.active_panel_id = tp.id
      WHERE s.id = ?
    `).get(sessionId) as ToolPanelRow | undefined;
    
    if (!row) return null;
    
    const state = row.state ? JSON.parse(row.state) as ToolPanelState : { isActive: true, hasBeenViewed: false };
    // This panel is the active one by definition (we joined on active_panel_id)
    state.isActive = true;
    
    return {
      id: row.id,
      sessionId: row.session_id,
      type: row.type as ToolPanelType,
      title: row.title,
      state,
      metadata: row.metadata ? JSON.parse(row.metadata) as ToolPanelMetadata : { createdAt: row.created_at, lastActiveAt: row.created_at, position: 0 }
    };
  }

  deletePanelsForSession(sessionId: string): void {
    this.db.prepare('DELETE FROM tool_panels WHERE session_id = ?').run(sessionId);
  }

  // ========== UNIFIED PANEL SETTINGS OPERATIONS ==========
  // These methods store all panel-specific settings as JSON in the tool_panels.settings column
  // This provides a flexible, extensible way to store settings without schema changes

  /**
   * Get panel settings from the unified JSON storage
   * Returns the parsed settings object or an empty object if none exist
   */
  getPanelSettings(panelId: string): Record<string, unknown> {
    const row = this.db.prepare(`
      SELECT settings FROM tool_panels WHERE id = ?
    `).get(panelId) as { settings?: string } | undefined;

    if (!row || !row.settings) {
      return {};
    }

    try {
      return JSON.parse(row.settings);
    } catch (e) {
      console.error(`Failed to parse settings for panel ${panelId}:`, e);
      return {};
    }
  }

  /**
   * Update panel settings in the unified JSON storage
   * Merges the provided settings with existing ones
   */
  updatePanelSettings(panelId: string, settings: Record<string, unknown>): void {
    // Get existing settings
    const existingSettings = this.getPanelSettings(panelId);
    
    // Merge with new settings
    const mergedSettings = {
      ...existingSettings,
      ...settings,
      updatedAt: new Date().toISOString()
    };

    // Update the database
    this.db.prepare(`
      UPDATE tool_panels
      SET settings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(mergedSettings), panelId);
  }

  /**
   * Set panel settings (replaces all existing settings)
   */
  setPanelSettings(panelId: string, settings: Record<string, unknown>): void {
    const settingsWithTimestamp = {
      ...settings,
      updatedAt: new Date().toISOString()
    };

    this.db.prepare(`
      UPDATE tool_panels
      SET settings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(settingsWithTimestamp), panelId);
  }

  // ========== LEGACY CLAUDE PANEL SETTINGS (for backward compatibility) ==========
  // These will be deprecated but are kept for migration purposes

  createClaudePanelSettings(panelId: string, settings: {
    model?: string;
    commit_mode?: boolean;
    system_prompt?: string;
    max_tokens?: number;
    temperature?: number;
  }): void {
    // Use the new unified settings storage
    this.updatePanelSettings(panelId, {
      model: settings.model || 'auto',
      commitMode: settings.commit_mode || false,
      systemPrompt: settings.system_prompt || null,
      maxTokens: settings.max_tokens || 4096,
      temperature: settings.temperature || 0.7
    });
  }

  getClaudePanelSettings(panelId: string): {
    panel_id: string;
    model: string;
    commit_mode: boolean;
    system_prompt: string | null;
    max_tokens: number;
    temperature: number;
    created_at: string;
    updated_at: string;
  } | null {
    const settings = this.getPanelSettings(panelId);
    
    if (!settings || Object.keys(settings).length === 0) {
      return null;
    }

    // Convert from new format to old format for compatibility
    const s = settings as Record<string, unknown>;
    return {
      panel_id: panelId,
      model: (typeof s.model === 'string' ? s.model : null) || 'auto',
      commit_mode: (typeof s.commitMode === 'boolean' ? s.commitMode : null) || false,
      system_prompt: (typeof s.systemPrompt === 'string' ? s.systemPrompt : null) || null,
      max_tokens: (typeof s.maxTokens === 'number' ? s.maxTokens : null) || 4096,
      temperature: (typeof s.temperature === 'number' ? s.temperature : null) || 0.7,
      created_at: (typeof s.createdAt === 'string' ? s.createdAt : null) || new Date().toISOString(),
      updated_at: (typeof s.updatedAt === 'string' ? s.updatedAt : null) || new Date().toISOString()
    };
  }

  updateClaudePanelSettings(panelId: string, settings: {
    model?: string;
    commit_mode?: boolean;
    system_prompt?: string;
    max_tokens?: number;
    temperature?: number;
  }): void {
    const updateObj: Record<string, unknown> = {};
    
    if (settings.model !== undefined) updateObj.model = settings.model;
    if (settings.commit_mode !== undefined) updateObj.commitMode = settings.commit_mode;
    if (settings.system_prompt !== undefined) updateObj.systemPrompt = settings.system_prompt;
    if (settings.max_tokens !== undefined) updateObj.maxTokens = settings.max_tokens;
    if (settings.temperature !== undefined) updateObj.temperature = settings.temperature;
    
    this.updatePanelSettings(panelId, updateObj);
  }

  deleteClaudePanelSettings(panelId: string): void {
    this.db.prepare('DELETE FROM claude_panel_settings WHERE panel_id = ?').run(panelId);
  }

  // Session statistics methods
  getSessionTokenUsage(sessionId: string): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    messageCount: number;
  } {
    const rows = this.db.prepare(`
      SELECT data 
      FROM session_outputs 
      WHERE session_id = ? AND type = 'json'
      ORDER BY timestamp ASC
    `).all(sessionId) as { data: string }[];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let messageCount = 0;

    rows.forEach((row: { data: string }) => {
      try {
        const data = JSON.parse(row.data);
        if (data.input_tokens) {
          totalInputTokens += data.input_tokens;
          messageCount++;
        }
        if (data.output_tokens) {
          totalOutputTokens += data.output_tokens;
        }
        if (data.cache_read_input_tokens) {
          totalCacheReadTokens += data.cache_read_input_tokens;
        }
        if (data.cache_creation_input_tokens) {
          totalCacheCreationTokens += data.cache_creation_input_tokens;
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheReadTokens,
      totalCacheCreationTokens,
      messageCount
    };
  }

  getSessionOutputCounts(sessionId: string): { json: number; stdout: number; stderr: number } {
    const result = this.db.prepare(`
      SELECT 
        type,
        COUNT(*) as count
      FROM session_outputs
      WHERE session_id = ?
      GROUP BY type
    `).all(sessionId) as { type: string; count: number }[];

    const counts: { json: number; stdout: number; stderr: number } = {
      json: 0,
      stdout: 0,
      stderr: 0
    };

    result.forEach((row: { type: string; count: number }) => {
      if (row.type in counts) {
        counts[row.type as keyof typeof counts] = row.count;
      }
    });

    return counts;
  }

  getConversationMessageCount(sessionId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM conversation_messages 
      WHERE session_id = ?
    `).get(sessionId) as { count: number } | undefined;
    
    return result?.count || 0;
  }

  getPanelConversationMessageCount(panelId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM conversation_messages 
      WHERE panel_id = ?
    `).get(panelId) as { count: number } | undefined;
    
    return result?.count || 0;
  }

  getSessionToolUsage(sessionId: string): {
    tools: Array<{
      name: string;
      count: number;
      totalDuration: number;
      avgDuration: number;
      totalInputTokens: number;
      totalOutputTokens: number;
    }>;
    totalToolCalls: number;
  } {
    // Get all tool_use messages for this session
    const toolUseRows = this.db.prepare(`
      SELECT data, timestamp 
      FROM session_outputs 
      WHERE session_id = ? AND type = 'json'
      ORDER BY timestamp ASC
    `).all(sessionId) as { data: string; timestamp: string }[];

    const toolStats = new Map<string, {
      count: number;
      durations: number[];
      inputTokens: number;
      outputTokens: number;
      lastCallTime?: string;
      pendingCalls: Map<string, string>;
    }>();

    let totalToolCalls = 0;

    // Process each message
    toolUseRows.forEach((row: { data: string; timestamp: string }, index: number) => {
      try {
        const data = JSON.parse(row.data);
        
        // Check if this is a tool_use message
        if (data.type === 'assistant' && data.message?.content) {
          data.message.content.forEach((content: unknown) => {
            const contentObj = content as { type?: string; name?: string; id?: string };
            if (contentObj.type === 'tool_use' && contentObj.name) {
              totalToolCalls++;
              const toolName = contentObj.name!;
              const toolId = contentObj.id;
              
              if (!toolStats.has(toolName)) {
                toolStats.set(toolName, {
                  count: 0,
                  durations: [],
                  inputTokens: 0,
                  outputTokens: 0,
                  pendingCalls: new Map()
                });
              }
              
              const stats = toolStats.get(toolName)!;
              stats.count++;
              if (toolId) {
                stats.pendingCalls.set(toolId, row.timestamp);
              }
              
              // Add token usage if available
              if (data.message.usage) {
                stats.inputTokens += data.message.usage.input_tokens || 0;
                stats.outputTokens += data.message.usage.output_tokens || 0;
              }
            }
          });
        }
        
        // Check if this is a tool_result message
        if (data.type === 'user' && data.message?.content) {
          data.message.content.forEach((content: unknown) => {
            const contentObj = content as { type?: string; tool_use_id?: string };
            if (contentObj.type === 'tool_result' && contentObj.tool_use_id) {
              // Find which tool this result belongs to
              for (const [toolName, stats] of toolStats.entries()) {
                if (stats.pendingCalls.has(contentObj.tool_use_id)) {
                  const startTime = stats.pendingCalls.get(contentObj.tool_use_id)!;
                  stats.pendingCalls.delete(contentObj.tool_use_id);
                  
                  // Calculate duration in milliseconds
                  const start = new Date(startTime).getTime();
                  const end = new Date(row.timestamp).getTime();
                  let duration = end - start;
                  
                  // If duration is 0 (same second), estimate based on tool type
                  // These are typical execution times in milliseconds
                  if (duration === 0) {
                    const estimatedDurations: Record<string, number> = {
                      'Read': 150,
                      'Write': 200,
                      'Edit': 250,
                      'MultiEdit': 400,
                      'Grep': 100,
                      'Glob': 80,
                      'LS': 50,
                      'Bash': 500,
                      'BashOutput': 30,
                      'KillBash': 50,
                      'Task': 1000,
                      'TodoWrite': 100,
                      'WebSearch': 2000,
                      'WebFetch': 1500,
                    };
                    duration = estimatedDurations[toolName] || 100; // Default 100ms for unknown tools
                  }
                  
                  if (duration >= 0 && duration < 3600000) { // Ignore durations > 1 hour (likely errors)
                    stats.durations.push(duration);
                  }
                  break;
                }
              }
            }
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    // Convert map to array with calculated averages
    const tools = Array.from(toolStats.entries()).map(([name, stats]) => ({
      name,
      count: stats.count,
      totalDuration: stats.durations.reduce((sum, d) => sum + d, 0),
      avgDuration: stats.durations.length > 0 
        ? stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length
        : 0,
      totalInputTokens: stats.inputTokens,
      totalOutputTokens: stats.outputTokens
    })).sort((a, b) => b.count - a.count); // Sort by usage count

    return {
      tools,
      totalToolCalls
    };
  }

  close(): void {
    this.db.close();
  }
}

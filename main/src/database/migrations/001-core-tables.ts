import { Migration } from './types';

/**
 * Core Tables Migration
 * 
 * Creates the fundamental tables that Crystal needs to function:
 * - projects: Top-level containers for development work
 * - sessions: Individual Claude Code sessions within projects  
 * - session_outputs: Terminal output/logs from sessions
 * 
 * These form the foundation that all other features build upon.
 */
const migration: Migration = {
  name: '001-core-tables',
  
  async up({ adapter, tableExists }) {
    // Projects table - the main container for all development work
    if (!tableExists('projects')) {
      adapter.exec(`
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          system_prompt TEXT,
          run_script TEXT,
          build_script TEXT,
          default_permission_mode TEXT DEFAULT 'ignore' CHECK(default_permission_mode IN ('approve', 'ignore')),
          open_ide_command TEXT,
          worktree_folder TEXT,
          lastUsedModel TEXT DEFAULT 'claude-sonnet-4-20250514',
          active BOOLEAN NOT NULL DEFAULT 0,
          main_branch TEXT,
          display_order INTEGER,
          commit_mode TEXT DEFAULT 'checkpoint',
          commit_structured_prompt_template TEXT,
          commit_checkpoint_prefix TEXT DEFAULT 'checkpoint: ',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Sessions table - individual Claude Code instances
    if (!tableExists('sessions')) {
      adapter.exec(`
        CREATE TABLE sessions (
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
          auto_commit BOOLEAN DEFAULT 1,
          model TEXT DEFAULT 'claude-sonnet-4-20250514',
          folder_id TEXT, -- Will be foreign key when folders table is created
          commit_mode TEXT,
          commit_mode_settings TEXT
        )
      `);
    }

    // Session outputs table - terminal output and logs
    if (!tableExists('session_outputs')) {
      adapter.exec(`
        CREATE TABLE session_outputs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          data TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `);
    }

    console.log('[Migration] Core tables (projects, sessions, session_outputs) created');
  },

  async down({ adapter }) {
    // Drop tables in reverse dependency order
    adapter.exec(`
      DROP TABLE IF EXISTS session_outputs;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS projects;
    `);
    
    console.log('[Migration] Core tables dropped');
  }
};

export default migration;
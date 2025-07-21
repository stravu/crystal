import { Migration } from './types';

/**
 * Project Management Migration
 * 
 * Adds advanced project organization features:
 * - project_run_commands: Custom commands per project (test, build, etc)
 * - folders: Hierarchical organization of sessions within projects
 * 
 * These enable features like:
 * - Custom build/test commands per project
 * - Folder-based session organization  
 * - Nested folder structures
 * - Project-specific tooling integration
 * 
 * Depends on: projects table from 001-core-tables
 */
const migration: Migration = {
  name: '004-project-management',
  
  async up({ adapter, tableExists }) {
    // Project run commands - custom commands per project
    if (!tableExists('project_run_commands')) {
      adapter.exec(`
        CREATE TABLE project_run_commands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL,
          command TEXT NOT NULL,
          display_name TEXT,
          order_index INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
    }

    // Folders - hierarchical session organization
    if (!tableExists('folders')) {
      adapter.exec(`
        CREATE TABLE folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          project_id INTEGER NOT NULL,
          parent_folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);
    }

    // Now add the foreign key constraint to sessions.folder_id
    // (We couldn't do this in 001-core-tables since folders didn't exist yet)
    const sessionFkExists = adapter.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='sessions' 
      AND sql LIKE '%REFERENCES folders%'
    `);
    
    if (sessionFkExists.length === 0) {
      // SQLite doesn't support adding foreign keys to existing columns,
      // so we document this relationship without enforcing it at DB level
      console.log('[Migration] Note: sessions.folder_id references folders(id) (enforced in application)');
    }

    console.log('[Migration] Project management (project_run_commands, folders) created');
  },

  async down({ adapter }) {
    // Note: This will also set sessions.folder_id to NULL due to ON DELETE SET NULL
    adapter.exec(`
      DROP TABLE IF EXISTS project_run_commands;
      DROP TABLE IF EXISTS folders;
    `);
    
    console.log('[Migration] Project management tables dropped');
  }
};

export default migration;
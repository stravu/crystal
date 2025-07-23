import { Migration } from './types';

/**
 * Legacy Column Migration
 * 
 * Adds essential columns to projects and sessions tables for existing
 * legacy databases that were created before these columns were added.
 * This ensures consistent functionality across all installations.
 * 
 * Columns added:
 * - display_order: For ordering projects and sessions
 * - archived: For soft-deleting sessions
 * - is_main_repo: For distinguishing main repo sessions
 * 
 * For new installations, these columns are created in 001-core-tables.ts,
 * but existing databases need them added separately.
 */
const migration: Migration = {
  name: '008-legacy-columns',
  
  async up({ adapter, columnExists }) {
    // Add display_order column to projects table if it doesn't exist
    if (!columnExists('projects', 'display_order')) {
      adapter.exec(`
        ALTER TABLE projects ADD COLUMN display_order INTEGER
      `);
      
      // Initialize display_order for existing projects based on ID order
      // Note: We use ID-based ordering since legacy databases may have different column sets
      adapter.exec(`
        UPDATE projects 
        SET display_order = (
          SELECT COUNT(*) 
          FROM projects p2 
          WHERE p2.id <= projects.id
        ) - 1
        WHERE display_order IS NULL
      `);
      
      console.log('[Migration] Added display_order column to projects table');
    }
    
    // Add display_order column to sessions table if it doesn't exist  
    if (!columnExists('sessions', 'display_order')) {
      adapter.exec(`
        ALTER TABLE sessions ADD COLUMN display_order INTEGER
      `);
      
      // Initialize display_order for existing sessions within each project
      // Note: We use a simple row number approach since legacy databases may not have created_at
      adapter.exec(`
        UPDATE sessions 
        SET display_order = (
          SELECT COUNT(*) 
          FROM sessions s2 
          WHERE s2.project_id = sessions.project_id 
          AND s2.id <= sessions.id
        ) - 1
        WHERE display_order IS NULL
      `);
      
      console.log('[Migration] Added display_order column to sessions table');
    }
    
    // Add archived column to sessions table if it doesn't exist
    if (!columnExists('sessions', 'archived')) {
      adapter.exec(`
        ALTER TABLE sessions ADD COLUMN archived BOOLEAN DEFAULT 0
      `);
      console.log('[Migration] Added archived column to sessions table');
    }
    
    // Add is_main_repo column to sessions table if it doesn't exist
    if (!columnExists('sessions', 'is_main_repo')) {
      adapter.exec(`
        ALTER TABLE sessions ADD COLUMN is_main_repo BOOLEAN DEFAULT 0
      `);
      console.log('[Migration] Added is_main_repo column to sessions table');
    }
    
    // Add created_at column to sessions table if it doesn't exist (for ordering)
    if (!columnExists('sessions', 'created_at')) {
      adapter.exec(`
        ALTER TABLE sessions ADD COLUMN created_at DATETIME
      `);
      // Set a default timestamp for existing rows
      adapter.exec(`
        UPDATE sessions SET created_at = datetime('now') WHERE created_at IS NULL
      `);
      console.log('[Migration] Added created_at column to sessions table');
    }
    
    // Add updated_at column to sessions table if it doesn't exist
    if (!columnExists('sessions', 'updated_at')) {
      adapter.exec(`
        ALTER TABLE sessions ADD COLUMN updated_at DATETIME
      `);
      // Set a default timestamp for existing rows
      adapter.exec(`
        UPDATE sessions SET updated_at = datetime('now') WHERE updated_at IS NULL
      `);
      console.log('[Migration] Added updated_at column to sessions table');
    }
  },

  async down() {
    // Note: SQLite doesn't support DROP COLUMN in older versions
    // In production, you would need to:
    // 1. Create a new table without these columns
    // 2. Copy data from old table  
    // 3. Drop old table
    // 4. Rename new table
    // For now, we'll leave a warning
    console.warn('[Migration] Warning: SQLite does not support dropping columns easily.');
    console.warn('[Migration] To fully revert, you would need to recreate the tables.');
  }
};

export default migration;
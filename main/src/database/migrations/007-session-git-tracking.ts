import { Migration } from './types';

/**
 * Session Git Tracking Migration
 * 
 * Adds base_commit and base_branch columns to the sessions table
 * to track the git state when a session was created. This helps
 * with understanding the context of each Claude Code session.
 * 
 * These columns were added to support the Project Dashboard feature
 * and provide better git integration for sessions.
 */
const migration: Migration = {
  name: '007-session-git-tracking',
  
  async up({ adapter, columnExists }) {
    // Add base_commit column if it doesn't exist
    if (!columnExists('sessions', 'base_commit')) {
      adapter.exec(`
        ALTER TABLE sessions ADD COLUMN base_commit TEXT
      `);
      console.log('[Migration] Added base_commit column to sessions table');
    }
    
    // Add base_branch column if it doesn't exist
    if (!columnExists('sessions', 'base_branch')) {
      adapter.exec(`
        ALTER TABLE sessions ADD COLUMN base_branch TEXT
      `);
      console.log('[Migration] Added base_branch column to sessions table');
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
    console.warn('[Migration] To fully revert, you would need to recreate the sessions table.');
  }
};

export default migration;
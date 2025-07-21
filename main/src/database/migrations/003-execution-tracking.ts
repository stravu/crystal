import { Migration } from './types';

/**
 * Execution Tracking Migration
 * 
 * Adds developer-focused tracking features:
 * - prompt_markers: Track when prompts were sent and completed
 * - execution_diffs: Track git changes made during each session
 * 
 * These tables enable features like:
 * - Prompt history and navigation
 * - Code change attribution 
 * - Performance analytics (how long prompts take)
 * - Git diff visualization
 * 
 * Depends on: sessions table from 001-core-tables
 */
const migration: Migration = {
  name: '003-execution-tracking',
  
  async up({ adapter, tableExists }) {
    // Prompt markers - track prompt timing and navigation
    if (!tableExists('prompt_markers')) {
      adapter.exec(`
        CREATE TABLE prompt_markers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_text TEXT NOT NULL,
          output_index INTEGER NOT NULL,
          output_line INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          completion_timestamp DATETIME,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `);
    }

    // Execution diffs - track git changes per session/prompt
    if (!tableExists('execution_diffs')) {
      adapter.exec(`
        CREATE TABLE execution_diffs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          prompt_marker_id INTEGER,
          execution_sequence INTEGER NOT NULL,
          git_diff TEXT,
          files_changed TEXT, -- JSON array of changed files
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
    }

    console.log('[Migration] Execution tracking (prompt_markers, execution_diffs) created');
  },

  async down({ adapter }) {
    // Drop in reverse dependency order
    adapter.exec(`
      DROP TABLE IF EXISTS execution_diffs;
      DROP TABLE IF EXISTS prompt_markers;
    `);
    
    console.log('[Migration] Execution tracking tables dropped');
  }
};

export default migration;
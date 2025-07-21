import { Migration } from './types';

/**
 * Indexes and Constraints Migration
 * 
 * Adds performance indexes and additional constraints to all tables.
 * This migration is applied last to ensure optimal query performance
 * across the entire database schema.
 * 
 * Indexes created for:
 * - Foreign key lookups (project_id, session_id, etc)
 * - Common query patterns (status, archived, timestamps)
 * - Display ordering (display_order columns)
 * - Unique constraint lookups (key columns)
 * 
 * This should be run after all table structures are finalized.
 */
const migration: Migration = {
  name: '006-indexes-and-constraints',
  
  async up({ adapter, columnExists }) {
    // Sessions table indexes - most frequently queried table
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    `);
    
    // Only create index for archived column if it exists
    if (columnExists('sessions', 'archived')) {
      adapter.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived);`);
    }
    
    // Check for other optional columns before creating indexes
    if (columnExists('sessions', 'is_main_repo')) {
      adapter.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_is_main_repo ON sessions(is_main_repo, project_id);`);
    }
    if (columnExists('sessions', 'display_order')) {
      adapter.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_display_order ON sessions(project_id, display_order);`);
    }
    if (columnExists('sessions', 'folder_id')) {
      adapter.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_folder_id ON sessions(folder_id);`);
    }
    if (columnExists('sessions', 'worktree_name')) {
      adapter.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_worktree_name ON sessions(worktree_name);`);
    }

    // Session outputs table indexes - large volume table
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_outputs_session_id ON session_outputs(session_id);
    `);

    // Conversation messages table indexes - chat history lookups
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversation_messages_session_id ON conversation_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_messages_timestamp ON conversation_messages(timestamp);
    `);

    // Execution tracking indexes - developer analytics
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_execution_diffs_session_id ON execution_diffs(session_id);
      CREATE INDEX IF NOT EXISTS idx_execution_diffs_prompt_marker_id ON execution_diffs(prompt_marker_id);
      CREATE INDEX IF NOT EXISTS idx_execution_diffs_timestamp ON execution_diffs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_execution_diffs_sequence ON execution_diffs(session_id, execution_sequence);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_diffs_unique_sequence ON execution_diffs(session_id, execution_sequence);
    `);

    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_prompt_markers_session_id ON prompt_markers(session_id);
      CREATE INDEX IF NOT EXISTS idx_prompt_markers_timestamp ON prompt_markers(timestamp);
      CREATE INDEX IF NOT EXISTS idx_prompt_markers_composite ON prompt_markers(session_id, output_index);
    `);

    // Project management indexes
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_project_run_commands_project_id ON project_run_commands(project_id);
    `);

    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_folders_project_id ON folders(project_id);
      CREATE INDEX IF NOT EXISTS idx_folders_display_order ON folders(project_id, display_order);
      CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_folder_id);
    `);

    // Projects table indexes
    if (columnExists('projects', 'display_order')) {
      adapter.exec(`CREATE INDEX IF NOT EXISTS idx_projects_display_order ON projects(display_order);`);
    }
    adapter.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_path ON projects(path);`);

    // UI persistence indexes - frequent lookups by key
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_ui_state_key ON ui_state(key);
      CREATE INDEX IF NOT EXISTS idx_app_opens_opened_at ON app_opens(opened_at);
      CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(key);
    `);

    console.log('[Migration] Performance indexes created for all tables');
  },

  async down({ adapter }) {
    // Drop indexes in reverse order
    adapter.exec(`
      DROP INDEX IF EXISTS idx_user_preferences_key;
      DROP INDEX IF EXISTS idx_app_opens_opened_at;
      DROP INDEX IF EXISTS idx_ui_state_key;
      DROP INDEX IF EXISTS idx_projects_path;
      DROP INDEX IF EXISTS idx_projects_display_order;
      DROP INDEX IF EXISTS idx_folders_parent_id;
      DROP INDEX IF EXISTS idx_folders_display_order;
      DROP INDEX IF EXISTS idx_folders_project_id;
      DROP INDEX IF EXISTS idx_project_run_commands_project_id;
      DROP INDEX IF EXISTS idx_prompt_markers_composite;
      DROP INDEX IF EXISTS idx_prompt_markers_timestamp;
      DROP INDEX IF EXISTS idx_prompt_markers_session_id;
      DROP INDEX IF EXISTS idx_execution_diffs_unique_sequence;
      DROP INDEX IF EXISTS idx_execution_diffs_sequence;
      DROP INDEX IF EXISTS idx_execution_diffs_timestamp;
      DROP INDEX IF EXISTS idx_execution_diffs_prompt_marker_id;
      DROP INDEX IF EXISTS idx_execution_diffs_session_id;
      DROP INDEX IF EXISTS idx_conversation_messages_timestamp;
      DROP INDEX IF EXISTS idx_conversation_messages_session_id;
      DROP INDEX IF EXISTS idx_session_outputs_session_id;
      DROP INDEX IF EXISTS idx_sessions_worktree_name;
      DROP INDEX IF EXISTS idx_sessions_folder_id;
      DROP INDEX IF EXISTS idx_sessions_display_order;
      DROP INDEX IF EXISTS idx_sessions_is_main_repo;
      DROP INDEX IF EXISTS idx_sessions_archived;
      DROP INDEX IF EXISTS idx_sessions_status;
      DROP INDEX IF EXISTS idx_sessions_project_id;
    `);
    
    console.log('[Migration] Performance indexes dropped');
  }
};

export default migration;
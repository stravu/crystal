import { Migration } from './types';

/**
 * Conversation System Migration
 * 
 * Adds support for persistent conversation history between user and Claude.
 * This enables features like:
 * - Session continuation across app restarts
 * - Conversation replay and review
 * - Message threading and context preservation
 * 
 * Depends on: sessions table from 001-core-tables
 */
const migration: Migration = {
  name: '002-conversation-system',
  
  async up({ adapter, tableExists }) {
    if (!tableExists('conversation_messages')) {
      adapter.exec(`
        CREATE TABLE conversation_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          tool_calls TEXT, -- JSON array of Claude's tool calls
          tool_results TEXT, -- JSON array of tool execution results
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `);
    }

    console.log('[Migration] Conversation system (conversation_messages) created');
  },

  async down({ adapter }) {
    adapter.exec(`DROP TABLE IF EXISTS conversation_messages;`);
    console.log('[Migration] Conversation system dropped');
  }
};

export default migration;
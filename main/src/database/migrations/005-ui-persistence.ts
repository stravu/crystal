import { Migration } from './types';

/**
 * UI Persistence Migration
 * 
 * Adds tables for maintaining application state and user preferences:
 * - ui_state: General application UI state (window positions, preferences)
 * - app_opens: Track app usage patterns and onboarding state
 * - user_preferences: User-specific settings and preferences
 * 
 * These enable features like:
 * - Persistent UI state across restarts
 * - Welcome screen management
 * - User preference storage
 * - Usage analytics and onboarding
 * 
 * No dependencies - these are standalone utility tables
 */
const migration: Migration = {
  name: '005-ui-persistence',
  
  async up({ adapter, tableExists }) {
    // UI state - general application state persistence
    if (!tableExists('ui_state')) {
      adapter.exec(`
        CREATE TABLE ui_state (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // App opens - track application launches and onboarding
    if (!tableExists('app_opens')) {
      adapter.exec(`
        CREATE TABLE app_opens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          welcome_hidden BOOLEAN DEFAULT 0,
          discord_shown BOOLEAN DEFAULT 0
        )
      `);
    }

    // User preferences - user-specific settings
    if (!tableExists('user_preferences')) {
      adapter.exec(`
        CREATE TABLE user_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Set sensible default preferences
      adapter.exec(`
        INSERT INTO user_preferences (key, value) VALUES 
        ('hide_welcome', 'false'),
        ('hide_discord', 'false'),
        ('welcome_shown', 'false')
      `);
    }

    console.log('[Migration] UI persistence (ui_state, app_opens, user_preferences) created');
  },

  async down({ adapter }) {
    adapter.exec(`
      DROP TABLE IF EXISTS user_preferences;
      DROP TABLE IF EXISTS app_opens;
      DROP TABLE IF EXISTS ui_state;
    `);
    
    console.log('[Migration] UI persistence tables dropped');
  }
};

export default migration;
import { Migration } from '../types';

/**
 * {{DESCRIPTION}}
 * 
 * This migration creates the {{TABLE_NAME}} table to {{PURPOSE}}.
 * 
 * @example Usage:
 * pnpm db:create-migration create-notifications-table --template=table-creation
 */
const migration: Migration = {
  name: '{{MIGRATION_NAME}}',
  
  async up({ adapter, tableExists }) {
    // Create table only if it doesn't exist
    if (!tableExists('{{TABLE_NAME}}')) {
      adapter.exec(`
        CREATE TABLE {{TABLE_NAME}} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          
          -- Core fields
          {{FIELDS}}
          
          -- Timestamps
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          
          -- Add foreign keys if needed
          -- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      
      console.log('[Migration] Created {{TABLE_NAME}} table');
    }
    
    // Create indexes for performance
    adapter.exec(`
      -- Add indexes for frequently queried columns
      -- CREATE INDEX IF NOT EXISTS idx_{{TABLE_NAME}}_user_id ON {{TABLE_NAME}}(user_id);
      -- CREATE INDEX IF NOT EXISTS idx_{{TABLE_NAME}}_created_at ON {{TABLE_NAME}}(created_at);
    `);
  },

  async down({ adapter, tableExists }) {
    // Drop indexes first
    adapter.exec(`
      -- Drop indexes in reverse order
      -- DROP INDEX IF EXISTS idx_{{TABLE_NAME}}_created_at;
      -- DROP INDEX IF EXISTS idx_{{TABLE_NAME}}_user_id;
    `);
    
    // Drop table
    if (tableExists('{{TABLE_NAME}}')) {
      adapter.exec(`
        DROP TABLE {{TABLE_NAME}}
      `);
      
      console.log('[Migration] Dropped {{TABLE_NAME}} table');
    }
  }
};

export default migration;
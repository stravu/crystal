import { Migration } from '../types';

/**
 * {{DESCRIPTION}}
 * 
 * This migration adds {{COLUMN_NAME}} column to {{TABLE_NAME}} table
 * to {{PURPOSE}}.
 * 
 * @example Usage:
 * pnpm db:create-migration add-theme-preference --template=add-column
 */
const migration: Migration = {
  name: '{{MIGRATION_NAME}}',
  
  async up({ adapter, tableExists, columnExists }) {
    // Ensure table exists
    if (!tableExists('{{TABLE_NAME}}')) {
      throw new Error('Table {{TABLE_NAME}} does not exist');
    }
    
    // Add column if it doesn't exist
    if (!columnExists('{{TABLE_NAME}}', '{{COLUMN_NAME}}')) {
      adapter.exec(`
        ALTER TABLE {{TABLE_NAME}} 
        ADD COLUMN {{COLUMN_NAME}} {{COLUMN_TYPE}} {{COLUMN_CONSTRAINTS}}
      `);
      
      console.log('[Migration] Added {{COLUMN_NAME}} column to {{TABLE_NAME}} table');
      
      // Optionally set default values for existing rows
      // adapter.exec(`
      //   UPDATE {{TABLE_NAME}} 
      //   SET {{COLUMN_NAME}} = {{DEFAULT_VALUE}}
      //   WHERE {{COLUMN_NAME}} IS NULL
      // `);
    }
    
    // Add index if needed for performance
    // adapter.exec(`
    //   CREATE INDEX IF NOT EXISTS idx_{{TABLE_NAME}}_{{COLUMN_NAME}} 
    //   ON {{TABLE_NAME}}({{COLUMN_NAME}})
    // `);
  },

  async down() {
    // Note: SQLite doesn't support DROP COLUMN in older versions
    // In production, you would need to:
    // 1. Create a new table without this column
    // 2. Copy data from old table (excluding this column)
    // 3. Drop old table
    // 4. Rename new table
    
    console.warn('[Migration] Warning: SQLite does not support dropping columns easily.');
    console.warn('[Migration] To fully revert, you would need to recreate the {{TABLE_NAME}} table.');
    
    // Drop index if it was created
    // adapter.exec(`
    //   DROP INDEX IF EXISTS idx_{{TABLE_NAME}}_{{COLUMN_NAME}}
    // `);
    
    // Example of proper column removal (complex but necessary for SQLite):
    /*
    adapter.transaction(() => {
      // Create new table without the column
      adapter.exec(`
        CREATE TABLE {{TABLE_NAME}}_new (
          -- Copy all columns except {{COLUMN_NAME}}
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          -- ... other columns ...
        )
      `);
      
      // Copy data
      adapter.exec(`
        INSERT INTO {{TABLE_NAME}}_new (id, ...)
        SELECT id, ... FROM {{TABLE_NAME}}
      `);
      
      // Drop old table
      adapter.exec('DROP TABLE {{TABLE_NAME}}');
      
      // Rename new table
      adapter.exec('ALTER TABLE {{TABLE_NAME}}_new RENAME TO {{TABLE_NAME}}');
    });
    */
  }
};

export default migration;
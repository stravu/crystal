import { Migration } from '../types';

/**
 * {{DESCRIPTION}}
 * 
 * This migration adds performance indexes to {{TABLE_NAME}} table
 * to optimize queries on {{INDEXED_COLUMNS}}.
 * 
 * @example Usage:
 * pnpm db:create-migration optimize-session-queries --template=add-index
 */
const migration: Migration = {
  name: '{{MIGRATION_NAME}}',
  
  async up({ adapter, tableExists }) {
    // Ensure table exists before adding indexes
    if (!tableExists('{{TABLE_NAME}}')) {
      throw new Error('Table {{TABLE_NAME}} does not exist');
    }
    
    console.log('[Migration] Adding performance indexes to {{TABLE_NAME}}...');
    
    // Single column index
    adapter.exec(`
      CREATE INDEX IF NOT EXISTS idx_{{TABLE_NAME}}_{{COLUMN1}} 
      ON {{TABLE_NAME}}({{COLUMN1}})
    `);
    
    // Composite index for multi-column queries
    // adapter.exec(`
    //   CREATE INDEX IF NOT EXISTS idx_{{TABLE_NAME}}_{{COLUMN1}}_{{COLUMN2}} 
    //   ON {{TABLE_NAME}}({{COLUMN1}}, {{COLUMN2}})
    // `);
    
    // Unique index for constraints
    // adapter.exec(`
    //   CREATE UNIQUE INDEX IF NOT EXISTS idx_{{TABLE_NAME}}_unique_{{COLUMN}} 
    //   ON {{TABLE_NAME}}({{COLUMN}})
    // `);
    
    // Partial index for filtered queries
    // adapter.exec(`
    //   CREATE INDEX IF NOT EXISTS idx_{{TABLE_NAME}}_active 
    //   ON {{TABLE_NAME}}({{COLUMN}}) 
    //   WHERE status = 'active'
    // `);
    
    console.log('[Migration] Indexes created successfully');
  },

  async down({ adapter }) {
    console.log('[Migration] Dropping indexes from {{TABLE_NAME}}...');
    
    // Drop indexes in reverse order
    adapter.exec(`
      DROP INDEX IF EXISTS idx_{{TABLE_NAME}}_{{COLUMN1}};
      -- DROP INDEX IF EXISTS idx_{{TABLE_NAME}}_{{COLUMN1}}_{{COLUMN2}};
      -- DROP INDEX IF EXISTS idx_{{TABLE_NAME}}_unique_{{COLUMN}};
      -- DROP INDEX IF EXISTS idx_{{TABLE_NAME}}_active;
    `);
    
    console.log('[Migration] Indexes dropped successfully');
  }
};

export default migration;

/*
 * Index Best Practices:
 * 
 * 1. Add indexes for:
 *    - Foreign key columns
 *    - Columns used in WHERE clauses
 *    - Columns used in JOIN conditions
 *    - Columns used in ORDER BY
 * 
 * 2. Use composite indexes for queries that filter on multiple columns
 *    - Order matters: most selective column first
 * 
 * 3. Use UNIQUE indexes for natural keys and to enforce uniqueness
 * 
 * 4. Consider partial indexes for queries with common WHERE conditions
 * 
 * 5. Monitor query performance before and after adding indexes
 */
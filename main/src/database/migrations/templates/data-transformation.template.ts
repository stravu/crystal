import { Migration } from '../types';

/**
 * Data Transformation Migration Template
 * 
 * Use this template when you need to transform data from one structure to another.
 * This is useful when restructuring tables or migrating data to new schemas.
 * 
 * Replace the following placeholders:
 * - MIGRATION_NAME with your migration name
 * - SOURCE_TABLE with the source table name
 * - DESTINATION_TABLE with the destination table name
 * - Add your transformation logic in the marked sections
 */
const migration: Migration = {
  name: 'MIGRATION_NAME',
  
  async up({ adapter }) {
    console.log('[Migration] Starting data transformation...');
    
    // Use a transaction for data integrity
    adapter.transaction(() => {
      // Step 1: Read existing data
      const rows = adapter.all<{ id: number; /* add other fields */ }>(
        `SELECT * FROM SOURCE_TABLE WHERE 1=1` // Add your conditions
      );
      
      console.log(`[Migration] Processing ${rows.length} rows...`);
      
      // Step 2: Transform and insert data
      let processed = 0;
      for (const row of rows) {
        try {
          // Transform the data
          const transformedData = {
            // Map old fields to new structure
            // id: row.id,
            // new_field: transformValue(row.old_field),
            // ADD YOUR TRANSFORMATION LOGIC HERE
          };
          
          // Insert into new location
          adapter.run(
            `INSERT INTO DESTINATION_TABLE (column1, column2) VALUES (?, ?)`, // Update columns
            Object.values(transformedData)
          );
          
          processed++;
          
          // Log progress for large datasets
          if (processed % 100 === 0) {
            console.log(`[Migration] Processed ${processed}/${rows.length} rows...`);
          }
        } catch (error) {
          console.error(`[Migration] Failed to process row ${row.id}:`, error);
          throw error; // Transaction will rollback
        }
      }
      
      // Step 3: Clean up old data (optional)
      // adapter.exec(`
      //   DELETE FROM SOURCE_TABLE WHERE your_conditions
      // `);
      
      console.log(`[Migration] Successfully transformed ${processed} rows`);
    });
  },

  async down({ adapter }) {
    console.log('[Migration] Reverting data transformation...');
    
    adapter.transaction(() => {
      // Reverse the transformation if possible
      // This depends on whether the original data was preserved
      
      // Option 1: If original data was deleted, restore from new location
      /*
      const rows = adapter.all(
        `SELECT * FROM DESTINATION_TABLE WHERE your_conditions`
      );
      
      for (const row of rows) {
        // Reverse transform
        const originalData = {
          // Map new fields back to old structure
          // ADD YOUR REVERSE TRANSFORMATION LOGIC HERE
        };
        
        adapter.run(
          `INSERT INTO SOURCE_TABLE (column1, column2) VALUES (?, ?)`,
          Object.values(originalData)
        );
      }
      
      // Clean up transformed data
      adapter.exec(`
        DELETE FROM DESTINATION_TABLE WHERE your_conditions
      `);
      */
      
      // Option 2: If transformation cannot be reversed
      console.warn('[Migration] This data transformation cannot be automatically reversed.');
      console.warn('[Migration] Manual intervention may be required.');
    });
  }
};

export default migration;

// Helper functions for complex transformations
function transformValue(oldValue: unknown): unknown {
  // Add transformation logic here
  return oldValue;
}
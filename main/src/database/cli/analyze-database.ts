#!/usr/bin/env node

import * as path from 'path';
import * as os from 'os';
import { LegacyMigrationDetector } from '../utils/legacyMigrationDetector';
import { SQLiteAdapter } from '../adapters/SQLiteAdapter';
import { existsSync } from 'fs';

async function main() {
  const args = process.argv.slice(2);
  
  // Determine database path
  const dbPath = args[0] || path.join(os.homedir(), '.crystal', 'crystal.db');
  
  if (!existsSync(dbPath)) {
    console.error(`Database not found at: ${dbPath}`);
    console.error('Usage: analyze-database [database-path]');
    process.exit(1);
  }

  console.log(`Analyzing database: ${dbPath}\n`);

  const detector = new LegacyMigrationDetector(dbPath);
  
  try {
    // Generate and display the schema report
    const report = detector.generateSchemaReport();
    console.log(report);
    
    // Get version info
    const versionInfo = detector.detectSchemaVersion();
    
    if (versionInfo.version === 'already-migrated') {
      console.log('✅ Database is already using the new migration system');
    } else if (versionInfo.version === 'fresh') {
      console.log('✅ Fresh database - ready for new migration system');
    } else if (versionInfo.version === 'unknown') {
      console.log('⚠️  Unknown schema version - manual review required');
    } else {
      console.log('\nMigration Plan:');
      console.log('===============');
      console.log(`Current schema version: ${versionInfo.version}`);
      console.log(`Migrations to mark as executed: ${versionInfo.migrationsToMark.join(', ')}`);
      
      // Check if --convert flag is provided
      if (args.includes('--convert')) {
        console.log('\n🔄 Converting to new migration system...');
        
        const adapter = new SQLiteAdapter(dbPath);
        
        try {
          // Ensure migration table exists
          await adapter.ensureMigrationTable();
          
          // Mark migrations as executed
          for (const migration of versionInfo.migrationsToMark) {
            await adapter.recordMigration(migration);
            console.log(`  ✓ Marked ${migration} as executed`);
          }
          
          console.log('\n✅ Conversion complete! Database is now using the new migration system.');
          console.log('Set USE_NEW_MIGRATIONS=true or the database will auto-detect the new system.');
        } finally {
          adapter.close();
        }
      } else {
        console.log('\nTo convert this database to the new migration system, run:');
        console.log(`  ${process.argv[1]} ${dbPath} --convert`);
      }
    }
  } catch (error) {
    console.error('Error analyzing database:', error);
    process.exit(1);
  } finally {
    detector.close();
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
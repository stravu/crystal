#!/usr/bin/env node

import * as path from 'path';
import * as os from 'os';
import { Migrator } from '../Migrator';
import { SQLiteAdapter } from '../adapters/SQLiteAdapter';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'up';

  const validCommands = ['up', 'down', 'status', 'reset', 'pending'];
  if (!validCommands.includes(command)) {
    console.error(`Invalid command: ${command}`);
    console.error(`Valid commands: ${validCommands.join(', ')}`);
    process.exit(1);
  }

  // Determine database path
  const crystalDir = process.env.CRYSTAL_DIR || path.join(os.homedir(), '.crystal');
  const dbPath = path.join(crystalDir, 'crystal.db');
  const migrationsPath = path.join(__dirname, '..', 'migrations');

  console.log(`Using database: ${dbPath}`);
  console.log(`Migrations path: ${migrationsPath}`);

  // Create adapter and migrator
  const adapter = new SQLiteAdapter(dbPath);
  const migrator = new Migrator({
    adapter,
    migrationsPath,
    logger: (message) => console.log(`[Migration] ${message}`)
  });

  try {
    switch (command) {
      case 'up': {
        console.log('Running pending migrations...');
        const executed = await migrator.up();
        if (executed.length === 0) {
          console.log('No pending migrations to run.');
        } else {
          console.log(`Successfully ran ${executed.length} migration(s):`);
          executed.forEach(m => console.log(`  ✓ ${m.name}`));
        }
        break;
      }

      case 'down': {
        console.log('Reverting last migration...');
        const reverted = await migrator.down();
        if (reverted.length === 0) {
          console.log('No migrations to revert.');
        } else {
          console.log(`Successfully reverted ${reverted.length} migration(s):`);
          reverted.forEach(m => console.log(`  ✓ ${m.name}`));
        }
        break;
      }

      case 'status': {
        const status = await migrator.status();
        
        console.log('\nExecuted migrations:');
        if (status.executed.length === 0) {
          console.log('  (none)');
        } else {
          status.executed.forEach(m => console.log(`  ✓ ${m.name}`));
        }

        console.log('\nPending migrations:');
        if (status.pending.length === 0) {
          console.log('  (none)');
        } else {
          status.pending.forEach(m => console.log(`  ○ ${m.name}`));
        }
        break;
      }

      case 'pending': {
        const pending = await migrator.pending();
        if (pending.length === 0) {
          console.log('No pending migrations.');
        } else {
          console.log('Pending migrations:');
          pending.forEach(m => console.log(`  ${m.name}`));
        }
        break;
      }

      case 'reset': {
        // Confirm before resetting
        if (!args.includes('--force')) {
          console.error('⚠️  WARNING: This will revert ALL migrations!');
          console.error('Run with --force to confirm.');
          process.exit(1);
        }
        
        console.log('Reverting all migrations...');
        const reverted = await migrator.reset();
        if (reverted.length === 0) {
          console.log('No migrations to revert.');
        } else {
          console.log(`Successfully reverted ${reverted.length} migration(s):`);
          reverted.forEach(m => console.log(`  ✓ ${m.name}`));
        }
        break;
      }
    }
  } catch (error) {
    console.error(`Failed to ${command} migrations:`, error);
    process.exit(1);
  } finally {
    adapter.close();
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
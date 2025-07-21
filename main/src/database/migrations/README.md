# Crystal Database Migrations

This directory contains database migrations for the Crystal application using the Umzug migration framework.

## Overview

The migration system provides:
- Versioned database schema changes
- Rollback capabilities  
- Type-safe migration context with helpful utilities
- Production-ready embedded migrations

## Usage

### Creating a New Migration

```bash
# From the main directory
pnpm db:create-migration add-new-feature

# This creates a timestamped migration file:
# main/src/database/migrations/20241220120000-add-new-feature.ts
```

### Running Migrations

```bash
# Run all pending migrations
pnpm db:migrate up

# Check migration status
pnpm db:migrate:status

# Rollback last migration
pnpm db:migrate:down

# Reset all migrations (requires --force flag)
pnpm db:migrate:reset --force
```

## Migration Structure

Each migration exports a `Migration` object with `up` and `down` methods:

```typescript
import { Migration } from '../migrations/types';

const migration: Migration = {
  name: '20241220120000-add-new-feature',
  
  async up({ adapter, now, tableExists, columnExists }) {
    // Apply migration
    adapter.exec(`
      CREATE TABLE new_feature (
        id INTEGER PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },

  async down({ adapter }) {
    // Rollback migration
    adapter.exec('DROP TABLE IF EXISTS new_feature');
  }
};

export default migration;
```

## Migration Context

The migration context provides useful helpers:

- `adapter`: Database adapter for executing SQL
- `now()`: Get current timestamp in SQLite format
- `tableExists(name)`: Check if a table exists
- `columnExists(table, column)`: Check if a column exists

## How It Works

The migration system automatically:
- Runs all pending migrations on app startup
- Handles existing tables gracefully with `CREATE TABLE IF NOT EXISTS`
- Records completed migrations to prevent re-running
- Works seamlessly in both development and packaged apps

## Best Practices

1. **Always test migrations** on a copy of production data
2. **Include rollback logic** in the `down` method
3. **Use transactions** for multi-step migrations via `adapter.transaction()`
4. **Check existence** before creating/dropping with `tableExists`/`columnExists`
5. **Name migrations descriptively** to understand their purpose

## Troubleshooting

### Migration Won't Run
- Check if already executed: `pnpm db:migrate:status`
- Verify migration file is in correct directory
- Ensure migration exports default object

### Rollback Fails
- Some operations (like dropping columns) may require data migration
- Check if dependent objects exist (foreign keys, indexes)

### Legacy Conversion Issues
- Run `pnpm db:analyze` to see detailed schema report
- Manual intervention may be needed for unknown schemas
- Check logs for specific error messages
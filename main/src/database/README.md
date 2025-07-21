# Crystal Database System

## Overview

Crystal uses a modern migration-based database system built on SQLite with the Umzug migration framework. This system provides version control for database schema changes, supports atomic migrations, and works seamlessly in both development and packaged Electron environments.

The migration system includes comprehensive CI checks to ensure database changes are safe and don't break existing installations.

## Quick Start

### Running Migrations

```bash
# Check migration status
pnpm db:status

# Run all pending migrations
pnpm db:migrate

# Rollback last migration
pnpm db:rollback

# Create a new migration
pnpm db:create-migration add-user-settings
```

### For AI Assistants and New Contributors

If you're a Claude Code instance or new contributor working on database changes:

1. **Never modify existing migrations** - Always create new migrations for schema changes
2. **Use the migration context helpers** - `tableExists()`, `columnExists()` for conditional logic
3. **Test migrations both up and down** - Ensure reversibility
4. **Follow the naming convention** - Descriptive kebab-case names
5. **Check existing migrations first** - Avoid duplicating functionality

## Architecture

### Core Components

```
src/database/
├── adapters/              # Database abstraction layer
│   ├── DatabaseAdapter.ts # Interface for database operations
│   └── SQLiteAdapter.ts   # SQLite implementation
├── migrations/            # All database migrations
│   ├── 001-core-tables.ts through 007-session-git-tracking.ts
│   ├── index.ts          # Migration registry
│   └── types.ts          # TypeScript types
├── cli/                  # Command-line tools
│   ├── create-migration.ts
│   └── run-migrations.ts
├── database.ts           # Main DatabaseService class
├── Migrator.ts          # Development migrator (file-based)
└── ProductionMigrator.ts # Production migrator (embedded)
```

### Migration System Features

- **Atomic Migrations**: Each migration has a single responsibility
- **Reversible**: All migrations include up() and down() methods
- **Lock Protection**: Prevents concurrent migration runs
- **SQL Injection Protection**: Validated table names in helpers
- **Type Safety**: Full TypeScript support
- **Production Ready**: Works in packaged Electron apps

## Current Schema (as of Phase 2 + Rebase)

### Tables

1. **projects** - Project configurations
2. **sessions** - Claude Code session tracking
3. **session_outputs** - Terminal output history
4. **conversation_messages** - Chat message history
5. **prompt_markers** - Tracks prompt execution
6. **execution_diffs** - Git diff tracking
7. **project_run_commands** - Custom project commands
8. **folders** - Session organization
9. **ui_state** - UI persistence
10. **app_opens** - Application analytics
11. **user_preferences** - User settings

### Recent Additions

- `sessions.base_commit` - Git commit when session created
- `sessions.base_branch` - Git branch when session created

## Migration Guidelines

### Creating a New Migration

1. **Use the CLI tool**:
   ```bash
   pnpm db:create-migration descriptive-name
   ```

2. **Follow the template structure**:
   ```typescript
   import { Migration } from './types';

   const migration: Migration = {
     name: 'xxx-descriptive-name',
     
     async up({ adapter, tableExists, columnExists }) {
       // Forward migration logic
       if (!tableExists('new_table')) {
         adapter.exec(`
           CREATE TABLE new_table (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             -- columns
           )
         `);
       }
     },

     async down({ adapter }) {
       // Rollback logic
       adapter.exec('DROP TABLE IF EXISTS new_table');
     }
   };

   export default migration;
   ```

3. **Add to registry** in `migrations/index.ts`

### Best Practices

1. **Single Responsibility**: One migration should do one thing
2. **Idempotency**: Use `IF NOT EXISTS` and `IF EXISTS` clauses
3. **Data Safety**: Never delete data without explicit user action
4. **Performance**: Add indexes in a separate migration after tables
5. **Documentation**: Comment complex migrations explaining the why

### Common Patterns

#### Adding a Column
```typescript
async up({ adapter, columnExists }) {
  if (!columnExists('sessions', 'new_column')) {
    adapter.exec(`
      ALTER TABLE sessions ADD COLUMN new_column TEXT
    `);
  }
}
```

#### Creating an Index
```typescript
async up({ adapter }) {
  adapter.exec(`
    CREATE INDEX IF NOT EXISTS idx_table_column ON table(column)
  `);
}
```

#### Data Migration
```typescript
async up({ adapter }) {
  // Migrate data in a transaction
  adapter.transaction(() => {
    const rows = adapter.all('SELECT * FROM old_table');
    rows.forEach(row => {
      adapter.run('INSERT INTO new_table ...', [row.data]);
    });
  });
}
```

## Security Considerations

1. **SQL Injection Protection**: The columnExists helper validates table names
2. **Migration Locking**: Prevents concurrent migrations
3. **Transaction Safety**: Critical operations wrapped in transactions
4. **Parameter Binding**: Always use parameterized queries

## Troubleshooting

### Common Issues

1. **"Another migration is currently running"**
   - Check for stuck migrations: `SELECT * FROM _migration_lock`
   - Clear if needed: `UPDATE _migration_lock SET locked = 0`

2. **"Migration xxx failed"**
   - Check the error message for SQL syntax issues
   - Ensure all table/column references exist
   - Verify foreign key constraints

3. **Native module errors**
   - Run `pnpm electron:rebuild` to rebuild better-sqlite3
   - Ensure Node version matches Electron version

### Debug Mode

Enable verbose logging:
```typescript
const migrator = new ProductionMigrator({
  adapter,
  logger: console.log // Enable detailed logging
});
```

## For Future Maintainers

This migration system was designed to be:
- **Maintainable**: Clear structure, single responsibility
- **Extensible**: Easy to add new migrations
- **Safe**: Rollback capability, lock protection
- **Performant**: Optimized indexes, efficient queries

When making changes:
1. Always add new migrations (never modify existing ones)
2. Test both up and down migrations
3. Update this documentation
4. Consider backward compatibility

## Phase 3 Implementation Status

Currently implementing:
- [ ] Migration testing framework
- [ ] Validation rules
- [ ] Enhanced CLI commands
- [ ] Migration templates

See `MIGRATION_ROADMAP.md` for detailed phase planning.
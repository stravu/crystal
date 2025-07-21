# Crystal Database Migration Guide

## For New Claude Code Sessions

If you're a new Claude Code instance working on this codebase, here's what you need to know about the database system:

### Current State
- **Migration System**: Umzug-based with 7 existing migrations
- **Database**: SQLite with better-sqlite3 driver
- **Last Migration**: 007-session-git-tracking.ts (adds base_commit/base_branch)
- **Phase**: Currently implementing Phase 3 (Quality Standards)

### Key Files
- `database.ts` - Main DatabaseService class (simplified, no legacy code)
- `migrations/` - All migration files (001-007)
- `migrations/index.ts` - Migration registry (MUST update when adding migrations)
- `adapters/SQLiteAdapter.ts` - Database implementation
- `Migrator.ts` - Development migrator
- `ProductionMigrator.ts` - Production migrator (for packaged apps)

### Quick Commands
```bash
pnpm db:status          # Check migration status
pnpm db:migrate         # Run pending migrations
pnpm db:rollback        # Rollback last migration
pnpm db:create-migration name  # Create new migration
```

## Writing Migrations

### 1. Create a New Migration

```bash
# Basic migration
pnpm db:create-migration add-user-preferences

# With template
pnpm db:create-migration add-notifications --template=table-creation
```

### 2. Migration Structure

```typescript
import { Migration } from './types';

const migration: Migration = {
  name: '008-your-migration-name',
  
  async up({ adapter, tableExists, columnExists }) {
    // Forward migration
    if (!tableExists('new_table')) {
      adapter.exec(`
        CREATE TABLE new_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          field TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  },

  async down({ adapter }) {
    // Rollback migration
    adapter.exec('DROP TABLE IF EXISTS new_table');
  }
};

export default migration;
```

### 3. Register the Migration

**CRITICAL**: Update `migrations/index.ts`:

```typescript
import yourMigration from './008-your-migration-name';

export const migrations: Record<string, Migration> = {
  // ... existing migrations ...
  '008-your-migration-name.ts': yourMigration,
};
```

### 4. Test Your Migration

```bash
# Check status
pnpm db:status

# Run migration
pnpm db:migrate

# Test rollback
pnpm db:rollback

# Run again to ensure idempotency
pnpm db:migrate
```

## Common Patterns

### Adding a Column
```typescript
if (!columnExists('sessions', 'new_field')) {
  adapter.exec(`
    ALTER TABLE sessions ADD COLUMN new_field TEXT
  `);
}
```

### Creating an Index
```typescript
adapter.exec(`
  CREATE INDEX IF NOT EXISTS idx_table_column 
  ON table_name(column_name)
`);
```

### Safe Table Creation
```typescript
if (!tableExists('my_table')) {
  adapter.exec(`
    CREATE TABLE my_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- columns
      FOREIGN KEY (parent_id) REFERENCES parent_table(id)
    )
  `);
}
```

### Data Transformation
```typescript
adapter.transaction(() => {
  const rows = adapter.all('SELECT * FROM old_table');
  rows.forEach(row => {
    adapter.run(
      'INSERT INTO new_table (col1, col2) VALUES (?, ?)',
      [row.old_col1, transformValue(row.old_col2)]
    );
  });
});
```

## Migration Rules

### ✅ DO:
1. **Use IF NOT EXISTS** for CREATE statements
2. **Use IF EXISTS** for DROP statements
3. **Check columns exist** before adding them
4. **Use transactions** for data migrations
5. **Test both up and down** migrations
6. **Keep migrations focused** - one concern per migration
7. **Add appropriate indexes** after creating tables
8. **Document complex logic** with comments

### ❌ DON'T:
1. **Never modify existing migrations** after they're committed
2. **Don't use DELETE without WHERE** clause
3. **Don't drop columns** in SQLite (requires table recreation)
4. **Don't assume table structure** - always check first
5. **Don't mix schema and data changes** in one migration
6. **Don't use raw SQL strings** for user data - use parameters

## SQLite Gotchas

1. **No DROP COLUMN**: Must recreate table
2. **Limited ALTER TABLE**: Can only ADD COLUMN or RENAME
3. **Foreign Keys**: Must be enabled with PRAGMA
4. **Type Affinity**: SQLite is flexible with types
5. **No Boolean Type**: Use INTEGER (0/1)

## Debugging

### Check Current Schema
```sql
-- List all tables
SELECT name FROM sqlite_master WHERE type='table';

-- Show table structure
PRAGMA table_info(table_name);

-- List indexes
SELECT name FROM sqlite_master WHERE type='index';
```

### Migration Issues
1. **"Another migration is running"**
   ```sql
   UPDATE _migration_lock SET locked = 0;
   ```

2. **"Migration already executed"**
   - Check `_migrations` table
   - Migration might be registered twice

3. **Foreign Key Errors**
   - Ensure parent table exists
   - Check PRAGMA foreign_keys is ON

## Testing Migrations

Run the test suite:
```bash
pnpm db:test
```

Key test scenarios:
1. **Up/Down/Up cycle** - Ensures reversibility
2. **Idempotency** - Running twice shouldn't fail
3. **Data preservation** - Data survives rollback
4. **Concurrent protection** - Lock mechanism works

## Phase 3 Implementation Details

Currently implemented:
- ✅ Migration testing framework (`test/migration.test.ts`)
- ✅ Validation rules (`utils/migrationValidator.ts`)
- ✅ Migration templates (4 templates available)
- ✅ Enhanced CLI with template support
- ✅ Comprehensive documentation

## For Production

The migration system works in packaged Electron apps:
- Uses `ProductionMigrator` with embedded migrations
- No filesystem access required
- Migrations are bundled in the build
- Same API as development migrator

## Need Help?

1. Check existing migrations for examples
2. Use templates for common patterns
3. Run validation before committing
4. Test migrations thoroughly
5. Update documentation when adding features

Remember: Migrations are permanent once deployed. Think carefully before creating them!
# Crystal Database Migration System Overhaul Plan

## Executive Summary

Crystal's current database migration system relies on a 635-line `runMigrations()` method that performs conditional schema updates without version tracking, rollback capabilities, or transaction safety. This ad hoc approach has accumulated technical debt and poses risks for data integrity, developer productivity, and future scalability.

This document proposes a complete overhaul using **Umzug** as the migration framework, paired with a custom database adapter pattern for portability. The new system will provide:

- Version-tracked, reversible migrations
- Full transaction safety
- Database-agnostic migration logic
- Automated testing and validation
- Zero-downtime transition from the current system

## Current State Analysis

### What's Broken Now

1. **No Version Tracking**: The system cannot determine which migrations have run, relying entirely on conditional column/table existence checks
2. **No Rollback Support**: Once a migration runs, it cannot be undone
3. **Code Organization**: All migrations are hardcoded in a single 635-line method
4. **Transaction Safety**: Most migrations run outside transactions, risking partial updates
5. **Testing Challenges**: Cannot test migrations in isolation or verify rollback behavior
6. **Database Coupling**: SQLite-specific PRAGMA statements throughout, making portability difficult

### Current Migration Pattern

```typescript
// Example from runMigrations()
const tableInfo = this.db.prepare("PRAGMA table_info(sessions)").all();
const hasStatus = tableInfo.some((col: any) => col.name === 'status');
if (!hasStatus) {
  this.db.prepare("ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'initializing'").run();
}
```

This pattern is repeated ~50 times for different schema changes.

## Requirements for the New System

### Core Requirements

1. **Version Tracking**: Track which migrations have been applied with timestamps
2. **Reversibility**: Support for down migrations to enable rollbacks
3. **Transaction Safety**: All migrations run in transactions by default
4. **Database Portability**: Abstract database operations for future Postgres support
5. **Developer Experience**: Simple CLI commands for creating and running migrations
6. **Testing Support**: Ability to test migrations in isolation
7. **Zero Data Loss**: Safe transition from current system

### Non-Functional Requirements

1. **Lightweight**: Minimal dependencies suitable for Electron
2. **TypeScript-First**: Full type safety for migrations
3. **Audit Trail**: Complete history of schema changes
4. **Performance**: Minimal overhead for checking migration status

## Recommended Approach

### Framework Evaluation

| Framework | Pros | Cons | Verdict |
|-----------|------|------|---------|
| **Umzug** | - Lightweight (50KB)<br>- Framework agnostic<br>- TypeScript support<br>- Battle-tested<br>- Supports custom storage | - Requires adapter implementation | ✅ **Recommended** |
| **Kysely** | - Type-safe queries<br>- Built-in migrations<br>- Good DX | - Heavier (200KB+)<br>- Opinionated query builder<br>- Less flexible storage | ❌ Too opinionated |
| **Drizzle** | - Modern<br>- Great TypeScript support<br>- Schema inference | - Heavy dependencies<br>- Newer/less stable<br>- ORM overhead | ❌ Too heavy |
| **Custom** | - Full control<br>- Minimal size | - Reinventing wheel<br>- Maintenance burden<br>- No community | ❌ Unnecessary |

### Final Recommendation: Umzug

Umzug provides the perfect balance of:
- Minimal footprint (50KB)
- Flexibility for custom storage and execution
- Proven reliability (used by Sequelize)
- Database agnostic design
- Strong TypeScript support

## System Design

### Directory Structure

```
main/
├── src/
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001-initial-schema.ts
│   │   │   ├── 002-add-projects.ts
│   │   │   ├── 003-add-folders.ts
│   │   │   └── ...
│   │   ├── migrator/
│   │   │   ├── index.ts          # Umzug configuration
│   │   │   ├── adapter.ts        # Database adapter interface
│   │   │   ├── sqlite-adapter.ts # SQLite implementation
│   │   │   └── types.ts         # Migration types
│   │   └── database.ts          # Main database class
```

### Types and Interfaces

```typescript
// main/src/database/migrator/types.ts

export interface MigrationContext {
  adapter: DatabaseAdapter;
  logger: Logger;
}

export interface Migration {
  name: string;
  up: (context: MigrationContext) => Promise<void>;
  down: (context: MigrationContext) => Promise<void>;
}

export interface DatabaseAdapter {
  // DDL Operations
  createTable(name: string, definition: TableDefinition): Promise<void>;
  dropTable(name: string): Promise<void>;
  renameTable(oldName: string, newName: string): Promise<void>;
  
  // Column Operations
  addColumn(table: string, column: ColumnDefinition): Promise<void>;
  dropColumn(table: string, column: string): Promise<void>;
  renameColumn(table: string, oldName: string, newName: string): Promise<void>;
  
  // Index Operations
  createIndex(name: string, table: string, columns: string[]): Promise<void>;
  dropIndex(name: string): Promise<void>;
  
  // Data Operations
  execute(sql: string, params?: any[]): Promise<any>;
  select(sql: string, params?: any[]): Promise<any[]>;
  
  // Transaction Management
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  
  // Introspection
  tableExists(name: string): Promise<boolean>;
  columnExists(table: string, column: string): Promise<boolean>;
  getTableInfo(table: string): Promise<ColumnInfo[]>;
}

export interface TableDefinition {
  columns: ColumnDefinition[];
  primaryKey?: string[];
  indexes?: IndexDefinition[];
  foreignKeys?: ForeignKeyDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: DataType;
  nullable?: boolean;
  defaultValue?: any;
  unique?: boolean;
  references?: { table: string; column: string };
}

export enum DataType {
  INTEGER = 'INTEGER',
  TEXT = 'TEXT',
  REAL = 'REAL',
  BLOB = 'BLOB',
  DATETIME = 'DATETIME',
  BOOLEAN = 'BOOLEAN',
  JSON = 'JSON'
}
```

### Example Migration File

```typescript
// main/src/database/migrations/001-initial-schema.ts

import { Migration, MigrationContext, DataType } from '../migrator/types';

export const migration: Migration = {
  name: '001-initial-schema',
  
  async up({ adapter }: MigrationContext) {
    // Create projects table
    await adapter.createTable('projects', {
      columns: [
        { name: 'id', type: DataType.TEXT, nullable: false },
        { name: 'name', type: DataType.TEXT, nullable: false },
        { name: 'path', type: DataType.TEXT, nullable: false, unique: true },
        { name: 'created_at', type: DataType.DATETIME, defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: DataType.DATETIME, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      primaryKey: ['id']
    });

    // Create sessions table
    await adapter.createTable('sessions', {
      columns: [
        { name: 'id', type: DataType.TEXT, nullable: false },
        { name: 'project_id', type: DataType.TEXT, nullable: false },
        { name: 'name', type: DataType.TEXT, nullable: false },
        { name: 'worktree_name', type: DataType.TEXT },
        { name: 'status', type: DataType.TEXT, defaultValue: 'initializing' },
        { name: 'created_at', type: DataType.DATETIME, defaultValue: 'CURRENT_TIMESTAMP' }
      ],
      primaryKey: ['id'],
      foreignKeys: [{
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'CASCADE'
      }]
    });

    // Create indexes
    await adapter.createIndex('idx_sessions_project_id', 'sessions', ['project_id']);
    await adapter.createIndex('idx_sessions_status', 'sessions', ['status']);
  },

  async down({ adapter }: MigrationContext) {
    await adapter.dropTable('sessions');
    await adapter.dropTable('projects');
  }
};
```

### Umzug Configuration

```typescript
// main/src/database/migrator/index.ts

import { Umzug, UmzugOptions } from 'umzug';
import { Database } from 'better-sqlite3';
import { SQLiteAdapter } from './sqlite-adapter';
import * as fs from 'fs';
import * as path from 'path';

export class Migrator {
  private umzug: Umzug;
  private adapter: DatabaseAdapter;

  constructor(private db: Database) {
    this.adapter = new SQLiteAdapter(db);
    
    const umzugConfig: UmzugOptions = {
      migrations: {
        glob: path.join(__dirname, '../migrations/*.ts'),
        resolve: ({ name, path: migrationPath }) => {
          const migration = require(migrationPath).migration;
          return {
            name,
            up: async () => migration.up({ adapter: this.adapter, logger: console }),
            down: async () => migration.down({ adapter: this.adapter, logger: console })
          };
        }
      },
      context: { adapter: this.adapter },
      storage: {
        async executed() {
          const migrations = await db.prepare(
            'SELECT name FROM migrations ORDER BY executed_at'
          ).all();
          return migrations.map(m => m.name);
        },
        async logMigration({ name }) {
          await db.prepare(
            'INSERT INTO migrations (name, executed_at) VALUES (?, ?)'
          ).run(name, new Date().toISOString());
        },
        async unlogMigration({ name }) {
          await db.prepare('DELETE FROM migrations WHERE name = ?').run(name);
        }
      },
      logger: console
    };

    this.umzug = new Umzug(umzugConfig);
  }

  async up() {
    await this.ensureMigrationsTable();
    return this.umzug.up();
  }

  async down() {
    return this.umzug.down();
  }

  async pending() {
    return this.umzug.pending();
  }

  async executed() {
    return this.umzug.executed();
  }

  private async ensureMigrationsTable() {
    this.db.prepare(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  }
}
```

## Adapter Strategy

### SQLite Adapter Implementation

```typescript
// main/src/database/migrator/sqlite-adapter.ts

import { Database } from 'better-sqlite3';
import { DatabaseAdapter, TableDefinition, ColumnDefinition, DataType } from './types';

export class SQLiteAdapter implements DatabaseAdapter {
  constructor(private db: Database) {}

  async createTable(name: string, definition: TableDefinition): Promise<void> {
    const columns = definition.columns.map(col => this.columnToSQL(col)).join(', ');
    const primaryKey = definition.primaryKey 
      ? `, PRIMARY KEY (${definition.primaryKey.join(', ')})` 
      : '';
    
    const sql = `CREATE TABLE ${name} (${columns}${primaryKey})`;
    this.db.prepare(sql).run();

    // Create indexes
    if (definition.indexes) {
      for (const index of definition.indexes) {
        await this.createIndex(index.name, name, index.columns);
      }
    }
  }

  async dropTable(name: string): Promise<void> {
    this.db.prepare(`DROP TABLE IF EXISTS ${name}`).run();
  }

  async addColumn(table: string, column: ColumnDefinition): Promise<void> {
    const sql = `ALTER TABLE ${table} ADD COLUMN ${this.columnToSQL(column)}`;
    this.db.prepare(sql).run();
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const trx = this.db.transaction(async () => {
      return await fn();
    });
    return trx() as T;
  }

  async tableExists(name: string): Promise<boolean> {
    const result = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(name);
    return !!result;
  }

  async columnExists(table: string, column: string): Promise<boolean> {
    const info = this.db.prepare(`PRAGMA table_info(${table})`).all();
    return info.some((col: any) => col.name === column);
  }

  private columnToSQL(column: ColumnDefinition): string {
    let sql = `${column.name} ${this.mapDataType(column.type)}`;
    
    if (!column.nullable) sql += ' NOT NULL';
    if (column.unique) sql += ' UNIQUE';
    if (column.defaultValue !== undefined) {
      sql += ` DEFAULT ${this.formatDefault(column.defaultValue)}`;
    }
    
    return sql;
  }

  private mapDataType(type: DataType): string {
    const mapping: Record<DataType, string> = {
      [DataType.INTEGER]: 'INTEGER',
      [DataType.TEXT]: 'TEXT',
      [DataType.REAL]: 'REAL',
      [DataType.BLOB]: 'BLOB',
      [DataType.DATETIME]: 'DATETIME',
      [DataType.BOOLEAN]: 'INTEGER',
      [DataType.JSON]: 'TEXT'
    };
    return mapping[type];
  }

  private formatDefault(value: any): string {
    if (value === 'CURRENT_TIMESTAMP') return value;
    if (typeof value === 'string') return `'${value}'`;
    return String(value);
  }

  // ... implement remaining methods
}
```

### Future Postgres Adapter

```typescript
// main/src/database/migrator/postgres-adapter.ts

export class PostgresAdapter implements DatabaseAdapter {
  constructor(private client: PgClient) {}

  async createTable(name: string, definition: TableDefinition): Promise<void> {
    // Postgres-specific implementation
    // Would use CREATE TABLE with Postgres types
  }

  private mapDataType(type: DataType): string {
    const mapping: Record<DataType, string> = {
      [DataType.INTEGER]: 'INTEGER',
      [DataType.TEXT]: 'TEXT',
      [DataType.REAL]: 'DOUBLE PRECISION',
      [DataType.BLOB]: 'BYTEA',
      [DataType.DATETIME]: 'TIMESTAMP WITH TIME ZONE',
      [DataType.BOOLEAN]: 'BOOLEAN',
      [DataType.JSON]: 'JSONB'
    };
    return mapping[type];
  }

  // ... implement all methods with Postgres syntax
}
```

## Transition Plan

### Phase 1: Setup New System (Week 1)

1. Install Umzug and dependencies
2. Implement DatabaseAdapter interface and SQLiteAdapter
3. Create Migrator class with Umzug configuration
4. Set up migration directory structure

### Phase 2: Convert Existing Migrations (Week 2)

1. Analyze current `runMigrations()` method
2. Extract each conditional migration into a numbered migration file
3. Create a "baseline" migration representing current schema
4. Test each migration can run up/down successfully

### Phase 3: Parallel Running (Week 3)

1. Add feature flag for new migration system
2. Run both old and new systems in parallel
3. Verify both produce identical schemas
4. Add comprehensive logging for debugging

### Phase 4: Cutover (Week 4)

1. Create final migration to add version tracking table
2. Populate migrations table with already-applied migrations
3. Switch to new system behind feature flag
4. Remove old `runMigrations()` method
5. Clean up unused code

### Migration Conversion Example

Current code:
```typescript
// In runMigrations()
const hasColumn = tableInfo.some(col => col.name === 'prompt');
if (!hasColumn) {
  this.db.prepare('ALTER TABLE sessions ADD COLUMN prompt TEXT').run();
}
```

Becomes:
```typescript
// 005-add-session-prompt.ts
export const migration: Migration = {
  name: '005-add-session-prompt',
  
  async up({ adapter }) {
    await adapter.addColumn('sessions', {
      name: 'prompt',
      type: DataType.TEXT,
      nullable: true
    });
  },

  async down({ adapter }) {
    await adapter.dropColumn('sessions', 'prompt');
  }
};
```

## Testing Strategy

### Unit Tests

```typescript
// main/src/database/migrator/__tests__/adapter.test.ts

describe('SQLiteAdapter', () => {
  let db: Database;
  let adapter: SQLiteAdapter;

  beforeEach(() => {
    db = new Database(':memory:');
    adapter = new SQLiteAdapter(db);
  });

  test('createTable creates table with correct schema', async () => {
    await adapter.createTable('test_table', {
      columns: [
        { name: 'id', type: DataType.INTEGER, nullable: false },
        { name: 'name', type: DataType.TEXT }
      ],
      primaryKey: ['id']
    });

    expect(await adapter.tableExists('test_table')).toBe(true);
    expect(await adapter.columnExists('test_table', 'id')).toBe(true);
    expect(await adapter.columnExists('test_table', 'name')).toBe(true);
  });

  test('transaction rollback on error', async () => {
    await adapter.createTable('test', {
      columns: [{ name: 'id', type: DataType.INTEGER }]
    });

    await expect(
      adapter.transaction(async () => {
        await adapter.execute('INSERT INTO test (id) VALUES (1)');
        throw new Error('Rollback test');
      })
    ).rejects.toThrow();

    const count = db.prepare('SELECT COUNT(*) as count FROM test').get();
    expect(count.count).toBe(0);
  });
});
```

### Integration Tests

```typescript
// main/src/database/migrator/__tests__/migrator.test.ts

describe('Migrator Integration', () => {
  let db: Database;
  let migrator: Migrator;

  beforeEach(() => {
    db = new Database(':memory:');
    migrator = new Migrator(db);
  });

  test('runs all pending migrations', async () => {
    const pending = await migrator.pending();
    expect(pending.length).toBeGreaterThan(0);

    await migrator.up();

    const executed = await migrator.executed();
    expect(executed.length).toBe(pending.length);
  });

  test('rollback reverses migration', async () => {
    await migrator.up();
    const beforeRollback = await migrator.executed();

    await migrator.down();
    const afterRollback = await migrator.executed();

    expect(afterRollback.length).toBe(beforeRollback.length - 1);
  });
});
```

### Migration Validation Tests

```typescript
// main/src/database/migrator/__tests__/migration-validator.ts

export class MigrationValidator {
  static async validateMigration(migration: Migration, db: Database) {
    const testDb = new Database(':memory:');
    const adapter = new SQLiteAdapter(testDb);
    
    // Test up migration
    await migration.up({ adapter, logger: console });
    const afterUp = this.captureSchema(testDb);
    
    // Test down migration
    await migration.down({ adapter, logger: console });
    const afterDown = this.captureSchema(testDb);
    
    // Verify reversibility
    expect(afterDown).toEqual({}); // Should be empty after down
    
    testDb.close();
  }

  private static captureSchema(db: Database): SchemaSnapshot {
    // Capture complete schema state
    const tables = db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table'"
    ).all();
    
    return { tables };
  }
}
```

## Developer Experience

### CLI Commands

```bash
# Create new migration
pnpm crystal:migration create add-user-preferences

# Run pending migrations
pnpm crystal:migration up

# Rollback last migration
pnpm crystal:migration down

# Show migration status
pnpm crystal:migration status

# Reset database (down all, then up all)
pnpm crystal:migration reset
```

### Migration Generator

```typescript
// scripts/create-migration.ts

import * as fs from 'fs';
import * as path from 'path';

const template = `import { Migration, MigrationContext, DataType } from '../migrator/types';

export const migration: Migration = {
  name: '{{NAME}}',
  
  async up({ adapter }: MigrationContext) {
    // TODO: Implement up migration
  },

  async down({ adapter }: MigrationContext) {
    // TODO: Implement down migration
  }
};
`;

function createMigration(name: string) {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const filename = `${timestamp}-${name}.ts`;
  const content = template.replace('{{NAME}}', filename.replace('.ts', ''));
  
  const migrationPath = path.join(__dirname, '../main/src/database/migrations', filename);
  fs.writeFileSync(migrationPath, content);
  
  console.log(`Created migration: ${filename}`);
}

// Usage: pnpm crystal:migration create <name>
const name = process.argv[2];
if (!name) {
  console.error('Please provide a migration name');
  process.exit(1);
}

createMigration(name);
```

### VSCode Integration

```json
// .vscode/crystal.code-snippets
{
  "Crystal Migration": {
    "prefix": "migration",
    "body": [
      "import { Migration, MigrationContext, DataType } from '../migrator/types';",
      "",
      "export const migration: Migration = {",
      "  name: '${1:migration-name}',",
      "  ",
      "  async up({ adapter }: MigrationContext) {",
      "    ${2:// Implementation}",
      "  },",
      "",
      "  async down({ adapter }: MigrationContext) {",
      "    ${3:// Rollback}",
      "  }",
      "};"
    ]
  }
}
```

## Long-Term Enhancements

### 1. Migration Squashing

After accumulating many migrations, provide ability to squash into a new baseline:

```typescript
class MigrationSquasher {
  async squash(untilMigration: string): Promise<void> {
    // 1. Run all migrations up to specified point
    // 2. Dump current schema
    // 3. Create new baseline migration
    // 4. Archive old migrations
  }
}
```

### 2. Schema Drift Detection

Detect when actual database schema differs from expected:

```typescript
class SchemaDriftDetector {
  async detectDrift(): Promise<DriftReport> {
    const expected = await this.getExpectedSchema();
    const actual = await this.getActualSchema();
    return this.compareSchemas(expected, actual);
  }
}
```

### 3. Migration Dependencies

Support for migrations that depend on others:

```typescript
export const migration: Migration = {
  name: 'add-user-settings',
  dependsOn: ['add-users-table'],
  // ...
};
```

### 4. Dry Run Mode

Preview what a migration will do without executing:

```typescript
await migrator.up({ dryRun: true });
// Outputs planned SQL without executing
```

### 5. Schema Versioning

Track and tag schema versions for releases:

```typescript
await migrator.tag('v1.0.0');
await migrator.migrateTo('v1.0.0'); // Migrate to specific version
```

## Risk Mitigation

### Identified Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during transition | Critical | - Full backup before cutover<br>- Parallel running period<br>- Rollback plan |
| Migration failure in production | High | - Comprehensive test suite<br>- Staging environment testing<br>- Transaction safety |
| Performance regression | Medium | - Benchmark migration performance<br>- Optimize slow migrations<br>- Add progress reporting |
| Developer adoption friction | Medium | - Clear documentation<br>- Migration generator<br>- IDE integration |
| Incompatible schema changes | High | - Adapter abstraction<br>- Type safety<br>- Validation tests |

### Rollback Plan

If issues arise during transition:

1. **Immediate**: Revert to old `runMigrations()` via feature flag
2. **Short-term**: Fix issues while running old system
3. **Long-term**: Re-attempt transition with fixes

### Backup Strategy

```typescript
class DatabaseBackup {
  async backup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '');
    const backupPath = path.join(BACKUP_DIR, `crystal-${timestamp}.db`);
    
    // Use SQLite backup API
    await this.db.backup(backupPath);
    
    return backupPath;
  }

  async restore(backupPath: string): Promise<void> {
    // Restore from backup
    await fs.copyFile(backupPath, this.dbPath);
  }
}
```

## Conclusion

The proposed migration system overhaul addresses all critical issues with Crystal's current approach while providing a solid foundation for future growth. Using Umzug with a custom adapter pattern ensures:

1. **Immediate Benefits**: Version tracking, rollbacks, transaction safety
2. **Future Proofing**: Database portability for potential Postgres migration  
3. **Developer Experience**: Simple CLI, clear patterns, good tooling
4. **Risk Management**: Gradual transition with parallel running

The investment in a proper migration system will pay dividends through:
- Reduced debugging time for schema issues
- Confidence in production deployments
- Easier onboarding for new developers
- Foundation for advanced features (multi-tenancy, data migrations)

The recommended 4-week implementation timeline allows for careful transition without disrupting ongoing development. With proper testing and the parallel running period, we can achieve zero data loss and minimal risk.

This migration system will transform a current pain point into a Crystal strength, setting the project up for sustainable growth and maintainability.
import Database from 'better-sqlite3';

interface TableInfo {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
  }>;
}

interface LegacySchemaInfo {
  version: string;
  migrationsToMark: string[];
  description: string;
}

export class LegacyMigrationDetector {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });
  }

  /**
   * Detect the current schema version by analyzing existing tables and columns
   */
  detectSchemaVersion(): LegacySchemaInfo {
    const tables = this.getTables();
    const tableNames = new Set(tables.map(t => t.name));

    // Check for migration tracking table first
    if (tableNames.has('_migrations')) {
      const migrationCount = this.db.prepare(
        'SELECT COUNT(*) as count FROM _migrations'
      ).get() as { count: number };
      
      if (migrationCount.count > 0) {
        return {
          version: 'already-migrated',
          migrationsToMark: [],
          description: 'Database already using new migration system'
        };
      }
    }

    // No tables at all - fresh database
    if (tables.length === 0) {
      return {
        version: 'fresh',
        migrationsToMark: [],
        description: 'Fresh database - no existing schema'
      };
    }

    // Analyze schema to determine version
    const schemaFingerprint = this.analyzeSchema(tables, tableNames);
    
    return schemaFingerprint;
  }

  private analyzeSchema(tables: TableInfo[], tableNames: Set<string>): LegacySchemaInfo {
    // Check for the most recent features first, working backwards
    
    // Check for user_preferences table (most recent addition)
    if (tableNames.has('user_preferences')) {
      return {
        version: 'v1.0-complete',
        migrationsToMark: ['001-initial-schema.ts'],
        description: 'Full v1.0 schema with user preferences'
      };
    }

    // Check for app_opens table
    if (tableNames.has('app_opens')) {
      return {
        version: 'v0.9-app-tracking',
        migrationsToMark: ['001-initial-schema.ts'],
        description: 'Schema with app usage tracking'
      };
    }

    // Check for ui_state table
    if (tableNames.has('ui_state')) {
      return {
        version: 'v0.8-ui-state',
        migrationsToMark: ['001-initial-schema.ts'],
        description: 'Schema with UI state persistence'
      };
    }

    // Check for folders table with proper structure
    if (tableNames.has('folders')) {
      const folderInfo = this.getTableInfo('folders');
      const hasParentFolderId = folderInfo.columns.some(c => c.name === 'parent_folder_id');
      
      if (hasParentFolderId) {
        return {
          version: 'v0.7-nested-folders',
          migrationsToMark: ['001-initial-schema.ts'],
          description: 'Schema with nested folder support'
        };
      } else {
        return {
          version: 'v0.6-folders',
          migrationsToMark: ['001-initial-schema.ts'],
          description: 'Schema with basic folder support'
        };
      }
    }

    // Check for project_run_commands table
    if (tableNames.has('project_run_commands')) {
      return {
        version: 'v0.5-run-commands',
        migrationsToMark: ['001-initial-schema.ts'],
        description: 'Schema with project run commands'
      };
    }

    // Check for projects table with advanced features
    if (tableNames.has('projects')) {
      const projectInfo = this.getTableInfo('projects');
      const hasMainBranch = projectInfo.columns.some(c => c.name === 'main_branch');
      const hasBuildScript = projectInfo.columns.some(c => c.name === 'build_script');
      
      if (hasMainBranch && hasBuildScript) {
        return {
          version: 'v0.4-projects-enhanced',
          migrationsToMark: ['001-initial-schema.ts'],
          description: 'Enhanced project schema with build scripts'
        };
      } else {
        return {
          version: 'v0.3-projects-basic',
          migrationsToMark: ['001-initial-schema.ts'],
          description: 'Basic project support'
        };
      }
    }

    // Check for execution_diffs table
    if (tableNames.has('execution_diffs')) {
      return {
        version: 'v0.2-execution-tracking',
        migrationsToMark: ['001-initial-schema.ts'],
        description: 'Schema with execution diff tracking'
      };
    }

    // Check for prompt_markers table
    if (tableNames.has('prompt_markers')) {
      return {
        version: 'v0.1-prompt-tracking',
        migrationsToMark: ['001-initial-schema.ts'],
        description: 'Schema with prompt tracking'
      };
    }

    // Only basic tables (sessions, session_outputs)
    if (tableNames.has('sessions') && tableNames.has('session_outputs')) {
      return {
        version: 'v0.0-basic',
        migrationsToMark: ['001-initial-schema.ts'],
        description: 'Basic schema with sessions only'
      };
    }

    // Unknown schema
    return {
      version: 'unknown',
      migrationsToMark: [],
      description: 'Unknown schema version - manual intervention required'
    };
  }

  private getTables(): TableInfo[] {
    const tables = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all() as Array<{ name: string }>;

    return tables.map(t => ({
      name: t.name,
      columns: this.getTableInfo(t.name).columns
    }));
  }

  private getTableInfo(tableName: string): TableInfo {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }>;

    return {
      name: tableName,
      columns
    };
  }

  /**
   * Generate a detailed schema report for debugging
   */
  generateSchemaReport(): string {
    const tables = this.getTables();
    const version = this.detectSchemaVersion();
    
    let report = `Legacy Schema Detection Report\n`;
    report += `==============================\n\n`;
    report += `Detected Version: ${version.version}\n`;
    report += `Description: ${version.description}\n`;
    report += `Migrations to Mark: ${version.migrationsToMark.join(', ') || 'None'}\n\n`;
    
    report += `Tables Found (${tables.length}):\n`;
    report += `----------------\n`;
    
    for (const table of tables) {
      report += `\n${table.name}:\n`;
      for (const col of table.columns) {
        const pk = col.pk ? ' [PRIMARY KEY]' : '';
        const nn = col.notnull ? ' NOT NULL' : '';
        const def = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
        report += `  - ${col.name}: ${col.type}${pk}${nn}${def}\n`;
      }
    }
    
    return report;
  }

  close(): void {
    this.db.close();
  }
}
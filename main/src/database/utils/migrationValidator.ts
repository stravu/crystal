import { Migration } from '../migrations/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Migration Validation Rules
 * 
 * Enforces best practices and safety checks for migrations
 */
export class MigrationValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Validate a migration file
   */
  async validateMigration(migration: Migration, filePath?: string): Promise<ValidationResult> {
    this.errors = [];
    this.warnings = [];

    // Rule 1: Must have a name
    if (!migration.name) {
      this.errors.push('Migration must have a name property');
    }

    // Rule 2: Must have up method
    if (!migration.up || typeof migration.up !== 'function') {
      this.errors.push('Migration must have an up() method');
    }

    // Rule 3: Must have down method
    if (!migration.down || typeof migration.down !== 'function') {
      this.errors.push('Migration must have a down() method');
    }

    // Rule 4: Name should match file name
    if (filePath) {
      const fileName = path.basename(filePath, '.ts');
      if (migration.name && migration.name !== fileName) {
        this.errors.push(`Migration name "${migration.name}" does not match filename "${fileName}"`);
      }
    }

    // Rule 5: Check for dangerous operations
    if (filePath) {
      const content = fs.readFileSync(filePath, 'utf-8');
      this.validateSQLSafety(content);
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  /**
   * Validate SQL safety
   */
  private validateSQLSafety(content: string): void {
    // Check for DROP TABLE without IF EXISTS in down()
    if (content.includes('DROP TABLE') && !content.includes('DROP TABLE IF EXISTS')) {
      this.warnings.push('Use DROP TABLE IF EXISTS in down() method for safety');
    }

    // Check for data deletion
    if (content.includes('DELETE FROM') && !content.includes('WHERE')) {
      this.errors.push('DELETE without WHERE clause detected - this will delete all data!');
    }

    // Check for TRUNCATE
    if (content.includes('TRUNCATE')) {
      this.errors.push('TRUNCATE detected - use DELETE with WHERE clause instead');
    }

    // Check for column drops (SQLite limitation)
    if (content.includes('DROP COLUMN')) {
      this.warnings.push('SQLite does not support DROP COLUMN - document workaround in down()');
    }

    // Check for proper transaction usage
    if (content.includes('BEGIN') || content.includes('COMMIT')) {
      this.warnings.push('Use adapter.transaction() instead of manual transaction management');
    }

    // Check for parameterized queries
    if (content.match(/VALUES\s*\([^)]*'[^']*'/)) {
      this.warnings.push('Consider using parameterized queries for dynamic values');
    }
  }

  /**
   * Validate migration naming convention
   */
  static validateNaming(fileName: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Should start with number sequence
    if (!fileName.match(/^\d{3}-/)) {
      errors.push('Migration filename should start with 3-digit sequence (e.g., 008-feature-name.ts)');
    }

    // Should use kebab-case
    if (!fileName.match(/^\d{3}-[a-z-]+\.ts$/)) {
      errors.push('Migration filename should use kebab-case (e.g., 008-add-user-settings.ts)');
    }

    // Should be descriptive
    const namePart = fileName.replace(/^\d{3}-/, '').replace('.ts', '');
    if (namePart.length < 5) {
      warnings.push('Migration name should be descriptive (at least 5 characters)');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate migration sequence
   */
  static async validateSequence(migrationsPath: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const files = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith('.ts') && f.match(/^\d{3}-/))
      .sort();

    // Check for sequence gaps
    let expectedSequence = 1;
    for (const file of files) {
      const sequence = parseInt(file.substring(0, 3));
      if (sequence !== expectedSequence) {
        errors.push(`Sequence gap detected: expected ${expectedSequence.toString().padStart(3, '0')}, found ${file}`);
      }
      expectedSequence++;
    }

    // Check for duplicates
    const sequences = files.map(f => f.substring(0, 3));
    const duplicates = sequences.filter((s, i) => sequences.indexOf(s) !== i);
    if (duplicates.length > 0) {
      errors.push(`Duplicate sequence numbers found: ${duplicates.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate migration dependencies
   */
  static validateDependencies(_migration: Migration, _allMigrations: Migration[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // This would check if a migration references tables/columns that don't exist yet
    // For now, this is a placeholder for future implementation
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Pre-commit hook for migration validation
 */
export async function validateMigrationsPreCommit(migrationsPath: string): Promise<boolean> {
  console.log('🔍 Validating migrations...');
  
  const validator = new MigrationValidator();
  let hasErrors = false;

  // Validate sequence
  const sequenceResult = await MigrationValidator.validateSequence(migrationsPath);
  if (!sequenceResult.valid) {
    console.error('❌ Sequence validation failed:');
    sequenceResult.errors.forEach(e => console.error(`   - ${e}`));
    hasErrors = true;
  }

  // Validate each migration file
  const files = fs.readdirSync(migrationsPath)
    .filter(f => f.endsWith('.ts') && f.match(/^\d{3}-/));

  for (const file of files) {
    const filePath = path.join(migrationsPath, file);
    
    // Validate naming
    const namingResult = MigrationValidator.validateNaming(file);
    if (!namingResult.valid) {
      console.error(`❌ ${file} - Naming validation failed:`);
      namingResult.errors.forEach(e => console.error(`   - ${e}`));
      hasErrors = true;
    }

    // Import and validate migration
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const migration = require(filePath).default;
      const result = await validator.validateMigration(migration, filePath);
      
      if (!result.valid) {
        console.error(`❌ ${file} - Validation failed:`);
        result.errors.forEach(e => console.error(`   - ${e}`));
        hasErrors = true;
      }
      
      if (result.warnings.length > 0) {
        console.warn(`⚠️  ${file} - Warnings:`);
        result.warnings.forEach(w => console.warn(`   - ${w}`));
      }
    } catch (error) {
      console.error(`❌ ${file} - Failed to load migration:`, error);
      hasErrors = true;
    }
  }

  if (!hasErrors) {
    console.log('✅ All migrations validated successfully!');
  }

  return !hasErrors;
}
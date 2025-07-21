#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { Migrator } from '../Migrator';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: create-migration <migration-name> [--template=<template-name>]');
    console.error('');
    console.error('Examples:');
    console.error('  create-migration add-user-settings');
    console.error('  create-migration add-notifications-table --template=table-creation');
    console.error('  create-migration add-theme-preference --template=add-column');
    console.error('');
    console.error('Available templates:');
    console.error('  - table-creation    : Create a new table with indexes');
    console.error('  - add-column        : Add a column to existing table');
    console.error('  - data-transformation : Transform data between tables');
    console.error('  - add-index         : Add performance indexes');
    process.exit(1);
  }

  // Parse arguments
  const templateArg = args.find(arg => arg.startsWith('--template='));
  const template = templateArg ? templateArg.split('=')[1] : null;
  const nameArgs = args.filter(arg => !arg.startsWith('--'));
  const migrationName = nameArgs.join('-');
  
  // Determine migrations path relative to the database directory
  const migrationsPath = path.join(__dirname, '..', 'migrations');

  try {
    let filePath: string;
    
    if (template) {
      // Use template
      filePath = await createMigrationFromTemplate(migrationName, template, migrationsPath);
    } else {
      // Use default
      filePath = await Migrator.createMigration(migrationName, migrationsPath);
    }
    
    console.log(`✅ Created migration: ${filePath}`);
    console.log('');
    console.log('Next steps:');
    console.log(`1. Edit the migration file: ${path.basename(filePath)}`);
    console.log('2. Update the migration registry in migrations/index.ts');
    console.log('3. Run: pnpm db:migrate');
  } catch (error) {
    console.error('Failed to create migration:', error);
    process.exit(1);
  }
}

async function createMigrationFromTemplate(
  name: string, 
  templateName: string, 
  migrationsPath: string
): Promise<string> {
  // Load template
  const templatesPath = path.join(migrationsPath, 'templates');
  const templateFile = `${templateName}.template.ts`;
  const templatePath = path.join(templatesPath, templateFile);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateName}`);
  }
  
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  
  // Get next sequence number
  const existingMigrations = fs.readdirSync(migrationsPath)
    .filter(f => f.match(/^\d{3}-/) && f.endsWith('.ts'))
    .sort();
  
  const lastSequence = existingMigrations.length > 0
    ? parseInt(existingMigrations[existingMigrations.length - 1].substring(0, 3))
    : 0;
  
  const nextSequence = (lastSequence + 1).toString().padStart(3, '0');
  const fileName = `${nextSequence}-${name}.ts`;
  const filePath = path.join(migrationsPath, fileName);
  
  // Replace placeholders
  let content = templateContent
    .replace(/{{MIGRATION_NAME}}/g, fileName.replace('.ts', ''))
    .replace(/{{DESCRIPTION}}/g, `${name.replace(/-/g, ' ')} Migration`)
    .replace(/{{TABLE_NAME}}/g, 'table_name')
    .replace(/{{COLUMN_NAME}}/g, 'column_name')
    .replace(/{{PURPOSE}}/g, 'TODO: describe purpose');
  
  // Remove template comments
  content = content.replace(/\s*@example[\s\S]*?\*\//, ' */');
  
  fs.writeFileSync(filePath, content);
  return filePath;
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
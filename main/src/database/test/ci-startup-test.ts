#!/usr/bin/env ts-node
/**
 * CI Database Startup Test
 * 
 * This test simulates Crystal app startup in various scenarios
 * to ensure the migration system works correctly in CI.
 */

import { DatabaseService } from '../database';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import Database from 'better-sqlite3';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  console.log(`\n🧪 Running: ${name}`);
  const start = Date.now();
  
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`✅ Passed in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMessage });
    console.error(`❌ Failed: ${errorMessage}`);
  }
}

async function testFreshInstall(): Promise<void> {
  const testDir = path.join(os.tmpdir(), 'crystal-ci-test-fresh');
  const dbPath = path.join(testDir, 'crystal.db');
  
  // Clean up any existing test database
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  
  const db = new DatabaseService(dbPath);
  await db.initialize();
  
  // Verify all tables exist
  const tables = db['db'].prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[];
  
  const expectedTables = [
    '_migration_lock',
    '_migrations',
    'app_opens',
    'conversation_messages',
    'execution_diffs',
    'folders',
    'project_run_commands',
    'projects',
    'prompt_markers',
    'session_outputs',
    'sessions',
    'ui_state',
    'user_preferences'
  ];
  
  const missingTables = expectedTables.filter(
    table => !tables.some(t => t.name === table)
  );
  
  if (missingTables.length > 0) {
    throw new Error(`Missing tables: ${missingTables.join(', ')}`);
  }
  
  // Test basic operations
  const project = db.createProject('CI Test Project', '/ci/test/path');
  if (!project) {
    throw new Error('Failed to create project');
  }
  
  const session = db.createSession({
    id: 'ci-test-123',
    name: 'CI Test Session',
    initial_prompt: 'Test',
    worktree_name: 'ci-test',
    worktree_path: '/ci/test',
    project_id: project.id,
    base_commit: 'abc123',
    base_branch: 'main'
  });
  
  if (!session) {
    throw new Error('Failed to create session');
  }
  
  db.close();
}

async function testMigrationLocking(): Promise<void> {
  const testDir = path.join(os.tmpdir(), 'crystal-ci-test-lock');
  const dbPath = path.join(testDir, 'crystal.db');
  
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  
  // Create two database instances
  const db1 = new DatabaseService(dbPath);
  const db2 = new DatabaseService(dbPath);
  
  // Start migrations in parallel
  const promise1 = db1.initialize();
  const promise2 = db2.initialize();
  
  // One should succeed, one might be blocked by migration lock
  const results = await Promise.allSettled([promise1, promise2]);
  
  // At least one should succeed
  const successes = results.filter(r => r.status === 'fulfilled');
  if (successes.length === 0) {
    const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    throw new Error(`Both migrations failed: ${failures.map(f => f.reason?.message || f.reason).join(', ')}`);
  }
  
  // Verify only one set of migrations ran
  const migrationCount = db1['db'].prepare(
    'SELECT COUNT(*) as count FROM _migrations'
  ).get() as { count: number };
  
  if (migrationCount.count !== 8) {
    throw new Error(`Expected 8 migrations, found ${migrationCount.count}`);
  }
  
  db1.close();
  db2.close();
}

async function testDataPreservation(): Promise<void> {
  const testDir = path.join(os.tmpdir(), 'crystal-ci-test-preserve');
  const dbPath = path.join(testDir, 'crystal.db');
  
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  
  // Create a legacy database with data
  const legacyDb = new Database(dbPath);
  legacyDb.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initial_prompt TEXT,
      worktree_name TEXT,
      worktree_path TEXT,
      status TEXT DEFAULT 'pending',
      project_id INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
    
    INSERT INTO projects (name, path) VALUES 
      ('Project 1', '/path/1'),
      ('Project 2', '/path/2');
      
    INSERT INTO sessions (id, name, project_id) VALUES 
      ('session-1', 'Session 1', 1),
      ('session-2', 'Session 2', 1),
      ('session-3', 'Session 3', 2);
  `);
  legacyDb.close();
  
  // Run migrations
  const db = new DatabaseService(dbPath);
  await db.initialize();
  
  // Verify data was preserved
  const projects = db.getAllProjects();
  if (projects.length !== 2) {
    throw new Error(`Expected 2 projects, found ${projects.length}`);
  }
  
  const sessions = db.getAllSessions();
  if (sessions.length !== 3) {
    throw new Error(`Expected 3 sessions, found ${sessions.length}`);
  }
  
  // Verify new columns exist
  const sessionWithNewColumns = db['db'].prepare(
    'SELECT base_commit, base_branch FROM sessions WHERE id = ?'
  ).get('session-1') as { base_commit: string | null; base_branch: string | null };
  
  if (!('base_commit' in sessionWithNewColumns)) {
    throw new Error('base_commit column not found');
  }
  
  db.close();
}

async function testPerformance(): Promise<void> {
  const iterations = 5;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const testDir = path.join(os.tmpdir(), `crystal-ci-test-perf-${i}`);
    const dbPath = path.join(testDir, 'crystal.db');
    
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    const start = Date.now();
    const db = new DatabaseService(dbPath);
    await db.initialize();
    db.close();
    
    const elapsed = Date.now() - start;
    times.push(elapsed);
    
    fs.rmSync(testDir, { recursive: true });
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const maxTime = Math.max(...times);
  
  console.log(`  Average: ${avgTime.toFixed(2)}ms`);
  console.log(`  Max: ${maxTime}ms`);
  
  if (avgTime > 100) {
    throw new Error(`Average startup time too high: ${avgTime}ms (expected < 100ms)`);
  }
  
  if (maxTime > 200) {
    throw new Error(`Max startup time too high: ${maxTime}ms (expected < 200ms)`);
  }
}

// Main test runner
async function main() {
  console.log('🚀 Crystal Database CI Tests');
  console.log('===========================');
  
  await runTest('Fresh Installation', testFreshInstall);
  await runTest('Migration Locking', testMigrationLocking);
  await runTest('Data Preservation', testDataPreservation);
  await runTest('Performance', testPerformance);
  
  // Summary
  console.log('\n📊 Test Summary');
  console.log('==============');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

// Run tests
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
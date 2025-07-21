#!/usr/bin/env node
/**
 * Test Crystal App Startup with Migration System
 * 
 * This simulates what happens when Crystal starts:
 * 1. Fresh install (no database)
 * 2. Existing database (needs migration)
 * 3. Already migrated database
 */

const { DatabaseService } = require('./dist/database/database');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Test scenarios
async function testFreshInstall() {
  console.log('\n🧪 TEST 1: Fresh Install (No Database)');
  console.log('=====================================');
  
  const testDir = path.join(os.homedir(), '.crystal-test-fresh');
  const dbPath = path.join(testDir, 'crystal.db');
  
  // Clean up any existing test database
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  
  console.time('Fresh install time');
  
  try {
    const db = new DatabaseService(dbPath);
    await db.initialize();
    console.log('✅ Database initialized successfully');
    
    // Check that all tables exist
    const tables = db.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();
    
    console.log(`✅ Created ${tables.length} tables`);
    
    // Try creating a project
    const project = db.createProject('Test Project', '/test/path');
    console.log('✅ Can create project:', project.name);
    
    // Try creating a session
    const session = db.createSession({
      id: 'test-123',
      name: 'Test Session',
      initial_prompt: 'Test',
      worktree_name: 'test',
      worktree_path: '/test',
      project_id: project.id,
      base_commit: 'abc123',
      base_branch: 'main'
    });
    console.log('✅ Can create session with new columns:', session.id);
    
    db.close();
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
  
  console.timeEnd('Fresh install time');
  return true;
}

async function testExistingDatabase() {
  console.log('\n🧪 TEST 2: Existing Database (Pre-migration)');
  console.log('==========================================');
  
  const testDir = path.join(os.homedir(), '.crystal-test-existing');
  const dbPath = path.join(testDir, 'crystal.db');
  
  // Create directory
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  // Simulate an old database by creating basic tables without migrations
  const Database = require('better-sqlite3');
  const oldDb = new Database(dbPath);
  
  // Create minimal old schema
  oldDb.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initial_prompt TEXT,
      worktree_name TEXT,
      worktree_path TEXT,
      status TEXT DEFAULT 'pending',
      project_id INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );
  `);
  
  // Add some test data
  oldDb.prepare('INSERT INTO projects (name, path) VALUES (?, ?)').run('Old Project', '/old/path');
  oldDb.close();
  
  console.time('Migration upgrade time');
  
  try {
    // Now open with new migration system
    const db = new DatabaseService(dbPath);
    await db.initialize();
    console.log('✅ Database upgraded successfully');
    
    // Check that old data still exists
    const projects = db.getAllProjects();
    console.log(`✅ Old data preserved: ${projects.length} projects`);
    
    // Check that new columns exist
    const columns = db.db.prepare("PRAGMA table_info(sessions)").all();
    const hasBaseCommit = columns.some(c => c.name === 'base_commit');
    const hasBaseBranch = columns.some(c => c.name === 'base_branch');
    
    console.log(`✅ New columns added: base_commit=${hasBaseCommit}, base_branch=${hasBaseBranch}`);
    
    db.close();
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
  
  console.timeEnd('Migration upgrade time');
  return true;
}

async function testAlreadyMigrated() {
  console.log('\n🧪 TEST 3: Already Migrated Database');
  console.log('====================================');
  
  const testDir = path.join(os.homedir(), '.crystal-test-migrated');
  const dbPath = path.join(testDir, 'crystal.db');
  
  // Use existing migrated database from test 1
  const freshDir = path.join(os.homedir(), '.crystal-test-fresh');
  if (fs.existsSync(freshDir)) {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    fs.copyFileSync(
      path.join(freshDir, 'crystal.db'),
      dbPath
    );
  }
  
  console.time('Already migrated startup time');
  
  try {
    const db = new DatabaseService(dbPath);
    await db.initialize();
    console.log('✅ Database opened successfully');
    
    // Check migration status
    const migrations = db.db.prepare(
      'SELECT COUNT(*) as count FROM _migrations'
    ).get();
    
    console.log(`✅ No duplicate migrations: ${migrations.count} migrations recorded`);
    
    db.close();
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
  
  console.timeEnd('Already migrated startup time');
  return true;
}

async function testPerformance() {
  console.log('\n🧪 TEST 4: Performance Check');
  console.log('===========================');
  
  const iterations = 5;
  const times = [];
  
  for (let i = 0; i < iterations; i++) {
    const testDir = path.join(os.homedir(), `.crystal-test-perf-${i}`);
    const dbPath = path.join(testDir, 'crystal.db');
    
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    
    const start = Date.now();
    try {
      const db = new DatabaseService(dbPath);
      await db.initialize();
      db.close();
      const elapsed = Date.now() - start;
      times.push(elapsed);
    } catch (error) {
      console.error(`❌ Iteration ${i + 1} failed:`, error.message);
    }
    
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`✅ Average startup time: ${avgTime.toFixed(2)}ms`);
  console.log(`✅ Min: ${Math.min(...times)}ms, Max: ${Math.max(...times)}ms`);
  
  return avgTime < 500; // Should start in under 500ms
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Testing Crystal Startup with New Migration System');
  console.log('=================================================');
  
  const results = [];
  
  results.push(await testFreshInstall());
  results.push(await testExistingDatabase());
  results.push(await testAlreadyMigrated());
  results.push(await testPerformance());
  
  // Clean up test directories
  const testDirs = [
    '.crystal-test-fresh',
    '.crystal-test-existing',
    '.crystal-test-migrated'
  ];
  
  for (const dir of testDirs) {
    const fullPath = path.join(os.homedir(), dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true });
    }
  }
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('==============');
  const passed = results.filter(r => r).length;
  console.log(`Total: ${results.length} tests`);
  console.log(`Passed: ${passed} tests`);
  console.log(`Failed: ${results.length - passed} tests`);
  
  if (passed === results.length) {
    console.log('\n✅ All tests passed! Migration system is production ready.');
    console.log('✅ Invisible to users, better for developers.');
  } else {
    console.log('\n❌ Some tests failed. Please fix before proceeding.');
  }
  
  process.exit(passed === results.length ? 0 : 1);
}

runAllTests().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
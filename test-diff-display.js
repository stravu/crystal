#!/usr/bin/env node

// Test script to verify diff display is working
const sqlite3 = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Connect to the database
const dbPath = path.join(os.homedir(), '.ccc', 'sessions.db');
const db = new sqlite3(dbPath);

console.log('Connected to database:', dbPath);

// Get recent executions with diffs
const executions = db.prepare(`
  SELECT 
    e.id,
    e.session_id,
    e.execution_sequence,
    e.git_diff IS NOT NULL as has_diff,
    e.stats_files_changed,
    e.stats_additions,
    e.stats_deletions,
    LENGTH(e.git_diff) as diff_length,
    e.timestamp,
    s.name as session_name
  FROM execution_diffs e
  JOIN sessions s ON e.session_id = s.id
  WHERE e.git_diff IS NOT NULL
  ORDER BY e.timestamp DESC
  LIMIT 5
`).all();

console.log('\nRecent executions with diffs:');
console.log('=====================================');

executions.forEach(exec => {
  console.log(`\nSession: ${exec.session_name} (${exec.session_id})`);
  console.log(`Execution #${exec.execution_sequence} - ID: ${exec.id}`);
  console.log(`Changes: ${exec.stats_files_changed} files, +${exec.stats_additions} -${exec.stats_deletions}`);
  console.log(`Diff size: ${exec.diff_length} characters`);
  console.log(`Timestamp: ${exec.timestamp}`);
  
  // Get a preview of the diff
  const diffPreview = db.prepare('SELECT substr(git_diff, 1, 200) as preview FROM execution_diffs WHERE id = ?').get(exec.id);
  console.log(`Diff preview: ${diffPreview.preview}...`);
});

// Test the API endpoint directly
console.log('\n\nTesting API endpoints:');
console.log('=====================================');

const fetch = require('node-fetch');

async function testEndpoints() {
  try {
    // Pick the most recent session with diffs
    const latestSession = executions[0];
    if (!latestSession) {
      console.log('No sessions with diffs found');
      return;
    }
    
    console.log(`\nTesting session: ${latestSession.session_id}`);
    
    // Test executions endpoint
    const execResponse = await fetch(`http://localhost:3001/api/sessions/${latestSession.session_id}/executions`);
    const execData = await execResponse.json();
    console.log(`\n/executions endpoint returned ${execData.length} executions`);
    
    // Test combined-diff endpoint
    const diffResponse = await fetch(`http://localhost:3001/api/sessions/${latestSession.session_id}/combined-diff`);
    const diffData = await diffResponse.json();
    console.log(`\n/combined-diff endpoint:`);
    console.log(`- Diff length: ${diffData.diff ? diffData.diff.length : 0}`);
    console.log(`- Stats: ${diffData.stats ? JSON.stringify(diffData.stats) : 'N/A'}`);
    console.log(`- Changed files: ${diffData.changedFiles ? diffData.changedFiles.length : 0}`);
    
    if (!diffData.diff) {
      console.log('\nWARNING: Combined diff returned no diff content!');
    }
    
  } catch (error) {
    console.error('Error testing endpoints:', error.message);
    console.log('\nMake sure the Crystal app is running on port 3001');
  }
}

// Only test endpoints if the app is running
const http = require('http');
http.get('http://localhost:3001/health', (res) => {
  if (res.statusCode === 200) {
    testEndpoints();
  } else {
    console.log('\nCrystal app not running on port 3001, skipping API tests');
  }
}).on('error', () => {
  console.log('\nCrystal app not running on port 3001, skipping API tests');
});

db.close();
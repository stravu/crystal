// Debug script to check execution diff retrieval
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Use the same database path as the app
const dbPath = path.join(os.homedir(), '.ccc', 'sessions.db');
console.log('Opening database:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Test session ID
  const sessionId = '83b61994-3532-488c-9cd6-cf29f45b0353';
  
  // Get execution diffs directly from database
  const query = `
    SELECT * FROM execution_diffs 
    WHERE session_id = ? 
    ORDER BY execution_sequence ASC
  `;
  
  const rows = db.prepare(query).all(sessionId);
  console.log(`\nFound ${rows.length} execution diffs for session ${sessionId}\n`);
  
  rows.forEach(row => {
    console.log(`Execution #${row.execution_sequence} (ID: ${row.id}):`);
    console.log(`  Files changed: ${row.stats_files_changed}`);
    console.log(`  Additions: ${row.stats_additions}, Deletions: ${row.stats_deletions}`);
    console.log(`  Has git_diff: ${row.git_diff ? 'YES' : 'NO'}`);
    console.log(`  Git diff length: ${row.git_diff ? row.git_diff.length : 0}`);
    console.log(`  Files changed array: ${row.files_changed}`);
    console.log('');
  });
  
  // Test the conversion that happens in the app
  console.log('\nTesting data conversion as done in the app:');
  const convertedRows = rows.map(row => {
    return {
      id: row.id,
      session_id: row.session_id,
      prompt_marker_id: row.prompt_marker_id,
      execution_sequence: row.execution_sequence,
      git_diff: row.git_diff,
      files_changed: row.files_changed ? JSON.parse(row.files_changed) : [],
      stats_additions: row.stats_additions,
      stats_deletions: row.stats_deletions,
      stats_files_changed: row.stats_files_changed,
      before_commit_hash: row.before_commit_hash,
      after_commit_hash: row.after_commit_hash,
      timestamp: row.timestamp
    };
  });
  
  console.log('Converted rows:', JSON.stringify(convertedRows, null, 2));
  
  db.close();
} catch (error) {
  console.error('Error:', error.message);
  console.log('\nMake sure better-sqlite3 is installed in the main directory:');
  console.log('cd main && npm install');
}
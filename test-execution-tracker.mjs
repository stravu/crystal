// Test the execution tracker logic directly
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(os.homedir(), '.ccc', 'sessions.db');
const db = new Database(dbPath, { readonly: true });

const sessionId = '83b61994-3532-488c-9cd6-cf29f45b0353';

// Simulate what getExecutionDiffs does
const rows = db.prepare(`
  SELECT * FROM execution_diffs 
  WHERE session_id = ? 
  ORDER BY execution_sequence ASC
`).all(sessionId);

console.log(`Found ${rows.length} execution diffs\n`);

// Simulate the conversion
const convertedRows = rows.map(row => ({
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
}));

// Simulate what getCombinedDiff does
const diffs = convertedRows
  .filter(exec => exec.git_diff)
  .map(exec => ({
    diff: exec.git_diff,
    stats: {
      additions: exec.stats_additions,
      deletions: exec.stats_deletions,
      filesChanged: exec.stats_files_changed
    },
    changedFiles: exec.files_changed || [],
    beforeHash: exec.before_commit_hash,
    afterHash: exec.after_commit_hash
  }));

console.log(`Filtered to ${diffs.length} diffs with content\n`);

// Simulate combineDiffs
const combinedDiff = {
  diff: diffs.map(d => d.diff).join('\n\n'),
  stats: {
    additions: diffs.reduce((sum, d) => sum + d.stats.additions, 0),
    deletions: diffs.reduce((sum, d) => sum + d.stats.deletions, 0),
    filesChanged: 0
  },
  changedFiles: [],
  beforeHash: diffs[0]?.beforeHash,
  afterHash: diffs[diffs.length - 1]?.afterHash
};

// Calculate unique files
const allFiles = new Set();
diffs.forEach(d => d.changedFiles.forEach(f => allFiles.add(f)));
combinedDiff.changedFiles = Array.from(allFiles);
combinedDiff.stats.filesChanged = combinedDiff.changedFiles.length;

console.log('Combined diff result:');
console.log('- Diff length:', combinedDiff.diff.length);
console.log('- Stats:', combinedDiff.stats);
console.log('- Changed files:', combinedDiff.changedFiles);
console.log('- Hashes:', { before: combinedDiff.beforeHash, after: combinedDiff.afterHash });

db.close();
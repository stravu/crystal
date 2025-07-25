-- Execution diffs table to store git diff data for each prompt execution
CREATE TABLE IF NOT EXISTS execution_diffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  prompt_marker_id INTEGER, -- Link to prompt_markers table
  execution_sequence INTEGER NOT NULL, -- Order of execution within session
  git_diff TEXT, -- The full git diff output
  files_changed TEXT, -- JSON array of changed file paths
  stats_additions INTEGER DEFAULT 0, -- Number of lines added
  stats_deletions INTEGER DEFAULT 0, -- Number of lines deleted
  stats_files_changed INTEGER DEFAULT 0, -- Number of files changed
  before_commit_hash TEXT, -- Git commit hash before changes
  after_commit_hash TEXT, -- Git commit hash after changes (if committed)
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (prompt_marker_id) REFERENCES prompt_markers(id) ON DELETE SET NULL
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_execution_diffs_session_id ON execution_diffs(session_id);
CREATE INDEX IF NOT EXISTS idx_execution_diffs_prompt_marker_id ON execution_diffs(prompt_marker_id);
CREATE INDEX IF NOT EXISTS idx_execution_diffs_timestamp ON execution_diffs(timestamp);
CREATE INDEX IF NOT EXISTS idx_execution_diffs_sequence ON execution_diffs(session_id, execution_sequence);
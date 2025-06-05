-- Prompt markers table to track prompt positions in the terminal output
CREATE TABLE IF NOT EXISTS prompt_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  output_index INTEGER NOT NULL, -- Position in the session_outputs table
  output_line INTEGER, -- Approximate line number in output for scrolling
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_prompt_markers_session_id ON prompt_markers(session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_markers_timestamp ON prompt_markers(timestamp);
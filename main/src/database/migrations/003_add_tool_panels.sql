-- Tool panels table
CREATE TABLE IF NOT EXISTS tool_panels (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT,                    -- JSON string
  metadata TEXT,                  -- JSON string
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Track active panel per session
ALTER TABLE sessions ADD COLUMN active_panel_id TEXT;

-- Index for faster queries
CREATE INDEX idx_tool_panels_session_id ON tool_panels(session_id);
CREATE INDEX idx_tool_panels_type ON tool_panels(type);
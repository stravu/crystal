-- Add archived field to sessions table
ALTER TABLE sessions ADD COLUMN archived BOOLEAN DEFAULT 0;

-- Create index for faster queries on active sessions
CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived);
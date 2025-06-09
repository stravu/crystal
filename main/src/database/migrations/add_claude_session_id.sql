-- Add claude_session_id column to sessions table to store Claude's actual session ID
ALTER TABLE sessions ADD COLUMN claude_session_id TEXT;
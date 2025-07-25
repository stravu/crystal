-- Add is_main_repo column to sessions table to mark sessions that run in the main repository
ALTER TABLE sessions ADD COLUMN is_main_repo BOOLEAN DEFAULT 0;

-- Create index for quick lookup of main repo sessions
CREATE INDEX IF NOT EXISTS idx_sessions_is_main_repo ON sessions(is_main_repo, project_id);
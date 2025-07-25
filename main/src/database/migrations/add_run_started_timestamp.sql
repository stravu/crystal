-- Add run_started_at field to track when Claude actually starts running
ALTER TABLE sessions ADD COLUMN run_started_at TEXT;
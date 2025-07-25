-- Add projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    system_prompt TEXT,
    run_script TEXT,
    active BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add project_id to sessions table
ALTER TABLE sessions ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE;

-- Create index for faster project-based queries
CREATE INDEX idx_sessions_project_id ON sessions(project_id);

-- Migrate existing sessions to a default project if gitRepoPath exists
-- This will be handled in the migration code
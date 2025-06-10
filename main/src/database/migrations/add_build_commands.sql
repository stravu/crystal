-- Add build_script column to projects table
ALTER TABLE projects ADD COLUMN build_script TEXT;

-- Add main_branch column to projects table if it doesn't exist
-- (This might already exist from another migration)
ALTER TABLE projects ADD COLUMN main_branch TEXT DEFAULT 'main';

-- Create a new table for multiple run commands
CREATE TABLE IF NOT EXISTS project_run_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    command TEXT NOT NULL,
    display_name TEXT,
    order_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX idx_project_run_commands_project_id ON project_run_commands(project_id);

-- Migrate existing run_script data to the new table
-- This will be handled in the migration code
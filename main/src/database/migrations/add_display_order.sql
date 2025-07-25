-- Add display_order to projects table
ALTER TABLE projects ADD COLUMN display_order INTEGER;

-- Add display_order to sessions table  
ALTER TABLE sessions ADD COLUMN display_order INTEGER;

-- Initialize display_order for existing projects based on creation order
UPDATE projects 
SET display_order = (
    SELECT COUNT(*) 
    FROM projects p2 
    WHERE p2.created_at <= projects.created_at OR (p2.created_at = projects.created_at AND p2.id <= projects.id)
) - 1
WHERE display_order IS NULL;

-- Initialize display_order for existing sessions within each project
UPDATE sessions 
SET display_order = (
    SELECT COUNT(*) 
    FROM sessions s2 
    WHERE s2.project_id = sessions.project_id 
    AND (s2.created_at < sessions.created_at OR (s2.created_at = sessions.created_at AND s2.id <= sessions.id))
) - 1
WHERE display_order IS NULL;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_display_order ON projects(display_order);
CREATE INDEX IF NOT EXISTS idx_sessions_display_order ON sessions(project_id, display_order);
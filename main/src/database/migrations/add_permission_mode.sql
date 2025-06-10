-- Add permission mode to sessions table
ALTER TABLE sessions ADD COLUMN permission_mode TEXT DEFAULT 'ignore' CHECK(permission_mode IN ('approve', 'ignore'));

-- Also add default permission mode to projects
ALTER TABLE projects ADD COLUMN default_permission_mode TEXT DEFAULT 'ignore' CHECK(default_permission_mode IN ('approve', 'ignore'));
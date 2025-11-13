-- Add project groups table
CREATE TABLE IF NOT EXISTS project_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  system_prompt TEXT,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add project group members table to link projects to groups
CREATE TABLE IF NOT EXISTS project_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  include_in_context INTEGER DEFAULT 1,  -- SQLite uses INTEGER for BOOLEAN (1=true, 0=false)
  role_description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES project_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(group_id, project_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_group_members_group_id ON project_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_project_group_members_project_id ON project_group_members(project_id);

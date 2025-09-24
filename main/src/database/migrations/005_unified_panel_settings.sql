-- Migration 005: Unified panel settings storage
-- Store all panel-specific settings as JSON in tool_panels.settings column

-- Step 1: Add settings column to tool_panels if it doesn't exist
-- Note: This column will store all panel-specific settings as JSON
ALTER TABLE tool_panels ADD COLUMN settings TEXT DEFAULT '{}';

-- Step 2: Migrate existing claude_panel_settings data to the new structure
-- This will move data from the separate table into the JSON settings column
UPDATE tool_panels
SET settings = json_object(
    'model', COALESCE((SELECT model FROM claude_panel_settings WHERE panel_id = tool_panels.id), 'auto'),
    'commitMode', COALESCE((SELECT commit_mode FROM claude_panel_settings WHERE panel_id = tool_panels.id), 0),
    'systemPrompt', (SELECT system_prompt FROM claude_panel_settings WHERE panel_id = tool_panels.id),
    'maxTokens', COALESCE((SELECT max_tokens FROM claude_panel_settings WHERE panel_id = tool_panels.id), 4096),
    'temperature', COALESCE((SELECT temperature FROM claude_panel_settings WHERE panel_id = tool_panels.id), 0.7)
)
WHERE type = 'claude' AND EXISTS (SELECT 1 FROM claude_panel_settings WHERE panel_id = tool_panels.id);

-- Step 3: Drop the claude_panel_settings table as it's no longer needed
DROP TABLE IF EXISTS claude_panel_settings;

-- Step 4: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tool_panels_settings ON tool_panels(type, settings);
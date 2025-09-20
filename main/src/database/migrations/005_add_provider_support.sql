-- Add provider information to sessions table
ALTER TABLE sessions ADD COLUMN provider_id TEXT DEFAULT 'anthropic';
ALTER TABLE sessions ADD COLUMN provider_model TEXT DEFAULT 'claude-3-opus-20240229';
ALTER TABLE sessions ADD COLUMN provider_config TEXT; -- JSON string of provider-specific config

-- Add provider information to tool_panels table
ALTER TABLE tool_panels ADD COLUMN provider_id TEXT DEFAULT 'anthropic';
ALTER TABLE tool_panels ADD COLUMN provider_model TEXT DEFAULT 'claude-3-opus-20240229';

-- Create index for provider queries
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_panels_provider ON tool_panels(provider_id);
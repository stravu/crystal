-- Migration 007: Add model_id and persona_name to prompt_markers
-- This allows displaying which model and persona were used for each prompt

-- Add model_id column (stores the model identifier like "claude-sonnet-4-20250514")
ALTER TABLE prompt_markers ADD COLUMN model_id TEXT;

-- Add persona_name column (stores the display name of the persona)
ALTER TABLE prompt_markers ADD COLUMN persona_name TEXT;

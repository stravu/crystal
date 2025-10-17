-- Migration 008: Add model_id and persona_name to conversation_messages
-- This allows displaying which model and persona were used for each conversation message

-- Add model_id column (stores the model identifier like "claude-sonnet-4-20250514")
ALTER TABLE conversation_messages ADD COLUMN model_id TEXT;

-- Add persona_name column (stores the display name of the persona)
ALTER TABLE conversation_messages ADD COLUMN persona_name TEXT;

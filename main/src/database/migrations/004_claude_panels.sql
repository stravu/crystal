-- Migration 004: Add panel_id columns to Claude tables and create claude_panel_settings table
-- This migration prepares the database for the Claude Code Panel refactor

-- Step 1: Add panel_id columns to all Claude tables (nullable initially for backward compatibility)

-- Add panel_id to session_outputs table
ALTER TABLE session_outputs ADD COLUMN panel_id TEXT;

-- Add panel_id to conversation_messages table  
ALTER TABLE conversation_messages ADD COLUMN panel_id TEXT;

-- Add panel_id to prompt_markers table
ALTER TABLE prompt_markers ADD COLUMN panel_id TEXT;

-- Add panel_id to execution_diffs table
ALTER TABLE execution_diffs ADD COLUMN panel_id TEXT;

-- Step 2: Create claude_panel_settings table for Claude-specific panel configuration
CREATE TABLE claude_panel_settings (
    panel_id TEXT PRIMARY KEY,
    model TEXT DEFAULT 'claude-3-opus-20240229',
    commit_mode BOOLEAN DEFAULT 0,
    system_prompt TEXT,
    max_tokens INTEGER DEFAULT 4096,
    temperature REAL DEFAULT 0.7,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (panel_id) REFERENCES tool_panels(id) ON DELETE CASCADE
);

-- Step 3: Create indexes for efficient queries
CREATE INDEX idx_session_outputs_panel_id ON session_outputs(panel_id);
CREATE INDEX idx_conversation_messages_panel_id ON conversation_messages(panel_id);
CREATE INDEX idx_prompt_markers_panel_id ON prompt_markers(panel_id);
CREATE INDEX idx_execution_diffs_panel_id ON execution_diffs(panel_id);

-- Step 4: Data migration logic will be handled in the database.ts runMigrations() method:
-- 1. For each existing session with Claude data (claude_session_id IS NOT NULL)
-- 2. Create a Claude panel entry in tool_panels table
-- 3. Copy session_id values to panel_id columns in all Claude tables
-- 4. Store existing claude_session_id as claudeResumeId in panel metadata
-- 5. Update sessions.active_panel_id to point to the new Claude panel

-- Note: This is an incremental migration - old session_id columns remain for backward compatibility
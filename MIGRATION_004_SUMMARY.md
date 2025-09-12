# Migration 004: Claude Panels Database Migration

## Overview
This migration adds support for the Claude Code Panel refactor by adding `panel_id` columns to all Claude-related tables and implementing data migration logic to preserve existing Claude data.

## Changes Made

### 1. Migration File
- **Created**: `main/src/database/migrations/004_claude_panels.sql`
- Documents all SQL changes for reference

### 2. Database Schema Changes
- **Added `panel_id TEXT` column to**:
  - `session_outputs`
  - `conversation_messages` 
  - `prompt_markers`
  - `execution_diffs`

- **Created new table**: `claude_panel_settings`
  - Stores Claude-specific panel configuration
  - Links to `tool_panels` via foreign key
  - Includes model, commit_mode, system_prompt, etc.

- **Added indexes** for efficient queries:
  - `idx_session_outputs_panel_id`
  - `idx_conversation_messages_panel_id`
  - `idx_prompt_markers_panel_id`
  - `idx_execution_diffs_panel_id`

### 3. Data Migration Logic
- **Identifies sessions with Claude data** (where `claude_session_id IS NOT NULL`)
- **Creates Claude panel entries** in `tool_panels` table for each existing session
- **Migrates existing data** by copying session_id to panel_id in all Claude tables
- **Preserves Claude session continuity** by storing `claude_session_id` as `claudeResumeId` in panel metadata
- **Sets active panel** by updating `sessions.active_panel_id`

### 4. Migration Safety
- **Incremental migration**: Original session_id columns remain for backward compatibility
- **Idempotent**: Uses `claude_panels_migrated` preference flag to prevent re-running
- **Error handling**: Catches exceptions and allows app to continue if migration fails
- **Type safety**: Added type guard fix for `cwd` property access in terminalPanelManager

## Migration Flow

1. **Check if migration needed**: Looks for `claude_panels_migrated` preference flag
2. **Schema updates**: Add panel_id columns and indexes if they don't exist
3. **Create Claude panel settings table**: If it doesn't exist
4. **Data migration**: For each session with Claude data:
   - Generate unique panel ID
   - Create tool_panels entry with type='claude'
   - Create claude_panel_settings entry
   - Update all Claude tables to link to new panel
   - Set session's active_panel_id
5. **Mark complete**: Set migration flag to prevent re-running

## Success Criteria ✅
- [x] Migration file created
- [x] All Claude tables have panel_id columns  
- [x] Claude panel settings table created
- [x] Data migration logic preserves existing data
- [x] Migration runs without errors (TypeScript compilation successful)
- [x] Fixed existing TypeScript error in terminalPanelManager

## Next Steps
After this migration runs, the application will be ready for the Claude Code Panel refactor implementation in subsequent tasks.
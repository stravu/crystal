# Test Plan for Codex Session ID Fix

## Issue Summary
Codex session IDs were being lost when continuing conversations because:
1. The `CodexPanelState` TypeScript interface was missing the `codexSessionId` field
2. When updating panel state in IPC handlers, the spread operator wasn't preserving the field

## Fix Applied
1. Added `codexSessionId?: string` to the `CodexPanelState` interface
2. Modified both `codexPanel:start` and `codexPanel:continue` IPC handlers to explicitly preserve `codexSessionId`

## Test Steps
1. Start Crystal in development mode
2. Create a new Codex panel
3. Send initial prompt: "The secret word is flamingo"
4. Wait for Codex to respond and session ID to be stored
5. Send second prompt: "What is the secret word?"
6. Check logs to verify session ID is preserved and `resume` command is used
7. Send third prompt: "What was the secret word one more time?"
8. Verify session ID is STILL preserved and resume works

## Expected Results
- First prompt: New session created with session ID
- Second prompt: Uses `codex exec --json resume <session-id>` with SAME session ID
- Third prompt: STILL uses same session ID (not creating a new one)

## Log Markers to Check
- `[session-id-debug] ✅ Found Codex session ID:` - Should show same ID for prompts 2 and 3
- `[DB-DEBUG] Panel state after update:` - Should show `codexSessionId` preserved
- `codex exec --json resume` - Command should use same session ID

## Success Criteria
✅ Session ID persists across multiple conversation turns
✅ Each continue uses `resume` command with the original session ID
✅ No new session IDs are created after the first one

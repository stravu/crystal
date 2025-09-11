# Tool Panel System - Post-Migration Cleanup Plan

## Overview

This document outlines all cleanup tasks to be performed after the tool panel system migration is complete and stable. These tasks remove deprecated code, consolidate functionality, and clean up the database schema.

## Cleanup Phases

### Phase 1: Remove Old Terminal Tab System (After Terminal Panel Stable)

#### Frontend Components to Remove

1. **Terminal View Mode from ViewTabs**
   - File: `frontend/src/components/session/ViewTabs.tsx`
   - Remove: Terminal tab and associated unread activity tracking
   - Update: ViewMode type definition to exclude 'terminal'

2. **Terminal-specific Logic in SessionInput Components**
   - Files: 
     - `frontend/src/components/session/SessionInput.tsx`
     - `frontend/src/components/session/SessionInputWithImages.tsx`
   - Remove: All `viewMode === 'terminal'` conditional logic
   - Remove: Terminal-specific placeholders and button states
   - Remove: Terminal mode indicators in UI

3. **Terminal View in SessionView**
   - File: `frontend/src/components/SessionView.tsx`
   - Remove: Terminal div container (lines ~376-381)
   - Remove: Terminal-specific state management
   - Remove: Terminal XTerm mounting/unmounting logic

4. **Terminal View in ProjectView**
   - File: `frontend/src/components/ProjectView.tsx`
   - Remove: Terminal initialization logic (lines ~300-310)
   - Remove: Terminal view container (lines ~497-530)
   - Remove: `initTerminal()` function and terminal state

5. **Update ViewMode Type**
   ```typescript
   // frontend/src/hooks/useSessionView.ts
   // BEFORE:
   export type ViewMode = 'richOutput' | 'changes' | 'terminal' | 'logs' | 'editor' | 'messages';
   
   // AFTER:
   export type ViewMode = 'richOutput' | 'changes' | 'logs' | 'editor' | 'messages';
   ```

#### Backend Services to Remove

1. **TerminalSessionManager Service**
   - File: `main/src/services/terminalSessionManager.ts`
   - Action: DELETE entire file (replaced by TerminalPanelManager)
   - Update: Remove all imports and references in other files

2. **Terminal IPC Handlers in Session Module**
   - File: `main/src/ipc/session.ts`
   - Remove handlers:
     - `sessions:terminal:create`
     - `sessions:terminal:input`
     - `sessions:terminal:resize`
     - `sessions:terminal:pre-create`
   - Keep: Session-specific handlers unrelated to terminal

3. **Terminal References in SessionManager**
   - File: `main/src/services/sessionManager.ts`
   - Remove: `terminalManager` property and imports
   - Remove: Terminal-specific methods
   - Update: Constructor to not require TerminalSessionManager

### Phase 2: Remove Old Claude Tab System (After Claude Panel Implementation)

#### Frontend Components to Remove

1. **RichOutput and Messages View Modes**
   - File: `frontend/src/components/session/ViewTabs.tsx`
   - Remove: 'Output' and 'Messages' tabs
   - Remove: Associated unread activity tracking

2. **Old Claude Output Components** (Move to panels/claude/)
   - Files to move/refactor:
     - `frontend/src/components/session/RichOutputView.tsx` → `panels/claude/ClaudeOutputView.tsx`
     - `frontend/src/components/session/MessagesView.tsx` → `panels/claude/ClaudeMessagesView.tsx`
     - `frontend/src/components/session/RichOutputWithSidebar.tsx` → `panels/claude/ClaudeOutputWithSidebar.tsx`
     - `frontend/src/components/session/RichOutputSettingsPanel.tsx` → `panels/claude/ClaudeSettingsPanel.tsx`

3. **Update ViewMode Type**
   ```typescript
   // frontend/src/hooks/useSessionView.ts
   // FINAL:
   export type ViewMode = 'changes' | 'logs' | 'editor';
   ```

4. **Claude-specific Logic in SessionView**
   - File: `frontend/src/components/SessionView.tsx`
   - Remove: RichOutput and Messages view containers
   - Remove: Claude output state management
   - Update: Redirect to Claude panel when needed

#### Backend Services to Refactor

1. **ClaudeCodeManager Refactoring**
   - File: `main/src/services/claudeCodeManager.ts`
   - Extract: Core process management to `panels/claude/ClaudeProcessManager.ts`
   - Keep: Legacy wrapper for backward compatibility (temporary)
   - Move: Event handling to `panels/claude/ClaudeEventHandler.ts`

2. **Claude IPC Handlers Migration**
   - File: `main/src/ipc/session.ts`
   - Move handlers to: `main/src/ipc/panels/claude.ts`
     - `sessions:send-input` → `panels:claude:input`
     - `sessions:continue` → `panels:claude:continue`
     - `sessions:stop` → `panels:claude:stop`
   - Add: Compatibility redirects during transition

### Phase 3: Database Schema Cleanup

#### Tables to Remove (After Full Migration)

1. **Deprecated Columns in Sessions Table**
   ```sql
   -- Migration: 005_cleanup_panel_migration.sql
   
   -- Step 1: Remove terminal-specific columns (if any exist)
   -- Note: Check if these columns exist before removal
   
   -- Step 2: Remove claude_panel_id after migration complete
   -- This was only needed for tracking during migration
   ALTER TABLE sessions DROP COLUMN IF EXISTS claude_panel_id;
   
   -- Step 3: Remove deprecated columns
   ALTER TABLE sessions DROP COLUMN IF EXISTS main_branch;  -- Already deprecated
   ALTER TABLE sessions DROP COLUMN IF EXISTS autoCommit;    -- Legacy field
   ```

2. **Cleanup Orphaned Data**
   ```sql
   -- Remove orphaned session outputs (safety check)
   DELETE FROM session_outputs 
   WHERE session_id NOT IN (SELECT id FROM sessions);
   
   -- Remove orphaned conversation messages
   DELETE FROM conversation_messages 
   WHERE session_id NOT IN (SELECT id FROM sessions);
   
   -- Remove orphaned prompt markers
   DELETE FROM prompt_markers 
   WHERE session_id NOT IN (SELECT id FROM sessions);
   
   -- Remove orphaned tool panels
   DELETE FROM tool_panels 
   WHERE session_id NOT IN (SELECT id FROM sessions);
   ```

3. **Index Optimization**
   ```sql
   -- Add composite indexes for panel queries
   CREATE INDEX IF NOT EXISTS idx_tool_panels_session_type 
   ON tool_panels(session_id, type);
   
   -- Drop unused indexes (verify they're not used first)
   -- DROP INDEX IF EXISTS idx_old_terminal_sessions;
   ```

### Phase 4: Code Organization Cleanup

#### Directory Structure Reorganization

1. **Move Panel Components to Proper Structure**
   ```
   frontend/src/components/
   ├── panels/
   │   ├── claude/
   │   │   ├── ClaudePanel.tsx
   │   │   ├── ClaudePanelInput.tsx
   │   │   ├── ClaudePanelOutput.tsx
   │   │   ├── ClaudeMessagesView.tsx
   │   │   ├── ClaudeRichOutput.tsx
   │   │   └── index.ts
   │   ├── terminal/
   │   │   ├── TerminalPanel.tsx
   │   │   ├── TerminalPanelInput.tsx
   │   │   └── index.ts
   │   └── shared/
   │       ├── PanelTabBar.tsx
   │       ├── PanelContainer.tsx
   │       └── PanelTypes.ts
   └── session/  (cleanup)
       ├── (remove terminal/claude specific components)
       └── (keep only session management components)
   ```

2. **Backend Services Organization**
   ```
   main/src/services/
   ├── panels/
   │   ├── claude/
   │   │   ├── ClaudePanelManager.ts
   │   │   ├── ClaudeProcessManager.ts
   │   │   ├── ClaudeEventHandler.ts
   │   │   └── types.ts
   │   ├── terminal/
   │   │   ├── TerminalPanelManager.ts
   │   │   └── types.ts
   │   └── base/
   │       ├── PanelManager.ts
   │       ├── PanelEventBus.ts
   │       └── types.ts
   └── (remove old managers after migration)
       ├── terminalSessionManager.ts (DELETE)
       └── claudeCodeManager.ts (REFACTOR/MOVE)
   ```

### Phase 5: Configuration and Settings Cleanup

1. **Remove Migration Feature Flags**
   ```typescript
   // config.json - Remove after stable
   {
     // DELETE THESE:
     "useClaudePanels": true,
     "migrationMode": "panels-only",
     "enableLegacyTerminal": false
   }
   ```

2. **Update Help Documentation**
   - File: `frontend/src/components/Help.tsx`
   - Remove: References to old terminal tab
   - Remove: References to Output/Messages tabs
   - Update: Document new panel system
   - Add: Panel-specific keyboard shortcuts

3. **Update CLAUDE.md Documentation**
   - Remove: Old terminal tab documentation
   - Remove: Output/Messages view documentation
   - Update: Reflect new panel-based architecture
   - Add: Panel system user guide

### Phase 6: Performance Optimizations

1. **Remove Unnecessary Event Listeners**
   ```typescript
   // Remove duplicate event handling between old and new systems
   // Consolidate all events through PanelEventBus
   ```

2. **Memory Optimization**
   - Remove cached terminal states from old system
   - Remove duplicate output storage
   - Optimize panel state persistence

3. **Bundle Size Reduction**
   - Remove unused dependencies (if any)
   - Tree-shake removed components
   - Optimize imports

## Testing Before Cleanup

### Pre-cleanup Checklist

- [ ] All users migrated to panel system
- [ ] No reports of data loss
- [ ] Panel system stable for 2+ weeks
- [ ] All features working in new system
- [ ] Backward compatibility tested
- [ ] Rollback tested and verified

### Cleanup Testing

1. **Unit Tests to Update/Remove**
   - Remove: Terminal tab tests
   - Remove: Old Claude view tests
   - Update: Session tests to use panels
   - Add: Comprehensive panel tests

2. **Integration Tests**
   - Test session creation with panels
   - Test data migration integrity
   - Test panel switching performance
   - Verify no orphaned processes

3. **Performance Tests**
   - Memory usage comparison
   - Load time improvements
   - Panel switching speed
   - Process cleanup verification

## Rollback Plan for Cleanup

If issues arise during cleanup:

1. **Git Reversion**: All cleanup in separate commits
2. **Database Backup**: Before schema changes
3. **Feature Flags**: Re-enable if needed
4. **Quick Fixes**: Keep compatibility layer ready

## Timeline

### Week 1-2: Stabilization
- Monitor panel system in production
- Fix any critical bugs
- Gather user feedback

### Week 3: Phase 1 (Terminal Cleanup)
- Remove old terminal system
- Test thoroughly
- Update documentation

### Week 4: Phase 2 (Claude Migration)
- Implement Claude panels
- Move components
- Test migration

### Week 5: Phase 3-4 (Database & Organization)
- Clean database schema
- Reorganize code structure
- Optimize performance

### Week 6: Phase 5-6 (Final Cleanup)
- Remove feature flags
- Update all documentation
- Final testing

## Success Metrics

- **Code Reduction**: Target 30% less code
- **Bundle Size**: Target 20% smaller
- **Memory Usage**: Target 25% reduction
- **Maintenance**: Simpler codebase
- **Performance**: Faster panel switching

## Notes

### Do NOT Remove Until Confirmed Stable
1. Session outputs table (contains Claude history)
2. Conversation messages table (needed for continuations)
3. Core session management logic
4. Git worktree integration

### Keep for Backward Compatibility (Temporary)
1. Old IPC handlers with redirects
2. Database migration rollback scripts
3. Legacy configuration options
4. Compatibility layer classes

### Safe to Remove Immediately
1. Deprecated warning messages
2. Unused imports
3. Commented-out code
4. Test files for removed features

## Conclusion

This cleanup plan ensures a smooth transition from the old tab-based system to the new panel architecture. By following these phases, we minimize risk while maximizing the benefits of the new system. The cleanup will result in a cleaner, more maintainable codebase with better performance and extensibility.
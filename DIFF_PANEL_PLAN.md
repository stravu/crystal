# Diff Panel REFACTOR Plan

## Context: Tool Panel System Already Implemented

The Tool Panel system (Phases 1 & 2) has been successfully implemented as described in TOOL_PANEL_DESIGN.md. Terminal, Claude, Editor, and Logs panels are working/planned. Diff will be a special always-present panel type.

**THIS IS A REFACTOR, NOT A REWRITE.** Every existing file will be moved to its new location and adapted minimally. No components will be rewritten from scratch.

**Core Principle**: MOVE files first, EDIT them second, NEVER rewrite.

## Special Characteristics of Diff Panel

**ALWAYS-PRESENT BEHAVIOR**: Unlike other panel types, the Diff panel has unique characteristics:
- **Always exists**: One diff panel is automatically created with each session
- **Cannot be closed**: No close button on the diff panel tab
- **Cannot create more**: Users cannot create additional diff panels
- **Auto-created**: Created automatically when session is created
- **Persistent**: Survives all session operations

## Refactoring Goals

1. **100% Code Preservation**: Move ALL existing Diff files to new locations intact
2. **Always-Present Panel**: Ensure diff panel always exists for each session
3. **Uncloseable**: Remove ability to close diff panel
4. **Singleton**: Prevent creation of multiple diff panels
5. **Event Integration**: React to file changes from other panels

## Current State Analysis

### Existing Diff Files (TO BE MOVED, NOT REWRITTEN)

#### Frontend Files to Move
- `frontend/src/components/DiffView.tsx` → Move to `frontend/src/components/panels/diff/DiffView.tsx`
- `frontend/src/components/CombinedDiffView.tsx` → Move to `frontend/src/components/panels/diff/CombinedDiffView.tsx`
- `frontend/src/components/DiffViewer.tsx` → Move to `frontend/src/components/panels/diff/DiffViewer.tsx`
- `frontend/src/components/GitOperations.tsx` → Keep in place, connects to diff panel
- Any diff-related utilities → Move to `frontend/src/utils/diff/`

#### Backend Files
- Git diff logic in `main/src/ipc/git.ts` → Keep, add panel routing
- Diff generation in `main/src/services/` → Extract to `main/src/services/panels/diff/diffManager.ts`

## Panel Type Definition

Add to `shared/types/panels.ts`:

```typescript
// Add to ToolPanelType enum
export type ToolPanelType = 'terminal' | 'claude' | 'editor' | 'logs' | 'diff';

// Add DiffPanelState interface
export interface DiffPanelState {
  lastRefresh?: string;            // Last time diff was refreshed
  currentDiff?: string;             // Cached diff content
  filesChanged?: number;            // Number of files changed
  insertions?: number;              // Lines added
  deletions?: number;               // Lines deleted
  isDiffStale?: boolean;            // Needs refresh indicator
  viewMode?: 'split' | 'unified';  // Diff view preference
  showWhitespace?: boolean;         // Show whitespace changes
  contextLines?: number;            // Lines of context
  commitSha?: string;               // Specific commit being viewed
}

// Add to PANEL_CAPABILITIES
diff: {
  canEmit: ['diff:refreshed'],
  canConsume: ['files:changed', 'git:commit', 'editor:file_saved'],
  requiresProcess: false,           // No background process
  singleton: true,                  // Only one diff panel
  permanent: true                   // Cannot be closed (NEW FLAG)
}
```

## Implementation Plan

### Step 1: File Movement and Directory Setup

**Goal**: Move all Diff-related files to their new panel locations without breaking imports.

1. Create directory: `frontend/src/components/panels/diff/`
2. Use `git mv` to move files:
   ```bash
   git mv frontend/src/components/DiffView.tsx frontend/src/components/panels/diff/DiffView.tsx
   git mv frontend/src/components/CombinedDiffView.tsx frontend/src/components/panels/diff/CombinedDiffView.tsx
   git mv frontend/src/components/DiffViewer.tsx frontend/src/components/panels/diff/DiffViewer.tsx
   ```
3. Update all imports throughout the codebase
4. Run build to verify no broken imports

### Step 2: Auto-Creation Logic

Modify session creation to always create a diff panel:

```typescript
// In main/src/services/sessionManager.ts
async createSession(request: CreateSessionRequest) {
  // ... existing session creation logic ...
  
  // Auto-create diff panel for new session
  await panelManager.createPanel({
    sessionId: session.id,
    type: 'diff',
    title: 'Diff',
    metadata: {
      permanent: true  // Mark as permanent panel
    }
  });
  
  return session;
}
```

### Step 3: Create Diff Panel Wrapper

Create `frontend/src/components/panels/diff/DiffPanel.tsx`:

```typescript
import React, { useEffect, useState, useCallback } from 'react';
import { CombinedDiffView } from './CombinedDiffView';
import { DiffPanelProps } from '../../../types/panelComponents';
import { usePanelStore } from '../../../stores/panelStore';

export const DiffPanel: React.FC<DiffPanelProps> = ({ 
  panel, 
  isActive 
}) => {
  const [diffContent, setDiffContent] = useState<string>('');
  const [isStale, setIsStale] = useState(false);
  const diffState = panel.state?.customState as DiffPanelState;
  
  // Listen for file change events from other panels
  useEffect(() => {
    const subscription = panelEventBus.subscribe({
      panelId: panel.id,
      eventTypes: ['files:changed', 'editor:file_saved', 'git:commit'],
      callback: (event) => {
        // Show refresh indicator
        setIsStale(true);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [panel.id]);
  
  // Load diff content
  const loadDiff = useCallback(async () => {
    const diff = await window.electron.invoke('git:getDiff', panel.sessionId);
    setDiffContent(diff);
    setIsStale(false);
    
    // Update panel state
    await window.electron.invoke('panels:update', panel.id, {
      state: {
        customState: {
          currentDiff: diff,
          lastRefresh: new Date().toISOString(),
          isDiffStale: false
        }
      }
    });
  }, [panel.sessionId, panel.id]);
  
  // Auto-refresh when becoming active and stale
  useEffect(() => {
    if (isActive && isStale) {
      loadDiff();
    }
  }, [isActive, isStale, loadDiff]);
  
  // Initial load
  useEffect(() => {
    if (isActive) {
      loadDiff();
    }
  }, [isActive]);
  
  return (
    <div className="diff-panel h-full">
      {isStale && !isActive && (
        <div className="stale-indicator">
          Files changed - switch to diff panel to refresh
        </div>
      )}
      <CombinedDiffView 
        diffContent={diffContent}
        onRefresh={loadDiff}
        viewMode={diffState?.viewMode || 'unified'}
        // Pass existing props
      />
    </div>
  );
};
```

### Step 4: Modify Panel Tab Bar for Permanent Panel

Edit `frontend/src/components/panels/PanelTabBar.tsx`:

```typescript
// In the panel tab rendering
{panels.map((panel) => {
  const isPermanent = panel.metadata?.permanent === true;
  
  return (
    <div key={panel.id} className={cn(/* existing classes */)}>
      {getPanelIcon(panel.type)}
      <span className="ml-2 text-sm">{panel.title}</span>
      {!isPermanent && (  // Only show close button for non-permanent panels
        <button
          className="ml-2 p-0.5 hover:bg-gray-600 rounded"
          onClick={(e) => handlePanelClose(e, panel)}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
})}

// In the Add Tool dropdown, filter out 'diff'
const availablePanelTypes = Object.keys(PANEL_CAPABILITIES)
  .filter(type => {
    const capability = PANEL_CAPABILITIES[type];
    return !capability.permanent;  // Don't show permanent panels in dropdown
  }) as ToolPanelType[];
```

### Step 5: Migration for Existing Sessions

Add migration to ensure all existing sessions have diff panels:

```typescript
// In database migration or app startup
async function ensureDiffPanels() {
  const sessions = await db.getAllSessions();
  
  for (const session of sessions) {
    const panels = await panelManager.getPanelsForSession(session.id);
    const hasDiff = panels.some(p => p.type === 'diff');
    
    if (!hasDiff) {
      // Create diff panel for existing session
      await panelManager.createPanel({
        sessionId: session.id,
        type: 'diff',
        title: 'Diff',
        metadata: { permanent: true }
      });
    }
  }
}
```

### Step 6: Event Integration

Diff panel reacts to events from other panels:

```typescript
// Event reactions
- 'files:changed' from Terminal → Show stale indicator
- 'editor:file_saved' from Editor → Show stale indicator  
- 'git:commit' from Claude → Auto-refresh
- 'claude:completed' from Claude → Check for changes

// Stale indicator behavior
- Shows badge on panel tab when not active
- Auto-refreshes when panel becomes active
- Manual refresh button always available
```

### Step 7: Optimize Performance

Since diff panel is always present:

1. **Lazy Loading**: Only compute diff when panel is active
2. **Caching**: Cache diff content to avoid recomputation
3. **Incremental Updates**: For small changes, update incrementally
4. **Virtual Rendering**: For large diffs, use virtualization

## Migration Strategy

### For Existing Sessions
- On first load, auto-create diff panel if missing
- Diff tab in main view can be hidden
- Existing diff functionality preserved

### For New Sessions
- Diff panel created automatically
- Always visible in panel bar
- Cannot be removed

## User Experience

### Panel Behavior
- **Always There**: Users can rely on diff panel existing
- **Quick Access**: Single click to view current changes
- **Smart Refresh**: Knows when content is stale
- **No Accidents**: Cannot accidentally close it
- **Consistent Position**: Always in predictable location

### Interaction Patterns
1. Make changes in editor/terminal → Diff shows stale indicator
2. Switch to diff panel → Auto-refreshes
3. Review changes → Use for git operations
4. Panel remains available for next review cycle

### Visual Indicators
- Stale badge when changes detected
- Refresh spinner during update
- File count badge showing number of changed files
- Color coding for additions/deletions

## Benefits of Always-Present Diff Panel

1. **Reliability**: Users know diff is always available
2. **Consistency**: Same location every time
3. **Awareness**: Stale indicators show when review needed
4. **Safety**: Can't lose diff view accidentally
5. **Integration**: Central hub for reviewing all changes

## Risk Mitigation

### Risk: Performance Impact
- Lazy computation only when viewed
- Efficient diff algorithms
- Caching of computed diffs
- Debounced refresh on rapid changes

### Risk: User Confusion
- Clear visual distinction (no close button)
- Helpful tooltip explaining permanent status
- Documentation in help system

### Risk: Screen Space
- Can be minimized but not closed
- Compact tab design
- Keyboard shortcut to toggle

## Testing Checklist

- [ ] Move all diff files with git mv
- [ ] Update all import paths
- [ ] Create DiffPanel wrapper component
- [ ] Implement auto-creation on session create
- [ ] Remove close button for diff panel
- [ ] Test stale indicator on file changes
- [ ] Test auto-refresh when activated
- [ ] Test event consumption from other panels
- [ ] Ensure migration creates diff for existing sessions
- [ ] Verify performance with large diffs

## Success Criteria

1. All existing diff code moved, not rewritten
2. Diff panel automatically created with every session
3. Diff panel cannot be closed or removed
4. Only one diff panel exists per session
5. Panel shows stale indicator when files change
6. Auto-refreshes when becoming active
7. All existing diff functionality preserved

## Implementation Notes

### Panel Ordering
Consider fixing diff panel position:
- Always first in panel list
- OR always last in panel list
- Provides consistent muscle memory

### Keyboard Shortcuts
- Quick toggle to diff panel (e.g., Cmd+D)
- Refresh diff (e.g., Cmd+R when in diff panel)
- Switch between split/unified view

### Status Bar Integration
- Show diff summary in status bar
- Quick indicator of uncommitted changes
- Click to jump to diff panel

## Conclusion

This refactor plan moves the existing diff implementation into the panel system as a special permanent panel type. The key differentiator is that the diff panel is always present and cannot be closed, providing a reliable location for reviewing changes. By wrapping the existing diff components and adding permanent panel logic, we preserve all current functionality while ensuring the diff view is always available when needed. The panel's event integration allows it to intelligently track when it needs refreshing, providing a seamless experience for reviewing changes across all other panel activities.
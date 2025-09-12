# Editor Panel REFACTOR Plan

## Context: Tool Panel System Already Implemented

The Tool Panel system (Phases 1 & 2) has been successfully implemented as described in TOOL_PANEL_DESIGN.md. Terminal panels are working, and Claude panels are planned. Editor will be the third panel type added to this system.

**THIS IS A REFACTOR, NOT A REWRITE.** Every existing file will be moved to its new location and adapted minimally. No components will be rewritten from scratch.

**Core Principle**: MOVE files first, EDIT them second, NEVER rewrite.

## Refactoring Goals

1. **100% Code Preservation**: Move ALL existing Editor files to new locations intact
2. **Multiple Editor Instances**: Enable multiple editor panels per session
3. **Independent File Editing**: Each editor panel can edit different files simultaneously
4. **Minimal Changes**: Only modify what's necessary for panel integration
5. **Clean File Organization**: Organize existing editor files into panel module structure

## Current State Analysis

### Existing Editor Files (TO BE MOVED, NOT REWRITTEN)

#### Frontend Files to Move
- `frontend/src/components/EditorView.tsx` → Move to `frontend/src/components/panels/editor/EditorView.tsx`
- `frontend/src/components/MonacoEditor.tsx` → Move to `frontend/src/components/panels/editor/MonacoEditor.tsx` (if exists)
- Any editor-related utilities → Move to `frontend/src/utils/editor/`

#### Backend Files (if any)
- File reading/writing handlers in `main/src/ipc/` → Extract to `main/src/ipc/editorPanel.ts`

## Panel Type Definition

Add to `shared/types/panels.ts`:

```typescript
// Add to ToolPanelType enum
export type ToolPanelType = 'terminal' | 'claude' | 'editor';

// Add EditorPanelState interface
export interface EditorPanelState {
  filePath?: string;              // Currently open file
  content?: string;               // File content (for unsaved changes)
  isDirty?: boolean;              // Has unsaved changes
  cursorPosition?: {              // Cursor location
    line: number;
    column: number;
  };
  scrollPosition?: number;        // Scroll position
  language?: string;              // File language for syntax highlighting
  readOnly?: boolean;             // Read-only mode
  fontSize?: number;              // Editor font size preference
  theme?: string;                 // Editor theme preference
}

// Add to PANEL_CAPABILITIES
editor: {
  canEmit: ['editor:file_saved', 'editor:file_changed'],
  canConsume: ['files:changed'],  // React to file system changes
  requiresProcess: false,          // No background process needed
  singleton: false                 // Multiple editors allowed
}
```

## Implementation Plan

### Step 1: File Movement and Directory Setup

**Goal**: Move all Editor-related files to their new panel locations without breaking imports.

1. Create directory: `frontend/src/components/panels/editor/`
2. Use `git mv` to move each file:
   ```bash
   git mv frontend/src/components/EditorView.tsx frontend/src/components/panels/editor/EditorView.tsx
   git mv frontend/src/components/MonacoEditor.tsx frontend/src/components/panels/editor/MonacoEditor.tsx
   ```
3. Update all imports throughout the codebase
4. Run build to verify no broken imports

### Step 2: Create Editor Panel Wrapper

Create `frontend/src/components/panels/editor/EditorPanel.tsx`:

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import { EditorView } from './EditorView';
import { EditorPanelProps } from '../../../types/panelComponents';

export const EditorPanel: React.FC<EditorPanelProps> = ({ 
  panel, 
  isActive 
}) => {
  // Extract existing editor state from EditorView
  // Wrap with panel-specific logic
  
  const editorState = panel.state?.customState as EditorPanelState;
  
  // Load file if specified
  useEffect(() => {
    if (editorState?.filePath && isActive) {
      // Load file content
    }
  }, [editorState?.filePath, isActive]);
  
  // Save state on changes
  const handleContentChange = useCallback((content: string) => {
    // Update panel state with new content
  }, [panel.id]);
  
  return (
    <EditorView 
      {...existingProps}
      // Pass panel-specific props
    />
  );
};
```

### Step 3: Update Panel Container

Edit `frontend/src/components/panels/PanelContainer.tsx`:

```typescript
// Add import
const EditorPanel = lazy(() => import('./editor/EditorPanel'));

// Add case in switch statement
case 'editor':
  return <EditorPanel panel={panel} isActive={isActive} />;
```

### Step 4: Add File Opening Logic

Create ability to open files in new editor panels:

1. Add context menu or button to file tree: "Open in Editor Panel"
2. Create IPC handler for file operations:
   ```typescript
   ipcMain.handle('editor:openFile', async (_, panelId, filePath) => {
     const content = await fs.readFile(filePath, 'utf-8');
     await panelManager.updatePanel(panelId, {
       state: { 
         customState: { 
           filePath, 
           content,
           isDirty: false 
         }
       }
     });
     return content;
   });
   ```

### Step 5: Handle Multiple Editor Instances

1. Each editor panel maintains its own:
   - File path
   - Content buffer
   - Undo/redo history
   - Cursor position
   - Scroll position

2. Panel title shows filename:
   ```typescript
   const getEditorTitle = (panel: ToolPanel) => {
     const state = panel.state?.customState as EditorPanelState;
     if (state?.filePath) {
       const filename = path.basename(state.filePath);
       return state.isDirty ? `${filename} *` : filename;
     }
     return 'Editor';
   };
   ```

### Step 6: Add Save Functionality

1. Keyboard shortcut (Cmd/Ctrl+S) when editor panel is active
2. Save button in panel UI
3. Auto-save option
4. Dirty state indicator (asterisk in tab title)

### Step 7: Event Integration

Editor panels should:
- Emit `editor:file_saved` when saving
- Emit `editor:file_changed` when content changes
- Listen to `files:changed` to reload if external changes detected

## Migration Strategy

### For Existing Sessions
- Editor tab in main view remains functional
- Users can optionally create editor panels
- Gradual transition as users adopt panel workflow

### For New Sessions
- Editor still available in main tabs initially
- "Open in Panel" options added throughout UI
- Eventually deprecate main tab editor

## User Experience

### Opening Files
1. **From file tree**: Right-click → "Open in Editor Panel"
2. **From terminal**: Click on file path → "Open in Editor Panel"
3. **From Claude output**: Click on file reference → "Open in Editor Panel"
4. **Drag and drop**: Drag file to panel bar → Creates new editor panel

### Panel Management
- Multiple files open simultaneously in different panels
- Quick switching between files via panel tabs
- Close panel with unsaved changes → Prompt to save
- Reopen recently closed files

### Persistence
- Open editor panels restored on app restart
- Unsaved changes preserved (with warning indicator)
- Cursor and scroll positions maintained

## Benefits of Panel-Based Editors

1. **Side-by-side editing**: Edit multiple files simultaneously
2. **Context preservation**: Each file keeps its own state
3. **Better workflow**: Quick switching between related files
4. **Independence**: One crashed editor doesn't affect others
5. **Flexibility**: Arrange editors as needed for task

## Risk Mitigation

### Risk: Lost Work
- Auto-save drafts to temporary location
- Confirm before closing with unsaved changes
- Recover unsaved work on crash

### Risk: Performance with Many Editors
- Lazy load Monaco editor instances
- Virtualize inactive editor panels
- Limit maximum open editors (configurable)

### Risk: Confusion with Main Tab Editor
- Clear visual distinction
- Helpful tooltips explaining difference
- Gradual migration path

## Testing Checklist

- [ ] Move all editor files with git mv
- [ ] Update all import paths
- [ ] Create EditorPanel wrapper component
- [ ] Integrate with PanelContainer
- [ ] Test opening files in panels
- [ ] Test multiple editor instances
- [ ] Test save functionality
- [ ] Test persistence across restart
- [ ] Test event emission/consumption
- [ ] Verify no regression in main tab editor

## Success Criteria

1. All existing editor code moved, not rewritten
2. Multiple editor panels can be opened
3. Each panel can edit different files
4. State persists across app restarts
5. No functionality lost from original editor
6. Clean separation in panel module structure

## Conclusion

This refactor plan moves the existing editor implementation into the panel system with minimal changes. By wrapping the existing EditorView component rather than rewriting it, we preserve all current functionality while enabling multiple independent editor instances. The key is to MOVE first, then ADD the minimal panel integration layer, never REWRITE existing code.
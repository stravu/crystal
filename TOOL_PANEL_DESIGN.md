# Tool Panel System Design - Phases 1 & 2

## Design Goals

The tool panel system must achieve these core objectives:

1. **Maximum State Persistence**: UX state should be preserved across application restarts
   - Terminal scrollback, command history, working directories
   - Panel positions, titles, and configurations
   - User's working context should survive crashes/restarts

2. **Clean Event Management**: Updates and events should flow predictably
   - No circular dependencies or event loops
   - Clear producer/consumer relationships
   - Panels remain isolated unless explicitly connected

3. **Efficient Memory Usage**: Lazy initialization and rendering
   - Panels don't start until first viewed (no auto-startup on app launch)
   - Active panels can execute in background without rendering
   - Only the currently visible panel consumes rendering resources

4. **Extensible Architecture**: Support for future panel types
   - Well-defined panel interface contract
   - Panels as self-contained modules
   - Clear separation of concerns
   - Consistent lifecycle management

## Overview

This document outlines the implementation of a flexible, multi-instance tool panel system for Crystal. The new panel system will be displayed as a **second tab bar underneath the existing ViewTabs bar**, and initially we will **only migrate the Terminal view** to the new system.

### What's Actually Being Built in Phase 1-2

✅ **IMPLEMENTED**:
- Multi-instance Terminal panels (multiple terminals per session)
- Panel tab bar UI (appears below main tabs when Terminal is selected)
- Basic panel lifecycle (create, delete, switch, rename)
- Terminal-specific events (`terminal:command_executed`, `terminal:exit`, `files:changed`)
- Panel state persistence in database
- Event bus infrastructure for future panel communication

❌ **NOT IMPLEMENTED** (shown for design reference only):
- Claude panels (remains in original tab system)
- Diff panels (remains in original tab system)
- Editor panels (remains in original tab system)
- Logs panels (remains in original tab system)
- Cross-panel event consumption (terminals don't react to other panels yet)
- Advanced Claude/Diff event types (these are theoretical for future phases)

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│                     Session Header                           │
├─────────────────────────────────────────────────────────────┤
│   Existing Tab Bar (Output | Diff | Terminal* | Logs | Editor)│
├─────────────────────────────────────────────────────────────┤
│   NEW Panel Tab Bar (Terminal 1 | Terminal 2 | + Add Panel)  │
├─────────────────────────────────────────────────────────────┤
│                   Active Panel Content                       │
└─────────────────────────────────────────────────────────────┘

* Terminal in the existing bar will show/hide the panel tab bar
```

## Phase 1: Core Infrastructure

### 1.1 Type Definitions

Create `shared/types/panels.ts`:

```typescript
export interface ToolPanel {
  id: string;                    // Unique panel instance ID (uuid)
  sessionId: string;             // Associated session/worktree
  type: ToolPanelType;          // 'terminal' for now
  title: string;                 // Display title (e.g., "Terminal 1")
  state: ToolPanelState;         // Panel-specific state
  metadata: ToolPanelMetadata;   // Creation time, position, etc.
}

export type ToolPanelType = 'terminal'; // Will expand later

export interface ToolPanelState {
  isActive: boolean;
  isPinned?: boolean;
  hasBeenViewed?: boolean;       // Track if panel has ever been viewed
  customState?: TerminalPanelState;
}

export interface TerminalPanelState {
  // Basic state (implemented in Phase 1-2)
  isInitialized?: boolean;       // Whether PTY process has been started
  cwd?: string;                  // Current working directory
  shellType?: string;            // bash, zsh, etc.
  
  // Enhanced persistence (can be added incrementally)
  scrollbackBuffer?: string[];   // Full terminal output history
  commandHistory?: string[];     // Commands entered by user
  environmentVars?: Record<string, string>; // Modified env vars
  dimensions?: { cols: number; rows: number }; // Terminal size
  lastActiveCommand?: string;    // Command running when closed
  cursorPosition?: { x: number; y: number }; // Cursor location
  selectionText?: string;        // Any selected text
  lastActivityTime?: string;     // For "idle since" indicators
  
  // Advanced persistence options
  tmuxSessionId?: string;        // For true session persistence via tmux
  outputSizeLimit?: number;      // Max lines to persist (default: 10000)
}

export interface ToolPanelMetadata {
  createdAt: string;
  lastActiveAt: string;
  position: number;              // Tab order
}

export interface CreatePanelRequest {
  sessionId: string;
  type: ToolPanelType;
  title?: string;                // Optional custom title
  initialState?: any;
}

export interface UpdatePanelRequest {
  panelId: string;
  updates: Partial<ToolPanel>;
}

// Panel Event System Types
export interface PanelEvent {
  type: PanelEventType;
  source: {
    panelId: string;
    panelType: ToolPanelType;
    sessionId: string;
  };
  data: any;
  timestamp: string;
}

// ⚠️ IMPORTANT: Event Types Implementation Status
// ================================================
// For Phase 1-2, ONLY terminal events will be implemented.
// The full list below shows the FUTURE event system design to demonstrate
// how different panel types will communicate once migrated.
//
// IMPLEMENTED IN PHASE 1-2:
//   - terminal:command_executed
//   - terminal:exit  
//   - files:changed (emitted by terminal when file operations detected)
//
// NOT IMPLEMENTED (shown for future reference only):
//   - All claude:* events
//   - All diff:* events
//   - All git:* events

export type PanelEventType = 
  // Terminal panel events (✅ IMPLEMENTED IN PHASE 1-2)
  | 'terminal:command_executed'  // When a command is run in terminal
  | 'terminal:exit'              // When terminal process exits
  | 'files:changed'              // When terminal detects file system changes

export interface PanelEventSubscription {
  panelId: string;
  eventTypes: PanelEventType[];
  callback: (event: PanelEvent) => void;
}

export interface PanelCapabilities {
  canEmit: PanelEventType[];      // Events this panel type can produce
  canConsume: PanelEventType[];   // Events this panel type listens to
  requiresProcess?: boolean;       // Whether panel needs a background process
  singleton?: boolean;             // Only one instance allowed per session
}

// Panel Registry - Currently only terminal is implemented
export const PANEL_CAPABILITIES: Record<ToolPanelType, PanelCapabilities> = {
  terminal: {
    canEmit: ['terminal:command_executed', 'terminal:exit', 'files:changed'],
    canConsume: [], // Terminal doesn't consume events in Phase 1-2
    requiresProcess: true,
    singleton: false
  },
  // Future panel types will be added here when migrated
};
```

### 1.2 Database Schema

Create migration `main/src/database/migrations/003_add_tool_panels.sql`:

```sql
-- Tool panels table
CREATE TABLE IF NOT EXISTS tool_panels (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT,                    -- JSON string
  metadata TEXT,                  -- JSON string
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Track active panel per session
ALTER TABLE sessions ADD COLUMN active_panel_id TEXT;

-- Index for faster queries
CREATE INDEX idx_tool_panels_session_id ON tool_panels(session_id);
CREATE INDEX idx_tool_panels_type ON tool_panels(type);
```

### 1.3 Database Methods

Add to `main/src/database/index.ts`:

```typescript
// Panel operations
createPanel(data: {
  id: string;
  sessionId: string;
  type: string;
  title: string;
  state?: any;
  metadata?: any;
}): void

updatePanel(panelId: string, updates: {
  title?: string;
  state?: any;
  metadata?: any;
}): void

deletePanel(panelId: string): void

getPanel(panelId: string): ToolPanel | null

getPanelsForSession(sessionId: string): ToolPanel[]

setActivePanel(sessionId: string, panelId: string | null): void

getActivePanel(sessionId: string): ToolPanel | null

// Cleanup when session is deleted
deletePanelsForSession(sessionId: string): void
```

### 1.4 Panel Event Bus

Create `main/src/services/panelEventBus.ts`:

```typescript
export class PanelEventBus {
  private subscriptions = new Map<string, PanelEventSubscription[]>();
  private eventHistory: PanelEvent[] = [];
  
  subscribe(subscription: PanelEventSubscription): () => void
  emit(event: PanelEvent): void
  getRecentEvents(eventTypes?: PanelEventType[], limit = 10): PanelEvent[]
  unsubscribePanel(panelId: string): void
  
  // Key behaviors:
  // - Routes events to subscribed panels (excluding source panel)
  // - Maintains event history for debugging (last 100 events)
  // - Prevents circular events (panels don't receive their own events)
  // - Emits events to frontend via IPC for UI updates
}
```

### 1.5 Panel Manager Service

Create `main/src/services/panelManager.ts`:

```typescript
export class PanelManager {
  async createPanel(request: CreatePanelRequest): Promise<ToolPanel>
  async deletePanel(panelId: string): Promise<void>
  async updatePanel(panelId: string, updates: Partial<ToolPanel>): Promise<void>
  async setActivePanel(sessionId: string, panelId: string): Promise<void>
  getPanel(panelId: string): ToolPanel | undefined
  getPanelsForSession(sessionId: string): ToolPanel[]
  async emitPanelEvent(panelId: string, eventType: PanelEventType, data: any): Promise<void>
  
  // Key behaviors:
  // - Auto-generates panel titles (Terminal 1, Terminal 2, etc.)
  // - Manages panel lifecycle and database persistence
  // - Tracks initialization state for lazy loading
  // - Cleans up event subscriptions on panel deletion
  // - Automatically activates another panel when active panel is deleted
  // - Emits IPC events for frontend synchronization
}
```

### 1.6 IPC Handlers

Add to `main/src/ipc/panels.ts`:

```typescript
import { ipcMain } from 'electron';
import { panelManager } from '../services/panelManager';
import { terminalPanelManager } from '../services/terminalPanelManager';

export function registerPanelHandlers() {
  ipcMain.handle('panels:create', async (_, request) => {
    return panelManager.createPanel(request);
  });

  ipcMain.handle('panels:delete', async (_, panelId) => {
    return panelManager.deletePanel(panelId);
  });

  ipcMain.handle('panels:update', async (_, panelId, updates) => {
    return panelManager.updatePanel(panelId, updates);
  });

  ipcMain.handle('panels:list', async (_, sessionId) => {
    return panelManager.getPanelsForSession(sessionId);
  });

  ipcMain.handle('panels:setActive', async (_, sessionId, panelId) => {
    return panelManager.setActivePanel(sessionId, panelId);
  });

  ipcMain.handle('panels:getActive', async (_, sessionId) => {
    const db = getDatabase();
    return db.getActivePanel(sessionId);
  });

  // Panel initialization tracking (for lazy loading)
  ipcMain.handle('panels:initialize', async (_, panelId) => {
    const panel = panelManager.getPanel(panelId);
    if (!panel) throw new Error('Panel not found');
    
    // Mark panel as viewed if not already
    if (!panel.state.hasBeenViewed) {
      await panelManager.updatePanel(panelId, {
        state: { ...panel.state, hasBeenViewed: true }
      });
    }
    
    // Initialize terminal if not already initialized
    if (panel.type === 'terminal' && !panel.state.customState?.isInitialized) {
      const cwd = panel.state.customState?.cwd || process.cwd();
      terminalPanelManager.initializeTerminal(panel, cwd);
      
      await panelManager.updatePanel(panelId, {
        state: {
          ...panel.state,
          customState: { 
            ...panel.state.customState, 
            isInitialized: true 
          }
        }
      });
    }
    
    return panel;
  });

  ipcMain.handle('panels:checkInitialized', async (_, panelId) => {
    const panel = panelManager.getPanel(panelId);
    return panel?.state.customState?.isInitialized || false;
  });

  // Event-related handlers
  ipcMain.handle('panels:emitEvent', async (_, panelId, eventType, data) => {
    return panelManager.emitPanelEvent(panelId, eventType, data);
  });

  ipcMain.handle('panels:getRecentEvents', async (_, eventTypes, limit) => {
    return panelEventBus.getRecentEvents(eventTypes, limit);
  });
}
```

### 1.7 Terminal Panel Process Manager

The Terminal Panel Manager handles PTY process lifecycle and state management.

**Service Responsibilities:**

1. **Process Management**
   - Maintain map of panel ID to PTY process instances
   - Spawn PTY processes only on first view (lazy initialization)
   - Track initialization state for each terminal
   - Handle process termination and cleanup

2. **Key Methods**
   - `initializeTerminal(panel, cwd)` - Lazy init on first view
   - `isTerminalInitialized(panelId)` - Check if PTY is running
   - `writeToTerminal(panelId, data)` - Send input to PTY
   - `resizeTerminal(panelId, cols, rows)` - Update PTY dimensions
   - `destroyTerminal(panelId)` - Terminate PTY process
   - `saveTerminalState(panelId)` - Capture current state
   - `restoreTerminalState(panel, state)` - Apply saved state

3. **State Persistence**
   - Save scrollback buffer (last 10,000 lines)
   - Capture command history
   - Store working directory
   - Remember terminal dimensions
   - Track last active command

4. **Event Emission**
   - Emit `terminal:command_executed` when commands run
   - Emit `files:changed` when file operations detected
   - Emit `terminal:exit` when process terminates

5. **Key Behaviors**
   - No auto-start on app launch (requires user interaction)
   - Processes continue running when panels are hidden
   - State persists across app restarts
   - Graceful cleanup on panel deletion

## Terminal State Persistence (Using Option 1: Simple State Restoration)

### What Gets Persisted

The terminal panel system persists comprehensive state to maintain user context across restarts:

- **Working directory** - Current directory path
- **Scrollback buffer** - Last 10,000 lines of terminal output
- **Command history** - Previously entered commands
- **Terminal dimensions** - Cols/rows for consistent layout
- **Panel metadata** - Title, position, creation time
- **Last active command** - Command running when closed

### Implementation Strategy

1. **Save State**
   - Capture terminal state when panel is unmounted
   - Store as JSON in database `state` column
   - Limit scrollback to 10,000 lines to control size
   - Include timestamp for restoration indicator

2. **Restore State**
   - Load saved state when panel is remounted
   - Write scrollback buffer back to terminal
   - Show "Session Restored from [timestamp]" message
   - Restore dimensions and working directory
   - Display last active command if any

### Storage Considerations

- **Database Storage**: JSON serialization in SQLite
- **Size Management**: Configurable scrollback limits
- **Compression**: Optional for large buffers
- **Performance**: Lazy-load on panel activation

### User Experience

When reopening Crystal with persisted terminals:

1. Terminal panels recreate with saved configurations
2. Previous work visible via restored scrollback
3. Clear restoration indicator with timestamp
4. Working directory maintained from last session
5. Context preserved for seamless continuation

## Phase 2: UI Components

### 2.1 Panel Store

Create `frontend/src/stores/panelStore.ts`:

```typescript
import { create } from 'zustand';
import { ToolPanel, CreatePanelRequest, PanelEvent, PanelEventType } from '../../shared/types/panels';

interface PanelStore {
  // State
  panels: Map<string, ToolPanel[]>;        // sessionId -> panels
  activePanels: Map<string, string>;       // sessionId -> active panelId
  panelEvents: PanelEvent[];               // Recent events
  eventSubscriptions: Map<string, Set<PanelEventType>>; // panelId -> subscribed events
  
  // Actions
  createPanel: (request: CreatePanelRequest) => Promise<ToolPanel>;
  deletePanel: (panelId: string) => Promise<void>;
  updatePanel: (panelId: string, updates: Partial<ToolPanel>) => Promise<void>;
  setActivePanel: (sessionId: string, panelId: string) => Promise<void>;
  loadPanelsForSession: (sessionId: string) => Promise<void>;
  
  // Event actions
  emitPanelEvent: (panelId: string, eventType: PanelEventType, data: any) => Promise<void>;
  subscribeToPanelEvents: (panelId: string, eventTypes: PanelEventType[]) => void;
  unsubscribeFromPanelEvents: (panelId: string, eventTypes: PanelEventType[]) => void;
  
  // Getters
  getSessionPanels: (sessionId: string) => ToolPanel[];
  getActivePanel: (sessionId: string) => ToolPanel | undefined;
  getPanelEvents: (panelId?: string, eventTypes?: PanelEventType[]) => PanelEvent[];
  
  // Event handlers
  handlePanelCreated: (panel: ToolPanel) => void;
  handlePanelDeleted: (data: { panelId: string; sessionId: string }) => void;
  handlePanelUpdated: (panel: ToolPanel) => void;
  handlePanelActivated: (data: { sessionId: string; panelId: string }) => void;
  handlePanelEvent: (event: PanelEvent) => void;
}

export const usePanelStore = create<PanelStore>((set, get) => ({
  panels: new Map(),
  activePanels: new Map(),
  panelEvents: [],
  eventSubscriptions: new Map(),

  createPanel: async (request) => {
    const panel = await window.electron.invoke('panels:create', request);
    get().handlePanelCreated(panel);
    return panel;
  },

  deletePanel: async (panelId) => {
    await window.electron.invoke('panels:delete', panelId);
  },

  updatePanel: async (panelId, updates) => {
    await window.electron.invoke('panels:update', panelId, updates);
  },

  setActivePanel: async (sessionId, panelId) => {
    await window.electron.invoke('panels:setActive', sessionId, panelId);
    set((state) => {
      const newActivePanels = new Map(state.activePanels);
      newActivePanels.set(sessionId, panelId);
      return { activePanels: newActivePanels };
    });
  },

  loadPanelsForSession: async (sessionId) => {
    const panels = await window.electron.invoke('panels:list', sessionId);
    const activePanel = await window.electron.invoke('panels:getActive', sessionId);
    
    set((state) => {
      const newPanels = new Map(state.panels);
      newPanels.set(sessionId, panels);
      
      const newActivePanels = new Map(state.activePanels);
      if (activePanel) {
        newActivePanels.set(sessionId, activePanel.id);
      }
      
      return { panels: newPanels, activePanels: newActivePanels };
    });
  },

  getSessionPanels: (sessionId) => {
    return get().panels.get(sessionId) || [];
  },

  getActivePanel: (sessionId) => {
    const panels = get().panels.get(sessionId) || [];
    const activePanelId = get().activePanels.get(sessionId);
    return panels.find(p => p.id === activePanelId);
  },

  handlePanelCreated: (panel) => {
    set((state) => {
      const newPanels = new Map(state.panels);
      const sessionPanels = newPanels.get(panel.sessionId) || [];
      newPanels.set(panel.sessionId, [...sessionPanels, panel]);
      
      const newActivePanels = new Map(state.activePanels);
      newActivePanels.set(panel.sessionId, panel.id);
      
      return { panels: newPanels, activePanels: newActivePanels };
    });
  },

  handlePanelDeleted: (data) => {
    set((state) => {
      const newPanels = new Map(state.panels);
      const sessionPanels = newPanels.get(data.sessionId) || [];
      newPanels.set(data.sessionId, sessionPanels.filter(p => p.id !== data.panelId));
      return { panels: newPanels };
    });
  },

  handlePanelUpdated: (panel) => {
    set((state) => {
      const newPanels = new Map(state.panels);
      const sessionPanels = newPanels.get(panel.sessionId) || [];
      const index = sessionPanels.findIndex(p => p.id === panel.id);
      if (index !== -1) {
        sessionPanels[index] = panel;
        newPanels.set(panel.sessionId, [...sessionPanels]);
      }
      return { panels: newPanels };
    });
  },

  handlePanelActivated: (data) => {
    set((state) => {
      const newActivePanels = new Map(state.activePanels);
      newActivePanels.set(data.sessionId, data.panelId);
      return { activePanels: newActivePanels };
    });
  },

  // Event methods
  emitPanelEvent: async (panelId, eventType, data) => {
    await window.electron.invoke('panels:emitEvent', panelId, eventType, data);
  },

  subscribeToPanelEvents: (panelId, eventTypes) => {
    set((state) => {
      const newSubscriptions = new Map(state.eventSubscriptions);
      const existing = newSubscriptions.get(panelId) || new Set();
      eventTypes.forEach(type => existing.add(type));
      newSubscriptions.set(panelId, existing);
      return { eventSubscriptions: newSubscriptions };
    });
  },

  unsubscribeFromPanelEvents: (panelId, eventTypes) => {
    set((state) => {
      const newSubscriptions = new Map(state.eventSubscriptions);
      const existing = newSubscriptions.get(panelId);
      if (existing) {
        eventTypes.forEach(type => existing.delete(type));
        if (existing.size === 0) {
          newSubscriptions.delete(panelId);
        } else {
          newSubscriptions.set(panelId, existing);
        }
      }
      return { eventSubscriptions: newSubscriptions };
    });
  },

  getPanelEvents: (panelId, eventTypes) => {
    const events = get().panelEvents;
    let filtered = events;
    
    if (panelId) {
      filtered = filtered.filter(e => e.source.panelId === panelId);
    }
    
    if (eventTypes && eventTypes.length > 0) {
      filtered = filtered.filter(e => eventTypes.includes(e.type));
    }
    
    return filtered;
  },

  handlePanelEvent: (event) => {
    set((state) => {
      const newEvents = [...state.panelEvents, event];
      // Keep only last 100 events
      if (newEvents.length > 100) {
        newEvents.shift();
      }
      return { panelEvents: newEvents };
    });
    
    // Check if any panels are subscribed to this event type
    const subscriptions = get().eventSubscriptions;
    subscriptions.forEach((eventTypes, panelId) => {
      if (eventTypes.has(event.type) && panelId !== event.source.panelId) {
        // Panel is subscribed to this event type
        // Trigger re-render or specific action based on panel type
        console.log(`Panel ${panelId} received event ${event.type}`, event);
      }
    });
  }
}));
```

### 2.2 Panel Tab Bar Component

Create `frontend/src/components/panels/PanelTabBar.tsx`:

```typescript
import React from 'react';
import { Plus, X, Terminal } from 'lucide-react';
import { ToolPanel } from '../../../shared/types/panels';
import { cn } from '../../utils/cn';
import { usePanelStore } from '../../stores/panelStore';

interface PanelTabBarProps {
  sessionId: string;
  panels: ToolPanel[];
  activePanel?: ToolPanel;
  onPanelSelect: (panel: ToolPanel) => void;
  onPanelClose: (panel: ToolPanel) => void;
  onPanelCreate: () => void;
}

export const PanelTabBar: React.FC<PanelTabBarProps> = ({
  sessionId,
  panels,
  activePanel,
  onPanelSelect,
  onPanelClose,
  onPanelCreate
}) => {
  const getPanelIcon = (type: string) => {
    switch (type) {
      case 'terminal':
        return <Terminal className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center bg-surface-tertiary border-t border-border-primary px-2 h-9">
      {/* Panel tabs */}
      <div className="flex items-center flex-1 overflow-x-auto scrollbar-thin">
        {panels.map((panel) => (
          <div
            key={panel.id}
            className={cn(
              "group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer transition-all",
              "border-r border-border-secondary hover:bg-surface-hover",
              activePanel?.id === panel.id
                ? "bg-surface-secondary text-text-primary font-medium"
                : "text-text-secondary"
            )}
            onClick={() => onPanelSelect(panel)}
          >
            {getPanelIcon(panel.type)}
            <span className="max-w-[120px] truncate">{panel.title}</span>
            
            {/* Close button */}
            <button
              className={cn(
                "ml-1 p-0.5 rounded hover:bg-surface-hover",
                "opacity-0 group-hover:opacity-100 transition-opacity"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onPanelClose(panel);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add panel button */}
      <button
        className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all"
        onClick={onPanelCreate}
        title="Add new terminal"
      >
        <Plus className="w-3 h-3" />
        <span>New Terminal</span>
      </button>
    </div>
  );
};
```

### 2.3 Terminal Panel Component

The Terminal Panel manages individual terminal instances within the panel system.

**Component Requirements:**

1. **Lazy Initialization**
   - Terminal PTY process must NOT start until panel is first viewed
   - Check initialization state via `panels:checkInitialized` IPC call
   - Initialize on first view via `panels:initialize` IPC call
   - Track initialization state to prevent duplicate spawning

2. **Mounting/Unmounting Behavior**
   - Mount XTerm.js instance only when `isActive = true`
   - Unmount and dispose XTerm when `isActive = false` to save memory
   - PTY process continues running even when XTerm is unmounted
   - Save terminal state (scrollback, dimensions) before unmounting
   - Restore terminal state when remounting

3. **State Persistence**
   - Persist last 10,000 lines of scrollback buffer
   - Save command history, working directory, terminal dimensions
   - Show "Session Restored" indicator when remounting with saved state
   - Update panel state in database on unmount via `panels:update`

4. **Component Interface**
   ```typescript
   interface TerminalPanelProps {
     panel: ToolPanel;           // Panel configuration
     sessionId: string;          // Current session ID
     workingDirectory: string;   // Initial working directory
     isActive: boolean;          // Controls mounting/unmounting
   }
   ```

5. **Lifecycle Management**
   - **On First View**: Initialize PTY process, create XTerm instance
   - **On Activate**: Mount XTerm, restore scrollback, connect I/O
   - **On Deactivate**: Save state, unmount XTerm, keep PTY running
   - **On Destroy**: Terminate PTY process, clean up resources

6. **I/O Handling**
   - Connect to backend terminal process via IPC
   - Handle input/output streams between XTerm and PTY
   - Manage resize events and terminal dimensions
   - Clean up event listeners on unmount

### 2.4 Panel Container Component

Create `frontend/src/components/panels/PanelContainer.tsx`:

```typescript
import React from 'react';
import { ToolPanel } from '../../../shared/types/panels';
import { TerminalPanel } from './types/TerminalPanel';

interface PanelContainerProps {
  panel: ToolPanel;
  sessionId: string;
  workingDirectory: string;
  isActive: boolean;  // Critical: Only render when active
}

export const PanelContainer: React.FC<PanelContainerProps> = ({
  panel,
  sessionId,
  workingDirectory,
  isActive
}) => {
  // Suspend rendering for inactive panels (terminal keeps running)
  if (!isActive) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        <div className="text-center">
          <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <div>Terminal Running in Background</div>
          <div className="text-xs mt-1">Click tab to view</div>
        </div>
      </div>
    );
  }
  
  // Render appropriate panel based on type
  switch (panel.type) {
    case 'terminal':
      return (
        <TerminalPanel
          panel={panel}
          sessionId={sessionId}
          workingDirectory={workingDirectory}
          isActive={isActive}  // Pass isActive to enable mounting/unmounting
        />
      );
    default:
      return (
        <div className="h-full flex items-center justify-center text-text-secondary">
          Unknown panel type: {panel.type}
        </div>
      );
  }
};
```

### 2.5 Integration with SessionView

Modify `frontend/src/components/SessionView.tsx`:

```typescript
// Add to imports
import { usePanelStore } from '../stores/panelStore';
import { PanelTabBar } from './panels/PanelTabBar';
import { PanelContainer } from './panels/PanelContainer';

// Inside SessionView component
const {
  panels,
  activePanel,
  createPanel,
  deletePanel,
  setActivePanel,
  loadPanelsForSession
} = usePanelStore();

// Load panels when session changes
useEffect(() => {
  if (activeSession?.id) {
    loadPanelsForSession(activeSession.id);
  }
}, [activeSession?.id]);

// Get panels for current session
const sessionPanels = panels.get(activeSession?.id || '') || [];
const currentActivePanel = activePanel.get(activeSession?.id || '');

// In the render, modify the terminal view section:
{hook.viewMode === 'terminal' && (
  <>
    {/* Panel tab bar - shown below the main tab bar */}
    <PanelTabBar
      sessionId={activeSession.id}
      panels={sessionPanels}
      activePanel={currentActivePanel}
      onPanelSelect={(panel) => setActivePanel(activeSession.id, panel.id)}
      onPanelClose={(panel) => deletePanel(panel.id)}
      onPanelCreate={() => createPanel({
        sessionId: activeSession.id,
        type: 'terminal'
      })}
    />
    
    {/* Panel content - Keep all panels in DOM but only render active one */}
    <div className="flex-1 min-h-0">
      {sessionPanels.length > 0 ? (
        <>
          {sessionPanels.map(panel => (
            <div
              key={panel.id}
              className={panel.id === currentActivePanel?.id ? 'h-full' : 'hidden'}
            >
              <PanelContainer
                panel={panel}
                sessionId={activeSession.id}
                workingDirectory={activeSession.worktreePath}
                isActive={panel.id === currentActivePanel?.id}  // Only active panel renders XTerm
              />
            </div>
          ))}
        </>
      ) : (
        <div className="h-full flex items-center justify-center text-text-secondary">
          <button
            onClick={() => createPanel({
              sessionId: activeSession.id,
              type: 'terminal'
            })}
            className="px-4 py-2 bg-surface-secondary hover:bg-surface-hover rounded-lg transition-colors"
          >
            Create Terminal
          </button>
        </div>
      )}
    </div>
  </>
)}
```

## Migration Strategy

### Initial State
When Crystal starts:
1. Terminal panels are restored from database but **NOT started**
2. Panels show "Click to Start" until first viewed
3. No PTY processes spawn until user clicks on a terminal tab

When user clicks Terminal tab for a session:
1. Check if any panels exist for the session
2. If no panels exist, create one terminal panel (but don't start it)
3. When user clicks on the panel tab, initialize the terminal

### Memory Efficiency
- Opening Crystal with 20 sessions doesn't spawn 20 terminals
- Each terminal only starts when explicitly viewed
- Once started, terminals continue running in background
- Switching away only suspends rendering, not execution

## Event Flow

```
User clicks "New Terminal" → 
  Frontend calls createPanel() → 
    IPC to backend → 
      PanelManager creates DB entry → 
      TerminalPanelManager spawns PTY → 
      Events emitted → 
    Frontend updates state → 
  New tab appears in UI
```

## Testing Checklist

### Phase 1 Testing
- [ ] Database migration runs successfully
- [ ] Panel CRUD operations work via IPC
- [ ] Panel state persists across app restarts
- [ ] Events propagate correctly
- [ ] Terminal working directory persists
- [ ] Terminal panel recreates on app restart

### Phase 2 Testing
- [ ] Panel tab bar renders below main tabs
- [ ] Can create multiple terminal panels
- [ ] Can switch between panels
- [ ] Can close panels (with confirmation if running)
- [ ] Terminal input/output works correctly
- [ ] Panels maintain independent state
- [ ] Panel titles are editable
- [ ] Overflow handling works (scrollable tabs)

### Terminal Persistence Testing
- [ ] Basic state (cwd, title) persists on close/reopen
- [ ] Scrollback buffer saves and restores (if implemented)
- [ ] Command history persists (if implemented)
- [ ] "Session restored" indicator appears
- [ ] Terminal dimensions maintained
- [ ] Large scrollback buffers handle gracefully (>10K lines)

## Panel Event System Overview

> **⚠️ NOTE**: In Phase 1-2, only Terminal panels and their events are implemented.  
> The event system infrastructure is built to support future panel types.

### How It Works

1. **Event Emission**: Panels emit events when significant actions occur
2. **Event Bus**: Routes events to subscribed panels (excluding the source)
3. **Event Consumption**: Panels subscribe to relevant event types and react accordingly

### Phase 1-2 Implementation (Terminal Only)

**Terminal Panel Capabilities**:
- Emits: `terminal:command_executed`, `terminal:exit`, `files:changed`
- Consumes: None (terminals are independent in Phase 1-2)
- Detects file operations and emits `files:changed` for commands like touch, rm, mv, cp, mkdir

### Event Flow Example

```
Terminal Panel 1 executes 'touch newfile.txt':
  → Emits 'terminal:command_executed' with command data
  → Emits 'files:changed' because it detected a file operation

Terminal Panel 2 (if subscribed to events - not in Phase 1-2):
  → Would receive the events but Terminal doesn't consume events yet
  → Each terminal remains independent

Future: When Diff panel is migrated:
  → Would receive 'files:changed' event
  → Would show refresh indicator
```

### Future Panel Integration

When other panel types are migrated:

**Claude Panels**: Will emit `claude:completed`, `claude:file_modified` events
**Diff Panels**: Will consume file change events to show refresh indicators
**Cross-Panel Communication**: Events will enable panels to react to each other's actions while maintaining independence

## Event System Benefits

1. **Decoupled Communication**: Panels don't need direct references to each other
2. **Flexible Subscriptions**: Panels only listen to events they care about
3. **Historical Context**: Event history helps debug and understand panel interactions
4. **Future Extensibility**: New panel types can easily integrate with existing events
5. **User Feedback**: Events can trigger UI updates showing panel relationships
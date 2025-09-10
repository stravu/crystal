# Tool Panel System Design - Phases 1 & 2

## Overview

This document outlines the implementation of a flexible, multi-instance tool panel system for Crystal. The tool panel bar is **always visible** as a second tab bar underneath the existing ViewTabs bar. Terminal has been **removed from the main tabs** and is now exclusively available through the tool panel system.

The tool panel bar features:
- Always visible below the main tab bar (Output | Diff | Logs | Editor)
- Multiple terminal instances per session
- Dropdown "Add Tool" button for creating panels (currently only Terminal, expandable for future panel types)
- When a panel is active, it replaces the main view content
- When no panel is active, the main view content (Output, Diff, etc.) is shown

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
│   Existing Tab Bar (Output | Diff | Logs | Editor)           │
├─────────────────────────────────────────────────────────────┤
│   Tool Panel Bar (Terminal 1 | Terminal 2 | [+] Add Tool)    │
├─────────────────────────────────────────────────────────────┤
│        Active Panel Content (or Main View Content)           │
└─────────────────────────────────────────────────────────────┘

Notes:
- Terminal has been REMOVED from the existing tab bar
- Tool Panel Bar is ALWAYS visible below the main tabs
- When no panel is active, the main view content is shown
- [+] Add Tool button shows a dropdown menu of available panel types
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
  
  subscribe(subscription: PanelEventSubscription): () => void;
  emit(event: PanelEvent): void;
  getRecentEvents(eventTypes?: PanelEventType[], limit = 10): PanelEvent[];
  unsubscribePanel(panelId: string): void;
}
```

**Key behaviors:**
- Routes events to subscribed panels (excluding source panel)
- Maintains event history for debugging (last 100 events)
- Prevents circular events (panels don't receive their own events)
- Emits events to frontend via IPC for UI updates

### 1.5 Panel Manager Service

Create `main/src/services/panelManager.ts`:

```typescript
export class PanelManager {
  async createPanel(request: CreatePanelRequest): Promise<ToolPanel>;
  async deletePanel(panelId: string): Promise<void>;
  async updatePanel(panelId: string, updates: Partial<ToolPanel>): Promise<void>;
  async setActivePanel(sessionId: string, panelId: string): Promise<void>;
  getPanel(panelId: string): ToolPanel | undefined;
  getPanelsForSession(sessionId: string): ToolPanel[];
  async emitPanelEvent(panelId: string, eventType: PanelEventType, data: any): Promise<void>;
}
```

**Key behaviors:**
- Auto-generates panel titles (Terminal 1, Terminal 2, etc.)
- Manages panel lifecycle and database persistence
- Tracks initialization state for lazy loading
- Cleans up event subscriptions on panel deletion
- Automatically activates another panel when active panel is deleted
- Emits IPC events for frontend synchronization

### 1.6 IPC Handlers

Add to `main/src/ipc/panels.ts`:

```typescript
export function registerPanelHandlers() {
  // Panel CRUD operations
  ipcMain.handle('panels:create', async (_, request) => panelManager.createPanel(request));
  ipcMain.handle('panels:delete', async (_, panelId) => panelManager.deletePanel(panelId));
  ipcMain.handle('panels:update', async (_, panelId, updates) => panelManager.updatePanel(panelId, updates));
  ipcMain.handle('panels:list', async (_, sessionId) => panelManager.getPanelsForSession(sessionId));
  ipcMain.handle('panels:setActive', async (_, sessionId, panelId) => panelManager.setActivePanel(sessionId, panelId));
  ipcMain.handle('panels:getActive', async (_, sessionId) => db.getActivePanel(sessionId));
  
  // Panel initialization (lazy loading)
  ipcMain.handle('panels:initialize', async (_, panelId) => {
    // Mark panel as viewed and initialize terminal if needed
    // Implementation details...
  });
  
  ipcMain.handle('panels:checkInitialized', async (_, panelId) => {
    const panel = panelManager.getPanel(panelId);
    return panel?.state.customState?.isInitialized || false;
  });
  
  // Event handlers
  ipcMain.handle('panels:emitEvent', async (_, panelId, eventType, data) => {
    return panelManager.emitPanelEvent(panelId, eventType, data);
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

## Terminal State Persistence (Simple State Restoration)

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

### 2.1 Panel Store Types and Implementation

Create `frontend/src/types/panelStore.ts` for interfaces:

```typescript
import { ToolPanel, CreatePanelRequest, PanelEvent, PanelEventType } from '../../shared/types/panels';

export interface PanelStore {
  // State (using plain objects instead of Maps for React reactivity)
  panels: Record<string, ToolPanel[]>;        // sessionId -> panels
  activePanels: Record<string, string>;       // sessionId -> active panelId
  panelEvents: PanelEvent[];                  // Recent events
  eventSubscriptions: Record<string, Set<PanelEventType>>; // panelId -> subscribed events
  
  // Synchronous state update actions
  setPanels: (sessionId: string, panels: ToolPanel[]) => void;
  setActivePanel: (sessionId: string, panelId: string) => void;
  addPanel: (panel: ToolPanel) => void;
  removePanel: (sessionId: string, panelId: string) => void;
  updatePanelState: (panel: ToolPanel) => void;
  
  // Event actions  
  subscribeToPanelEvents: (panelId: string, eventTypes: PanelEventType[]) => void;
  unsubscribeFromPanelEvents: (panelId: string, eventTypes: PanelEventType[]) => void;
  addPanelEvent: (event: PanelEvent) => void;
  
  // Getters
  getSessionPanels: (sessionId: string) => ToolPanel[];
  getActivePanel: (sessionId: string) => ToolPanel | undefined;
  getPanelEvents: (panelId?: string, eventTypes?: PanelEventType[]) => PanelEvent[];
  
}
```

Create `frontend/src/services/panelApi.ts` for async operations:

```typescript
import { CreatePanelRequest, ToolPanel } from '../../shared/types/panels';

export const panelApi = {
  async createPanel(request: CreatePanelRequest): Promise<ToolPanel> {
    return window.electron.invoke('panels:create', request);
  },
  
  async deletePanel(panelId: string): Promise<void> {
    return window.electron.invoke('panels:delete', panelId);
  },
  
  async updatePanel(panelId: string, updates: Partial<ToolPanel>): Promise<void> {
    return window.electron.invoke('panels:update', panelId, updates);
  },
  
  async loadPanelsForSession(sessionId: string): Promise<ToolPanel[]> {
    return window.electron.invoke('panels:list', sessionId);
  },
  
  async getActivePanel(sessionId: string): Promise<ToolPanel | null> {
    return window.electron.invoke('panels:getActive', sessionId);
  },
  
  async setActivePanel(sessionId: string, panelId: string): Promise<void> {
    return window.electron.invoke('panels:setActive', sessionId, panelId);
  },
  
  async emitPanelEvent(panelId: string, eventType: string, data: any): Promise<void> {
    return window.electron.invoke('panels:emitEvent', panelId, eventType, data);
  }
};
```

Create `frontend/src/stores/panelStore.ts` for implementation:

```typescript
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { PanelStore } from '../types/panelStore';
import { ToolPanel } from '../../shared/types/panels';

// FIX: Use immer for safe immutable updates
export const usePanelStore = create<PanelStore>()(
  immer((set, get) => ({
    panels: {},
    activePanels: {},
    panelEvents: [],
    eventSubscriptions: {},

    // Pure synchronous state updates
    setPanels: (sessionId, panels) => {
      set((state) => {
        state.panels[sessionId] = panels;
      });
    },

    setActivePanel: (sessionId, panelId) => {
      set((state) => {
        state.activePanels[sessionId] = panelId;
      });
    },

    addPanel: (panel) => {
      set((state) => {
        if (!state.panels[panel.sessionId]) {
          state.panels[panel.sessionId] = [];
        }
        state.panels[panel.sessionId].push(panel);
        state.activePanels[panel.sessionId] = panel.id;
      });
    },

    removePanel: (sessionId, panelId) => {
      set((state) => {
        if (state.panels[sessionId]) {
          state.panels[sessionId] = state.panels[sessionId].filter(p => p.id !== panelId);
        }
        // Clear active panel if it was the removed one
        if (state.activePanels[sessionId] === panelId) {
          delete state.activePanels[sessionId];
        }
      });
    },

    updatePanelState: (panel) => {
      set((state) => {
        const sessionPanels = state.panels[panel.sessionId];
        if (sessionPanels) {
          const index = sessionPanels.findIndex(p => p.id === panel.id);
          if (index !== -1) {
            sessionPanels[index] = panel;
          }
        }
      });
    },

    // Getters remain the same
    getSessionPanels: (sessionId) => get().panels[sessionId] || [],
    getActivePanel: (sessionId) => {
      const panels = get().panels[sessionId] || [];
      return panels.find(p => p.id === get().activePanels[sessionId]);
    },

    // Event management
    subscribeToPanelEvents: (panelId, eventTypes) => {
      set((state) => {
        if (!state.eventSubscriptions[panelId]) {
          state.eventSubscriptions[panelId] = new Set();
        }
        eventTypes.forEach(type => state.eventSubscriptions[panelId].add(type));
      });
    },

    unsubscribeFromPanelEvents: (panelId, eventTypes) => {
      set((state) => {
        if (state.eventSubscriptions[panelId]) {
          eventTypes.forEach(type => state.eventSubscriptions[panelId].delete(type));
        }
      });
    },

    addPanelEvent: (event) => {
      set((state) => {
        state.panelEvents.push(event);
        // Keep only last 100 events
        if (state.panelEvents.length > 100) {
          state.panelEvents = state.panelEvents.slice(-100);
        }
      });
    },

    getPanelEvents: (panelId, eventTypes) => {
      const events = get().panelEvents;
      return events.filter(e => {
        const matchesPanel = !panelId || e.source.panelId === panelId;
        const matchesType = !eventTypes || eventTypes.includes(e.type);
        return matchesPanel && matchesType;
      });
    }
  }))
);
```

### 2.2 Panel Tab Bar Component

Create `frontend/src/types/panelComponents.ts`:

```typescript
import { ToolPanel } from '../../shared/types/panels';

export interface PanelTabBarProps {
  panels: ToolPanel[];
  activePanel?: ToolPanel;
  onPanelSelect: (panel: ToolPanel) => void;
  onPanelClose: (panel: ToolPanel) => void;
  onPanelCreate: (type: ToolPanelType) => void;
}

export interface PanelContainerProps {
  panel: ToolPanel;
  isActive: boolean;
}

export interface TerminalPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}
```

Create `frontend/src/components/panels/PanelTabBar.tsx`:

```typescript
import React, { useCallback, memo, useState, useRef } from 'react';
import { Plus, X, Terminal, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { usePanelStore } from '../../stores/panelStore';
import { PanelTabBarProps } from '../../types/panelComponents';
import { ToolPanelType, PANEL_CAPABILITIES } from '../../../shared/types/panels';

export const PanelTabBar: React.FC<PanelTabBarProps> = memo(({
  panels,
  activePanel,
  onPanelSelect,
  onPanelClose,
  onPanelCreate
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Memoize event handlers to prevent unnecessary re-renders
  const handlePanelClick = useCallback((panel: ToolPanel) => {
    onPanelSelect(panel);
  }, [onPanelSelect]);

  const handlePanelClose = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
    onPanelClose(panel);
  }, [onPanelClose]);
  
  const handleAddPanel = useCallback((type: ToolPanelType) => {
    onPanelCreate(type);
    setShowDropdown(false);
  }, [onPanelCreate]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);
  
  // Get available panel types
  const availablePanelTypes = Object.keys(PANEL_CAPABILITIES) as ToolPanelType[];
  
  const getPanelIcon = (type: ToolPanelType) => {
    switch (type) {
      case 'terminal':
        return <Terminal className="w-4 h-4" />;
      // Add more icons as panel types are added
      default:
        return null;
    }
  };

  return (
    <div className="panel-tab-bar flex items-center bg-gray-800 border-b border-gray-700 h-8">
      {/* Render panel tabs */}
      {panels.map((panel) => (
        <div
          key={panel.id}
          className={cn(
            "flex items-center px-3 py-1 cursor-pointer hover:bg-gray-700 border-r border-gray-700",
            activePanel?.id === panel.id && "bg-gray-700"
          )}
          onClick={() => handlePanelClick(panel)}
        >
          {getPanelIcon(panel.type)}
          <span className="ml-2 text-sm">{panel.title}</span>
          <button
            className="ml-2 p-0.5 hover:bg-gray-600 rounded"
            onClick={(e) => handlePanelClose(e, panel)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      
      {/* Add Panel dropdown button */}
      <div className="relative" ref={dropdownRef}>
        <button
          className="flex items-center px-3 py-1 hover:bg-gray-700 text-sm"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Tool
          <ChevronDown className="w-3 h-3 ml-1" />
        </button>
        
        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-10">
            {availablePanelTypes.map((type) => (
              <button
                key={type}
                className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-700 text-left"
                onClick={() => handleAddPanel(type)}
              >
                {getPanelIcon(type)}
                <span className="ml-2 capitalize">{type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

PanelTabBar.displayName = 'PanelTabBar';
```

### 2.3 Terminal Panel Component

The Terminal Panel manages individual terminal instances within the panel system.

**Critical XTerm.js Integration Requirements:**

```typescript
import { useRef, useEffect, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useRequiredSession } from '../../contexts/SessionContext';
import { TerminalPanelProps } from '../../types/panelComponents';

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ panel, isActive }) => {
  // FIX: Get session data only from context, not props
  const { sessionId, workingDirectory } = useRequiredSession();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive || !terminalRef.current) return;

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let disposed = false;

    const initializeTerminal = async () => {
      try {
        // Check if already initialized on backend
        const initialized = await window.electron.invoke('panels:checkInitialized', panel.id);
        
        if (!initialized) {
          // Initialize backend PTY process
          await window.electron.invoke('panels:initialize', panel.id, {
            cwd: workingDirectory,
            sessionId
          });
        }

        // FIX: Check if component was unmounted during async operation
        if (disposed) return;

        // Create XTerm instance
        terminal = new Terminal({
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4'
          },
          scrollback: 50000
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        
        // FIX: Additional check before DOM manipulation
        if (terminalRef.current && !disposed) {
          terminal.open(terminalRef.current);
          fitAddon.fit();
          
          xtermRef.current = terminal;
          fitAddonRef.current = fitAddon;
          setIsInitialized(true);

          // Set up IPC communication for terminal I/O
          const outputHandler = (_: any, data: { panelId: string; output: string }) => {
            if (data.panelId === panel.id && terminal && !disposed) {
              terminal.write(data.output);
            }
          };

          window.electron.on('terminal:output', outputHandler);

          // Handle terminal input
          const inputDisposable = terminal.onData((data) => {
            window.electron.invoke('terminal:input', panel.id, data);
          });

          // Handle resize
          const resizeObserver = new ResizeObserver(() => {
            if (fitAddon && !disposed) {
              fitAddon.fit();
              const dimensions = fitAddon.proposeDimensions();
              if (dimensions) {
                window.electron.invoke('terminal:resize', panel.id, dimensions.cols, dimensions.rows);
              }
            }
          });
          
          resizeObserver.observe(terminalRef.current);

          // FIX: Return comprehensive cleanup function
          return () => {
            disposed = true;
            resizeObserver.disconnect();
            window.electron.off('terminal:output', outputHandler);
            inputDisposable.dispose();
          };
        }
      } catch (error) {
        console.error('Failed to initialize terminal:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    const cleanup = initializeTerminal();

    // FIX: Proper cleanup that checks initialization state
    return () => {
      disposed = true;
      
      // Clean up async initialization
      cleanup.then(cleanupFn => cleanupFn?.());
      
      // FIX: Safe disposal with null checks
      if (xtermRef.current) {
        try {
          xtermRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing terminal:', e);
        }
        xtermRef.current = null;
      }
      
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing fit addon:', e);
        }
        fitAddonRef.current = null;
      }
      
      setIsInitialized(false);
    };
  }, [isActive, panel.id]); // FIX: Removed sessionId and workingDirectory from deps

  if (initError) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Terminal initialization failed: {initError}
      </div>
    );
  }

  if (!isInitialized && isActive) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Initializing terminal...
      </div>
    );
  }

  return <div ref={terminalRef} className="h-full w-full" />;
};
```

**Benefits of Using Context:**

1. **Clean Component Interfaces**: Components only receive the props they directly use (panel, isActive)
2. **No Prop Drilling**: Session data is available to any component that needs it without passing through intermediate components
3. **Easy to Extend**: Adding new session-related data (like userId, permissions) only requires updating the context
4. **Better Testability**: Can easily provide mock session data in tests
5. **Consistent Access Pattern**: All components access session data the same way via `useSession()`

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
     isActive: boolean;          // Controls mounting/unmounting
     // REMOVED: sessionId and workingDirectory (get from context instead)
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

**Important**: Wrap PanelContainer with an Error Boundary to prevent panel failures from crashing the entire application. Each panel type should gracefully handle errors and display fallback UI.

```typescript
import React, { Suspense, lazy, useMemo } from 'react';
import { PanelContainerProps } from '../../types/panelComponents';
import { ErrorBoundary } from 'react-error-boundary';

// Lazy load panel components for better performance
const TerminalPanel = lazy(() => import('./TerminalPanel'));

const PanelErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({ 
  error, 
  resetErrorBoundary 
}) => (
  <div className="flex flex-col items-center justify-center h-full text-red-500 p-4">
    <p className="text-lg font-semibold mb-2">Panel Error</p>
    <p className="text-sm text-gray-400 mb-4">{error.message}</p>
    <button 
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      Retry
    </button>
  </div>
);

export const PanelContainer: React.FC<PanelContainerProps> = ({
  panel,
  isActive
}) => {
  // FIX: Use stable panel rendering without forcing remounts
  // Each panel type maintains its own state internally
  // The isActive prop controls whether it should render its content
  
  const panelComponent = useMemo(() => {
    switch (panel.type) {
      case 'terminal':
        return <TerminalPanel panel={panel} isActive={isActive} />;
      // Future panel types...
      default:
        return <div>Unknown panel type: {panel.type}</div>;
    }
  }, [panel.type, panel.id, isActive]); // Include stable deps only

  return (
    <ErrorBoundary
      FallbackComponent={PanelErrorFallback}
      resetKeys={[panel.id]} // Only reset when panel changes
    >
      <Suspense fallback={
        <div className="flex items-center justify-center h-full text-gray-500">
          Loading panel...
        </div>
      }>
        {panelComponent}
      </Suspense>
    </ErrorBoundary>
  );
};
```

### 2.5 Session Context Provider

Create `frontend/src/contexts/SessionContext.tsx`:

```typescript
import React, { createContext, useContext, ReactNode } from 'react';
import { Session } from '../../shared/types';

interface SessionContextValue {
  sessionId: string;
  workingDirectory: string;
  projectId: string;
  session: Session;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider: React.FC<{
  children: ReactNode;
  session: Session | null;
}> = ({ children, session }) => {
  // FIX: Don't render children without a valid session
  // This prevents components that require session from rendering
  if (!session) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No session selected
      </div>
    );
  }

  const value: SessionContextValue = {
    sessionId: session.id,
    workingDirectory: session.worktreePath,
    projectId: session.projectId,
    session
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

// Safe hook that doesn't throw
export const useSession = (): SessionContextValue | null => {
  return useContext(SessionContext) || null;
};

// Hook for components that absolutely require a session
export const useRequiredSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useRequiredSession must be used within a SessionProvider with a valid session');
  }
  return context;
};
```

### 2.6 Integration with SessionView

Modify `frontend/src/components/SessionView.tsx`:

```typescript
// Add to imports
import { useMemo, useCallback } from 'react';
import { usePanelStore } from '../stores/panelStore';
import { panelApi } from '../services/panelApi';
import { PanelTabBar } from './panels/PanelTabBar';
import { PanelContainer } from './panels/PanelContainer';
import { SessionProvider } from '../contexts/SessionContext';

// Inside SessionView component
const {
  panels,
  activePanels,
  setPanels,
  setActivePanel: setActivePanelInStore,
  addPanel,
  removePanel,
} = usePanelStore();

// Load panels when session changes
useEffect(() => {
  if (activeSession?.id) {
    panelApi.loadPanelsForSession(activeSession.id).then(loadedPanels => {
      setPanels(activeSession.id, loadedPanels);
    });
    
    panelApi.getActivePanel(activeSession.id).then(activePanel => {
      if (activePanel) {
        setActivePanelInStore(activeSession.id, activePanel.id);
      }
    });
  }
}, [activeSession?.id, setPanels, setActivePanelInStore]);

// Get panels for current session with memoization
const sessionPanels = useMemo(
  () => panels[activeSession?.id || ''] || [],
  [panels, activeSession?.id]
);

const currentActivePanel = useMemo(
  () => sessionPanels.find(p => p.id === activePanels[activeSession?.id || '']),
  [sessionPanels, activePanels, activeSession?.id]
);

// FIX: Memoize all callbacks to prevent re-renders
const handlePanelSelect = useCallback(
  async (panel: ToolPanel) => {
    if (!activeSession) return;
    setActivePanelInStore(activeSession.id, panel.id);
    await panelApi.setActivePanel(activeSession.id, panel.id);
  },
  [activeSession, setActivePanelInStore]
);

const handlePanelClose = useCallback(
  async (panel: ToolPanel) => {
    if (!activeSession) return;
    
    // Find next panel to activate
    const panelIndex = sessionPanels.findIndex(p => p.id === panel.id);
    const nextPanel = sessionPanels[panelIndex + 1] || sessionPanels[panelIndex - 1];
    
    // Remove from store first for immediate UI update
    removePanel(activeSession.id, panel.id);
    
    // Set next active panel if available
    if (nextPanel) {
      setActivePanelInStore(activeSession.id, nextPanel.id);
      await panelApi.setActivePanel(activeSession.id, nextPanel.id);
    }
    
    // Delete on backend
    await panelApi.deletePanel(panel.id);
  },
  [activeSession, sessionPanels, removePanel, setActivePanelInStore]
);

const handlePanelCreate = useCallback(
  async (type: ToolPanelType) => {
    if (!activeSession) return;
    
    const newPanel = await panelApi.createPanel({
      sessionId: activeSession.id,
      type
    });
    
    // Add to store and make active
    addPanel(newPanel);
  },
  [activeSession, addPanel]
);

// FIX: Memoize the panel content to prevent unnecessary re-renders
const panelContent = useMemo(() => {
  if (!currentActivePanel) {
    // When no panel is active, show the main view content based on viewMode
    return null; // Main content will be rendered based on viewMode
  }

  // FIX: Don't use key prop - let React handle reconciliation
  // The PanelContainer will handle mounting/unmounting internally based on isActive
  return (
    <PanelContainer
      panel={currentActivePanel}
      isActive={true}
    />
  );
}, [currentActivePanel]);

// In the render method:
return (
  <div className="session-view flex flex-col h-full">
    {/* Existing tab bar (without Terminal) */}
    <div className="tab-bar">
      <button className={cn(viewMode === 'output' && 'active')}>Output</button>
      <button className={cn(viewMode === 'diff' && 'active')}>Diff</button>
      <button className={cn(viewMode === 'logs' && 'active')}>Logs</button>
      <button className={cn(viewMode === 'editor' && 'active')}>Editor</button>
    </div>
    
    {/* Tool Panel Bar - ALWAYS VISIBLE */}
    <SessionProvider session={activeSession}>
      <PanelTabBar
        panels={sessionPanels}
        activePanel={currentActivePanel}
        onPanelSelect={handlePanelSelect}
        onPanelClose={handlePanelClose}
        onPanelCreate={handlePanelCreate}
      />
    </SessionProvider>
    
    {/* Main content area */}
    <div className="content-area flex-1 overflow-hidden">
      {panelContent ? (
        // Show active panel content
        <SessionProvider session={activeSession}>
          {panelContent}
        </SessionProvider>
      ) : (
        // Show main view content based on viewMode
        <>
          {viewMode === 'output' && <OutputView />}
          {viewMode === 'diff' && <DiffView />}
          {viewMode === 'logs' && <LogsView />}
          {viewMode === 'editor' && <EditorView />}
        </>
      )}
    </div>
  </div>
);
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
# Tool Panel System Design - Phases 1 & 2

## Overview

This document outlines the implementation of a flexible, multi-instance tool panel system for Crystal. The new panel system will be displayed as a **second tab bar underneath the existing ViewTabs bar**, and initially we will **only migrate the Terminal view** to the new system.

Eventually, all tool types will be migrated and the top tool bar will be removed. This implementation plan only covers the migration of the terminal tool.

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
import { PanelStore } from '../types/panelStore';

export const usePanelStore = create<PanelStore>((set, get) => ({
  panels: {},
  activePanels: {},
  panelEvents: [],
  eventSubscriptions: {},

  // Synchronous state updates
  setPanels: (sessionId, panels) => {
    set((state) => ({
      panels: { ...state.panels, [sessionId]: panels }
    }));
  },

  setActivePanel: (sessionId, panelId) => {
    set((state) => ({
      activePanels: { ...state.activePanels, [sessionId]: panelId }
    }));
  },

  addPanel: (panel) => {
    // Add panel and make it active
    set((state) => ({
      panels: { 
        ...state.panels, 
        [panel.sessionId]: [...(state.panels[panel.sessionId] || []), panel] 
      },
      activePanels: { ...state.activePanels, [panel.sessionId]: panel.id }
    }));
  },

  removePanel: (sessionId, panelId) => {
    // Remove panel from list
    set((state) => ({
      panels: {
        ...state.panels,
        [sessionId]: state.panels[sessionId]?.filter(p => p.id !== panelId) || []
      }
    }));
  },

  updatePanelState: (panel) => {
    // Update specific panel in the list
    // Implementation details...
  },

  // Getters
  getSessionPanels: (sessionId) => get().panels[sessionId] || [],
  getActivePanel: (sessionId) => {
    const panels = get().panels[sessionId] || [];
    return panels.find(p => p.id === get().activePanels[sessionId]);
  },

  // Event subscription management
  subscribeToPanelEvents: (panelId, eventTypes) => { /* Implementation */ },
  unsubscribeFromPanelEvents: (panelId, eventTypes) => { /* Implementation */ },
  getPanelEvents: (panelId, eventTypes) => { /* Implementation */ },
  addPanelEvent: (event) => { 
    // Add event to history and notify subscribers
    // Implementation details...
  }
}));
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
  onPanelCreate: () => void;
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
import React, { useCallback, memo } from 'react';
import { Plus, X, Terminal } from 'lucide-react';
import { cn } from '../../utils/cn';
import { usePanelStore } from '../../stores/panelStore';
import { PanelTabBarProps } from '../../types/panelComponents';

export const PanelTabBar: React.FC<PanelTabBarProps> = memo(({
  panels,
  activePanel,
  onPanelSelect,
  onPanelClose,
  onPanelCreate
}) => {
  // Memoize event handlers to prevent unnecessary re-renders
  const handlePanelClick = useCallback((panel: ToolPanel) => {
    onPanelSelect(panel);
  }, [onPanelSelect]);

  const handlePanelClose = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
    onPanelClose(panel);
  }, [onPanelClose]);

  return (
    <div className="panel-tab-bar">
      {/* Render panel tabs with click handlers */}
      {panels.map((panel) => (
        <div key={panel.id} onClick={() => handlePanelClick(panel)}>
          {/* Tab UI with title, icon, close button */}
        </div>
      ))}
      <button onClick={onPanelCreate}>New Terminal</button>
    </div>
  );
});

PanelTabBar.displayName = 'PanelTabBar';
```

### 2.3 Terminal Panel Component

The Terminal Panel manages individual terminal instances within the panel system.

**Critical XTerm.js Integration Requirements:**

```typescript
import { useRef, useEffect } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useSession } from '../../contexts/SessionContext';

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ panel, isActive }) => {
  // Get session data from context instead of props
  const { sessionId, workingDirectory } = useSession();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  
  useEffect(() => {
    if (!isActive || !terminalRef.current) return;
    
    // Initialize XTerm with proper ref isolation
    const terminal = new Terminal(/* config */);
    terminal.open(terminalRef.current);
    xtermRef.current = terminal;
    
    // Connect to backend using sessionId and workingDirectory from context
    // Handle I/O, resize events, etc.
    
    // Cleanup on unmount
    return () => {
      terminal.dispose();
      xtermRef.current = null;
    };
  }, [isActive, panel.id, sessionId, workingDirectory]);
  
  return <div ref={terminalRef} />;
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

**Important**: Wrap PanelContainer with an Error Boundary to prevent panel failures from crashing the entire application. Each panel type should gracefully handle errors and display fallback UI.

```typescript
import React, { Suspense, lazy } from 'react';
import { PanelContainerProps } from '../../types/panelComponents';

// Lazy load panel components for better performance
const TerminalPanel = lazy(() => import('./types/TerminalPanel'));

export const PanelContainer: React.FC<PanelContainerProps> = ({
  panel,
  isActive
}) => {
  // Only render active panel to save memory
  // Use lazy loading with Suspense for better performance
  
  const renderPanel = () => {
    switch (panel.type) {
      case 'terminal':
        return <TerminalPanel panel={panel} isActive={isActive} />;
      // Future panel types...
      default:
        return <div>Unknown panel type: {panel.type}</div>;
    }
  };

  return (
    <Suspense fallback={<div>Loading panel...</div>}>
      {renderPanel()}
    </Suspense>
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
  session: Session | null;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider: React.FC<{
  children: ReactNode;
  session: Session | null;
}> = ({ children, session }) => {
  if (!session) {
    return <>{children}</>;
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

export const useSession = (): SessionContextValue => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

// Optional: hook that doesn't throw if no session
export const useSessionOptional = (): SessionContextValue | undefined => {
  return useContext(SessionContext);
};
```

### 2.6 Integration with SessionView

Modify `frontend/src/components/SessionView.tsx`:

```typescript
// Add to imports
import { usePanelStore } from '../stores/panelStore';
import { PanelTabBar } from './panels/PanelTabBar';
import { PanelContainer } from './panels/PanelContainer';
import { SessionProvider } from '../contexts/SessionContext';

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
const sessionPanels = panels[activeSession?.id || ''] || [];
const currentActivePanel = activePanels[activeSession?.id || ''];

// In the render, wrap terminal view section with SessionProvider:
{hook.viewMode === 'terminal' && (
  <SessionProvider session={activeSession}>
    <PanelTabBar
      panels={sessionPanels}
      activePanel={currentActivePanel}
      onPanelSelect={(panel) => setActivePanel(activeSession.id, panel.id)}
      onPanelClose={(panel) => deletePanel(panel.id)}
      onPanelCreate={() => createPanel({ sessionId: activeSession.id, type: 'terminal' })}
    />
    
    <div className="panel-content">
      {currentActivePanel ? (
        <PanelContainer
          key={currentActivePanel.id}
          panel={currentActivePanel}
          isActive={true}
        />
      ) : (
        <div>No active panel or create first panel prompt</div>
      )}
    </div>
  </SessionProvider>
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
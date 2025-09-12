export interface ToolPanel {
  id: string;                    // Unique panel instance ID (uuid)
  sessionId: string;             // Associated session/worktree
  type: ToolPanelType;          // 'terminal' for now
  title: string;                 // Display title (e.g., "Terminal 1")
  state: ToolPanelState;         // Panel-specific state
  metadata: ToolPanelMetadata;   // Creation time, position, etc.
}

export type ToolPanelType = 'terminal' | 'claude'; // Will expand later

export interface ToolPanelState {
  isActive: boolean;
  isPinned?: boolean;
  hasBeenViewed?: boolean;       // Track if panel has ever been viewed
  customState?: TerminalPanelState | ClaudePanelState;
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

export interface ClaudePanelState {
  // Basic state
  isInitialized?: boolean;       // Whether Claude process has been started
  claudeResumeId?: string;       // Claude's internal resume ID for session continuation
  
  // Enhanced persistence (can be added incrementally)
  lastPrompt?: string;           // Last user prompt
  model?: string;                // Model being used (sonnet, opus, haiku)
  permissionMode?: 'approve' | 'ignore'; // Permission mode
  lastActivityTime?: string;     // For "idle since" indicators
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
  claude: {
    canEmit: ['files:changed'], // Claude can change files through tool calls
    canConsume: [], // Claude doesn't consume events in initial implementation
    requiresProcess: true,
    singleton: false
  },
  // Future panel types will be added here when migrated
};
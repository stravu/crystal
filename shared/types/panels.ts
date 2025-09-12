export interface ToolPanel {
  id: string;                    // Unique panel instance ID (uuid)
  sessionId: string;             // Associated session/worktree
  type: ToolPanelType;          // 'terminal' for now
  title: string;                 // Display title (e.g., "Terminal 1")
  state: ToolPanelState;         // Panel-specific state
  metadata: ToolPanelMetadata;   // Creation time, position, etc.
}

export type ToolPanelType = 'terminal' | 'claude' | 'diff' | 'editor'; // Will expand later

export interface ToolPanelState {
  isActive: boolean;
  isPinned?: boolean;
  hasBeenViewed?: boolean;       // Track if panel has ever been viewed
  customState?: TerminalPanelState | ClaudePanelState | DiffPanelState | EditorPanelState;
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
  
  // File tree state
  expandedDirs?: string[];        // List of expanded directory paths
  fileTreeWidth?: number;         // Width of the file tree panel
  searchQuery?: string;           // Current search query in file tree
  showSearch?: boolean;           // Whether search is visible
}

export interface ToolPanelMetadata {
  createdAt: string;
  lastActiveAt: string;
  position: number;              // Tab order
  permanent?: boolean;           // Cannot be closed (for diff panel)
}

export interface CreatePanelRequest {
  sessionId: string;
  type: ToolPanelType;
  title?: string;                // Optional custom title
  initialState?: any;
  metadata?: Partial<ToolPanelMetadata>; // Optional metadata overrides
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
  | 'diff:refreshed'             // When diff panel refreshes its content
  // Editor panel events
  | 'editor:file_saved'          // When a file is saved in editor
  | 'editor:file_changed'        // When file content changes in editor

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
  permanent?: boolean;             // Cannot be closed (for diff panel)
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
  diff: {
    canEmit: ['diff:refreshed'],
    canConsume: ['files:changed', 'terminal:command_executed'],
    requiresProcess: false,           // No background process
    singleton: true,                  // Only one diff panel
    permanent: true                   // Cannot be closed
  },
  editor: {
    canEmit: ['editor:file_saved', 'editor:file_changed'],
    canConsume: ['files:changed'],  // React to file system changes
    requiresProcess: false,          // No background process needed
    singleton: false                 // Multiple editors allowed
  },
  // Future panel types will be added here when migrated
};
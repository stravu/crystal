export interface ToolPanel {
  id: string;                    // Unique panel instance ID (uuid)
  sessionId: string;             // Associated session/worktree
  type: ToolPanelType;          // 'terminal' for now
  title: string;                 // Display title (e.g., "Terminal 1")
  state: ToolPanelState;         // Panel-specific state
  metadata: ToolPanelMetadata;   // Creation time, position, etc.
}

export type ToolPanelType = 'terminal' | 'claude' | 'codex' | 'diff' | 'editor' | 'logs' | 'dashboard' | 'setup-tasks'; // Will expand later

export interface ToolPanelState {
  isActive: boolean;
  isPinned?: boolean;
  hasBeenViewed?: boolean;       // Track if panel has ever been viewed
  customState?: TerminalPanelState | ClaudePanelState | CodexPanelState | DiffPanelState | EditorPanelState | LogsPanelState | DashboardPanelState | SetupTasksPanelState | Record<string, unknown>;
}

export interface TerminalPanelState {
  // Basic state (implemented in Phase 1-2)
  isInitialized?: boolean;       // Whether PTY process has been started
  cwd?: string;                  // Current working directory
  shellType?: string;            // bash, zsh, etc.
  
  // Enhanced persistence (can be added incrementally)
  scrollbackBuffer?: string | string[];   // Full terminal output history (string for new format, array for legacy)
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

// Panel status type - mirrors session status but at panel level
export type PanelStatus = 'idle' | 'running' | 'waiting' | 'stopped' | 'completed_unviewed' | 'error';

// Base interface for AI panel states (Claude, Codex, etc.)
export interface BaseAIPanelState {
  // Common state for all AI tools
  isInitialized?: boolean;       // Whether AI process has been started
  lastPrompt?: string;           // Last user prompt
  model?: string;                // Model being used
  lastActivityTime?: string;     // For "idle since" indicators
  lastInput?: string;            // Last input sent to the AI

  // Panel-level status tracking (independent per panel)
  panelStatus?: PanelStatus;     // Current panel execution status
  hasUnviewedContent?: boolean;  // Whether panel has content not yet viewed

  // Generic agent session ID for resume functionality (used by all AI agents)
  agentSessionId?: string;        // The AI agent's session ID for resuming conversations

  // Legacy fields for backward compatibility (will be migrated to agentSessionId)
  claudeSessionId?: string;       // Deprecated: Use agentSessionId instead
  codexSessionId?: string;        // Deprecated: Use agentSessionId instead
  claudeResumeId?: string;        // Deprecated: Claude's old resume ID
  codexResumeId?: string;         // Deprecated: Codex's old resume ID
}

export interface ClaudePanelState extends BaseAIPanelState {
  // Claude-specific state
  permissionMode?: 'approve' | 'ignore'; // Permission mode for Claude

  // Automatic context tracking
  contextUsage?: string | null;          // Latest context usage summary (e.g., "54k/200k tokens (27%)")
  autoContextRunState?: 'idle' | 'running'; // Tracks whether an automatic /context run is in progress
  lastAutoContextAt?: string;            // ISO timestamp of the most recent automatic context refresh
}

export interface CodexPanelState extends BaseAIPanelState {
  // Codex-specific state
  modelProvider?: string;        // Provider (openai, anthropic, etc.)
  approvalPolicy?: 'auto' | 'manual'; // Approval policy for tool calls
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'; // Sandbox mode
  webSearch?: boolean;           // Whether web search is enabled
  
  // Settings to remember for new tabs
  codexConfig?: {
    model: string;
    thinkingLevel: 'low' | 'medium' | 'high';
    sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
    webSearch: boolean;
  };
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

export interface LogsPanelState {
  isRunning: boolean;             // Process currently running
  processId?: number;             // Active process PID
  command?: string;               // Command being executed
  startTime?: string;             // When process started
  endTime?: string;               // When process ended
  exitCode?: number;              // Process exit code
  outputBuffer?: string[];        // Recent output lines
  errorCount?: number;            // Number of errors detected
  warningCount?: number;          // Number of warnings detected
  lastActivityTime?: string;      // Last output received
}

export interface DashboardPanelState {
  lastRefresh?: string;           // Last time dashboard was refreshed
  filterType?: 'all' | 'stale' | 'changes' | 'pr'; // Current filter
  isRefreshing?: boolean;          // Whether dashboard is currently refreshing
  cachedData?: Record<string, unknown>;                // Cached dashboard data
}

export interface SetupTasksPanelState {
  lastCheck?: string;              // Last time tasks were checked
  tasksCompleted?: Record<string, boolean>; // Track which tasks are done
  dismissedTasks?: string[];       // Tasks the user has dismissed
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
  initialState?: TerminalPanelState | ClaudePanelState | CodexPanelState | DiffPanelState | EditorPanelState | LogsPanelState | DashboardPanelState | SetupTasksPanelState | { customState?: unknown };
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
  data: unknown;
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
  // Logs panel events
  | 'process:started'            // When a script process starts
  | 'process:output'             // When process produces output
  | 'process:ended'              // When process exits
  // Git operation events
  | 'git:operation_started'      // When a git operation begins
  | 'git:operation_completed'    // When a git operation succeeds
  | 'git:operation_failed'        // When a git operation fails

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
  canAppearInProjects?: boolean;  // Whether panel can appear in project view
  canAppearInWorktrees?: boolean; // Whether panel can appear in worktree sessions
}

// Panel Registry - Currently only terminal is implemented
export const PANEL_CAPABILITIES: Record<ToolPanelType, PanelCapabilities> = {
  terminal: {
    canEmit: ['terminal:command_executed', 'terminal:exit', 'files:changed'],
    canConsume: [], // Terminal doesn't consume events in Phase 1-2
    requiresProcess: true,
    singleton: false,
    canAppearInProjects: true,       // Terminal can appear in projects
    canAppearInWorktrees: true       // Terminal can appear in worktrees
  },
  claude: {
    canEmit: ['files:changed'], // Claude can change files through tool calls
    canConsume: [], // Claude doesn't consume events in initial implementation
    requiresProcess: true,
    singleton: false,
    canAppearInProjects: true,       // Claude can appear in projects
    canAppearInWorktrees: true       // Claude can appear in worktrees
  },
  codex: {
    canEmit: ['files:changed'], // Codex can change files through tool calls
    canConsume: [], // Codex doesn't consume events in initial implementation
    requiresProcess: true,
    singleton: false,
    canAppearInProjects: true,       // Codex can appear in projects
    canAppearInWorktrees: true       // Codex can appear in worktrees
  },
  diff: {
    canEmit: ['diff:refreshed'],
    canConsume: ['files:changed', 'terminal:command_executed'],
    requiresProcess: false,           // No background process
    singleton: true,                  // Only one diff panel
    permanent: true,                  // Cannot be closed
    canAppearInProjects: false,       // Diff not available in projects (no worktree)
    canAppearInWorktrees: true        // Diff only in worktrees
  },
  editor: {
    canEmit: ['editor:file_saved', 'editor:file_changed'],
    canConsume: ['files:changed'],  // React to file system changes
    requiresProcess: false,          // No background process needed
    singleton: false,                // Multiple editors allowed
    canAppearInProjects: true,       // Editor can appear in projects
    canAppearInWorktrees: true       // Editor can appear in worktrees
  },
  logs: {
    canEmit: ['process:started', 'process:output', 'process:ended'],
    canConsume: [],                  // Logs doesn't listen to other panels
    requiresProcess: true,           // Manages script processes
    singleton: true,                 // ONLY ONE logs panel per session
    canAppearInProjects: true,       // Logs can appear in projects
    canAppearInWorktrees: true       // Logs can appear in worktrees
  },
  dashboard: {
    canEmit: [],                     // Dashboard doesn't emit events
    canConsume: ['files:changed'],   // Refresh on file changes
    requiresProcess: false,          // No background process
    singleton: true,                 // Only one dashboard panel
    permanent: true,                 // Cannot be closed (like diff panel)
    canAppearInProjects: true,       // Dashboard ONLY in projects
    canAppearInWorktrees: false      // Dashboard NOT in worktrees
  },
  'setup-tasks': {
    canEmit: [],                     // Setup tasks doesn't emit events
    canConsume: ['files:changed'],   // Refresh when files change (e.g., gitignore)
    requiresProcess: false,          // No background process
    singleton: true,                 // Only one setup tasks panel
    permanent: true,                 // Cannot be closed (like dashboard)
    canAppearInProjects: true,       // Setup tasks ONLY in projects
    canAppearInWorktrees: false      // Setup tasks NOT in worktrees
  }
};

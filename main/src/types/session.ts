export interface Session {
  id: string;
  name: string;
  worktreePath: string;
  prompt: string;
  status: 'initializing' | 'ready' | 'running' | 'waiting' | 'stopped' | 'completed_unviewed' | 'error';
  statusMessage?: string;
  pid?: number;
  createdAt: Date;
  lastActivity?: Date;
  output: string[];
  jsonMessages: unknown[];
  error?: string;
  isRunning?: boolean;
  lastViewedAt?: string;
  permissionMode?: 'approve' | 'ignore';
  runStartedAt?: string;
  isMainRepo?: boolean;
  displayOrder?: number;
  projectId?: number;
  folderId?: string;
  isFavorite?: boolean;
  autoCommit?: boolean;
  model?: string;
  toolType?: 'claude' | 'codex' | 'none';
  archived?: boolean;
  gitStatus?: GitStatus;
  baseCommit?: string;
  baseBranch?: string;
  commitMode?: 'structured' | 'checkpoint' | 'disabled';
  commitModeSettings?: string; // JSON string of CommitModeSettings
}

export interface GitStatus {
  state: 'clean' | 'modified' | 'untracked' | 'ahead' | 'behind' | 'diverged' | 'conflict' | 'unknown';
  ahead?: number;
  behind?: number;
  additions?: number; // Uncommitted additions
  deletions?: number; // Uncommitted deletions
  filesChanged?: number; // Uncommitted files changed
  lastChecked?: string;
  // Enhanced status information
  isReadyToMerge?: boolean; // True when ahead of base branch with no uncommitted changes and not diverged (not behind)
  hasUncommittedChanges?: boolean;
  hasUntrackedFiles?: boolean;
  // Allow tracking multiple states for better clarity
  secondaryStates?: Array<'modified' | 'untracked' | 'ahead' | 'behind'>;
  // Commit statistics (for all commits ahead of main)
  commitAdditions?: number;
  commitDeletions?: number;
  commitFilesChanged?: number;
  // Total commits in branch (not just ahead of main)
  totalCommits?: number;
}

export interface CreateSessionRequest {
  prompt: string;
  worktreeTemplate?: string;
  count?: number;
  permissionMode?: 'approve' | 'ignore';
  projectId?: number;
  folderId?: string;
  baseBranch?: string;
  autoCommit?: boolean;
  model?: string;
  toolType?: 'claude' | 'codex' | 'none';
  commitMode?: 'structured' | 'checkpoint' | 'disabled';
  commitModeSettings?: string; // JSON string of CommitModeSettings
  codexConfig?: {
    model?: string;
    modelProvider?: string;
    approvalPolicy?: 'auto' | 'manual';
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
    webSearch?: boolean;
    thinkingLevel?: 'low' | 'medium' | 'high';
  };
  claudeConfig?: {
    model?: string;
    permissionMode?: 'approve' | 'ignore';
    ultrathink?: boolean;
  };
}

export interface SessionUpdate {
  status?: Session['status'];
  statusMessage?: string;
  lastActivity?: Date;
  error?: string;
  run_started_at?: string | null;
  model?: string;
  gitStatus?: GitStatus;
  skip_continue_next?: boolean;
}

// Claude message content types
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type MessageContent = TextContent | ToolUseContent | ToolResultContent;

// Tool definition interface
export interface ToolDefinition {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

// MCP server definition interface  
export interface McpServerDefinition {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

// JSON message structure from Claude
export interface ClaudeJsonMessage {
  id?: string;
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'result' | 'thinking' | 'session';
  role?: 'user' | 'assistant' | 'system';
  content?: string | MessageContent[];
  message?: { 
    content?: string | MessageContent[];
    [key: string]: unknown;
  };
  timestamp: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  parent_tool_use_id?: string;
  session_id?: string;
  text?: string;
  subtype?: string;
  cwd?: string;
  model?: string;
  tools?: ToolDefinition[];
  mcp_servers?: McpServerDefinition[];
  permissionMode?: string;
  summary?: string;
  error?: string;
  details?: string;
  raw_output?: string;
  is_error?: boolean;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
  cost_usd?: number;
  thinking?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SessionOutput {
  sessionId: string;
  type: 'stdout' | 'stderr' | 'json' | 'error';
  data: unknown; // Can be string for stdout/stderr, or JSON object for json/error types
  timestamp: Date;
  panelId?: string;
}

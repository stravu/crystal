// Session information interface
export interface SessionInfoData {
  type?: string; // Make type optional for flexibility
  initialPrompt?: string;
  codexCommand?: string;
  claudeCommand?: string;
  worktreePath?: string;
  model?: string;
  modelProvider?: string;
  approvalPolicy?: string;
  sandboxMode?: boolean | string;
  permissionMode?: string;
  resumeSessionId?: string;
  isResume?: boolean;
  timestamp?: string;
  [key: string]: unknown; // Allow any additional properties
}

// Generic system info that can contain various types
export type SystemInfoData = SessionInfoData | {
  type?: string;
  [key: string]: unknown; // Allow any additional properties
};

// Unified message structure that all agents transform to
export interface UnifiedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  segments: MessageSegment[];
  metadata?: {
    agent?: string;
    model?: string;
    duration?: number;
    tokens?: number;
    cost?: number;
    systemSubtype?: string;
    sessionInfo?: SessionInfoData;
    [key: string]: unknown; // Allow any additional metadata
  };
}

export type MessageSegment = 
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool: ToolCall }
  | { type: 'tool_result'; result: ToolResult & { toolCallId: string } }
  | { type: 'system_info'; info: SystemInfoData }
  | { type: 'thinking'; content: string }
  | { type: 'diff'; diff: string }
  | { type: 'error'; error: { message: string; details?: string } };

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>; // Tool inputs can have various shapes
  result?: ToolResult;
  status: 'pending' | 'success' | 'error';
  isSubAgent?: boolean;
  subAgentType?: string;
  parentToolId?: string;
  childToolCalls?: ToolCall[];
}

export interface ToolResult {
  content: string;
  isError?: boolean;
  metadata?: {
    exitCode?: number;
    duration?: number;
    [key: string]: unknown; // Tool result metadata can have various shapes
  };
}

// Message transformer interface for converting agent-specific formats to unified format
export interface MessageTransformer {
  // Transform raw agent messages to unified format
  transform(rawMessages: unknown[]): UnifiedMessage[];
  
  // Parse a single message
  parseMessage(raw: unknown): UnifiedMessage | null;
  
  // Agent-specific capabilities
  supportsStreaming(): boolean;
  supportsThinking(): boolean;
  supportsToolCalls(): boolean;
  
  // Get agent name for display
  getAgentName(): string;
}
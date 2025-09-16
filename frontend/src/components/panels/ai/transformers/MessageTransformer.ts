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
    sessionInfo?: any;
    [key: string]: any;
  };
}

export type MessageSegment = 
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool: ToolCall }
  | { type: 'tool_result'; result: ToolResult & { toolCallId: string } }
  | { type: 'system_info'; info: any }
  | { type: 'thinking'; content: string }
  | { type: 'diff'; diff: string }
  | { type: 'error'; error: { message: string; details?: string } };

export interface ToolCall {
  id: string;
  name: string;
  input?: any;
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
  metadata?: any;
}

// Message transformer interface for converting agent-specific formats to unified format
export interface MessageTransformer {
  // Transform raw agent messages to unified format
  transform(rawMessages: any[]): UnifiedMessage[];
  
  // Parse a single message
  parseMessage(raw: any): UnifiedMessage | null;
  
  // Agent-specific capabilities
  supportsStreaming(): boolean;
  supportsThinking(): boolean;
  supportsToolCalls(): boolean;
  
  // Get agent name for display
  getAgentName(): string;
}
import { MessageTransformer, UnifiedMessage, MessageSegment, ToolCall, ToolResult } from './MessageTransformer';

// Content block types
interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  content?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
}

// Tool definition types
interface ToolDefinition {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  [key: string]: unknown;
}

// MCP server definition types
interface McpServerDefinition {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

// Claude-specific message format
interface ClaudeRawMessage {
  id?: string;
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'result';
  role?: 'user' | 'assistant' | 'system';
  content?: string | object;
  message?: { 
    content?: string | ContentBlock[]; 
    model?: string;
    duration?: number;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cost?: number;
    };
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
  [key: string]: unknown;
}

export class ClaudeMessageTransformer implements MessageTransformer {
  private messageIdCounter = 0;
  
  transform(rawMessages: ClaudeRawMessage[]): UnifiedMessage[] {
    const transformed: UnifiedMessage[] = [];
    
    // First pass: Build tool result map and identify sub-agent relationships
    const toolResults = new Map<string, ToolResult>();
    const parentToolMap = new Map<string, string>();
    
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      
      // Check for parent_tool_use_id to identify sub-agent tool calls
      if (msg.parent_tool_use_id && msg.message?.content && Array.isArray(msg.message.content)) {
        const content = msg.message.content;
        for (let j = 0; j < content.length; j++) {
          const block = content[j];
          if (block.type === 'tool_use' && block.id) {
            parentToolMap.set(block.id, msg.parent_tool_use_id);
          }
        }
      }
      
      // Collect tool results
      if (msg.type === 'user' && msg.message?.content && Array.isArray(msg.message.content)) {
        const content = msg.message.content;
        for (let j = 0; j < content.length; j++) {
          const block = content[j];
          if (block.type === 'tool_result' && block.tool_use_id) {
            toolResults.set(block.tool_use_id, {
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
              isError: block.is_error || false
            });
          }
        }
      }
    }
    
    // Second pass: Build all tool calls
    const allToolCalls = new Map<string, ToolCall>();
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
        const content = msg.message.content;
        for (let j = 0; j < content.length; j++) {
          const block = content[j];
          if (block.type === 'tool_use') {
            const isTaskAgent = block.name === 'Task';
            const toolCall: ToolCall = {
              id: block.id || '',
              name: block.name || '',
              input: block.input,
              status: toolResults.has(block.id || '') ? 'success' : 'pending',
              result: toolResults.get(block.id || ''),
              isSubAgent: isTaskAgent,
              subAgentType: isTaskAgent && block.input && typeof block.input === 'object' && 'subagent_type' in block.input ? String(block.input.subagent_type) : undefined,
              parentToolId: parentToolMap.get(block.id || ''),
              childToolCalls: []
            };
            allToolCalls.set(block.id || '', toolCall);
          }
        }
      }
    }
    
    // Build parent-child relationships
    const toolCallsArray = Array.from(allToolCalls.values());
    for (let i = 0; i < toolCallsArray.length; i++) {
      const toolCall = toolCallsArray[i];
      if (toolCall.parentToolId) {
        const parentTool = allToolCalls.get(toolCall.parentToolId);
        if (parentTool && parentTool.childToolCalls) {
          parentTool.childToolCalls.push(toolCall);
        }
      }
    }
    
    // Third pass: Build conversation messages
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      const unifiedMsg = this.parseMessage(msg, allToolCalls, toolResults);
      if (unifiedMsg) {
        transformed.push(unifiedMsg);
      }
    }
    
    return transformed;
  }
  
  parseMessage(msg: ClaudeRawMessage, allToolCalls?: Map<string, ToolCall>, _toolResults?: Map<string, ToolResult>): UnifiedMessage | null {
    if (msg.type === 'user') {
      return this.parseUserMessage(msg);
    } else if (msg.type === 'assistant') {
      return this.parseAssistantMessage(msg, allToolCalls);
    } else if (msg.type === 'system') {
      return this.parseSystemMessage(msg);
    } else if (msg.type === 'result') {
      return this.parseResultMessage(msg);
    }
    
    return null;
  }
  
  private parseUserMessage(msg: ClaudeRawMessage): UnifiedMessage | null {
    // First, extract the text content to check for slash command results
    const textContent = this.extractTextContent(msg);

    // Check if this is a slash command result (contains <local-command-stdout> tags)
    if (textContent && textContent.includes('<local-command-stdout>')) {
      // Extract content and remove tags
      const slashCommandContent = textContent
        .replace(/<local-command-stdout>/g, '')
        .replace(/<\/local-command-stdout>/g, '')
        .trim();

      return {
        id: msg.id || `slash_result_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: msg.timestamp,
        segments: [{ type: 'text', content: slashCommandContent }],
        metadata: {
          agent: 'claude',
          systemSubtype: 'slash_command_result'
        }
      };
    }

    // Check if this is a tool result message
    let hasToolResult = false;
    let hasOnlyText = true;

    if (msg.message?.content && Array.isArray(msg.message.content)) {
      const content = msg.message.content;
      for (let j = 0; j < content.length; j++) {
        if (content[j].type === 'tool_result') {
          hasToolResult = true;
          hasOnlyText = false;
          break;
        }
        if (content[j].type !== 'text') {
          hasOnlyText = false;
        }
      }
    }

    // Only show real user prompts (text-only messages without tool results)
    if (!hasToolResult && hasOnlyText) {
      if (textContent) {
        return {
          id: msg.id || `user_msg_${++this.messageIdCounter}`,
          role: 'user',
          timestamp: msg.timestamp,
          segments: [{ type: 'text', content: textContent }],
          metadata: { agent: 'claude' }
        };
      }
    }

    return null;
  }
  
  private parseAssistantMessage(msg: ClaudeRawMessage, allToolCalls?: Map<string, ToolCall>): UnifiedMessage | null {
    const segments: MessageSegment[] = [];
    
    // Check for direct text field first
    if (msg.text && typeof msg.text === 'string') {
      segments.push({ type: 'text', content: msg.text.trim() });
    } else if (msg.message?.content && Array.isArray(msg.message.content)) {
      const content = msg.message.content;
      for (let j = 0; j < content.length; j++) {
        const block = content[j];
        if (block.type === 'text' && block.text?.trim()) {
          segments.push({ type: 'text', content: block.text.trim() });
        } else if (block.type === 'thinking') {
          const thinkingContent = block.thinking || block.content || block.text;
          if (thinkingContent && typeof thinkingContent === 'string' && thinkingContent.trim()) {
            segments.push({ type: 'thinking', content: thinkingContent.trim() });
          }
        } else if (block.type === 'tool_use' && allToolCalls) {
          const toolCall = allToolCalls.get(block.id || '');
          // Only add top-level tools (those without parents)
          if (toolCall && !toolCall.parentToolId) {
            segments.push({ type: 'tool_call', tool: toolCall });
          }
        }
      }
    } else {
      // Fallback for other formats
      const textContent = this.extractTextContent(msg);
      if (textContent) {
        segments.push({ type: 'text', content: textContent });
      }
    }
    
    // Only add message if it has content
    if (segments.length > 0) {
      // Check if this is a synthetic error message
      const isSyntheticError = msg.message?.model === '<synthetic>' && 
        segments.some(seg => seg.type === 'text' && 
          (seg.content.includes('Prompt is too long') || 
           seg.content.includes('API Error') ||
           seg.content.includes('error')));
      
      return {
        id: msg.id || `assistant_msg_${++this.messageIdCounter}`,
        role: isSyntheticError ? 'system' : 'assistant',
        timestamp: msg.timestamp,
        segments,
        metadata: {
          agent: 'claude',
          model: msg.message?.model,
          duration: msg.message?.duration,
          tokens: msg.message?.usage ? 
            (msg.message.usage.input_tokens || 0) + (msg.message.usage.output_tokens || 0) : 
            undefined,
          cost: msg.message?.usage?.cost,
          systemSubtype: isSyntheticError ? 'error' : undefined
        }
      };
    }
    
    return null;
  }
  
  private parseSystemMessage(msg: ClaudeRawMessage): UnifiedMessage | null {
    if (msg.subtype === 'init') {
      // Extract slash commands if available
      if (msg.slash_commands && Array.isArray(msg.slash_commands)) {
        console.log('[slash-debug] Detected slash commands in init message:', msg.slash_commands);
        // Store slash commands in localStorage keyed by session_id
        // We'll update this to use panel context later
        if (msg.session_id) {
          try {
            const slashCommandsKey = `slashCommands_${msg.session_id}`;
            localStorage.setItem(slashCommandsKey, JSON.stringify(msg.slash_commands));
            console.log('[slash-debug] Stored slash commands for session:', msg.session_id);
          } catch (e) {
            console.warn('[slash-debug] Failed to store slash commands:', e);
          }
        }
      }

      return {
        id: msg.id || `system_init_msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: msg.timestamp,
        segments: [{
          type: 'system_info',
          info: {
            cwd: msg.cwd,
            model: msg.model,
            tools: msg.tools,
            mcp_servers: msg.mcp_servers,
            permissionMode: msg.permissionMode,
            session_id: msg.session_id,
            slash_commands: msg.slash_commands
          }
        }],
        metadata: {
          systemSubtype: 'init',
          sessionInfo: msg
        }
      };
    } else if (msg.subtype === 'context_compacted') {
      return {
        id: msg.id || `context_compacted_msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: msg.timestamp,
        segments: [
          { type: 'text', content: msg.summary || '' },
          { type: 'system_info', info: { message: msg.message } }
        ],
        metadata: {
          systemSubtype: 'context_compacted'
        }
      };
    } else if (msg.subtype === 'error') {
      return {
        id: msg.id || `error_msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: msg.timestamp,
        segments: [{ 
          type: 'system_info', 
          info: {
            error: msg.error,
            details: msg.details,
            message: msg.message
          }
        }],
        metadata: {
          systemSubtype: 'error'
        }
      };
    } else if (msg.subtype === 'git_operation') {
      return {
        id: msg.id || `git_operation_msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: msg.timestamp,
        segments: [{ 
          type: 'text', 
          content: (typeof msg.message === 'string' ? msg.message : '') || (typeof msg.raw_output === 'string' ? msg.raw_output : '') || ''
        }],
        metadata: {
          systemSubtype: 'git_operation'
        }
      };
    } else if (msg.subtype === 'git_error') {
      return {
        id: msg.id || `git_error_msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: msg.timestamp,
        segments: [{ 
          type: 'text', 
          content: (typeof msg.message === 'string' ? msg.message : '') || (typeof msg.raw_output === 'string' ? msg.raw_output : '') || ''
        }],
        metadata: {
          systemSubtype: 'git_error'
        }
      };
    }
    
    return null;
  }
  
  private parseResultMessage(msg: ClaudeRawMessage): UnifiedMessage | null {
    // Handle execution result messages - especially errors
    if (msg.is_error && msg.result) {
      return {
        id: msg.id || `error_msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: msg.timestamp,
        segments: [{ 
          type: 'text', 
          content: `Error: ${msg.result}`
        }],
        metadata: {
          systemSubtype: 'error',
          duration: msg.duration_ms,
          cost: msg.total_cost_usd
        }
      };
    }
    
    return null;
  }
  
  private extractTextContent(msg: ClaudeRawMessage): string {
    // Handle Claude format: message.content as array of content blocks
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      return msg.message.content
        .filter((block: ContentBlock) => block.type === 'text')
        .map((block: ContentBlock) => block.text || '')
        .join('\n')
        .trim();
    }
    
    // Handle direct string content
    if (typeof msg.message?.content === 'string') {
      return msg.message.content.trim();
    }
    
    // Handle direct content field  
    if (typeof msg.content === 'string') {
      return msg.content.trim();
    }
    
    // Handle non-string content by converting to string
    if (msg.content && typeof msg.content === 'object') {
      return JSON.stringify(msg.content);
    }
    
    return '';
  }
  
  supportsStreaming(): boolean {
    return true;
  }
  
  supportsThinking(): boolean {
    return true;
  }
  
  supportsToolCalls(): boolean {
    return true;
  }
  
  getAgentName(): string {
    return 'Claude';
  }
}
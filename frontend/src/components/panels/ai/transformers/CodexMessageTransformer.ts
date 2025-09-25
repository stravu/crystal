import { MessageTransformer, UnifiedMessage, ToolCall, ToolResult } from './MessageTransformer';

// Interface for raw outputs from Codex (typically from database)
interface CodexRawOutput {
  type: 'json' | 'stdout' | 'stderr';
  data: string | unknown;
  timestamp?: string;
  [key: string]: unknown;
}

// Interface for text items from Codex user input
interface CodexTextItem {
  type: 'text';
  text: string;
}

// Codex message structures are complex and dynamic, so we'll use 'any' for flexibility

export class CodexMessageTransformer implements MessageTransformer {
  private messageIdCounter = 0;
  private toolCalls = new Map<string, ToolCall>();
  private toolCallIdCounter = 0;
  private originalPrompt: string | null = null; // Track original prompt from session info

  private resetToolCallState() {
    this.toolCalls.clear();
    this.toolCallIdCounter = 0;
    this.originalPrompt = null; // Reset original prompt tracking
  }

  private createToolCallId(): string {
    this.toolCallIdCounter += 1;
    return `tool_${this.toolCallIdCounter}`;
  }

  private registerToolCall(providedId: string | undefined, name: string, input: any): ToolCall {
    const id = providedId || this.createToolCallId();
    let toolCall = this.toolCalls.get(id);

    if (toolCall) {
      toolCall.name = name;
      toolCall.input = input;
      toolCall.status = 'pending';
      toolCall.result = undefined;
    } else {
      toolCall = {
        id,
        name,
        input,
        status: 'pending'
      };
      this.toolCalls.set(id, toolCall);
    }

    return toolCall;
  }

  private getMostRecentPendingToolCall(): ToolCall | undefined {
    const values = Array.from(this.toolCalls.values());
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i].status === 'pending') {
        return values[i];
      }
    }
    return undefined;
  }

  private applyResultToToolCall(providedId: string | undefined, result: ToolResult, isError: boolean): string {
    let id = providedId;
    let toolCall = id ? this.toolCalls.get(id) : undefined;

    if (!toolCall && !id) {
      toolCall = this.getMostRecentPendingToolCall();
      id = toolCall?.id;
    }

    if (!toolCall) {
      id = id || this.createToolCallId();
      toolCall = {
        id,
        name: 'unknown',
        status: 'pending'
      };
      this.toolCalls.set(id, toolCall);
    }

    toolCall.status = isError ? 'error' : 'success';
    toolCall.result = result;

    return toolCall.id;
  }

  private normalizeTimestamp(timestamp?: string | Date): string {
    if (!timestamp) {
      return new Date().toISOString();
    }

    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }

    return timestamp;
  }

  /**
   * Check if a prompt has been enhanced with structured commit instructions
   */
  private isEnhancedPrompt(content: string): boolean {
    if (!content || !this.originalPrompt) {
      return false;
    }
    
    // If the content starts with the original prompt and has additional content, it's likely enhanced
    if (content.startsWith(this.originalPrompt) && content.length > this.originalPrompt.length) {
      const additionalContent = content.substring(this.originalPrompt.length).trim();
      // Check for specific structured commit template indicators from DEFAULT_STRUCTURED_PROMPT_TEMPLATE
      return additionalContent.includes('After completing the requested changes') ||
             additionalContent.includes('please create a git commit with an appropriate message') ||
             additionalContent.includes('Conventional Commits format') ||
             additionalContent.includes('feat:, fix:, docs:, style:, refactor:, test:, chore:') ||
             additionalContent.includes('Only commit files that are directly related to this task') ||
             // Also check for generic structured commit indicators
             additionalContent.includes('Your commit message should') ||
             additionalContent.includes('structured commit format') ||
             additionalContent.includes('commit message template') ||
             additionalContent.includes('COMMIT MESSAGE STRUCTURE') ||
             additionalContent.includes('**Structured Commit Guidelines**');
    }
    
    return false;
  }

  transform(rawOutputs: CodexRawOutput[]): UnifiedMessage[] {
    const messages: UnifiedMessage[] = [];
    this.resetToolCallState();

    for (const output of rawOutputs) {
      const message = this.parseOutput(output);
      if (message) {
        messages.push(message);
      }
    }
    
    return messages;
  }

  private parseOutput(output: any): UnifiedMessage | null {
    // Data should already be parsed when coming from database
    // Only parse if it's still a string (shouldn't happen with current setup)
    let parsedData = output.data;
    if (output.type === 'json' && typeof output.data === 'string') {
      try {
        parsedData = JSON.parse(output.data);
      } catch (e) {
        console.error('[CodexMessageTransformer] Failed to parse JSON data:', e);
        console.error('[CodexMessageTransformer] Raw data:', output.data);
        return null;
      }
    }
    
    // Handle stdout/stderr as system messages
    if (output.type === 'stdout' || output.type === 'stderr') {
      // Filter out Codex debug logs from stderr
      if (output.type === 'stderr' && typeof parsedData === 'string') {
        // Check if this is a Codex debug log line
        // Pattern: [timestamp] INFO/DEBUG/etc codex_core::codex: FunctionCall: ...
        if (parsedData.includes('codex_core::codex') || 
            parsedData.includes('FunctionCall:') ||
            parsedData.includes('[32m INFO[0m') ||
            parsedData.includes('[33m WARN[0m') ||
            parsedData.includes('[31m ERROR[0m')) {
          // Skip Codex internal debug logs
          return null;
        }
      }
      
      // Only return if there's actual content
      if (parsedData && parsedData.trim()) {
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(output.timestamp),
          segments: [{
            type: 'text',
            content: parsedData
          }],
          metadata: {
            agent: 'codex',
            streamType: output.type
          }
        };
      }
      
      return null;
    }
    
    // Handle JSON messages
    if (output.type === 'json' && parsedData) {
      return this.parseJsonMessage(parsedData, output.timestamp);
    }
    
    return null;
  }

  private parseJsonMessage(message: any, timestamp?: string | Date): UnifiedMessage | null {
    
    // Handle Codex protocol operations (user input)
    if (message.op) {
      const op = message.op;
      
      if (op.type === 'user_input' && op.items) {
        // Extract text from items array
        const textItems = op.items.filter((item: CodexTextItem) => item.type === 'text');
        const content = textItems.map((item: CodexTextItem) => item.text).join('\n');
        
        // Use original prompt if available (for structured commit mode), otherwise use content as-is
        const displayContent = this.originalPrompt && this.isEnhancedPrompt(content) 
          ? this.originalPrompt 
          : (content || JSON.stringify(op));
        
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'user',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'text',
            content: displayContent
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
    }
    
    // Handle session info blocks that provide initial context
    if (message.type === 'session_info') {
      // Capture the original prompt for later use in user input messages
      if (message.original_prompt || message.initial_prompt) {
        this.originalPrompt = message.original_prompt || message.initial_prompt;
      }
      
      const sessionInfo = {
        type: 'session_info',
        initialPrompt: message.initial_prompt,
        codexCommand: message.codex_command,
        claudeCommand: message.claude_command,
        worktreePath: message.worktree_path,
        model: message.model,
        modelProvider: message.model_provider,
        approvalPolicy: message.approval_policy ?? message.approval,
        sandboxMode: message.sandbox_mode ?? message.sandbox,
        permissionMode: message.permission_mode,
        resumeSessionId: message.resume_session_id ?? message.resumeSessionId,
        isResume: message.is_resume ?? message.isResume,
        timestamp: this.normalizeTimestamp(timestamp)
      };

      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'system_info',
          info: sessionInfo
        }],
        metadata: {
          agent: 'codex',
          systemSubtype: 'session_info',
          sessionInfo
        }
      };
    }

    // Handle Codex protocol messages (responses)
    if (message.msg) {
      const msg = message.msg;
      
      // Filter out delta messages (streaming updates)
      if (msg.type === 'agent_reasoning_delta' || msg.type === 'agent_message_delta') {
        return null; // Skip these messages
      }
      
      // Session configured
      if (msg.type === 'session_configured') {
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'system_info',
            info: {
              type: 'session_configured',
              model: msg.model || 'default model'
            }
          }],
          metadata: {
            agent: 'codex',
            model: msg.model
          }
        };
      }
      
      // User input
      if (msg.type === 'user_input') {
        const content = msg.content || msg.text || JSON.stringify(msg);
        
        // Use original prompt if available (for structured commit mode), otherwise use content as-is
        const displayContent = this.originalPrompt && this.isEnhancedPrompt(content) 
          ? this.originalPrompt 
          : content;
        
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'user',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'text',
            content: displayContent
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      // Agent reasoning (thinking)
      if (msg.type === 'agent_reasoning') {
        const content = msg.content || msg.text || '';
        if (!content.trim()) return null;
        
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'assistant',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'thinking',
            content: content
          }],
          metadata: {
            agent: 'codex',
            model: msg.model || 'gpt-4o'
          }
        };
      }
      
      // Assistant message (complete, not delta)
      if (msg.type === 'assistant_message' || msg.type === 'agent_message' || msg.type === 'text') {
        // Skip if it's empty or just a delta
        const content = msg.message || msg.text || msg.content || '';
        if (!content.trim()) return null;
        
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'assistant',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'text',
            content: content
          }],
          metadata: {
            agent: 'codex',
            model: msg.model || 'gpt-4o'
          }
        };
      }

      if (msg.type === 'error') {
        const errorMessage = msg.message || msg.error || 'Error';
        const errorDetails = msg.details || msg.detail || msg.stack;

        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'error',
            error: {
              message: errorMessage,
              details: typeof errorDetails === 'string' ? errorDetails : errorDetails ? JSON.stringify(errorDetails, null, 2) : undefined
            }
          }],
          metadata: {
            agent: 'codex',
            systemSubtype: 'error'
          }
        };
      }

      // Handle stream errors (e.g., authentication, retry errors)
      if (msg.type === 'stream_error') {
        const errorMessage = msg.message || 'Stream error';
        let errorDetails = errorMessage;
        
        // Check if this is a 401 Unauthorized error
        if (errorMessage.includes('401 Unauthorized')) {
          errorDetails = `${errorMessage}\n\nYou may need to authenticate with Codex. Try running 'codex auth login' in a terminal to login with your Codex account.`;
        }
        
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'error',
            error: {
              message: 'Stream Error',
              details: errorDetails
            }
          }],
          metadata: {
            agent: 'codex',
            systemSubtype: 'stream_error'
          }
        };
      }
      
      // Tool call
      if (msg.type === 'tool_call') {
        const toolCall = this.registerToolCall(msg.call_id || msg.tool_call_id || msg.id, msg.tool || 'unknown', msg.args || msg);

        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'assistant',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'tool_call',
            tool: toolCall
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      // Tool result
      if (msg.type === 'tool_result') {
        const content = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
        const isError = Boolean(msg.is_error || msg.success === false || msg.status === 'error');
        const result: ToolResult = {
          content,
          isError
        };

        if (msg.metadata) {
          result.metadata = msg.metadata;
        }

        const toolCallId = this.applyResultToToolCall(msg.tool_call_id, result, isError);

        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'tool_result',
            result: {
              toolCallId,
              content: result.content,
              isError: result.isError,
              metadata: result.metadata
            }
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      // Task started/complete
      if (msg.type === 'task_started') {
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'system_info',
            info: {
              type: 'task_started',
              model_context_window: msg.model_context_window
            }
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      if (msg.type === 'task_complete') {
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'system_info',
            info: {
              type: 'task_complete',
              last_message: msg.last_agent_message
            }
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      // Agent reasoning section break (separator for thinking sections)
      if (msg.type === 'agent_reasoning_section_break') {
        return null; // Skip these as they're just visual separators
      }
      
      // Command execution messages
      if (msg.type === 'exec_command_begin') {
        const command = Array.isArray(msg.command) 
          ? msg.command.join(' ') 
          : msg.command;

        const toolCall = this.registerToolCall(msg.call_id, 'exec_command', {
          command,
          cwd: msg.cwd,
          parsed_cmd: msg.parsed_cmd
        });

        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'assistant',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'tool_call',
            tool: toolCall
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      if (msg.type === 'exec_command_output_delta') {
        // Skip delta messages as they're streaming updates
        return null;
      }
      
      if (msg.type === 'exec_command_end') {
        const output = msg.formatted_output || msg.aggregated_output || 
                      `${msg.stdout || ''}${msg.stderr || ''}`;
        const result: ToolResult = {
          content: (output || '').trim() || 'Command completed',
          isError: msg.exit_code !== 0,
          metadata: {
            exitCode: msg.exit_code,
            duration: msg.duration
          }
        };

        const toolCallId = this.applyResultToToolCall(msg.call_id, result, result.isError ?? false);

        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'tool_result',
            result: {
              toolCallId,
              content: result.content,
              isError: result.isError,
              metadata: result.metadata
            }
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      // Patch/file editing messages
      if (msg.type === 'patch_apply_begin') {
        const changes = msg.changes || {};
        const fileList = Object.keys(changes).map(path => {
          const change = changes[path];
          if (change.add) return `+ ${path}`;
          if (change.modify) return `~ ${path}`;
          if (change.delete) return `- ${path}`;
          return path;
        }).join('\n');
        
        const toolCall = this.registerToolCall(msg.call_id, 'patch_apply', {
          files: fileList,
          changes,
          auto_approved: msg.auto_approved
        });

        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'assistant',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'tool_call',
            tool: toolCall
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      if (msg.type === 'patch_apply_end') {
        const result = msg.success 
          ? (msg.stdout || 'Patch applied successfully')
          : (msg.stderr || msg.stdout || 'Patch failed');
        const toolResult: ToolResult = {
          content: result,
          isError: !msg.success
        };

        const toolCallId = this.applyResultToToolCall(msg.call_id, toolResult, toolResult.isError ?? false);

        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'tool_result',
            result: {
              toolCallId,
              content: toolResult.content,
              isError: toolResult.isError
            }
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      // Turn diff (shows changes made in this turn)
      if (msg.type === 'turn_diff') {
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'diff',
            diff: msg.unified_diff || ''
          }],
          metadata: {
            agent: 'codex'
          }
        };
      }
      
      // Token count information
      if (msg.type === 'token_count') {
        return null; // Skip showing token usage telemetry in the output view
      }
    }
    
    // Filter out delta messages at the top level
    if (message.type === 'agent_reasoning_delta' || message.type === 'agent_message_delta') {
      return null;
    }
    
    // Handle frontend-generated messages or direct protocol messages
    if (message.type === 'user_input' || message.type === 'user') {
      const content = message.content || message.text || JSON.stringify(message);
      
      // Use original prompt if available (for structured commit mode), otherwise use content as-is
      const displayContent = this.originalPrompt && this.isEnhancedPrompt(content) 
        ? this.originalPrompt 
        : content;
      
      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'user',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'text',
          content: displayContent
        }],
        metadata: {
          agent: 'codex'
        }
      };
    }
    
    if (message.type === 'assistant_response' || message.type === 'assistant' || message.type === 'text') {
      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'assistant',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'text',
          content: message.content || message.text || JSON.stringify(message)
        }],
        metadata: {
          agent: 'codex',
          model: 'gpt-4o'
        }
      };
    }

    if (message.type === 'tool_call') {
      const toolCall = this.registerToolCall(message.call_id || message.id, message.name || 'unknown', message.arguments || message);

      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'assistant',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'tool_call',
          tool: toolCall
        }],
        metadata: {
          agent: 'codex'
        }
      };
    }
    
    if (message.type === 'system') {
      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'text',
          content: message.message || JSON.stringify(message)
        }],
        metadata: {
          agent: 'codex'
        }
      };
    }

    // Handle Codex runtime configuration summaries that don't include a type field
    if (!message.type && (message.provider || message.model_provider) && message.model) {
      const runtimeInfo = {
        type: 'session_runtime',
        provider: message.provider || message.model_provider,
        model: message.model,
        sandboxMode: message.sandbox_mode ?? message.sandbox,
        approvalPolicy: message.approval_policy ?? message.approval,
        reasoningEffort: message['reasoning effort'] ?? message.reasoning_effort ?? message.reasoningEffort,
        reasoningSummaries: message['reasoning summaries'] ?? message.reasoning_summaries ?? message.reasoningSummaries,
        workdir: message.workdir || message.cwd,
        raw: message
      };

      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'system_info',
          info: runtimeInfo
        }],
        metadata: {
          agent: 'codex',
          systemSubtype: 'session_runtime'
        }
      };
    }

    // Handle plain prompt objects to show as user messages
    if (typeof message.prompt === 'string' && message.prompt.trim()) {
      // Use original prompt if available (for structured commit mode), otherwise use prompt as-is
      const displayContent = this.originalPrompt && this.isEnhancedPrompt(message.prompt) 
        ? this.originalPrompt 
        : message.prompt;
      
      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'user',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'text',
          content: displayContent
        }],
        metadata: {
          agent: 'codex',
          source: 'prompt'
        }
      };
    }

    // Handle session messages (e.g., errors, status updates)
    if (message.type === 'session' && message.data) {
      const data = message.data;
      // Check if it's an error message
      if (data.status === 'error') {
        // Build the error message
        let content = data.message || 'Session error';
        if (data.details) {
          content = data.details; // The details field contains the full error message with instructions
        }
        
        return {
          id: `msg_${++this.messageIdCounter}`,
          role: 'system',
          timestamp: this.normalizeTimestamp(timestamp),
          segments: [{
            type: 'error',
            error: {
              message: data.message || 'Error',
              details: content
            }
          }],
          metadata: {
            agent: 'codex',
            sessionStatus: data.status
          }
        };
      }
      
      // Handle other session status messages
      return {
        id: `msg_${++this.messageIdCounter}`,
        role: 'system',
        timestamp: this.normalizeTimestamp(timestamp),
        segments: [{
          type: 'system_info',
          info: {
            type: 'session_status',
            status: data.status,
            message: data.message || '',
            details: data.details
          }
        }],
        metadata: {
          agent: 'codex',
          sessionStatus: data.status
        }
      };
    }
    
    // Default fallback: show raw JSON for unrecognized message types
    return {
      id: `msg_${++this.messageIdCounter}`,
      role: 'system',
      timestamp: this.normalizeTimestamp(timestamp),
      segments: [{
        type: 'text',
        content: `\`\`\`json\n${JSON.stringify(message, null, 2)}\n\`\`\``
      }],
      metadata: {
        agent: 'codex',
        raw: true,
        messageType: message.type || message.msg?.type || 'unknown'
      }
    };
  }

  parseMessage(raw: any): UnifiedMessage | null {
    return this.parseOutput(raw);
  }

  supportsStreaming(): boolean {
    return true;
  }

  supportsThinking(): boolean {
    return true; // Codex has agent_reasoning which is similar to thinking
  }

  supportsToolCalls(): boolean {
    return true;
  }
  
  getAgentName(): string {
    return 'Codex';
  }
}

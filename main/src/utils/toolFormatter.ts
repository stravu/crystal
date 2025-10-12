import * as path from 'path';
import { formatJsonForOutput } from './formatters';
import type { ClaudeJsonMessage } from '../types/session';

interface ToolCall {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

interface PendingToolCall {
  call: ToolCall;
  timestamp: string;
}

interface TodoItem {
  status: string;
  content: string;
}

interface ThinkingItem {
  type: 'thinking';
  thinking?: string;
}

interface TextItem {
  type: 'text';
  text?: string;
}

type ContentItem = ThinkingItem | TextItem | ToolCall | ToolResult;

// Store pending tool calls to match with their results
const pendingToolCalls = new Map<string, PendingToolCall>();

/**
 * Recursively filter out base64 data from any object structure
 */
function filterBase64Data(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => filterBase64Data(item));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const filtered: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;
    
    for (const key in objRecord) {
      if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
        // Check if this is a base64 source object
        const sourceObj = objRecord[key] as Record<string, unknown>;
        if (key === 'source' && sourceObj?.type === 'base64' && sourceObj?.data) {
          // Replace base64 data with placeholder
          filtered[key] = {
            ...sourceObj,
            data: '[Base64 data filtered]'
          };
        } else {
          // Recursively filter nested objects
          filtered[key] = filterBase64Data(objRecord[key]);
        }
      }
    }
    
    return filtered;
  }

  // Return primitive values as-is
  return obj;
}

/**
 * Convert absolute file paths to relative paths based on the git repository root
 */
function makePathsRelative(content: unknown, gitRepoPath?: string): string {
  // Handle non-string content
  let stringContent: string;
  if (typeof content !== 'string') {
    if (content === null || content === undefined) {
      return '';
    }
    // Convert to string if it's an object or array
    stringContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
  } else {
    stringContent = content;
  }
  
  if (!gitRepoPath) return stringContent;
  
  // Match common file path patterns
  const pathRegex = /([\\/](?:Users|home|var|tmp|mnt|opt)[\\/][^\\s\\n]+)/g;
  
  return stringContent.replace(pathRegex, (match: string) => {
    try {
      // Find the worktree path in the match
      const worktreeMatch = match.match(/worktrees[\\/][^\\/]+/);
      if (worktreeMatch) {
        // Extract everything after the worktree name
        const afterWorktree = match.substring(match.indexOf(worktreeMatch[0]) + worktreeMatch[0].length);
        return afterWorktree;
      }
      
      // Otherwise try to make it relative to git repo
      if (match.includes(gitRepoPath)) {
        const relativePath = path.relative(gitRepoPath, match);
        return relativePath.startsWith('..') ? match : relativePath;
      }
      
      return match;
    } catch {
      return match;
    }
  });
}

/**
 * Format tool call and response as a unified display
 */
export function formatToolInteraction(
  toolCall: ToolCall,
  toolResult: ToolResult | null,
  callTimestamp: string,
  resultTimestamp?: string,
  gitRepoPath?: string
): string {
  // Safely parse timestamp
  let timestamp: string;
  try {
    const date = new Date(callTimestamp);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }
    timestamp = date.toLocaleTimeString();
  } catch {
    timestamp = new Date().toLocaleTimeString();
  }
  
  // Format the tool call header
  // Special header for slash commands
  let output: string;
  if (toolCall.name === 'SlashCommand') {
    const command = toolCall.input.command || 'unknown';
    console.log(`[slash-debug] Formatting SlashCommand tool: ${command}`);
    output = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[45m\x1b[97m ⚡ SLASH COMMAND \x1b[0m \x1b[1m\x1b[95m${command}\x1b[0m\r\n`;
  } else {
    output = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[33m🔧 Tool: ${toolCall.name}\x1b[0m\r\n`;
  }
  
  // Format parameters based on tool type
  if (toolCall.input && Object.keys(toolCall.input).length > 0) {
    output += `\x1b[90m┌─ Parameters:\x1b[0m\r\n`;
    
    // Special formatting for common tools
    if (toolCall.name === 'Grep' && toolCall.input.pattern) {
      output += `\x1b[90m│  Pattern: "${toolCall.input.pattern}"\x1b[0m\r\n`;
      if (toolCall.input.path) {
        output += `\x1b[90m│  Path: ${makePathsRelative(toolCall.input.path, gitRepoPath)}\x1b[0m\r\n`;
      }
      if (toolCall.input.include) {
        output += `\x1b[90m│  Include: ${toolCall.input.include}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'Read' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
      if (toolCall.input.offset && typeof toolCall.input.offset === 'number') {
        const limit = typeof toolCall.input.limit === 'number' ? toolCall.input.limit : 2000;
        output += `\x1b[90m│  Lines: ${toolCall.input.offset}-${toolCall.input.offset + limit}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'Edit' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
      output += `\x1b[90m│  Replacements: ${toolCall.input.expected_replacements || 1}\x1b[0m\r\n`;
    } else if (toolCall.name === 'Bash' && toolCall.input.command) {
      output += `\x1b[90m│  $ ${toolCall.input.command}\x1b[0m\r\n`;
    } else if (toolCall.name === 'TodoWrite' && toolCall.input.todos) {
      output += `\x1b[90m│  Tasks updated:\x1b[0m\r\n`;
      (toolCall.input.todos as Array<{status: string; content: string}>).forEach((todo) => {
        const status = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '→' : '○';
        const statusColor = todo.status === 'completed' ? '\x1b[32m' : todo.status === 'in_progress' ? '\x1b[33m' : '\x1b[90m';
        output += `\x1b[90m│    ${statusColor}${status}\x1b[0m ${todo.content}\x1b[0m\r\n`;
      });
    } else if (toolCall.name === 'Write' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
      const content = typeof toolCall.input.content === 'string' ? toolCall.input.content : '';
      const lines = content.split('\n');
      output += `\x1b[90m│  Size: ${lines.length} lines\x1b[0m\r\n`;
    } else if (toolCall.name === 'Glob' && toolCall.input.pattern) {
      output += `\x1b[90m│  Pattern: ${toolCall.input.pattern}\x1b[0m\r\n`;
      if (toolCall.input.path) {
        output += `\x1b[90m│  Path: ${makePathsRelative(toolCall.input.path, gitRepoPath)}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'MultiEdit' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
      const edits = Array.isArray(toolCall.input.edits) ? toolCall.input.edits : [];
      output += `\x1b[90m│  Edits: ${edits.length} changes\x1b[0m\r\n`;
    } else if (toolCall.name === 'Task' && toolCall.input.prompt) {
      const prompt = String(toolCall.input.prompt);
      const truncated = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt;
      output += `\x1b[90m│  Description: ${toolCall.input.description || 'Task'}\x1b[0m\r\n`;
      output += `\x1b[90m│  Prompt: ${truncated}\x1b[0m\r\n`;
    } else if (toolCall.name === 'LS' && toolCall.input.path) {
      output += `\x1b[90m│  Path: ${makePathsRelative(toolCall.input.path, gitRepoPath)}\x1b[0m\r\n`;
      const ignoreList = Array.isArray(toolCall.input.ignore) ? toolCall.input.ignore : [];
      if (ignoreList.length) {
        output += `\x1b[90m│  Ignoring: ${ignoreList.join(', ')}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'TodoRead') {
      output += `\x1b[90m│  Reading current task list...\x1b[0m\r\n`;
    } else if (toolCall.name === 'SlashCommand' && toolCall.input.command) {
      // Special logging for slash commands with [slash-debug] prefix
      console.log(`[slash-debug] SlashCommand tool invoked: ${toolCall.input.command}`);
      output += `\x1b[90m│  \x1b[0m\x1b[95mCommand: ${toolCall.input.command}\x1b[0m\r\n`;
      console.log(`[slash-debug] SlashCommand details:`, JSON.stringify(toolCall.input, null, 2));
    } else {
      // Generic parameter display
      const paramStr = JSON.stringify(toolCall.input, null, 2);
      const lines = paramStr.split('\n');
      const maxLines = 8;
      
      lines.slice(0, maxLines).forEach(line => {
        output += `\x1b[90m│  ${line}\x1b[0m\r\n`;
      });
      
      if (lines.length > maxLines) {
        output += `\x1b[90m│  ... (${lines.length - maxLines} more lines)\x1b[0m\r\n`;
      }
    }
  }
  
  // Add the result if available
  if (toolResult) {
    // Safely parse result timestamp
    let resultTime = '';
    if (resultTimestamp) {
      try {
        const { formatForDisplay, isValidTimestamp } = require('./timestampUtils');
        if (isValidTimestamp(resultTimestamp)) {
          resultTime = ` (${formatForDisplay(resultTimestamp)})`;
        }
      } catch {
        // Ignore invalid timestamp
      }
    }
    output += `\x1b[90m├─ Result${resultTime}:\x1b[0m\r\n`;
    
    if (toolResult.content) {
      // Check if this is an image read result
      let isImageResult = false;
      if (toolCall.name === 'Read' && toolCall.input.file_path) {
        try {
          // Check if the result is a JSON array with image data
          const parsed = JSON.parse(toolResult.content);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type === 'image') {
            isImageResult = true;
            // Display a friendly message instead of the base64 data
            output += `\x1b[90m│  \x1b[0m\x1b[37m[Image displayed to Claude Code]\x1b[0m\r\n`;
            output += `\x1b[90m│  \x1b[0m\x1b[90mFile: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
            if (parsed[0].source?.data) {
              const dataLength = parsed[0].source.data.length;
              const sizeKB = Math.round(dataLength * 0.75 / 1024); // Approximate base64 to bytes
              output += `\x1b[90m│  \x1b[0m\x1b[90mSize: ~${sizeKB} KB\x1b[0m\r\n`;
            }
          }
        } catch {
          // Not JSON or not an image, proceed with normal handling
        }
      }
      
      if (!isImageResult) {
        // Apply relative paths to the result content
        const processedContent = makePathsRelative(toolResult.content, gitRepoPath);
        const lines = processedContent.split('\n');
      // Show more lines for errors to ensure important information isn't hidden
      const isError = toolCall.name === 'Bash' && (
        toolResult.content.includes('error:') || 
        toolResult.content.includes('Error:') || 
        toolResult.content.includes('ERROR') ||
        toolResult.content.includes('fatal:') ||
        toolResult.content.includes('Command failed') ||
        toolResult.content.includes('aborted')
      );
      const maxLines = isError ? 30 : 15;
      
      // Special handling for file listings
      if (toolCall.name === 'Grep' && lines[0]?.startsWith('Found')) {
        output += `\x1b[37m│  ${lines[0]}\x1b[0m\r\n`;
        
        // Show file paths with better formatting
        lines.slice(1, Math.min(lines.length, maxLines)).forEach(line => {
          if (line.trim()) {
            output += `\x1b[90m│  \x1b[0m\x1b[37m• ${line.trim()}\x1b[0m\r\n`;
          }
        });
        
        if (lines.length > maxLines) {
          output += `\x1b[90m│  ... (${lines.length - maxLines} more files)\x1b[0m\r\n`;
        }
      } else if (toolCall.name === 'Glob' && lines[0]?.startsWith('Found')) {
        output += `\x1b[37m│  ${lines[0]}\x1b[0m\r\n`;
        
        // Show file paths with better formatting
        lines.slice(1, Math.min(lines.length, maxLines)).forEach(line => {
          if (line.trim()) {
            output += `\x1b[90m│  \x1b[0m\x1b[37m• ${line.trim()}\x1b[0m\r\n`;
          }
        });
        
        if (lines.length > maxLines) {
          output += `\x1b[90m│  ... (${lines.length - maxLines} more files)\x1b[0m\r\n`;
        }
      } else if (toolCall.name === 'TodoRead' && lines.length > 0) {
        output += `\x1b[37m│  Current Tasks:\x1b[0m\r\n`;
        lines.forEach(line => {
          if (line.includes('✓') || line.includes('completed')) {
            output += `\x1b[90m│  \x1b[32m${line}\x1b[0m\r\n`;
          } else if (line.includes('→') || line.includes('in_progress')) {
            output += `\x1b[90m│  \x1b[33m${line}\x1b[0m\r\n`;
          } else {
            output += `\x1b[90m│  \x1b[37m${line}\x1b[0m\r\n`;
          }
        });
      } else if (toolCall.name === 'Task') {
        // Task tool results are usually longer, show more lines
        const taskMaxLines = 25;
        lines.slice(0, taskMaxLines).forEach(line => {
          output += `\x1b[90m│  \x1b[37m${line}\x1b[0m\r\n`;
        });
        if (lines.length > taskMaxLines) {
          output += `\x1b[90m│  ... (${lines.length - taskMaxLines} more lines)\x1b[0m\r\n`;
        }
      } else {
        // Generic result display
        // Check if this is an error from a Bash command
        const isGitError = toolCall.name === 'Bash' && 
          lines.some(line => 
            line.includes('error:') || 
            line.includes('Error:') || 
            line.includes('ERROR') ||
            line.includes('fatal:') ||
            line.includes('Command failed') ||
            line.includes('aborted')
          );
        
        lines.slice(0, maxLines).forEach(line => {
          // Use red color for error lines, white for normal output
          let lineColor = '\x1b[37m'; // Default white
          
          if (isGitError) {
            // For git/bash errors, highlight specific error patterns
            if (line.includes('error:') || 
                line.includes('Error:') || 
                line.includes('ERROR') ||
                line.includes('fatal:') ||
                line.includes('Command failed') ||
                line.includes('aborted')) {
              lineColor = '\x1b[91m'; // Bright red for errors
            } else if (line.includes('warning:') || 
                       line.includes('Warning:') ||
                       line.includes('hint:')) {
              lineColor = '\x1b[93m'; // Yellow for warnings/hints
            }
          }
          
          output += `\x1b[90m│  \x1b[0m${lineColor}${line}\x1b[0m\r\n`;
        });
        
        if (lines.length > maxLines) {
          output += `\x1b[90m│  ... (${lines.length - maxLines} more lines)\x1b[0m\r\n`;
        }
      }
      } // Close the !isImageResult block
    } else {
      output += `\x1b[90m│  \x1b[0m\x1b[37m(empty result)\x1b[0m\r\n`;
    }
  } else {
    // Tool call is pending
    output += `\x1b[90m└─ \x1b[33m⏳ Executing...\x1b[0m\r\n`;
  }
  
  if (toolResult) {
    // Check if this was an error result
    const isError = toolCall.name === 'Bash' && toolResult.content && (
      toolResult.content.includes('error:') || 
      toolResult.content.includes('Error:') || 
      toolResult.content.includes('ERROR') ||
      toolResult.content.includes('fatal:') ||
      toolResult.content.includes('Command failed') ||
      toolResult.content.includes('aborted')
    );
    
    if (isError) {
      output += `\x1b[90m└─ \x1b[91m✗ Failed\x1b[0m\r\n`;
    } else {
      output += `\x1b[90m└─ ✓ Complete\x1b[0m\r\n`;
    }
  }
  
  return output + '\r\n';
}

/**
 * Enhanced JSON to output formatter that unifies tool calls and responses
 */
export function formatJsonForOutputEnhanced(jsonMessage: Record<string, unknown>, gitRepoPath?: string): string {
  // CODEX COMPATIBILITY: Unwrap old Codex format {"id":"0","msg":{...}}
  let unwrappedMessage = jsonMessage;
  if (jsonMessage.id !== undefined && jsonMessage.msg && typeof jsonMessage.msg === 'object') {
    console.log('[Codex] Detected old Codex format, unwrapping msg property');
    unwrappedMessage = { ...jsonMessage.msg as Record<string, unknown>, timestamp: jsonMessage.timestamp };
  }

  // Ensure we have a valid timestamp
  let timestamp: string;
  try {
    if (unwrappedMessage.timestamp && typeof unwrappedMessage.timestamp === 'string') {
      // Validate the provided timestamp
      const date = new Date(unwrappedMessage.timestamp);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid timestamp');
      }
      timestamp = unwrappedMessage.timestamp;
    } else {
      // Use current time if no timestamp provided
      timestamp = new Date().toISOString();
    }
  } catch {
    // Fallback to current time if timestamp is invalid
    timestamp = new Date().toISOString();
  }

  // CODEX COMPATIBILITY: Handle new Codex protocol message types
  const messageType = unwrappedMessage.type as string;

  // Handle thread lifecycle messages
  if (messageType === 'thread.started' || messageType === 'turn.started') {
    // Don't display thread/turn lifecycle messages - they're internal
    return '';
  }

  // Handle item messages (reasoning, command execution, etc.)
  if (messageType === 'item.started' || messageType === 'item.completed') {
    const item = unwrappedMessage.item as Record<string, unknown> | undefined;
    if (!item) return '';

    const itemType = item.type as string;
    const time = new Date(timestamp).toLocaleTimeString();

    if (itemType === 'reasoning') {
      const reasoningText = item.text as string || '';
      return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[96m🧠 ${reasoningText}\x1b[0m\r\n`;
    }

    if (itemType === 'command_execution') {
      const command = item.command as string || '';
      const status = item.status as string || '';
      const exitCode = item.exit_code as number | undefined;
      const aggregatedOutput = item.aggregated_output as string || '';

      if (messageType === 'item.started') {
        return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[33m🔧 Executing: ${command}\x1b[0m\r\n`;
      } else {
        // item.completed
        const isError = exitCode !== undefined && exitCode !== 0;
        const statusSymbol = isError ? '✗' : '✓';
        const statusColor = isError ? '\x1b[91m' : '\x1b[32m';

        let output = `\r\n\x1b[36m[${time}]\x1b[0m ${statusColor}${statusSymbol}\x1b[0m \x1b[33m${command}\x1b[0m`;
        if (exitCode !== undefined) {
          output += ` \x1b[90m(exit: ${exitCode})\x1b[0m`;
        }
        output += '\r\n';

        if (aggregatedOutput && aggregatedOutput.trim()) {
          const lines = aggregatedOutput.split('\n');
          const maxLines = 15;
          lines.slice(0, maxLines).forEach(line => {
            output += `\x1b[90m│  \x1b[37m${line}\x1b[0m\r\n`;
          });
          if (lines.length > maxLines) {
            output += `\x1b[90m│  ... (${lines.length - maxLines} more lines)\x1b[0m\r\n`;
          }
        }

        return output + '\r\n';
      }
    }

    if (itemType === 'text_delta') {
      const text = item.text as string || '';
      if (!text.trim()) return '';

      return `\x1b[37m${text}\x1b[0m`;
    }

    if (itemType === 'message') {
      const text = item.text as string || '';
      if (!text.trim()) return '';

      const time = new Date(timestamp).toLocaleTimeString();
      return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[35m🤖 ${text}\x1b[0m\r\n\r\n`;
    }
  }

  // Handle old Codex message types (after unwrapping)
  if (messageType === 'task_started') {
    return ''; // Silent, no output needed
  }

  if (messageType === 'agent_reasoning') {
    const reasoningText = unwrappedMessage.text as string || '';
    const time = new Date(timestamp).toLocaleTimeString();
    return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[96m🧠 ${reasoningText}\x1b[0m\r\n`;
  }

  if (messageType === 'agent_message') {
    const messageText = unwrappedMessage.message as string || '';
    const time = new Date(timestamp).toLocaleTimeString();
    return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[35m🤖 ${messageText}\x1b[0m\r\n\r\n`;
  }

  if (messageType === 'agent_reasoning_section_break') {
    return ''; // Silent separator, no visual output needed
  }

  if (messageType === 'token_count') {
    // Optional: Could display token usage, but for now keep it silent
    return '';
  }

  // Handle messages from assistant (Claude Code format)
  if (unwrappedMessage.type === 'assistant') {
    const messageObj = unwrappedMessage.message as {content?: unknown} | undefined;
    const content = messageObj?.content;
    
    if (Array.isArray(content)) {
      let output = '';
      
      // First, handle thinking messages
      const thinkingItems = content.filter((item: ContentItem): item is ThinkingItem => item.type === 'thinking');
      if (thinkingItems.length > 0) {
        thinkingItems.forEach((item: ThinkingItem) => {
          const time = (() => {
            try {
              const date = new Date(timestamp);
              return !isNaN(date.getTime()) ? date.toLocaleTimeString() : new Date().toLocaleTimeString();
            } catch {
              return new Date().toLocaleTimeString();
            }
          })();
          
          const thinkingContent = item.thinking || '';
          
          // Format thinking content with proper indentation and wrapping
          const lines = thinkingContent.split('\n');
          const formattedThinking = lines
            .map((line: string) => `\x1b[90m    ${line}\x1b[0m`)
            .join('\r\n');
          
          output += `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[96m🧠 Thinking\x1b[0m\r\n` +
                   `${formattedThinking}\r\n\r\n`;
        });
      }
      
      // Then handle tool uses
      const toolUses = content.filter((item: ContentItem): item is ToolCall => item.type === 'tool_use');
      if (toolUses.length > 0) {
        // Store tool calls for later matching
        toolUses.forEach((toolUse: ToolCall) => {
          pendingToolCalls.set(toolUse.id, {
            call: toolUse,
            timestamp
          });
        });
        
        // Format each tool call
        output += toolUses
          .map((toolUse: ToolCall) => 
            formatToolInteraction(toolUse, null, timestamp, undefined, gitRepoPath)
          )
          .join('');
      }
      
      // Finally, handle regular text content
      const textContent = content
        .filter((item: ContentItem): item is TextItem => item.type === 'text')
        .map((item: TextItem) => item.text || '')
        .join('\n\n');
      
      if (textContent) {
        const time = (() => {
          try {
            const date = new Date(timestamp);
            return !isNaN(date.getTime()) ? date.toLocaleTimeString() : new Date().toLocaleTimeString();
          } catch {
            return new Date().toLocaleTimeString();
          }
        })();
        output += `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[35m🤖 Assistant\x1b[0m\r\n` +
                 `\x1b[37m${textContent}\x1b[0m\r\n\r\n`;
      }
      
      // Return accumulated output (could be thinking + text, or thinking + tools, etc.)
      if (output) {
        return output;
      }
    }
  }

  // Handle tool results from user
  if (unwrappedMessage.type === 'user') {
    const messageObj = unwrappedMessage.message as {content?: unknown} | undefined;
    const content = messageObj?.content;
    
    if (Array.isArray(content)) {
      const toolResults = content.filter((item: ContentItem): item is ToolResult => item.type === 'tool_result');
      
      if (toolResults.length > 0) {
        // Match results with pending calls and format them
        return toolResults
          .map((result: ToolResult) => {
            const pending = pendingToolCalls.get(result.tool_use_id);
            
            if (pending) {
              pendingToolCalls.delete(result.tool_use_id);
              return formatToolInteraction(
                pending.call,
                result,
                pending.timestamp,
                timestamp,
                gitRepoPath
              );
            }
            
            // Orphaned tool result
            const time = (() => {
              try {
                const date = new Date(timestamp);
                return !isNaN(date.getTime()) ? date.toLocaleTimeString() : new Date().toLocaleTimeString();
              } catch {
                return new Date().toLocaleTimeString();
              }
            })();
            
            // Filter out any base64 data from the result
            let content = result.content || '';
            
            // First, filter out base64 data from the content
            const filteredContent = filterBase64Data(content);
            
            // Then convert to string for display
            if (typeof filteredContent === 'string') {
              content = makePathsRelative(filteredContent, gitRepoPath);
            } else if (filteredContent !== null && filteredContent !== undefined) {
              // Convert filtered object/array to string
              content = JSON.stringify(filteredContent, null, 2);
              content = makePathsRelative(content, gitRepoPath);
            }
            
            return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[90m📥 Tool Result [${result.tool_use_id}]\x1b[0m\r\n` +
                   `\x1b[37m${content}\x1b[0m\r\n\r\n`;
          })
          .join('');
      }
      
      // Handle regular text content from user
      const textContent = content
        .filter((item: ContentItem): item is TextItem => item.type === 'text')
        .map((item: TextItem) => item.text || '')
        .join(' ');
      
      if (textContent) {
        const time = (() => {
          try {
            const date = new Date(timestamp);
            return !isNaN(date.getTime()) ? date.toLocaleTimeString() : new Date().toLocaleTimeString();
          } catch {
            return new Date().toLocaleTimeString();
          }
        })();
        // Make user prompts more prominent with bright green background and bold text
        return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[42m\x1b[30m 👤 USER PROMPT \x1b[0m\r\n` +
               `\x1b[1m\x1b[92m${textContent}\x1b[0m\r\n` +
               `\x1b[90m${'─'.repeat(80)}\x1b[0m\r\n\r\n`;
      }
    }
  }


  // Handle session messages (like errors)
  if (unwrappedMessage.type === 'session') {
    const data = (unwrappedMessage.data as {status?: string; message?: string; details?: string}) || {};
    const time = (() => {
      try {
        const date = new Date(timestamp);
        return !isNaN(date.getTime()) ? date.toLocaleTimeString() : new Date().toLocaleTimeString();
      } catch {
        return new Date().toLocaleTimeString();
      }
    })();
    
    if (data.status === 'error') {
      return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[31m❌ Session Error\x1b[0m\r\n` +
             `\x1b[91m${data.message || 'An error occurred'}\x1b[0m\r\n\r\n` +
             (data.details ? `\x1b[90m${data.details}\x1b[0m\r\n\r\n` : '');
    }
    
    return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[90m📝 Session: ${data.status || 'update'}\x1b[0m\r\n`;
  }
  
  // Fall back to original formatter for other message types
  return formatJsonForOutput(unwrappedMessage as ClaudeJsonMessage);
}

// Re-export the original formatter for backwards compatibility
export { formatJsonForOutput };
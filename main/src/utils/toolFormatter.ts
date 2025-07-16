import * as path from 'path';
import { formatJsonForOutput } from './formatters';

interface ToolCall {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
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

// Store pending tool calls to match with their results
const pendingToolCalls = new Map<string, PendingToolCall>();

/**
 * Recursively filter out base64 data from any object structure
 */
function filterBase64Data(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => filterBase64Data(item));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const filtered: any = {};
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Check if this is a base64 source object
        if (key === 'source' && obj[key]?.type === 'base64' && obj[key]?.data) {
          // Replace base64 data with placeholder
          filtered[key] = {
            ...obj[key],
            data: '[Base64 data filtered]'
          };
        } else {
          // Recursively filter nested objects
          filtered[key] = filterBase64Data(obj[key]);
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
function makePathsRelative(content: any, gitRepoPath?: string): string {
  // Handle non-string content
  if (typeof content !== 'string') {
    if (content === null || content === undefined) {
      return '';
    }
    // Convert to string if it's an object or array
    content = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
  }
  
  if (!gitRepoPath) return content;
  
  // Match common file path patterns
  const pathRegex = /([\\/](?:Users|home|var|tmp|mnt|opt)[\\/][^\\s\\n]+)/g;
  
  return content.replace(pathRegex, (match: string) => {
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
  let output = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[33m🔧 Tool: ${toolCall.name}\x1b[0m\r\n`;
  
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
      if (toolCall.input.offset) {
        output += `\x1b[90m│  Lines: ${toolCall.input.offset}-${toolCall.input.offset + (toolCall.input.limit || 2000)}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'Edit' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
      output += `\x1b[90m│  Replacements: ${toolCall.input.expected_replacements || 1}\x1b[0m\r\n`;
    } else if (toolCall.name === 'Bash' && toolCall.input.command) {
      output += `\x1b[90m│  $ ${toolCall.input.command}\x1b[0m\r\n`;
    } else if (toolCall.name === 'TodoWrite' && toolCall.input.todos) {
      output += `\x1b[90m│  Tasks updated:\x1b[0m\r\n`;
      toolCall.input.todos.forEach((todo: any) => {
        const status = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '→' : '○';
        const statusColor = todo.status === 'completed' ? '\x1b[32m' : todo.status === 'in_progress' ? '\x1b[33m' : '\x1b[90m';
        output += `\x1b[90m│    ${statusColor}${status}\x1b[0m ${todo.content}\x1b[0m\r\n`;
      });
    } else if (toolCall.name === 'Write' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
      const lines = toolCall.input.content?.split('\n') || [];
      output += `\x1b[90m│  Size: ${lines.length} lines\x1b[0m\r\n`;
    } else if (toolCall.name === 'Glob' && toolCall.input.pattern) {
      output += `\x1b[90m│  Pattern: ${toolCall.input.pattern}\x1b[0m\r\n`;
      if (toolCall.input.path) {
        output += `\x1b[90m│  Path: ${makePathsRelative(toolCall.input.path, gitRepoPath)}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'MultiEdit' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path, gitRepoPath)}\x1b[0m\r\n`;
      output += `\x1b[90m│  Edits: ${toolCall.input.edits?.length || 0} changes\x1b[0m\r\n`;
    } else if (toolCall.name === 'Task' && toolCall.input.prompt) {
      const prompt = toolCall.input.prompt;
      const truncated = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt;
      output += `\x1b[90m│  Description: ${toolCall.input.description || 'Task'}\x1b[0m\r\n`;
      output += `\x1b[90m│  Prompt: ${truncated}\x1b[0m\r\n`;
    } else if (toolCall.name === 'LS' && toolCall.input.path) {
      output += `\x1b[90m│  Path: ${makePathsRelative(toolCall.input.path, gitRepoPath)}\x1b[0m\r\n`;
      if (toolCall.input.ignore?.length) {
        output += `\x1b[90m│  Ignoring: ${toolCall.input.ignore.join(', ')}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'TodoRead') {
      output += `\x1b[90m│  Reading current task list...\x1b[0m\r\n`;
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
export function formatJsonForOutputEnhanced(jsonMessage: any, gitRepoPath?: string): string {
  // Ensure we have a valid timestamp
  let timestamp: string;
  try {
    if (jsonMessage.timestamp) {
      // Validate the provided timestamp
      const date = new Date(jsonMessage.timestamp);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid timestamp');
      }
      timestamp = jsonMessage.timestamp;
    } else {
      // Use current time if no timestamp provided
      timestamp = new Date().toISOString();
    }
  } catch {
    // Fallback to current time if timestamp is invalid
    timestamp = new Date().toISOString();
  }
  
  // Handle messages from assistant
  if (jsonMessage.type === 'assistant' && jsonMessage.message?.content) {
    const content = jsonMessage.message.content;
    
    if (Array.isArray(content)) {
      let output = '';
      
      // First, handle thinking messages
      const thinkingItems = content.filter((item: any) => item.type === 'thinking');
      if (thinkingItems.length > 0) {
        thinkingItems.forEach((item: any) => {
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
      const toolUses = content.filter((item: any) => item.type === 'tool_use');
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
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
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
  if (jsonMessage.type === 'user' && jsonMessage.message?.content) {
    const content = jsonMessage.message.content;
    
    if (Array.isArray(content)) {
      const toolResults = content.filter((item: any) => item.type === 'tool_result');
      
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
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
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
  if (jsonMessage.type === 'session') {
    const data = jsonMessage.data || {};
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
  return formatJsonForOutput(jsonMessage);
}

// Re-export the original formatter for backwards compatibility
export { formatJsonForOutput };
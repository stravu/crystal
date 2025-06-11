// Simple fallback formatter for unknown message types
function formatJsonForOutput(jsonMessage: any): string {
  const timestamp = jsonMessage.timestamp || new Date().toISOString();
  const time = new Date(timestamp).toLocaleTimeString();
  
  // Handle system messages
  if (jsonMessage.type === 'system') {
    return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[90m⚙️  System: ${jsonMessage.subtype || 'info'}\x1b[0m\r\n\r\n`;
  }
  
  // Handle result messages
  if (jsonMessage.type === 'result') {
    const status = jsonMessage.is_error ? '❌ Error' : '✅ Success';
    // Removed cost display
    return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[90m${status}\x1b[0m\r\n\r\n`;
  }
  
  // Default formatting
  return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[90m${JSON.stringify(jsonMessage, null, 2)}\x1b[0m\r\n\r\n`;
}

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
 * Convert absolute file paths to relative paths
 */
function makePathsRelative(content: any): string {
  // Handle non-string content
  if (typeof content !== 'string') {
    if (content === null || content === undefined) {
      return '';
    }
    // Convert to string if it's an object or array
    content = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content);
  }
  
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
  resultTimestamp?: string
): string {
  const timestamp = new Date(callTimestamp).toLocaleTimeString();
  
  // Format the tool call header
  let output = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[33m🔧 Tool: ${toolCall.name}\x1b[0m\r\n`;
  
  // Format parameters based on tool type
  if (toolCall.input && Object.keys(toolCall.input).length > 0) {
    output += `\x1b[90m┌─ Parameters:\x1b[0m\r\n`;
    
    // Special formatting for common tools
    if (toolCall.name === 'Grep' && toolCall.input.pattern) {
      output += `\x1b[90m│  Pattern: "${toolCall.input.pattern}"\x1b[0m\r\n`;
      if (toolCall.input.path) {
        output += `\x1b[90m│  Path: ${makePathsRelative(toolCall.input.path)}\x1b[0m\r\n`;
      }
      if (toolCall.input.include) {
        output += `\x1b[90m│  Include: ${toolCall.input.include}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'Read' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path)}\x1b[0m\r\n`;
      if (toolCall.input.offset) {
        output += `\x1b[90m│  Lines: ${toolCall.input.offset}-${toolCall.input.offset + (toolCall.input.limit || 2000)}\x1b[0m\r\n`;
      }
    } else if (toolCall.name === 'Edit' && toolCall.input.file_path) {
      output += `\x1b[90m│  File: ${makePathsRelative(toolCall.input.file_path)}\x1b[0m\r\n`;
    } else if (toolCall.name === 'Bash' && toolCall.input.command) {
      output += `\x1b[90m│  $ ${toolCall.input.command}\x1b[0m\r\n`;
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
    const resultTime = resultTimestamp ? ` (${new Date(resultTimestamp).toLocaleTimeString()})` : '';
    output += `\x1b[90m├─ Result${resultTime}:\x1b[0m\r\n`;
    
    if (toolResult.content) {
      // Apply relative paths to the result content
      const processedContent = makePathsRelative(toolResult.content);
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
export function formatJsonForOutputEnhanced(jsonMessage: any): string {
  const timestamp = jsonMessage.timestamp || new Date().toISOString();
  
  // Handle tool calls from assistant
  if (jsonMessage.type === 'assistant' && jsonMessage.message?.content) {
    const content = jsonMessage.message.content;
    
    if (Array.isArray(content)) {
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
        return toolUses
          .map((toolUse: ToolCall) => 
            formatToolInteraction(toolUse, null, timestamp)
          )
          .join('');
      }
      
      // Handle regular text content
      const textContent = content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n\n');
      
      if (textContent) {
        const time = new Date(timestamp).toLocaleTimeString();
        return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[35m🤖 Assistant\x1b[0m\r\n` +
               `\x1b[37m${textContent}\x1b[0m\r\n\r\n`;
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
                timestamp
              );
            }
            
            // Orphaned tool result
            const time = new Date(timestamp).toLocaleTimeString();
            return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[90m📥 Tool Result [${result.tool_use_id}]\x1b[0m\r\n` +
                   `\x1b[37m${makePathsRelative(result.content || '')}\x1b[0m\r\n\r\n`;
          })
          .join('');
      }
      
      // Handle regular text content from user
      const textContent = content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join(' ');
      
      if (textContent) {
        const time = new Date(timestamp).toLocaleTimeString();
        // Make user prompts more prominent with bright green background and bold text
        return `\r\n\x1b[36m[${time}]\x1b[0m \x1b[1m\x1b[42m\x1b[30m 👤 USER PROMPT \x1b[0m\r\n` +
               `\x1b[1m\x1b[92m${textContent}\x1b[0m\r\n` +
               `\x1b[90m${'─'.repeat(80)}\x1b[0m\r\n\r\n`;
      }
    }
  }
  
  // Fall back to original formatter for other message types
  return formatJsonForOutput(jsonMessage);
}
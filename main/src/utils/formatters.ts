import { formatForDisplay, isValidTimestamp } from './timestampUtils';
import type { ClaudeJsonMessage, MessageContent } from '../types/session';

export function formatJsonForOutput(jsonMessage: ClaudeJsonMessage): string {
  // Safely parse timestamp
  let timestamp: string;
  try {
    const dateValue = jsonMessage.timestamp || new Date();
    if (isValidTimestamp(dateValue)) {
      timestamp = formatForDisplay(dateValue);
    } else {
      throw new Error('Invalid timestamp');
    }
  } catch {
    timestamp = formatForDisplay(new Date());
  }
  
  if (jsonMessage.type === 'system') {
    if (jsonMessage.subtype === 'init') {
      return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m🚀 Claude Code Session Started\x1b[0m\r\n` +
             `\x1b[90m  Session ID: ${jsonMessage.session_id}\x1b[0m\r\n` +
             `\x1b[90m  Available tools: ${jsonMessage.tools?.join(', ') || 'none'}\x1b[0m\r\n\r\n`;
    } else if (jsonMessage.subtype === 'result') {
      const duration = jsonMessage.duration_ms ? `${jsonMessage.duration_ms}ms` : 'unknown';
      const cost = jsonMessage.cost_usd ? `$${jsonMessage.cost_usd}` : 'free';
      const turns = jsonMessage.num_turns || 0;
      
      return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m📊 Session Complete\x1b[0m\r\n` +
             `\x1b[90m  Duration: ${duration} | Cost: ${cost} | Turns: ${turns}\x1b[0m\r\n\r\n`;
    }
    return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[90m⚙️  System: ${jsonMessage.subtype || 'message'}\x1b[0m\r\n`;
  }
  
  if (jsonMessage.type === 'user') {
    let content = '';
    
    // Extract content from the message structure
    if (jsonMessage.message?.content) {
      if (Array.isArray(jsonMessage.message.content)) {
        content = jsonMessage.message.content
          .map((item: MessageContent | string) => {
            if (typeof item === 'string') return item;
            if (item.type === 'text') return item.text;
            if (item.type === 'tool_result') {
              // Limit tool results to 10 lines
              const toolContent = item.content || '';
              const lines = toolContent.split('\n');
              const truncated = lines.slice(0, 10);
              const truncatedContent = truncated.join('\n');
              const hasMore = lines.length > 10;
              
              return `Tool result: ${item.tool_use_id ? `[${item.tool_use_id}]` : ''}\n${truncatedContent}${hasMore ? `\n... (${lines.length - 10} more lines)` : ''}`;
            }
            return JSON.stringify(item);
          })
          .join(' ');
      } else if (typeof jsonMessage.message.content === 'string') {
        content = jsonMessage.message.content;
      }
    }
    
    if (!content) return ''; // Skip if no content
    
    return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[32m👤 User Input\x1b[0m\r\n` +
           `\x1b[37m${content}\x1b[0m\r\n\r\n`;
  }
  
  if (jsonMessage.type === 'assistant') {
    let content = '';
    
    // Extract content from the message structure
    if (jsonMessage.message?.content) {
      if (Array.isArray(jsonMessage.message.content)) {
        content = jsonMessage.message.content
          .map((item: MessageContent | string) => {
            if (typeof item === 'string') return item;
            if (item.type === 'text') {
              // Don't truncate text content
              return item.text;
            }
            if (item.type === 'tool_use') {
              // Show tool use with parameters, but limit parameter display
              const params = item.input ? JSON.stringify(item.input, null, 2) : '';
              const lines = params.split('\n');
              if (lines.length > 10) {
                const truncated = lines.slice(0, 10).join('\n');
                return `[Using tool: ${item.name}]\nParameters:\n${truncated}\n... (${lines.length - 10} more lines)`;
              }
              return `[Using tool: ${item.name}]${params ? `\nParameters:\n${params}` : ''}`;
            }
            return JSON.stringify(item);
          })
          .join('\n\n');
      } else if (typeof jsonMessage.message.content === 'string') {
        content = jsonMessage.message.content;
      }
    }
    
    if (!content) return ''; // Skip if no content
    
    return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[35m🤖 Assistant Response\x1b[0m\r\n` +
           `\x1b[37m${content}\x1b[0m\r\n\r\n`;
  }
  
  
  if (jsonMessage.type === 'session') {
    const data = jsonMessage.data || {};
    
    if (data.status === 'error') {
      return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[31m❌ Session Error\x1b[0m\r\n` +
             `\x1b[91m${data.message || 'An error occurred'}\x1b[0m\r\n\r\n` +
             (data.details ? `\x1b[90m${data.details}\x1b[0m\r\n\r\n` : '');
    }
    
    return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[90m📝 Session: ${data.status || 'update'}\x1b[0m\r\n`;
  }
  
  // For other message types, show a generic format
  return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[90m📄 ${jsonMessage.type}: ${jsonMessage.subtype || 'message'}\x1b[0m\r\n`;
}
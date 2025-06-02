export function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  } else {
    return 'just now';
  }
}

export function formatJsonForWeb(jsonMessage: any): string {
  const timestamp = new Date(jsonMessage.timestamp || new Date()).toLocaleTimeString();
  
  if (jsonMessage.type === 'system') {
    if (jsonMessage.subtype === 'init') {
      return `\n[${timestamp}] 🚀 Claude Code Session Started\n` +
             `  Session ID: ${jsonMessage.session_id}\n` +
             `  Available tools: ${jsonMessage.tools?.join(', ') || 'none'}\n\n`;
    } else if (jsonMessage.subtype === 'result') {
      const duration = jsonMessage.duration_ms ? `${jsonMessage.duration_ms}ms` : 'unknown';
      const cost = jsonMessage.cost_usd ? `$${jsonMessage.cost_usd}` : 'free';
      const turns = jsonMessage.num_turns || 0;
      
      return `\n[${timestamp}] 📊 Session Complete\n` +
             `  Duration: ${duration} | Cost: ${cost} | Turns: ${turns}\n\n`;
    }
    return `\n[${timestamp}] ⚙️  System: ${jsonMessage.subtype || 'message'}\n`;
  }
  
  if (jsonMessage.type === 'user') {
    let content = '';
    
    // Extract content from the message structure
    if (jsonMessage.message?.content) {
      if (Array.isArray(jsonMessage.message.content)) {
        content = jsonMessage.message.content
          .map((item: any) => {
            if (item.type === 'text') return item.text;
            if (item.type === 'tool_result') return `Tool result: ${item.content}`;
            return JSON.stringify(item);
          })
          .join(' ');
      } else if (typeof jsonMessage.message.content === 'string') {
        content = jsonMessage.message.content;
      }
    }
    
    if (!content) return ''; // Skip if no content
    
    return `\n[${timestamp}] 👤 User Input\n${content}\n\n`;
  }
  
  if (jsonMessage.type === 'assistant') {
    let content = '';
    
    // Extract content from the message structure
    if (jsonMessage.message?.content) {
      if (Array.isArray(jsonMessage.message.content)) {
        content = jsonMessage.message.content
          .map((item: any) => {
            if (item.type === 'text') return item.text;
            if (item.type === 'tool_use') return `[Using tool: ${item.name}]`;
            return JSON.stringify(item);
          })
          .join(' ');
      } else if (typeof jsonMessage.message.content === 'string') {
        content = jsonMessage.message.content;
      }
    }
    
    if (!content) return ''; // Skip if no content
    
    return `\n[${timestamp}] 🤖 Assistant Response\n${content}\n\n`;
  }
  
  // For other message types, show a generic format
  return `\n[${timestamp}] 📄 ${jsonMessage.type}: ${jsonMessage.subtype || 'message'}\n`;
}
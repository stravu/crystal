export function formatJsonForTerminal(jsonMessage: any): string {
  const timestamp = new Date(jsonMessage.timestamp || new Date()).toLocaleTimeString();
  
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
    
    const preview = content.length > 150 ? content.substring(0, 150) + '...' : content;
    return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[32m👤 User Input\x1b[0m\r\n` +
           `\x1b[37m${preview}\x1b[0m\r\n\r\n`;
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
    
    const preview = content.length > 300 ? content.substring(0, 300) + '...' : content;
    return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[35m🤖 Assistant Response\x1b[0m\r\n` +
           `\x1b[37m${preview}\x1b[0m\r\n\r\n`;
  }
  
  // For other message types, show a generic format
  return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[90m📄 ${jsonMessage.type}: ${jsonMessage.subtype || 'message'}\x1b[0m\r\n`;
}
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
    
    const preview = content.length > 150 ? content.substring(0, 150) + '...' : content;
    return `\n[${timestamp}] 👤 User Input\n${preview}\n\n`;
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
    return `\n[${timestamp}] 🤖 Assistant Response\n${preview}\n\n`;
  }
  
  // For other message types, show a generic format
  return `\n[${timestamp}] 📄 ${jsonMessage.type}: ${jsonMessage.subtype || 'message'}\n`;
}
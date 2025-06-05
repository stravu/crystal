import { useState } from 'react';

interface JsonMessage {
  type: string;
  subtype?: string;
  content?: string;
  data?: any;
  timestamp: string;
  [key: string]: any;
}

interface JsonMessageItemProps {
  message: JsonMessage;
  index: number;
}

function JsonMessageItem({ message }: JsonMessageItemProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  const getMessageTypeColor = (type: string, subtype?: string) => {
    if (type === 'system') {
      return subtype === 'init' ? 'bg-blue-100 border-blue-300' : 'bg-gray-100 border-gray-300';
    }
    if (type === 'user') return 'bg-green-100 border-green-300';
    if (type === 'assistant') return 'bg-purple-100 border-purple-300';
    return 'bg-gray-100 border-gray-300';
  };

  const getMessageTypeIcon = (type: string, subtype?: string) => {
    if (type === 'system') {
      return subtype === 'init' ? '🚀' : '⚙️';
    }
    if (type === 'user') return '👤';
    if (type === 'assistant') return '🤖';
    return '📄';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getMessageTitle = (message: JsonMessage) => {
    if (message.type === 'system' && message.subtype === 'init') {
      return 'Session Started';
    }
    if (message.type === 'system' && message.subtype === 'result') {
      return `Result (${message.cost_usd ? `$${message.cost_usd}` : 'No cost'})`;
    }
    if (message.type === 'user') {
      return 'User Input';
    }
    if (message.type === 'assistant') {
      return 'Assistant Response';
    }
    return `${message.type} ${message.subtype || ''}`.trim();
  };

  const getMessagePreview = (message: JsonMessage) => {
    if (message.content) {
      return message.content.length > 100 
        ? message.content.substring(0, 100) + '...'
        : message.content;
    }
    if (message.type === 'system' && message.subtype === 'result') {
      return `Duration: ${message.duration_ms}ms, Turns: ${message.num_turns}`;
    }
    return '';
  };

  return (
    <div className={`border rounded-lg mb-2 ${getMessageTypeColor(message.type, message.subtype)}`}>
      <div 
        className="p-3 cursor-pointer flex items-center justify-between hover:bg-opacity-80"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-3">
          <span className="text-lg">{getMessageTypeIcon(message.type, message.subtype)}</span>
          <div>
            <h4 className="font-medium text-gray-800">{getMessageTitle(message)}</h4>
            {isCollapsed && (
              <p className="text-sm text-gray-600 mt-1">{getMessagePreview(message)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">{formatTimestamp(message.timestamp)}</span>
          <span className={`transform transition-transform ${isCollapsed ? 'rotate-0' : 'rotate-180'}`}>
            ▼
          </span>
        </div>
      </div>
      
      {!isCollapsed && (
        <div className="border-t bg-white bg-opacity-50 p-4">
          {message.content && (
            <div className="mb-4">
              <h5 className="font-medium text-gray-700 mb-2">Content:</h5>
              <div className="bg-white rounded p-3 text-sm font-mono whitespace-pre-wrap border">
                {message.content}
              </div>
            </div>
          )}
          
          <details>
            <summary className="cursor-pointer font-medium text-gray-700 mb-2">Raw JSON Data</summary>
            <pre className="bg-gray-100 rounded p-3 text-xs overflow-auto max-h-64 border">
              {JSON.stringify(message, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

interface JsonMessageViewProps {
  messages: JsonMessage[];
}

export function JsonMessageView({ messages }: JsonMessageViewProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No messages yet
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Claude Code Messages ({messages.length})
          </h3>
          {messages.map((message, index) => (
            <JsonMessageItem key={index} message={message} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
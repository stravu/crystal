import React, { useState, useEffect, useRef } from 'react';
import { API } from '../../utils/api';
import { cn } from '../../utils/cn';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';

interface MessagesViewProps {
  sessionId: string;
}

interface JSONMessage {
  type: 'json';
  data: string;
  timestamp: string;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ sessionId }) => {
  const [messages, setMessages] = useState<JSONMessage[]>([]);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Load messages for the session
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const response = await API.sessions.getJsonMessages(sessionId);
        if (response.success && response.data) {
          // The messages are already in the correct format from getJsonMessages
          const jsonMessages = response.data.map((msg: any) => ({
            type: 'json' as const,
            data: typeof msg === 'string' ? msg : JSON.stringify(msg),
            timestamp: msg.timestamp || new Date().toISOString()
          }));
          setMessages(jsonMessages);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [sessionId]);

  // Subscribe to new messages
  useEffect(() => {
    const handleSessionOutput = (data: any) => {
      if (data.sessionId === sessionId && data.type === 'json') {
        setMessages(prev => [...prev, {
          type: 'json',
          data: data.data,
          timestamp: new Date().toISOString()
        }]);
        
        // Auto-scroll to bottom if enabled
        if (autoScrollRef.current) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }
    };

    window.electron?.on('session:output', handleSessionOutput);
    return () => {
      window.electron?.off('session:output', handleSessionOutput);
    };
  }, [sessionId]);

  // Handle scroll to detect if user is at bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      autoScrollRef.current = isAtBottom;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMessage = (index: number) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatJSON = (jsonString: string): string => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  };

  const getMessagePreview = (jsonString: string): string => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.type) {
        return `${parsed.type}${parsed.role ? ` (${parsed.role})` : ''}`;
      }
      return 'JSON Message';
    } catch {
      return 'Invalid JSON';
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-text-tertiary mb-2">No JSON messages yet</div>
          <div className="text-sm text-text-quaternary">
            JSON messages from Claude Code will appear here
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-surface-primary p-4 font-mono text-sm"
    >
      <div className="space-y-2">
        {messages.map((message, index) => {
          const isExpanded = expandedMessages.has(index);
          const preview = getMessagePreview(message.data);
          const formatted = formatJSON(message.data);
          
          return (
            <div
              key={index}
              className="bg-surface-secondary rounded-lg border border-border-primary"
            >
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-hover transition-colors"
                onClick={() => toggleMessage(index)}
              >
                <div className="flex items-center gap-2">
                  <button className="text-text-tertiary hover:text-text-primary">
                    {isExpanded ? 
                      <ChevronDown className="w-4 h-4" /> : 
                      <ChevronRight className="w-4 h-4" />
                    }
                  </button>
                  <span className="text-text-primary font-medium">{preview}</span>
                  <span className="text-text-quaternary text-xs">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(formatted, index);
                  }}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    copiedIndex === index
                      ? "text-status-success bg-status-success/10"
                      : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
                  )}
                  title={copiedIndex === index ? "Copied!" : "Copy JSON"}
                >
                  {copiedIndex === index ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {isExpanded && (
                <div className="border-t border-border-primary">
                  <pre className="p-4 text-text-secondary overflow-x-auto max-h-96">
                    <code>{formatted}</code>
                  </pre>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
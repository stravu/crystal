import React, { useState, useEffect, useRef } from 'react';
import { API } from '../../../utils/api';
import { cn } from '../../../utils/cn';
import { ChevronRight, ChevronDown, Copy, Check, Terminal, FileText } from 'lucide-react';
import { SessionOutput } from '../../../types/session';

interface MessagesViewProps {
  panelId: string;
  agentType: 'claude' | 'codex' | 'generic-cli';
  outputEventName: string;
  getMessagesHandler?: string; // For IPC-based panels like Codex
}

interface JSONMessage {
  type: 'json';
  data: string;
  timestamp: string;
}

interface SessionInfo {
  type: 'session_info';
  initial_prompt?: string;
  claude_command?: string;
  codex_command?: string;
  worktree_path?: string;
  model?: string;
  permission_mode?: string;
  approval_policy?: string;
  timestamp: string;
}

export const MessagesView: React.FC<MessagesViewProps> = ({ 
  panelId, 
  agentType,
  outputEventName,
  getMessagesHandler
}) => {
  const [messages, setMessages] = useState<JSONMessage[]>([]);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showSessionInfo, setShowSessionInfo] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Load messages for the session
  useEffect(() => {
    const loadMessages = async () => {
      try {
        let response: { success: boolean; data?: JSONMessage[] };
        
        // Use appropriate method based on agent type
        if (getMessagesHandler && window.electron) {
          // For Codex and other IPC-based panels
          const outputs = await window.electron.invoke(getMessagesHandler, panelId);
          const jsonMessages = outputs
            .filter((output: SessionOutput) => output.type === 'json')
            .map((output: SessionOutput) => ({
              type: 'json' as const,
              data: typeof output.data === 'object' ? JSON.stringify(output.data) : output.data,
              timestamp: output.timestamp
            }));
          response = { success: true, data: jsonMessages };
        } else {
          // For Claude panels using API
          response = await API.panels.getJsonMessages(panelId);
        }
        
        if (response.success && response.data) {
          // Filter out session_info messages and handle them separately
          const regularMessages: JSONMessage[] = [];
          let foundSessionInfo: SessionInfo | null = null;
          
          response.data.forEach((msg: JSONMessage) => {
            try {
              // Try to parse the message data to check its type
              let msgData: unknown;
              if (typeof msg === 'string') {
                try {
                  msgData = JSON.parse(msg);
                } catch {
                  // If it's a string but not valid JSON, treat as regular message
                  // This case shouldn't have timestamps - skip adding to avoid "just now" issue
                  console.warn('Received raw string message without timestamp:', msg);
                  return;
                }
              } else if (msg.data) {
                // Handle messages with data field (from IPC)
                msgData = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
              } else {
                msgData = msg;
              }
              
              // Check if this is a session_info message
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- External protocol message with dynamic structure
              if (msgData && typeof msgData === 'object' && 'type' in msgData && (msgData as any).type === 'session_info') {
                foundSessionInfo = msgData as SessionInfo;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Codex protocol messages have varying nested structures
              } else if (msgData && typeof msgData === 'object' && 'msg' in msgData && typeof (msgData as any).msg === 'object' && (msgData as any).msg !== null && 'type' in (msgData as any).msg && (msgData as any).msg.type === 'session_configured') {
                // Handle Codex session configuration
                foundSessionInfo = {
                  type: 'session_info',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic Codex protocol field
                  model: (msgData as any).msg.model || 'default',
                  timestamp: msg.timestamp || ''
                };
              } else {
                // Regular JSON message
                regularMessages.push({
                  type: 'json' as const,
                  data: msg.data ? (typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)) :
                        (typeof msg === 'string' ? msg : JSON.stringify(msg)),
                  timestamp: msg.timestamp || ''
                });
              }
            } catch (error) {
              console.error('Error processing message:', error, msg);
              // If there's any error, treat it as a regular message
              regularMessages.push({
                type: 'json' as const,
                data: msg.data ? (typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)) :
                      (typeof msg === 'string' ? msg : JSON.stringify(msg)),
                timestamp: msg.timestamp || ''
              });
            }
          });
          
          setSessionInfo(foundSessionInfo);
          // Sort messages by timestamp if available
          const sortedMessages = regularMessages.sort((a, b) => {
            if (!a.timestamp || !b.timestamp) return 0;
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          });
          setMessages(sortedMessages);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [panelId, getMessagesHandler]);

  // Subscribe to new messages
  useEffect(() => {
    const handleOutput = (data: CustomEvent<{ panelId?: string; sessionId?: string; type?: string; data?: unknown; timestamp?: string }> | { panelId?: string; sessionId?: string; type?: string; data?: unknown; timestamp?: string; detail?: { panelId?: string; sessionId?: string; type?: string; data?: unknown; timestamp?: string } }) => {
      const detail = 'detail' in data ? data.detail : data;
      if (!detail || (!detail.panelId && !detail.sessionId) || detail.type !== 'json') {
        return;
      }
      if ((detail.panelId === panelId || detail.sessionId === panelId)) {
        try {
          // Check if this is a session_info message
          let parsedData: unknown;
          if (typeof detail.data === 'string') {
            try {
              parsedData = JSON.parse(detail.data);
            } catch {
              // If it's not valid JSON, treat as regular message
              setMessages(prev => [...prev, {
                type: 'json',
                data: String(detail.data || ''),
                timestamp: detail.timestamp || ''
              }]);
              return;
            }
          } else {
            parsedData = detail.data;
          }
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- External protocol message with dynamic structure
          if (parsedData && typeof parsedData === 'object' && 'type' in parsedData && (parsedData as any).type === 'session_info') {
            setSessionInfo(parsedData as SessionInfo);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Codex protocol messages have varying nested structures
          } else if (parsedData && typeof parsedData === 'object' && 'msg' in parsedData && typeof (parsedData as any).msg === 'object' && (parsedData as any).msg !== null && 'type' in (parsedData as any).msg && (parsedData as any).msg.type === 'session_configured') {
            // Handle Codex session configuration
            setSessionInfo({
              type: 'session_info',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic Codex protocol field
              model: (parsedData as any).msg.model || 'default',
              timestamp: detail.timestamp || ''
            });
          } else {
            setMessages(prev => [...prev, {
              type: 'json',
              data: typeof detail.data === 'string' ? detail.data : JSON.stringify(detail.data || {}),
              timestamp: detail.timestamp || ''
            }]);
            
            // Auto-scroll to bottom if enabled
            if (autoScrollRef.current) {
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }
          }
        } catch (error) {
          console.error('Error handling output:', error, data);
          // On error, just add as regular message
          setMessages(prev => [...prev, {
            type: 'json',
            data: typeof detail.data === 'string' ? detail.data : JSON.stringify(detail.data),
            timestamp: detail.timestamp || ''
          }]);
        }
      }
    };

    // Listen for the appropriate event based on the agent type
    if (outputEventName.includes('codex')) {
      // Only register Electron IPC listener for Codex - not both IPC and window
      window.electron?.on(outputEventName, handleOutput);
    } else {
      window.electron?.on('session:output', handleOutput);
    }
    
    return () => {
      if (outputEventName.includes('codex')) {
        window.electron?.off(outputEventName, handleOutput);
      } else {
        window.electron?.off('session:output', handleOutput);
      }
    };
  }, [panelId, outputEventName]);

  // Handle scroll to detect if user is at bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Consider "at bottom" only if within 50px of the bottom
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
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
      
      // Handle Codex protocol messages
      if (parsed.op) {
        return `Operation: ${parsed.op.type}`;
      }
      if (parsed.msg) {
        return `Message: ${parsed.msg.type}`;
      }
      
      // Handle standard messages
      if (parsed.type) {
        return `${parsed.type}${parsed.role ? ` (${parsed.role})` : ''}`;
      }
      return 'JSON Message';
    } catch {
      return 'Invalid JSON';
    }
  };

  const getAgentName = () => {
    switch (agentType) {
      case 'claude':
        return 'Claude Code';
      case 'codex':
        return 'Codex';
      default:
        return 'CLI Tool';
    }
  };

  if (messages.length === 0 && !sessionInfo) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-text-tertiary mb-2">No JSON messages yet</div>
          <div className="text-sm text-text-quaternary">
            JSON messages from {getAgentName()} will appear here
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="h-full overflow-y-auto overflow-x-hidden bg-surface-primary p-4 font-mono text-sm scrollbar-thin scrollbar-thumb-border-secondary"
    >
      <div className="space-y-2">
        {/* Session Info Card */}
        {sessionInfo && (
          <div className="bg-surface-secondary rounded-lg border border-border-primary mb-4">
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-hover transition-colors"
              onClick={() => setShowSessionInfo(!showSessionInfo)}
            >
              <div className="flex items-center gap-2">
                <button className="text-text-tertiary hover:text-text-primary">
                  {showSessionInfo ? 
                    <ChevronDown className="w-4 h-4" /> : 
                    <ChevronRight className="w-4 h-4" />
                  }
                </button>
                <span className="text-text-primary font-medium flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Session Information
                </span>
                {sessionInfo.timestamp && (
                  <span className="text-text-quaternary text-xs">
                    {new Date(sessionInfo.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const infoText = sessionInfo.initial_prompt ? 
                    `You:\n${sessionInfo.initial_prompt}\n\nCommand:\n${sessionInfo.claude_command || sessionInfo.codex_command || ''}\n\nWorktree Path:\n${sessionInfo.worktree_path}\n\nModel: ${sessionInfo.model}` :
                    `Model: ${sessionInfo.model || 'Unknown'}`;
                  copyToClipboard(infoText, -1);
                }}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  copiedIndex === -1
                    ? "text-status-success bg-status-success/10"
                    : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
                )}
                title={copiedIndex === -1 ? "Copied!" : "Copy Session Info"}
              >
                {copiedIndex === -1 ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            
            {showSessionInfo && (
              <div className="border-t border-border-primary">
                <div className="p-4 space-y-3">
                  {/* User Prompt (if available) */}
                  {sessionInfo.initial_prompt && (
                    <div>
                      <div className="flex items-center gap-2 text-text-secondary mb-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold tracking-wider">You</span>
                      </div>
                      <div className="bg-surface-primary rounded p-3 text-text-primary whitespace-pre-wrap break-words">
                        {sessionInfo.initial_prompt}
                      </div>
                    </div>
                  )}
                  
                  {/* Command (if available) */}
                  {(sessionInfo.claude_command || sessionInfo.codex_command) && (
                    <div>
                      <div className="flex items-center gap-2 text-text-secondary mb-1">
                        <Terminal className="w-3.5 h-3.5" />
                        <span className="text-xs font-semibold uppercase tracking-wider">
                          {agentType === 'claude' ? 'Claude' : 'Codex'} Command
                        </span>
                      </div>
                      <div className="bg-surface-primary rounded p-3 text-text-primary font-mono text-xs overflow-x-auto">
                        {sessionInfo.claude_command || sessionInfo.codex_command}
                      </div>
                    </div>
                  )}
                  
                  {/* Additional Info */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {sessionInfo.worktree_path && (
                      <div>
                        <span className="text-text-quaternary">Worktree Path:</span>
                        <div className="text-text-secondary mt-1 font-mono truncate" title={sessionInfo.worktree_path}>
                          {sessionInfo.worktree_path}
                        </div>
                      </div>
                    )}
                    <div>
                      <span className="text-text-quaternary">Model:</span>
                      <div className="text-text-secondary mt-1">
                        {sessionInfo.model || 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Regular Messages */}
        {messages.map((message, index) => {
          const isExpanded = expandedMessages.has(index);
          const preview = getMessagePreview(message.data);
          const formatted = formatJSON(message.data);
          
          return (
            <div
              key={`message_${panelId}_${index}_${message.timestamp}`}
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
                  {message.timestamp && (
                    <span className="text-text-quaternary text-xs">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  )}
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

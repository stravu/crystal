import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { API } from '../../utils/api';
import { MarkdownPreview } from '../MarkdownPreview';
import { User, Bot, ChevronDown, ChevronRight, Eye, EyeOff, Settings2, Wrench, CheckCircle, XCircle, Clock, ArrowDown } from 'lucide-react';
import { parseTimestamp, formatDistanceToNow } from '../../utils/timestampUtils';
import { ThinkingPlaceholder, InlineWorkingIndicator } from './ThinkingPlaceholder';

// Agent-agnostic message types for flexibility
interface RawMessage {
  id?: string;
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result' | 'result';
  role?: 'user' | 'assistant' | 'system';
  content?: string | any;
  message?: { content?: string | any; [key: string]: any };
  timestamp: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  [key: string]: any;
}

// Structured message representation for rendering
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  segments: MessageSegment[];
  metadata?: {
    agent?: string;
    model?: string;
    duration?: number;
    tokens?: number;
    cost?: number;
    systemSubtype?: string;
    sessionInfo?: any;
  };
}

// Different types of content within a message
type MessageSegment = 
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool: ToolCall }
  | { type: 'system_info'; info: any }
  | { type: 'thinking'; content: string };

interface ToolCall {
  id: string;
  name: string;
  input?: any;
  result?: ToolResult;
  status: 'pending' | 'success' | 'error';
}


interface ToolResult {
  content: string;
  isError?: boolean;
}

interface RichOutputViewProps {
  sessionId: string;
  sessionStatus?: string;
  settings?: RichOutputSettings;
}

// Settings stored in localStorage for persistence
export interface RichOutputSettings {
  showToolCalls: boolean;
  compactMode: boolean;
  collapseTools: boolean;
  showThinking: boolean;
  showSessionInit: boolean;
}

const defaultSettings: RichOutputSettings = {
  showToolCalls: true,
  compactMode: false,
  collapseTools: false,
  showThinking: true,
  showSessionInit: false, // Hide by default - it's developer info
};

export const RichOutputView = React.forwardRef<{ scrollToPrompt: (promptIndex: number) => void }, RichOutputViewProps>(
  ({ sessionId, sessionStatus, settings: propsSettings }, ref) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Use parent-controlled settings if provided, otherwise use default
  const localSettings = useMemo<RichOutputSettings>(() => {
    const saved = localStorage.getItem('richOutputSettings');
    return saved ? JSON.parse(saved) : defaultSettings;
  }, []);
  
  const settings = propsSettings || localSettings;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const userMessageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const wasAtBottomRef = useRef(false);

  // Save local settings to localStorage when they change
  useEffect(() => {
    if (!propsSettings) {
      localStorage.setItem('richOutputSettings', JSON.stringify(localSettings));
    }
  }, [localSettings, propsSettings]);
  
  // Expose scroll method via ref
  React.useImperativeHandle(ref, () => ({
    scrollToPrompt: (promptIndex: number) => {
      const messageDiv = userMessageRefs.current.get(promptIndex);
      if (messageDiv && scrollContainerRef.current) {
        // Scroll to the message with some offset from top
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add a highlight effect
        messageDiv.classList.add('highlight-prompt');
        setTimeout(() => {
          messageDiv.classList.remove('highlight-prompt');
        }, 2000);
      }
    }
  }), []);

  // Extract text content from various message formats
  const extractTextContent = (msg: RawMessage): string => {
    // Handle Claude format: message.content as array of content blocks
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      return msg.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join('\n')
        .trim();
    }
    
    // Handle direct string content
    if (typeof msg.message?.content === 'string') {
      return msg.message.content.trim();
    }
    
    // Handle direct content field  
    if (typeof msg.content === 'string') {
      return msg.content.trim();
    }
    
    // Handle Gemini/other formats (future-proofing)
    if (msg.message?.parts && Array.isArray(msg.message.parts)) {
      return msg.message.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('\n')
        .trim();
    }
    
    return '';
  };

  // Detect agent/model from message structure
  const detectAgent = (msg: RawMessage): string => {
    if (msg.message?.model?.includes('claude')) return 'claude';
    if (msg.message?.model?.includes('gemini')) return 'gemini';
    if (msg.message?.model?.includes('gpt')) return 'gpt-4';
    
    // Fallback based on message structure
    if (msg.message?.content && Array.isArray(msg.message.content)) return 'claude';
    if (msg.message?.parts) return 'gemini';
    
    return 'unknown';
  };

  // Transform raw messages into structured conversation messages
  const transformMessages = (rawMessages: RawMessage[]): ConversationMessage[] => {
    const transformed: ConversationMessage[] = [];
    
    // First pass: Build tool result map
    const toolResults = new Map<string, ToolResult>();
    rawMessages.forEach(msg => {
      if (msg.type === 'user' && msg.message?.content && Array.isArray(msg.message.content)) {
        msg.message.content.forEach((block: any) => {
          if (block.type === 'tool_result' && block.tool_use_id) {
            toolResults.set(block.tool_use_id, {
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
              isError: block.is_error || false
            });
          }
        });
      }
    });
    
    // Second pass: Build conversation messages
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      
      if (msg.type === 'user') {
        // Check if this is a tool result message
        let hasToolResult = false;
        let hasOnlyText = true;
        
        if (msg.message?.content && Array.isArray(msg.message.content)) {
          hasToolResult = msg.message.content.some((block: any) => block.type === 'tool_result');
          hasOnlyText = msg.message.content.every((block: any) => block.type === 'text');
        }
        
        // Only show real user prompts (text-only messages without tool results)
        if (!hasToolResult && hasOnlyText) {
          const textContent = extractTextContent(msg);
          
          if (textContent) {
            const userMessage = {
              id: msg.id || `user-${i}-${msg.timestamp}`,
              role: 'user' as const,
              timestamp: msg.timestamp,
              segments: [{ type: 'text', content: textContent } as MessageSegment],
              metadata: { agent: detectAgent(msg) }
            };
            
            transformed.push(userMessage);
            
            // Removed: Commit summaries are now shown in the dedicated Commits panel
          }
        }
        // Skip tool result messages - they're attached to assistant messages
        
      } else if (msg.type === 'assistant') {
        const segments: MessageSegment[] = [];
        
        
        // Check for direct text field first (some messages come this way)
        if (msg.text && typeof msg.text === 'string') {
          segments.push({ type: 'text', content: msg.text.trim() });
        } else if (msg.message?.content && Array.isArray(msg.message.content)) {
          // Process each content block
          msg.message.content.forEach((block: any) => {
            if (block.type === 'text' && block.text?.trim()) {
              segments.push({ type: 'text', content: block.text.trim() });
            } else if (block.type === 'thinking') {
              const thinkingContent = block.thinking || block.content || block.text;
              if (thinkingContent && typeof thinkingContent === 'string' && thinkingContent.trim()) {
                segments.push({ type: 'thinking', content: thinkingContent.trim() });
              }
            } else if (block.type === 'tool_use') {
              const toolCall: ToolCall = {
                id: block.id,
                name: block.name,
                input: block.input,
                status: toolResults.has(block.id) ? 'success' : 'pending',
                result: toolResults.get(block.id)
              };
              segments.push({ type: 'tool_call', tool: toolCall });
            }
          });
        } else {
          // Fallback for other formats
          const textContent = extractTextContent(msg);
          if (textContent) {
            segments.push({ type: 'text', content: textContent });
          }
        }
        
        // Only add message if it has content
        if (segments.length > 0) {
          // Check if this is a synthetic error message
          const isSyntheticError = msg.message?.model === '<synthetic>' && 
            segments.some(seg => seg.type === 'text' && 
              (seg.content.includes('Prompt is too long') || 
               seg.content.includes('API Error') ||
               seg.content.includes('error')));
          
          transformed.push({
            id: msg.id || `assistant-${i}-${msg.timestamp}`,
            role: isSyntheticError ? 'system' : 'assistant',
            timestamp: msg.timestamp,
            segments,
            metadata: {
              agent: detectAgent(msg),
              model: msg.message?.model,
              duration: msg.message?.duration,
              tokens: msg.message?.usage ? 
                (msg.message.usage.input_tokens || 0) + (msg.message.usage.output_tokens || 0) : 
                undefined,
              cost: msg.message?.usage?.cost,
              systemSubtype: isSyntheticError ? 'error' : undefined
            }
          });
        }
        
      } else if (msg.type === 'system' && msg.subtype === 'init') {
        // Include system init messages
        transformed.push({
          id: msg.id || `system-init-${i}-${msg.timestamp}`,
          role: 'system',
          timestamp: msg.timestamp,
          segments: [{ 
            type: 'system_info', 
            info: {
              cwd: msg.cwd,
              model: msg.model,
              tools: msg.tools,
              mcp_servers: msg.mcp_servers,
              permissionMode: msg.permissionMode,
              session_id: msg.session_id
            }
          }],
          metadata: {
            systemSubtype: 'init',
            sessionInfo: msg
          }
        });
        
      } else if (msg.type === 'system' && msg.subtype === 'context_compacted') {
        // Handle context compaction messages
        transformed.push({
          id: msg.id || `context-compacted-${i}-${msg.timestamp}`,
          role: 'system',
          timestamp: msg.timestamp,
          segments: [{ 
            type: 'text', 
            content: msg.summary || ''
          }, {
            type: 'system_info',
            info: {
              message: msg.message
            }
          }],
          metadata: {
            systemSubtype: 'context_compacted'
          }
        });
        
      } else if (msg.type === 'system' && msg.subtype === 'error') {
        // Handle error messages from session manager
        transformed.push({
          id: msg.id || `error-${i}-${msg.timestamp}`,
          role: 'system',
          timestamp: msg.timestamp,
          segments: [{ 
            type: 'system_info', 
            info: {
              error: msg.error,
              details: msg.details,
              message: msg.message
            }
          }],
          metadata: {
            systemSubtype: 'error'
          }
        });
        
      } else if (msg.type === 'system' && msg.subtype === 'git_operation') {
        // Handle git operation messages
        transformed.push({
          id: msg.id || `git-operation-${i}-${msg.timestamp}`,
          role: 'system',
          timestamp: msg.timestamp,
          segments: [{ 
            type: 'text', 
            content: msg.message || msg.raw_output || ''
          }],
          metadata: {
            systemSubtype: 'git_operation'
          }
        });
        
      } else if (msg.type === 'system' && msg.subtype === 'git_error') {
        // Handle git error messages
        transformed.push({
          id: msg.id || `git-error-${i}-${msg.timestamp}`,
          role: 'system',
          timestamp: msg.timestamp,
          segments: [{ 
            type: 'text', 
            content: msg.message || msg.raw_output || ''
          }],
          metadata: {
            systemSubtype: 'git_error'
          }
        });
        
      } else if (msg.type === 'result') {
        // Handle execution result messages - especially errors
        if (msg.is_error && msg.result) {
          transformed.push({
            id: msg.id || `error-${i}-${msg.timestamp}`,
            role: 'system',
            timestamp: msg.timestamp,
            segments: [{ 
              type: 'text', 
              content: `Error: ${msg.result}`
            }],
            metadata: {
              systemSubtype: 'error',
              duration: msg.duration_ms,
              cost: msg.total_cost_usd
            }
          });
        }
        // Skip non-error result messages
        continue;
      }
    }
    
    return transformed;
  };


  const loadMessages = useCallback(async () => {
    // Prevent concurrent loads using ref
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    
    try {
      setError(null);
      
      // Load conversation messages and JSON messages
      const [conversationResponse, outputResponse] = await Promise.all([
        API.sessions.getConversation(sessionId),
        API.sessions.getJsonMessages(sessionId)
      ]);
      
      // Combine both sources - conversation messages have the actual user prompts
      const userPrompts: RawMessage[] = [];
      if (conversationResponse.success && Array.isArray(conversationResponse.data)) {
        conversationResponse.data.forEach((msg: any) => {
          if (msg.message_type === 'user') {
            userPrompts.push({
              type: 'user',
              message: {
                role: 'user',
                content: [{ type: 'text', text: msg.content }]
              },
              timestamp: msg.timestamp
            });
          }
        });
      }
      
      // Combine user prompts with output messages (filter for JSON messages)
      const allMessages = [...userPrompts];
      if (outputResponse.success && outputResponse.data && Array.isArray(outputResponse.data)) {
        // JSON messages are already in the correct format from getJsonMessages
        allMessages.push(...outputResponse.data);
      }
      
      // Sort by timestamp to get correct order
      allMessages.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });
      
      
      const conversationMessages = transformMessages(allMessages);
      setMessages(conversationMessages);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('Failed to load conversation history');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [sessionId]);

  // Listen for real-time output updates - debounced to prevent performance issues
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
    const handleOutputAvailable = (event: CustomEvent<{ sessionId: string }>) => {
      if (event.detail.sessionId === sessionId) {
        // Debounce message reloading to prevent excessive re-renders
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadMessages();
        }, 500); // Wait 500ms after last event
      }
    };

    window.addEventListener('session-output-available', handleOutputAvailable as any);
    
    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('session-output-available', handleOutputAvailable as any);
    };
  }, [sessionId, loadMessages]);

  // Initial load
  useEffect(() => {
    if (!sessionId) return;
    loadMessages();
  }, [sessionId, loadMessages]);

  // Track if user is at bottom - set up once when container is available
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    
    // Use a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const checkIfAtBottom = () => {
        // Consider "at bottom" if within 30% of viewport height or 300px (whichever is larger)
        const threshold = Math.max(container.clientHeight * 0.3, 300);
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const isAtBottom = distanceFromBottom < threshold;
        wasAtBottomRef.current = isAtBottom;
      };

      // Check initial position
      checkIfAtBottom();

      container.addEventListener('scroll', checkIfAtBottom);
      
      // Store cleanup function
      cleanup = () => container.removeEventListener('scroll', checkIfAtBottom);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (cleanup) cleanup();
    };
  }, []); // Empty array - set up only once

  // Auto-scroll to bottom when messages change or view loads
  useEffect(() => {
    if (messagesEndRef.current && !loading) {
      // Scroll if we were at the bottom before the update
      if (wasAtBottomRef.current) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          // Use instant scrolling for better responsiveness during active output
          // Smooth scrolling can be too slow and cause users to miss content
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
          // Don't set wasAtBottomRef here - let the scroll event handler determine actual position
        });
      }
    }
  }, [messages, loading]);

  // Handle scroll events to show/hide scroll button
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Show button if scrolled up more than one viewport height
      const scrolledUp = scrollHeight - scrollTop - clientHeight;
      setShowScrollButton(scrolledUp > clientHeight);
    };

    container.addEventListener('scroll', handleScroll);
    // Check initial state
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleMessageCollapse = (messageId: string) => {
    setCollapsedMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };


  // Render a tool call segment
  const renderToolCall = (tool: ToolCall) => {
    const isExpanded = !settings.collapseTools || expandedTools.has(tool.id);
    
    return (
      <div className="rounded-md bg-surface-tertiary/50 overflow-hidden border border-border-primary/50">
        <button
          onClick={() => toggleToolExpand(tool.id)}
          className="w-full px-3 py-2 bg-surface-tertiary/30 flex items-center gap-2 hover:bg-surface-tertiary/50 transition-colors text-left"
        >
          <Wrench className="w-3.5 h-3.5 text-interactive-on-dark flex-shrink-0" />
          <span className="font-mono text-xs text-text-primary flex-1">{tool.name}</span>
          {tool.status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-status-success flex-shrink-0" />}
          {tool.status === 'error' && <XCircle className="w-3.5 h-3.5 text-status-error flex-shrink-0" />}
          {tool.status === 'pending' && <Clock className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0 animate-pulse" />}
          {settings.collapseTools && (
            isExpanded ? <ChevronDown className="w-3 h-3 text-text-tertiary" /> : <ChevronRight className="w-3 h-3 text-text-tertiary" />
          )}
        </button>
        
        {isExpanded && (
          <div className="px-3 py-2 text-xs">
            {/* Tool Parameters */}
            {tool.input && Object.keys(tool.input).length > 0 && (
              <div className="mb-2">
                <div className="text-text-tertiary mb-1">Parameters:</div>
                {formatToolInput(tool.name, tool.input)}
              </div>
            )}
            
            {/* Tool Result */}
            {tool.result && (
              <div>
                <div className="text-text-tertiary mb-1">
                  {tool.result.isError ? 'Error:' : 'Result:'}
                </div>
                <div className={`${tool.result.isError ? 'text-status-error' : 'text-text-primary'}`}>
                  {formatToolResult(tool.name, tool.result.content)}
                </div>
              </div>
            )}
            
            {/* Pending state */}
            {tool.status === 'pending' && (
              <div className="text-text-tertiary italic">Waiting for result...</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Format tool input for display
  const formatToolInput = (toolName: string, input: any): React.ReactNode => {
    switch (toolName) {
      case 'Read':
        return (
          <div className="font-mono text-xs space-y-0.5">
            {input.file_path && (
              <div className="flex items-center gap-1">
                <span className="text-text-tertiary">File:</span>
                <span className="text-interactive-on-dark truncate">{input.file_path}</span>
              </div>
            )}
            {input.offset && <div className="text-text-tertiary">Lines: {input.offset}-{input.offset + (input.limit || 2000)}</div>}
          </div>
        );
      
      case 'Edit':
      case 'MultiEdit':
        return (
          <div className="font-mono text-sm space-y-1">
            {input.file_path && <div>File: <span className="text-interactive-on-dark">{input.file_path}</span></div>}
            {toolName === 'MultiEdit' && input.edits && (
              <div>{input.edits.length} changes</div>
            )}
          </div>
        );
      
      case 'Write':
        return (
          <div className="font-mono text-sm space-y-1">
            {input.file_path && <div>File: <span className="text-interactive-on-dark">{input.file_path}</span></div>}
            {input.content && (
              <div>{input.content.split('\n').length} lines</div>
            )}
          </div>
        );
      
      case 'Bash':
        return (
          <div className="font-mono text-sm bg-bg-tertiary px-2 py-1 rounded">
            <span className="text-status-success">$</span> {input.command}
          </div>
        );
      
      case 'Grep':
        return (
          <div className="font-mono text-sm space-y-1">
            <div>Pattern: <span className="text-status-warning">"{input.pattern}"</span></div>
            {input.path && <div>Path: {input.path}</div>}
            {input.glob && <div>Files: {input.glob}</div>}
          </div>
        );
      
      case 'TodoWrite':
        return (
          <div className="text-sm space-y-1">
            {input.todos && input.todos.map((todo: any, idx: number) => {
              const icon = todo.status === 'completed' ? '✓' : 
                          todo.status === 'in_progress' ? '→' : '○';
              const color = todo.status === 'completed' ? 'text-status-success' : 
                           todo.status === 'in_progress' ? 'text-status-warning' : 'text-text-tertiary';
              return (
                <div key={idx} className={`${color} truncate`}>
                  {icon} {todo.content}
                </div>
              );
            })}
          </div>
        );
      
      default:
        // Compact display for unknown tools
        return (
          <pre className="text-xs overflow-x-auto max-h-20">
            {JSON.stringify(input, null, 2)}
          </pre>
        );
    }
  };

  // Format tool result for display
  const formatToolResult = (_toolName: string, result: string): React.ReactNode => {
    if (!result) {
      return <div className="text-sm text-text-tertiary italic">No result</div>;
    }
    
    try {
      // Check if result is JSON
      const parsed = JSON.parse(result);
      
      // Handle image reads
      if (Array.isArray(parsed) && parsed[0]?.type === 'image') {
        return (
          <div className="text-sm text-text-secondary italic">
            [Image displayed to assistant]
          </div>
        );
      }
      
      // For other JSON results, pretty print compactly
      return (
        <pre className="text-xs overflow-x-auto max-h-32">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      // Not JSON, display as text
      if (result.length > 300) {
        return (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
              {result.substring(0, 100)}... (click to expand)
            </summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{result}</pre>
          </details>
        );
      }
      
      return <pre className="text-sm whitespace-pre-wrap">{result}</pre>;
    }
  };

  // Render a complete message
  const renderMessage = (message: ConversationMessage, index: number, userMessageIndex?: number) => {
    const isCollapsed = collapsedMessages.has(message.id);
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const hasTextContent = message.segments.some(seg => seg.type === 'text');
    const textContent = message.segments
      .filter(seg => seg.type === 'text')
      .map(seg => seg.type === 'text' ? seg.content : '')
      .join('\n\n');
    
    // Check if message has tool calls or thinking
    const hasToolCalls = message.segments.some(seg => seg.type === 'tool_call');
    const hasThinking = message.segments.some(seg => seg.type === 'thinking');
    
    // Determine if we need extra spacing before this message
    const prevMessage = index > 0 ? filteredMessages[index - 1] : null;
    const needsExtraSpacing = prevMessage && (
      (prevMessage.role !== message.role) || 
      (hasThinking && !prevMessage.segments.some(seg => seg.type === 'thinking'))
    );
    
    // Special rendering for system messages
    if (isSystem) {
      if (message.metadata?.systemSubtype === 'init') {
        const info = message.segments.find(seg => seg.type === 'system_info');
        if (info?.type === 'system_info') {
          return (
            <div
              key={message.id}
              className={`
                rounded-lg transition-all bg-surface-tertiary border border-border-primary
                ${settings.compactMode ? 'p-3' : 'p-4'}
              `}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-full p-2 bg-interactive/10 text-interactive-on-dark">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-text-primary">Session Started</span>
                    <span className="text-sm text-text-tertiary">
                      {formatDistanceToNow(parseTimestamp(message.timestamp))}
                    </span>
                  </div>
                  <div className="text-sm text-text-secondary space-y-1">
                    <div>Model: <span className="text-text-primary font-mono">{info.info.model}</span></div>
                    <div>Working Directory: <span className="text-text-primary font-mono text-xs">{info.info.cwd}</span></div>
                    <div>
                      Tools: <span className="text-text-tertiary">{info.info.tools?.length || 0} available</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }
      } else if (message.metadata?.systemSubtype === 'error') {
        // Render error messages - get error info from system_info segment
        const errorInfo = message.segments.find(seg => seg.type === 'system_info')?.info;
        const errorMessage = errorInfo?.message || textContent;
        const errorTitle = errorInfo?.error || 'Session Error';
        
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all bg-status-error/10 border border-status-error/30
              ${settings.compactMode ? 'p-3' : 'p-4'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full p-2 bg-status-error/20 text-status-error">
                <XCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-status-error">{errorTitle}</span>
                  <span className="text-sm text-text-tertiary">
                    {formatDistanceToNow(parseTimestamp(message.timestamp))}
                  </span>
                  {message.metadata?.duration && (
                    <span className="text-xs text-text-tertiary">
                      · {(message.metadata.duration / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
                <div className="text-sm text-text-primary whitespace-pre-wrap">
                  {errorMessage}
                </div>
              </div>
            </div>
          </div>
        );
      } else if (message.metadata?.systemSubtype === 'context_compacted') {
        // Render context compaction messages
        // Get the message info from the system_info segment
        const infoSegment = message.segments.find(seg => seg.type === 'system_info');
        const helpMessage = infoSegment?.type === 'system_info' ? infoSegment.info.message : 
          'Context has been compacted. You can continue chatting - your next message will automatically include the context summary above.';
        
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all bg-status-warning/10 border border-status-warning/30
              ${settings.compactMode ? 'p-3' : 'p-4'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full p-2 bg-status-warning/20 text-status-warning">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold text-status-warning">Context Compacted</span>
                  <span className="text-sm text-text-tertiary">
                    {formatDistanceToNow(parseTimestamp(message.timestamp))}
                  </span>
                </div>
                
                {/* Summary content */}
                <div className="bg-surface-secondary rounded-lg p-3 mb-3 border border-border-primary">
                  <div className="text-sm text-text-secondary font-mono whitespace-pre-wrap">
                    {textContent}
                  </div>
                </div>
                
                {/* Clear instruction message */}
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-status-success mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-text-primary">
                    <span className="font-medium">Ready to continue!</span> {helpMessage}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      } else if (message.metadata?.systemSubtype === 'git_operation') {
        // Render git operation messages
        const rawOutput = message.segments.find(seg => seg.type === 'text')?.content || textContent;
        const isSuccess = rawOutput.includes('✓') || rawOutput.includes('Successfully');
        
        // Parse the git operation message for better formatting
        const lines = rawOutput.split('\n');
        const mainMessage = lines.filter(line => !line.includes('🔄 GIT OPERATION') && line.trim()).join('\n');
        
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all border 
              ${isSuccess 
                ? 'bg-status-success/10 border-status-success/30' 
                : 'bg-interactive/10 border-interactive/30'
              }
              ${settings.compactMode ? 'p-3' : 'p-4'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <div className={`
                rounded-full p-2 
                ${isSuccess 
                  ? 'bg-status-success/20 text-status-success' 
                  : 'bg-interactive/20 text-interactive-on-dark'
                }
              `}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`
                    font-semibold 
                    ${isSuccess ? 'text-status-success' : 'text-interactive-on-dark'}
                  `}>
                    🔄 Git Operation
                  </span>
                  <span className="text-sm text-text-tertiary">
                    {formatDistanceToNow(parseTimestamp(message.timestamp))}
                  </span>
                </div>
                <div className="space-y-2">
                  {mainMessage.split('\n').map((line, idx) => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return null;
                    
                    if (trimmedLine.startsWith('✓')) {
                      return (
                        <div key={idx} className="flex items-center gap-2 text-status-success font-medium">
                          <span className="text-base">✓</span>
                          <span>{trimmedLine.substring(1).trim()}</span>
                        </div>
                      );
                    } else if (trimmedLine.startsWith('Commit message:')) {
                      return (
                        <div key={idx} className="text-sm text-text-secondary italic">
                          {trimmedLine}
                        </div>
                      );
                    } else if (trimmedLine.includes('Git output:')) {
                      return (
                        <div key={idx} className="text-sm text-text-secondary font-medium border-t border-border-primary pt-2 mt-2">
                          {trimmedLine}
                        </div>
                      );
                    } else {
                      return (
                        <div key={idx} className="text-text-primary">
                          {trimmedLine}
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      } else if (message.metadata?.systemSubtype === 'git_error') {
        // Render git error messages
        const rawOutput = message.segments.find(seg => seg.type === 'text')?.content || textContent;
        
        // Parse the git error message for better formatting
        const lines = rawOutput.split('\n');
        const mainMessage = lines.filter(line => line.trim()).join('\n');
        
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all bg-status-error/10 border border-status-error/30
              ${settings.compactMode ? 'p-3' : 'p-4'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full p-2 bg-status-error/20 text-status-error">
                <XCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-status-error">Git Operation Failed</span>
                  <span className="text-sm text-text-tertiary">
                    {formatDistanceToNow(parseTimestamp(message.timestamp))}
                  </span>
                </div>
                <div className="space-y-2">
                  {mainMessage.split('\n').map((line, idx) => {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) return null;
                    
                    if (trimmedLine.startsWith('✗')) {
                      return (
                        <div key={idx} className="flex items-center gap-2 text-status-error font-medium">
                          <span className="text-base">✗</span>
                          <span>{trimmedLine.substring(1).trim()}</span>
                        </div>
                      );
                    } else if (trimmedLine.includes('Git output:')) {
                      return (
                        <div key={idx} className="text-sm text-text-secondary font-medium border-t border-status-error/20 pt-2 mt-2">
                          {trimmedLine}
                        </div>
                      );
                    } else {
                      return (
                        <div key={idx} className="text-sm text-status-error font-mono bg-surface-secondary/50 p-2 rounded border border-status-error/20">
                          {trimmedLine}
                        </div>
                      );
                    }
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      }
    }
    
    return (
      <div
        key={message.id}
        ref={isUser && userMessageIndex !== undefined ? (el) => {
          if (el) userMessageRefs.current.set(userMessageIndex, el);
        } : undefined}
        className={`
          rounded-lg transition-all
          ${isUser ? 'bg-surface-secondary' : hasThinking ? 'bg-surface-primary/50' : 'bg-surface-primary'}
          ${hasToolCalls ? 'bg-surface-tertiary/30' : ''}
          ${settings.compactMode ? 'p-3' : 'p-4'}
          ${needsExtraSpacing ? 'mt-4' : ''}
        `}
      >
        {/* Message Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`
            rounded-full p-1.5 flex-shrink-0
            ${isUser ? 'bg-status-success/20 text-status-success' : 'bg-interactive/20 text-interactive-on-dark'}
          `}>
            {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          </div>
          <div className="flex-1 flex items-baseline gap-2">
            <span className="font-medium text-text-primary text-sm">
              {isUser ? 'You' : getAgentName(message.metadata?.agent)}
            </span>
            <span className="text-xs text-text-tertiary">
              {formatDistanceToNow(parseTimestamp(message.timestamp))}
            </span>
            {message.metadata?.duration && (
              <span className="text-xs text-text-tertiary">
                · {(message.metadata.duration / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          {hasTextContent && textContent.length > 200 && (
            <button
              onClick={() => toggleMessageCollapse(message.id)}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {isCollapsed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Message Content */}
        <div className="ml-7 space-y-2">
          {/* Thinking segments */}
          {settings.showThinking && message.segments
            .filter(seg => seg.type === 'thinking')
            .map((seg, idx) => {
              if (seg.type === 'thinking') {
                return (
                  <div key={`${message.id}-thinking-${idx}`} className="relative">
                    <div className="absolute -left-7 top-0 w-1 h-full bg-interactive/20 rounded-full" />
                    <div className="pl-4 pr-2 py-2">
                      <div className="text-sm thinking-content italic text-text-secondary">
                        <MarkdownPreview content={seg.content} />
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })
          }
          
          {/* Text segments */}
          {hasTextContent && (
            <div className={`${isCollapsed ? 'max-h-20 overflow-hidden relative' : ''}`}>
              {isUser ? (
                <div className="text-text-primary whitespace-pre-wrap font-medium">{textContent}</div>
              ) : (
                <div className="rich-output-markdown">
                  <MarkdownPreview content={textContent} />
                </div>
              )}
              {isCollapsed && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-surface-secondary to-transparent pointer-events-none" />
              )}
            </div>
          )}
          
          {/* Tool calls */}
          {settings.showToolCalls && message.segments
            .filter(seg => seg.type === 'tool_call')
            .map((seg, idx) => {
              if (seg.type === 'tool_call') {
                return (
                  <div key={`${message.id}-tool-${idx}`}>
                    {renderToolCall(seg.tool)}
                  </div>
                );
              }
              return null;
            })
          }
          
        </div>
      </div>
    );
  };

  const getAgentName = (agent?: string) => {
    switch (agent) {
      case 'claude': return 'Claude';
      case 'gpt-4':
      case 'openai': return 'GPT-4';
      case 'gemini':
      case 'google': return 'Gemini';
      default: return 'Assistant';
    }
  };

  // Check if we're waiting for Claude's response
  const isWaitingForResponse = useMemo(() => {
    // Always show placeholder if session is actively running
    if (sessionStatus === 'running') {
      return true;
    }
    
    // Also show if waiting and last message is from user
    if (sessionStatus === 'waiting' && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      return lastMessage.role === 'user';
    }
    
    return false;
  }, [messages, sessionStatus]);

  // Filter messages based on settings
  const filteredMessages = useMemo(() => {
    if (settings.showSessionInit) {
      return messages;
    }
    // Filter out session init messages
    return messages.filter(msg => !(msg.role === 'system' && msg.metadata?.systemSubtype === 'init'));
  }, [messages, settings.showSessionInit]);

  // Memoize the rendered messages to prevent unnecessary re-renders
  const renderedMessages = useMemo(() => {
    let userMessageIndex = 0;
    return filteredMessages.map((msg, idx) => {
      const isUser = msg.role === 'user';
      const element = renderMessage(msg, idx, isUser ? userMessageIndex : undefined);
      if (isUser) userMessageIndex++;
      return element;
    });
  }, [filteredMessages, collapsedMessages, expandedTools, settings]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-secondary">Loading conversation...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-status-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary relative">
      {/* Settings panel is now rendered in SessionView to avoid duplication */}

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto relative scrollbar-thin scrollbar-thumb-border-secondary scrollbar-track-transparent hover:scrollbar-thumb-border-primary" 
        ref={scrollContainerRef}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--color-border-secondary) transparent'
        }}
      >
        <div className={`mx-auto ${settings.compactMode ? 'max-w-6xl' : 'max-w-5xl'} py-4`}>
          {filteredMessages.length === 0 && !isWaitingForResponse ? (
            <div className="text-center text-text-tertiary py-8">
              No messages to display
            </div>
          ) : (
            <div className="space-y-4 px-4">
              {renderedMessages}
              {isWaitingForResponse && (
                filteredMessages.length === 0 || 
                (filteredMessages.length > 0 && filteredMessages[filteredMessages.length - 1].role === 'user') ? (
                  <ThinkingPlaceholder />
                ) : (
                  <InlineWorkingIndicator />
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        
        {/* Scroll to bottom button - centered above input */}
        {showScrollButton && (
          <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <button
              onClick={scrollToBottom}
              className="pointer-events-auto p-3 bg-interactive hover:bg-interactive-hover text-white rounded-full shadow-lg transition-all hover:scale-110 flex items-center gap-2"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

RichOutputView.displayName = 'RichOutputView';
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { API } from '../../../utils/api';
import type { LucideIcon } from 'lucide-react';
import { User, Bot, Eye, EyeOff, Settings2, CheckCircle, XCircle, ArrowDown, Copy, Check, FileText, Terminal, Info, Loader2, Clock } from 'lucide-react';
import { parseTimestamp, formatDistanceToNow } from '../../../utils/timestampUtils';
import { ThinkingPlaceholder, InlineWorkingIndicator } from '../../session/ThinkingPlaceholder';
import { MessageSegment } from './components/MessageSegment';
import { ToolCallView } from './components/ToolCallView';
import { ToolCallGroup } from './components/ToolCallGroup';
import { TodoListDisplay } from './components/TodoListDisplay';
import { MessageTransformer, UnifiedMessage } from './transformers/MessageTransformer';
import { RichOutputSettings } from './AbstractAIPanel';
import { CodexMessageTransformer } from './transformers/CodexMessageTransformer';

// Local interface for combining user prompts with output messages
interface UserPromptMessage {
  type: 'user';
  message: {
    role: 'user';
    content: Array<{ type: 'text'; text: string }>;
  };
  timestamp: string;
}

// Interface for conversation messages from database
interface ConversationMessage {
  id: number;
  session_id: string;
  message_type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// We'll use any for event handling since events can come from different sources with different shapes

const defaultSettings: RichOutputSettings = {
  showToolCalls: true,
  compactMode: false,
  collapseTools: true, // Collapse tools by default
  showThinking: true,
  showSessionInit: false, // Hide by default - it's developer info
};

const formatStatusLabel = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char: string) => char.toUpperCase());

const sessionStatusStyles: Record<string, {
  icon: LucideIcon;
  container: string;
  iconWrapper: string;
  title?: string;
  titleClass: string;
}> = {
  completed: {
    icon: CheckCircle,
    container: 'bg-status-success/10 border-status-success/30',
    iconWrapper: 'bg-status-success/20 text-status-success',
    title: 'Session Completed',
    titleClass: 'text-status-success'
  },
  running: {
    icon: Loader2,
    container: 'bg-interactive/10 border-interactive/30',
    iconWrapper: 'bg-interactive/20 text-interactive-on-dark',
    title: 'Session Running',
    titleClass: 'text-interactive-on-dark'
  },
  initializing: {
    icon: Loader2,
    container: 'bg-interactive/10 border-interactive/30',
    iconWrapper: 'bg-interactive/20 text-interactive-on-dark',
    title: 'Session Initializing',
    titleClass: 'text-interactive-on-dark'
  },
  waiting: {
    icon: Clock,
    container: 'bg-status-warning/10 border-status-warning/30',
    iconWrapper: 'bg-status-warning/20 text-status-warning',
    title: 'Waiting for Input',
    titleClass: 'text-status-warning'
  },
  paused: {
    icon: Clock,
    container: 'bg-status-warning/10 border-status-warning/30',
    iconWrapper: 'bg-status-warning/20 text-status-warning',
    title: 'Session Paused',
    titleClass: 'text-status-warning'
  },
  error: {
    icon: XCircle,
    container: 'bg-status-error/10 border-status-error/30',
    iconWrapper: 'bg-status-error/20 text-status-error',
    title: 'Session Error',
    titleClass: 'text-status-error'
  },
  default: {
    icon: Info,
    container: 'bg-surface-tertiary/50 border-border-primary',
    iconWrapper: 'bg-surface-secondary text-text-secondary',
    title: 'Session Update',
    titleClass: 'text-text-secondary'
  }
};

interface RichOutputViewProps {
  panelId: string;
  sessionStatus?: string;
  settings?: RichOutputSettings;
  onSettingsChange?: (settings: RichOutputSettings) => void;
  showSettings?: boolean;
  messageTransformer: MessageTransformer;
  outputEventName: string;
  getOutputsHandler: string;
  showSystemMessages?: boolean;
}

export const RichOutputView = React.forwardRef<{ scrollToPrompt: (promptIndex: number) => void }, RichOutputViewProps>(
  ({ panelId, sessionStatus, settings: propsSettings, onSettingsChange, showSettings, messageTransformer, outputEventName, getOutputsHandler, showSystemMessages: showSystemMessagesProp }, ref) => {
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedMessages, setCollapsedMessages] = useState<Set<string>>(new Set());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const showSystemMessages = showSystemMessagesProp ?? true;

  // Use parent-controlled settings if provided, otherwise use default
  const localSettings = useMemo<RichOutputSettings>(() => {
    const saved = localStorage.getItem('richOutputSettings');
    return saved ? JSON.parse(saved) : defaultSettings;
  }, []);

  const settings = propsSettings || localSettings;
  const isCodexTransformer = useMemo(() => messageTransformer instanceof CodexMessageTransformer, [messageTransformer]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const userMessageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const wasAtBottomRef = useRef(true); // Start as true to scroll to bottom on first load
  const loadMessagesRef = useRef<(() => Promise<void>) | null>(null);
  const isFirstLoadRef = useRef(true); // Track if this is the first load
  const previousMessageCountRef = useRef(0); // Track previous message count

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
        messageDiv.scrollIntoView({ behavior: 'auto', block: 'center' });
        
        // Add a highlight effect
        messageDiv.classList.add('highlight-prompt');
        setTimeout(() => {
          messageDiv.classList.remove('highlight-prompt');
        }, 2000);
      }
    }
  }), []);

  const loadMessages = useCallback(async () => {
    // Prevent concurrent loads using ref
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    
    // Capture scroll position before loading
    const container = scrollContainerRef.current;
    if (container) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const wasAtBottom = distanceFromBottom < 50;
      wasAtBottomRef.current = wasAtBottom;
    }
    
    try {
      setError(null);
      
      // For Codex panels, use the getOutputsHandler to get outputs
      if (getOutputsHandler.includes('codex')) {
        const existingOutputs = await window.electron?.invoke(getOutputsHandler, panelId, 1000);
        if (existingOutputs && existingOutputs.length > 0) {
          const transformedMessages = messageTransformer.transform(existingOutputs);
          setMessages(transformedMessages);
          
          // Auto-expand sub-agent (Task) tools for Codex too
          const newSubAgentIds = new Set<string>();
          transformedMessages.forEach(msg => {
            msg.segments.forEach(seg => {
              if (seg.type === 'tool_call' && seg.tool.name === 'Task') {
                newSubAgentIds.add(seg.tool.id);
              }
            });
          });
          
          // Add sub-agent IDs to expanded tools
          if (newSubAgentIds.size > 0) {
            setExpandedTools(prev => {
              const next = new Set(prev);
              newSubAgentIds.forEach(id => next.add(id));
              return next;
            });
          }
        }
      } else {
        // For Claude panels, use the existing API calls
        const [conversationResponse, outputResponse] = await Promise.all([
          API.panels.getConversationMessages(panelId),
          API.panels.getJsonMessages(panelId)
        ]);
        
        // Combine both sources - conversation messages have the actual user prompts
        const userPrompts: UserPromptMessage[] = [];
        if (conversationResponse.success && Array.isArray(conversationResponse.data)) {
          conversationResponse.data.forEach((msg: ConversationMessage) => {
            if (msg.message_type === 'user') {
              // Skip slash command tool results (they contain <local-command-stdout> tags)
              if (msg.content && typeof msg.content === 'string' && msg.content.includes('<local-command-stdout>')) {
                // This is a slash command result, skip it - it will be shown from JSON messages
                return;
              }

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
        
        // Transform messages using the provided transformer
        const conversationMessages = messageTransformer.transform(allMessages);
        setMessages(conversationMessages);
        
        // Auto-expand sub-agent (Task) tools
        const newSubAgentIds = new Set<string>();
        conversationMessages.forEach(msg => {
          msg.segments.forEach(seg => {
            if (seg.type === 'tool_call' && seg.tool.name === 'Task') {
              newSubAgentIds.add(seg.tool.id);
            }
          });
        });
        
        // Add sub-agent IDs to expanded tools
        if (newSubAgentIds.size > 0) {
          setExpandedTools(prev => {
            const next = new Set(prev);
            newSubAgentIds.forEach(id => next.add(id));
            return next;
          });
        }
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('Failed to load conversation history');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [panelId, messageTransformer, getOutputsHandler]);

  // Store loadMessages in ref to avoid dependency cycles
  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  // Listen for real-time output updates - debounced to prevent performance issues
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
    const handleOutputAvailable = (event: CustomEvent<{ sessionId?: string; panelId?: string; type?: string }> | { sessionId?: string; panelId?: string; type?: string; detail?: { sessionId?: string; panelId?: string; type?: string } }) => {
      // Handle both CustomEvent and Electron IPC events
      const detail = 'detail' in event ? event.detail : event;
      if (detail && (detail.sessionId === panelId || detail.panelId === panelId)) {
        // Debounce message reloading to prevent excessive re-renders
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          // For both Claude and Codex, reload all messages from database
          // This ensures consistency and avoids duplicates
          loadMessagesRef.current?.();
        }, 500); // Wait 500ms after last event
      }
    };
    
    // Listen for the appropriate event based on the panel type
    if (outputEventName.includes('codex')) {
      // Only register Electron IPC listener for Codex
      window.electron?.on(outputEventName, handleOutputAvailable);
      // Don't also add a window event listener - this causes duplicate handling
    } else {
      window.addEventListener('session-output-available', handleOutputAvailable as EventListener);
    }
    
    return () => {
      clearTimeout(debounceTimer);
      if (outputEventName.includes('codex')) {
        window.electron?.off(outputEventName, handleOutputAvailable);
      } else {
        window.removeEventListener('session-output-available', handleOutputAvailable as EventListener);
      }
    };
  }, [panelId, outputEventName]); // Remove messageTransformer from dependencies to avoid re-registering

  // Initial load - only when panelId actually changes
  useEffect(() => {
    if (!panelId) return;
    // Reset first load flag when session changes
    isFirstLoadRef.current = true;
    wasAtBottomRef.current = true; // Also reset to true for new sessions
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]); // Only depend on panelId, not loadMessages - we want this to run only on panel change

  // Removed redundant effect that was calling loadMessages on every parent re-render
  // Messages are loaded via the initial effect above and real-time updates via the output event listener

  // Track if user is at bottom - set up as soon as possible
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const checkIfAtBottom = () => {
      // Consider "at bottom" only if within 50px of the bottom
      // This ensures we don't auto-scroll if the user has intentionally scrolled up
      const threshold = 50;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isAtBottom = distanceFromBottom < threshold;
      
      
      wasAtBottomRef.current = isAtBottom;
    };

    // Check initial position immediately
    checkIfAtBottom();

    // Add scroll listener
    container.addEventListener('scroll', checkIfAtBottom, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', checkIfAtBottom);
    };
  }); // Run on every render to ensure we catch container availability

  // Auto-scroll to bottom when messages change or view loads
  useEffect(() => {
    // Only proceed if we have new messages (not just a re-render)
    const hasNewMessages = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    
    if (messagesEndRef.current && !loading && (hasNewMessages || isFirstLoadRef.current)) {
      // Use the wasAtBottomRef value that was captured BEFORE the messages updated
      // Don't double-check after DOM update as the scroll position will have changed
      if (isFirstLoadRef.current || wasAtBottomRef.current) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          // Use instant scrolling for better responsiveness during active output
          // Smooth scrolling can be too slow and cause users to miss content
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
          // Mark first load as complete
          if (isFirstLoadRef.current) {
            isFirstLoadRef.current = false;
          }
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

  const copyMessageContent = async (message: UnifiedMessage) => {
    // Extract all text content from the message segments
    const contentParts: string[] = [];
    
    message.segments.forEach(seg => {
      if (seg.type === 'text' && seg.content) {
        contentParts.push(seg.content);
      } else if (seg.type === 'thinking' && seg.content) {
        contentParts.push(`*Thinking:*\n${seg.content}`);
      } else if (seg.type === 'tool_call' && seg.tool) {
        contentParts.push(`**Tool: ${seg.tool.name}**\n\`\`\`json\n${JSON.stringify(seg.tool.input, null, 2)}\n\`\`\``);
        if (seg.tool.result) {
          contentParts.push(`**Result:**\n${seg.tool.result.content}`);
        }
      } else if (seg.type === 'diff' && seg.diff) {
        contentParts.push(`\`\`\`diff\n${seg.diff}\n\`\`\``);
      }
    });
    
    const fullContent = contentParts.join('\n\n');
    
    try {
      await navigator.clipboard.writeText(fullContent);
      setCopiedMessageId(message.id);
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Render a complete message
  const renderMessage = (message: UnifiedMessage, index: number, userMessageIndex?: number) => {
    const isCollapsed = collapsedMessages.has(message.id);
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const hasTextContent = message.segments.some(seg => seg.type === 'text');
    const textContent = message.segments
      .filter(seg => seg.type === 'text')
      .map(seg => seg.type === 'text' ? seg.content : '')
      .join('\n\n');
    
    // Check if message has tool calls, thinking, diffs or tool results
    const hasToolCalls = message.segments.some(seg => seg.type === 'tool_call');
    const hasThinking = message.segments.some(seg => seg.type === 'thinking');
    const hasDiffs = message.segments.some(seg => seg.type === 'diff');
    const hasToolResults = message.segments.some(seg => seg.type === 'tool_result');
    
    // Determine if we need extra spacing before this message
    const prevMessage = index > 0 ? filteredMessages[index - 1] : null;
    const needsExtraSpacing = prevMessage && (
      (prevMessage.role !== message.role) || 
      (hasThinking && !prevMessage.segments.some(seg => seg.type === 'thinking'))
    );
    
    // Special rendering for system messages
    if (isSystem) {
      return renderSystemMessage(message, needsExtraSpacing || false);
    }
    
    // Check if this message has any renderable content (including TodoWrite for now, filtered later)
    const hasRenderableContent = hasTextContent || hasToolCalls || hasThinking || hasDiffs || hasToolResults;
    
    // If no renderable content and not a special system message, skip or show raw
    if (!hasRenderableContent) {
      // Check if it's a system_info only message that should be handled differently
      const hasSystemInfo = message.segments.some(seg => seg.type === 'system_info');
      if (hasSystemInfo) {
        // Return null to skip rendering - these are handled in renderSystemMessage
        return null;
      }
      
      // For other messages with no renderable content, show as raw JSON fallback
      if (message.segments.length > 0) {
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all bg-surface-tertiary/50 border border-border-primary
              ${settings.compactMode ? 'p-3' : 'p-4'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="text-xs text-text-tertiary mb-2">Unhandled message type</div>
            <pre className="text-xs text-text-secondary font-mono overflow-x-auto">
              {JSON.stringify(message, null, 2)}
            </pre>
          </div>
        );
      }
      
      // Skip completely empty messages
      return null;
    }
    
    return (
      <div
        key={message.id}
        ref={isUser && userMessageIndex !== undefined ? (el) => {
          if (el) userMessageRefs.current.set(userMessageIndex, el);
        } : undefined}
        className={`
          rounded-lg transition-all relative group
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
              {isUser ? 'You' : messageTransformer.getAgentName()}
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
          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Copy button - only for assistant messages */}
            {!isUser && (
              <button
                onClick={() => copyMessageContent(message)}
                className="p-1.5 rounded-lg bg-surface-secondary/80 hover:bg-surface-secondary transition-all opacity-0 group-hover:opacity-100 border border-border-primary"
                title="Copy message content as markdown"
              >
                {copiedMessageId === message.id ? (
                  <Check className="w-3.5 h-3.5 text-status-success" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-text-tertiary hover:text-text-secondary" />
                )}
              </button>
            )}
            {/* Hide/Show button for long messages */}
            {hasTextContent && textContent.length > 200 && (
              <button
                onClick={() => toggleMessageCollapse(message.id)}
                className="p-1.5 rounded-lg hover:bg-surface-secondary/50 transition-colors text-text-tertiary hover:text-text-secondary"
                title={isCollapsed ? "Show full message" : "Collapse message"}
              >
                {isCollapsed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Message Content */}
        <div className="ml-7 space-y-2">
          {/* Thinking segments */}
          {settings.showThinking && message.segments
            .filter(seg => seg.type === 'thinking')
            .map((seg, idx) => (
              <MessageSegment
                key={`${message.id}-thinking-${idx}`}
                segment={seg}
                messageId={message.id}
                index={idx}
                isUser={isUser}
                expandedTools={expandedTools}
                collapseTools={settings.collapseTools}
                showToolCalls={settings.showToolCalls}
                showThinking={settings.showThinking}
                onToggleToolExpand={toggleToolExpand}
              />
            ))
          }
          
          {/* Text segments - combined into one block */}
          {hasTextContent && (
            <MessageSegment
              segment={{ type: 'text', content: textContent }}
              messageId={message.id}
              index={0}
              isUser={isUser}
              isCollapsed={isCollapsed}
              expandedTools={expandedTools}
              collapseTools={settings.collapseTools}
              showToolCalls={settings.showToolCalls}
              showThinking={settings.showThinking}
              onToggleToolExpand={toggleToolExpand}
            />
          )}
          
          {/* Group consecutive tools, but break on TodoWrite and filter out SlashCommand */}
          {settings.showToolCalls && (() => {
            const toolSegments = message.segments.filter(seg =>
              seg.type === 'tool_call' && seg.tool.name !== 'SlashCommand'
            );
            if (toolSegments.length === 0) return null;
            
            const groups: { tools: typeof message.segments, isTodoWrite: boolean }[] = [];
            let currentGroup: typeof message.segments = [];
            
            toolSegments.forEach((seg) => {
              if (seg.type === 'tool_call' && seg.tool.name === 'TodoWrite') {
                // If we have a current group, save it
                if (currentGroup.length > 0) {
                  groups.push({ tools: currentGroup, isTodoWrite: false });
                  currentGroup = [];
                }
                // Add TodoWrite as its own group
                groups.push({ tools: [seg], isTodoWrite: true });
              } else {
                // Add to current group
                currentGroup.push(seg);
              }
            });
            
            // Don't forget the last group if it exists
            if (currentGroup.length > 0) {
              groups.push({ tools: currentGroup, isTodoWrite: false });
            }
            
            return groups.map((group, groupIdx) => {
              if (group.isTodoWrite && group.tools.length === 1) {
                const seg = group.tools[0];
                if (seg.type === 'tool_call' && seg.tool.result) {
                  try {
                    const resultData = typeof seg.tool.result.content === 'string' 
                      ? JSON.parse(seg.tool.result.content)
                      : seg.tool.result.content;
                    if (resultData.todos && Array.isArray(resultData.todos)) {
                      return (
                        <TodoListDisplay
                          key={`${message.id}-todo-${groupIdx}`}
                          todos={resultData.todos}
                        />
                      );
                    }
                  } catch (e) {
                    // If parsing fails, show as regular tool
                  }
                }
                // Fallback to regular tool display if TodoWrite has no valid result
                return (
                  <MessageSegment
                    key={`${message.id}-tool-group-${groupIdx}`}
                    segment={seg}
                    messageId={message.id}
                    index={groupIdx}
                    isUser={isUser}
                    expandedTools={expandedTools}
                    collapseTools={settings.collapseTools}
                    showToolCalls={settings.showToolCalls}
                    showThinking={settings.showThinking}
                    onToggleToolExpand={toggleToolExpand}
                  />
                );
              } else {
                // Regular tool group
                return (
                  <ToolCallGroup
                    key={`${message.id}-tool-group-${groupIdx}`}
                    tools={group.tools}
                    expandedTools={expandedTools}
                    collapseTools={settings.collapseTools}
                    onToggleToolExpand={toggleToolExpand}
                  />
                );
              }
            });
          })()}
          
          {/* Diff segments */}
          {message.segments
            .filter(seg => seg.type === 'diff')
            .map((seg, idx) => (
              <MessageSegment
                key={`${message.id}-diff-${idx}`}
                segment={seg}
                messageId={message.id}
                index={idx}
                isUser={isUser}
                expandedTools={expandedTools}
                collapseTools={settings.collapseTools}
                showToolCalls={settings.showToolCalls}
                showThinking={settings.showThinking}
                onToggleToolExpand={toggleToolExpand}
              />
            ))
          }
          
          {/* Tool results - only show if not already shown as part of tool calls */}
          {settings.showToolCalls && message.segments
            .filter(seg => seg.type === 'tool_result')
            .map((seg, idx) => (
              <MessageSegment
                key={`${message.id}-result-${idx}`}
                segment={seg}
                messageId={message.id}
                index={idx}
                isUser={isUser}
                expandedTools={expandedTools}
                collapseTools={settings.collapseTools}
                showToolCalls={settings.showToolCalls}
                showThinking={settings.showThinking}
                onToggleToolExpand={toggleToolExpand}
              />
            ))
          }
        </div>
      </div>
    );
  };

  const renderSystemMessage = (message: UnifiedMessage, needsExtraSpacing: boolean) => {
    const textContent = message.segments
      .filter(seg => seg.type === 'text')
      .map(seg => seg.type === 'text' ? seg.content : '')
      .join('\n\n');

    if (message.metadata?.systemSubtype === 'session_info') {
      if (!showSystemMessages && isCodexTransformer) {
        return null;
      }
      const infoSegment = message.segments.find(seg => seg.type === 'system_info');
      const sessionInfo = infoSegment?.type === 'system_info' ? infoSegment.info || {} : {};
      
      // Type guard helper to safely convert unknown values to strings
      const toString = (value: unknown): string => typeof value === 'string' ? value : '';
      
      const initialPrompt = toString(sessionInfo.initialPrompt || sessionInfo.initial_prompt);
      const command = toString(sessionInfo.codexCommand || sessionInfo.claudeCommand || sessionInfo.codex_command);
      const worktreePath = toString(sessionInfo.worktreePath || sessionInfo.worktree_path);
      const model = toString(sessionInfo.model);
      const provider = toString(sessionInfo.modelProvider || sessionInfo.model_provider);
      const approvalPolicy = toString(sessionInfo.approvalPolicy || sessionInfo.approval_policy);
      const sandboxMode = toString(sessionInfo.sandboxMode || sessionInfo.sandbox_mode);
      const permissionMode = toString(sessionInfo.permissionMode || sessionInfo.permission_mode);
      const rawResumeSessionId = sessionInfo.resumeSessionId ?? sessionInfo.resume_session_id;
      const resumeSessionId = typeof rawResumeSessionId === 'string' && rawResumeSessionId.trim().length > 0
        ? rawResumeSessionId
        : null;

      return (
        <div
          key={message.id}
          className={`
            rounded-lg transition-all bg-surface-tertiary border border-border-primary
            ${settings.compactMode ? 'p-3' : 'p-4'}
            ${needsExtraSpacing ? 'mt-4' : ''}
          `}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full p-2 bg-interactive/15 text-interactive-on-dark">
              <Settings2 className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-text-primary">Codex Session Ready</span>
                <span className="text-[11px] font-mono text-text-secondary bg-surface-secondary/70 border border-border-secondary px-2 py-0.5 rounded">
                  Resume ID: {resumeSessionId ?? 'none'}
                </span>
                <span className="text-sm text-text-tertiary">
                  {formatDistanceToNow(parseTimestamp(message.timestamp))}
                </span>
              </div>

              {initialPrompt && (
                <div>
                  <div className="flex items-center gap-2 text-text-secondary mb-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold tracking-wider">You</span>
                  </div>
                  <div className="bg-surface-secondary rounded p-3 text-sm text-text-primary whitespace-pre-wrap break-words">
                    {initialPrompt}
                  </div>
                </div>
              )}

              {command && (
                <div>
                  <div className="flex items-center gap-2 text-text-secondary mb-1">
                    <Terminal className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Codex Command</span>
                  </div>
                  <div className="bg-surface-secondary rounded p-3 text-xs text-text-primary font-mono overflow-x-auto">
                    {command}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {model && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Model</span>
                    <div className="text-text-secondary mt-1 font-medium">
                      {model}
                      {provider && (
                        <span className="block text-text-tertiary text-[11px] font-normal">Provider: {provider}</span>
                      )}
                    </div>
                  </div>
                )}
                {worktreePath && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Worktree</span>
                    <div className="text-text-secondary mt-1 font-mono truncate" title={worktreePath}>
                      {worktreePath}
                    </div>
                  </div>
                )}
                {approvalPolicy && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Approval Policy</span>
                    <div className="text-text-secondary mt-1">
                      {approvalPolicy}
                    </div>
                  </div>
                )}
                {sandboxMode && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Sandbox</span>
                    <div className="text-text-secondary mt-1">
                      {sandboxMode}
                    </div>
                  </div>
                )}
                {permissionMode && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Permission Mode</span>
                    <div className="text-text-secondary mt-1 capitalize">
                      {permissionMode}
                    </div>
                  </div>
                )}
                {resumeSessionId && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Resume Session ID</span>
                    <div className="text-text-secondary mt-1 font-mono truncate" title={resumeSessionId}>
                      {resumeSessionId}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (message.metadata?.systemSubtype === 'session_runtime') {
      if (!showSystemMessages && isCodexTransformer) {
        return null;
      }
      const infoSegment = message.segments.find(seg => seg.type === 'system_info');
      const runtimeInfo = infoSegment?.type === 'system_info' ? infoSegment.info || {} : {};
      
      // Type guard helper to safely convert unknown values to strings
      const toString = (value: unknown): string => typeof value === 'string' ? value : '';
      
      const provider = toString(runtimeInfo.provider);
      const sandboxMode = toString(runtimeInfo.sandboxMode);
      const approvalPolicy = toString(runtimeInfo.approvalPolicy);
      const reasoningEffort = toString(runtimeInfo.reasoningEffort);
      const reasoningSummaries = toString(runtimeInfo.reasoningSummaries);
      const workdir = toString(runtimeInfo.workdir);

      return (
        <div
          key={message.id}
          className={`
            rounded-lg transition-all bg-surface-secondary/60 border border-border-primary
            ${settings.compactMode ? 'p-3' : 'p-4'}
            ${needsExtraSpacing ? 'mt-4' : ''}
          `}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full p-2 bg-surface-secondary text-text-secondary">
              <Settings2 className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">Runtime Configuration</span>
                <span className="text-sm text-text-tertiary">
                  {formatDistanceToNow(parseTimestamp(message.timestamp))}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {provider && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Provider</span>
                    <div className="text-text-secondary mt-1">{provider}</div>
                  </div>
                )}
                {sandboxMode && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Sandbox</span>
                    <div className="text-text-secondary mt-1">{sandboxMode}</div>
                  </div>
                )}
                {approvalPolicy && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Approval Policy</span>
                    <div className="text-text-secondary mt-1">{approvalPolicy}</div>
                  </div>
                )}
                {reasoningEffort && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Reasoning Effort</span>
                    <div className="text-text-secondary mt-1">{reasoningEffort}</div>
                  </div>
                )}
                {reasoningSummaries && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Reasoning Summaries</span>
                    <div className="text-text-secondary mt-1">{reasoningSummaries}</div>
                  </div>
                )}
                {workdir && (
                  <div>
                    <span className="text-text-quaternary uppercase tracking-wide text-[10px]">Workdir</span>
                    <div className="text-text-secondary mt-1 font-mono truncate" title={workdir}>
                      {workdir}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    const errorSegment = message.segments.find(seg => seg.type === 'error');
    if (errorSegment?.type === 'error' && errorSegment.error) {
      const { message: errorMessage, details } = errorSegment.error;

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
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-status-error">
                  {errorMessage || 'Session Error'}
                </span>
                <span className="text-sm text-text-tertiary">
                  {formatDistanceToNow(parseTimestamp(message.timestamp))}
                </span>
              </div>
              {details && (
                <pre className="bg-status-error/10 border border-status-error/30 rounded p-3 text-xs text-status-error/90 whitespace-pre-wrap font-mono overflow-x-auto">
                  {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }

    
    if (message.metadata?.systemSubtype === 'init') {
      const info = message.segments.find(seg => seg.type === 'system_info');
      if (info?.type === 'system_info') {
        // Type guard helper to safely convert unknown values to strings
        const toString = (value: unknown): string => typeof value === 'string' ? value : '';
        
        const infoData = info.info || {};
        const model = toString(infoData.model);
        const cwd = toString(infoData.cwd);
        const toolsLength = Array.isArray(infoData.tools) ? infoData.tools.length : 0;
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
                  <div>Model: <span className="text-text-primary font-mono">{model}</span></div>
                  <div>Working Directory: <span className="text-text-primary font-mono text-xs">{cwd}</span></div>
                  <div>
                    Tools: <span className="text-text-tertiary">{toolsLength} available</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      }
    } else if (message.metadata?.systemSubtype === 'error') {
      const errorInfo = message.segments.find(seg => seg.type === 'system_info')?.info || {};
      
      // Type guard helper to safely convert unknown values to strings
      const toString = (value: unknown): string => typeof value === 'string' ? value : '';
      
      const errorMessage = toString(errorInfo.message) || textContent;
      const errorTitle = toString(errorInfo.error) || 'Session Error';
      
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
      const infoSegment = message.segments.find(seg => seg.type === 'system_info');
      
      // Type guard helper to safely convert unknown values to strings
      const toString = (value: unknown): string => typeof value === 'string' ? value : '';
      
      const helpMessage = infoSegment?.type === 'system_info' ? 
        toString(infoSegment.info?.message) || 'Context has been compacted. You can continue chatting - your next message will automatically include the context summary above.' :
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
    } else if (message.metadata?.systemSubtype === 'slash_command_result') {
      // Render slash command result with subtle styling
      return (
        <div
          key={message.id}
          className={`
            rounded-lg transition-all border bg-surface-tertiary/50 border-border-primary
            ${settings.compactMode ? 'p-3' : 'p-4'}
            ${needsExtraSpacing ? 'mt-4' : ''}
          `}
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full p-2 bg-surface-secondary text-text-secondary">
              <Terminal className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-text-primary">
                  Result
                </span>
                <span className="text-sm text-text-tertiary">
                  {formatDistanceToNow(parseTimestamp(message.timestamp))}
                </span>
              </div>
              <div className="bg-surface-secondary rounded-lg p-3 text-sm text-text-primary whitespace-pre-wrap font-mono">
                {textContent}
              </div>
            </div>
          </div>
        </div>
      );
    } else if (message.metadata?.systemSubtype === 'git_operation' || message.metadata?.systemSubtype === 'git_error') {
      const isError = message.metadata.systemSubtype === 'git_error';
      const rawOutput = textContent;
      const isSuccess = !isError && (rawOutput.includes('✓') || rawOutput.includes('Successfully'));
      
      // Parse the git operation message for better formatting
      const lines = rawOutput.split('\n');
      const mainMessage = lines.filter(line => !line.includes('🔄 GIT OPERATION') && line.trim()).join('\n');
      
      return (
        <div
          key={message.id}
          className={`
            rounded-lg transition-all border 
            ${isError 
              ? 'bg-status-error/10 border-status-error/30'
              : isSuccess 
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
              ${isError 
                ? 'bg-status-error/20 text-status-error'
                : isSuccess 
                  ? 'bg-status-success/20 text-status-success' 
                  : 'bg-interactive/20 text-interactive-on-dark'
              }
            `}>
              {isError ? (
                <XCircle className="w-5 h-5" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`
                  font-semibold 
                  ${isError ? 'text-status-error' : isSuccess ? 'text-status-success' : 'text-interactive-on-dark'}
                `}>
                  {isError ? 'Git Operation Failed' : '🔄 Git Operation'}
                </span>
                <span className="text-sm text-text-tertiary">
                  {formatDistanceToNow(parseTimestamp(message.timestamp))}
                </span>
              </div>
              <div className="space-y-2">
                {mainMessage.split('\n').map((line, idx) => {
                  const trimmedLine = line.trim();
                  if (!trimmedLine) return null;
                  
                  if (isError) {
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
                  } else {
                    if (trimmedLine.startsWith('✓')) {
                      return (
                        <div key={idx} className="flex items-center gap-2 text-status-success font-medium">
                          <span className="text-base">✓</span>
                          <span>{trimmedLine.substring(1).trim()}</span>
                        </div>
                      );
                    } else if (trimmedLine.startsWith('Commit message:') || trimmedLine.includes('Git output:')) {
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
                  }
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Check if there's system_info to display
    const systemInfo = message.segments.find(seg => seg.type === 'system_info');
    if (systemInfo?.type === 'system_info' && systemInfo.info) {
      const info = systemInfo.info;
      
      // Type guard helpers to safely convert unknown values
      const toString = (value: unknown): string => typeof value === 'string' ? value : '';
      const toNumber = (value: unknown): number => typeof value === 'number' ? value : 0;
      
      // Handle specific system_info types
      if (info.type === 'session_status') {
        const rawStatus = typeof info.status === 'string' ? info.status : 'unknown';
        const statusKey = rawStatus.toLowerCase();
        const config = sessionStatusStyles[statusKey] || sessionStatusStyles.default;
        const StatusIcon = config.icon;
        const title = config.title ?? formatStatusLabel(rawStatus);

        if (!showSystemMessages && isCodexTransformer && statusKey === 'completed') {
          return null;
        }

        const statusMessage = typeof info.message === 'string' && info.message.trim().length > 0
          ? info.message
          : `Session status updated to ${formatStatusLabel(rawStatus)}`;

        const detailsContent = info.details && typeof info.details === 'string'
          ? info.details
          : info.details && typeof info.details === 'object'
            ? JSON.stringify(info.details, null, 2)
            : null;

        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all border
              ${config.container}
              ${settings.compactMode ? 'p-3' : 'p-4'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-start gap-3">
              <div className={`rounded-full p-2 ${config.iconWrapper}`}>
                <StatusIcon className={`w-5 h-5 ${statusKey === 'running' || statusKey === 'initializing' ? 'animate-spin' : ''}`} />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${config.titleClass}`}>
                    {title}
                  </span>
                  <span className="text-sm text-text-tertiary">
                    {formatDistanceToNow(parseTimestamp(message.timestamp))}
                  </span>
                </div>
                <div className="text-sm text-text-secondary whitespace-pre-wrap">
                  {statusMessage}
                </div>
                {detailsContent && (
                  <pre className="bg-surface-secondary/70 border border-border-primary rounded p-3 text-xs text-text-secondary whitespace-pre-wrap font-mono overflow-x-auto">
                    {detailsContent}
                  </pre>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (info.type === 'task_started') {
        if (!showSystemMessages && isCodexTransformer) {
          return null;
        }
        
        const modelContextWindow = toNumber(info.model_context_window);
        
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all bg-interactive/5 border border-interactive/20
              ${settings.compactMode ? 'p-2' : 'p-3'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-center gap-2 text-xs text-interactive">
              <span>📋</span>
              <span>Task started</span>
              {modelContextWindow > 0 && (
                <span className="text-text-tertiary">
                  • Context: {(modelContextWindow / 1000).toFixed(0)}k tokens
                </span>
              )}
            </div>
          </div>
        );
      }
      
      if (info.type === 'task_complete') {
        const lastMessage = toString(info.last_message);
        
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all bg-status-success/5 border border-status-success/20
              ${settings.compactMode ? 'p-2' : 'p-3'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-center gap-2 text-xs text-status-success">
              <span>✅</span>
              <span>Task completed</span>
              {lastMessage && (
                <span className="text-text-tertiary">• {lastMessage}</span>
              )}
            </div>
          </div>
        );
      }
      
      if (info.type === 'token_usage') {
        const inputTokens = toNumber(info.input_tokens);
        const outputTokens = toNumber(info.output_tokens);
        const totalTokens = toNumber(info.total_tokens);
        const cachedTokens = toNumber(info.cached_tokens);
        
        return (
          <div
            key={message.id}
            className={`
              rounded-lg transition-all bg-surface-tertiary/30 border border-border-primary
              ${settings.compactMode ? 'p-2' : 'p-3'}
              ${needsExtraSpacing ? 'mt-4' : ''}
            `}
          >
            <div className="flex items-center gap-3 text-xs text-text-tertiary">
              <span>🔢</span>
              <span>Tokens:</span>
              {inputTokens > 0 && <span>In: {inputTokens.toLocaleString()}</span>}
              {outputTokens > 0 && <span>Out: {outputTokens.toLocaleString()}</span>}
              {totalTokens > 0 && <span className="text-text-secondary">Total: {totalTokens.toLocaleString()}</span>}
              {cachedTokens > 0 && (
                <span className="text-interactive">Cached: {cachedTokens.toLocaleString()}</span>
              )}
            </div>
          </div>
        );
      }
    }
    
    // Default system message rendering - only if there's text content
    if (textContent) {
      return (
        <div
          key={message.id}
          className={`
            rounded-lg transition-all bg-surface-tertiary/50 border border-border-primary
            ${settings.compactMode ? 'p-3' : 'p-4'}
            ${needsExtraSpacing ? 'mt-4' : ''}
          `}
        >
          <div className="text-sm text-text-secondary">
            {textContent}
          </div>
        </div>
      );
    }
    
    // If no text content and no recognized system_info, return null to skip
    return null;
  };

  // Check if we're waiting for response
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
    const elements: (React.ReactElement | null)[] = [];
    
    // Group consecutive tool-only messages
    let i = 0;
    while (i < filteredMessages.length) {
      const msg = filteredMessages[i];
      const isUser = msg.role === 'user';
      
      // Check if this message contains only tool calls
      const hasOnlyToolCalls = !isUser && 
        msg.segments.length > 0 && 
        msg.segments.every(seg => seg.type === 'tool_call');
      
      if (hasOnlyToolCalls && settings.showToolCalls) {
        // Collect consecutive tool messages, but break on TodoWrite
        const toolGroups: { messages: typeof filteredMessages, isTodoWrite: boolean }[] = [];
        let currentGroup: typeof filteredMessages = [];
        const messagesToProcess = [msg];
        let j = i + 1;
        
        // First collect all consecutive tool-only messages
        while (j < filteredMessages.length) {
          const nextMsg = filteredMessages[j];
          const nextHasOnlyToolCalls = !nextMsg.role || (nextMsg.role === 'assistant' && 
            nextMsg.segments.length > 0 && 
            nextMsg.segments.every(seg => seg.type === 'tool_call'));
          
          if (nextHasOnlyToolCalls) {
            messagesToProcess.push(nextMsg);
            j++;
          } else {
            break;
          }
        }
        
        // Now group them, breaking on TodoWrite
        for (const toolMsg of messagesToProcess) {
          const hasTodoWrite = toolMsg.segments.some(seg => 
            seg.type === 'tool_call' && seg.tool.name === 'TodoWrite'
          );
          
          if (hasTodoWrite) {
            // Save current group if any
            if (currentGroup.length > 0) {
              toolGroups.push({ messages: currentGroup, isTodoWrite: false });
              currentGroup = [];
            }
            // Add TodoWrite message as its own group
            toolGroups.push({ messages: [toolMsg], isTodoWrite: true });
          } else {
            // Add to current group
            currentGroup.push(toolMsg);
          }
        }
        
        // Save last group if any
        if (currentGroup.length > 0) {
          toolGroups.push({ messages: currentGroup, isTodoWrite: false });
        }
        
        // toolMessages is no longer needed since we use toolGroups now
        
        // Render each group
        if (toolGroups.length > 0) {
          toolGroups.forEach((group, groupIdx) => {
            if (group.isTodoWrite) {
              // Render TodoWrite display
              const todoMsg = group.messages[0];
              const todoSegment = todoMsg.segments.find(seg => 
                seg.type === 'tool_call' && seg.tool.name === 'TodoWrite'
              );
              
              if (todoSegment && todoSegment.type === 'tool_call') {
                let todos = todoSegment.tool.input?.todos;
                if (!todos && todoSegment.tool.result) {
                  try {
                    const resultContent = typeof todoSegment.tool.result.content === 'string' 
                      ? JSON.parse(todoSegment.tool.result.content)
                      : todoSegment.tool.result.content;
                    todos = resultContent?.todos;
                  } catch (e) {
                    // Failed to parse result
                  }
                }
                
                // Type guard to ensure todos is an array
                const validTodos = Array.isArray(todos) ? todos : [];
                
                if (validTodos.length > 0) {
                  // Wrap TodoListDisplay in an assistant message block
                  elements.push(
                    <div
                      key={`todo-display-${i}-${groupIdx}`}
                      className={`
                        rounded-lg transition-all relative group
                        bg-surface-primary
                        ${settings.compactMode ? 'p-3 mt-2' : 'p-4 mt-3'}
                      `}
                    >
                      {/* Message Header */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="rounded-full p-1.5 flex-shrink-0 bg-interactive/20 text-interactive-on-dark">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="flex-1 flex items-baseline gap-2">
                          <span className="font-medium text-text-primary text-sm">
                            {messageTransformer.getAgentName()}
                          </span>
                          <span className="text-xs text-text-tertiary">
                            {formatDistanceToNow(parseTimestamp(todoMsg.timestamp))}
                          </span>
                        </div>
                      </div>
                      
                      {/* Todo List Content */}
                      <div className="ml-7">
                        <TodoListDisplay todos={validTodos} timestamp={todoMsg.timestamp} />
                      </div>
                    </div>
                  );
                }
              }
            } else if (group.messages.length > 1) {
              // Render tool group
              const allToolSegments = group.messages.flatMap(m => 
                m.segments.filter(seg => seg.type === 'tool_call')
              );
              
              elements.push(
                <div
                  key={`tool-group-${i}-${groupIdx}`}
                  className={`rounded-lg bg-surface-primary ${settings.compactMode ? 'p-3 mt-2' : 'p-4 mt-3'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="rounded-full p-1.5 flex-shrink-0 bg-interactive/20 text-interactive-on-dark">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="flex-1 flex items-baseline gap-2">
                      <span className="font-medium text-text-primary text-sm">
                        {messageTransformer.getAgentName()}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        Tool sequence
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      {allToolSegments.filter(seg => seg.type === 'tool_call' && seg.tool.status === 'success').length > 0 && (
                        <span className="text-status-success">
                          {allToolSegments.filter(seg => seg.type === 'tool_call' && seg.tool.status === 'success').length}✓
                        </span>
                      )}
                      {allToolSegments.filter(seg => seg.type === 'tool_call' && seg.tool.status === 'error').length > 0 && (
                        <span className="text-status-error">
                          {allToolSegments.filter(seg => seg.type === 'tool_call' && seg.tool.status === 'error').length}✗
                        </span>
                      )}
                      {allToolSegments.filter(seg => seg.type === 'tool_call' && seg.tool.status === 'pending').length > 0 && (
                        <span className="text-text-tertiary">
                          {allToolSegments.filter(seg => seg.type === 'tool_call' && seg.tool.status === 'pending').length}⏳
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-7 space-y-[1px]">
                    {allToolSegments.map((seg, segIdx) => (
                      <div key={`grouped-tool-${i}-${groupIdx}-${segIdx}`}>
                        {seg.type === 'tool_call' && (
                          <ToolCallView
                            tool={seg.tool}
                            isExpanded={settings.collapseTools ? expandedTools.has(seg.tool.id) : false}
                            collapseTools={settings.collapseTools}
                            onToggleExpand={toggleToolExpand}
                            expandedTools={expandedTools}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            } else if (group.messages.length === 1) {
              // Single tool message, render normally
              const element = renderMessage(group.messages[0], i);
              elements.push(element);
            }
          });
          
          i = j; // Skip all the messages we processed
        } else {
          // Single tool-only message, render normally
          const element = renderMessage(msg, i, isUser ? userMessageIndex : undefined);
          if (isUser) userMessageIndex++;
          elements.push(element);
          i++;
        }
      } else {
        // Regular message, render normally
        const element = renderMessage(msg, i, isUser ? userMessageIndex : undefined);
        if (isUser) userMessageIndex++;
        
        // If this message has TodoWrite mixed with other content, also render TodoWrite separately
        if (!isUser && msg.segments.some(seg => seg.type === 'tool_call' && seg.tool.name === 'TodoWrite')) {
          // Find the last TodoWrite in this message
          const todoSegments = msg.segments.filter(seg => seg.type === 'tool_call' && seg.tool.name === 'TodoWrite');
          const lastTodoSegment = todoSegments[todoSegments.length - 1];
          
          if (lastTodoSegment && lastTodoSegment.type === 'tool_call' && lastTodoSegment.tool.input?.todos) {
            // Type guard to ensure todos is an array
            const todoList = Array.isArray(lastTodoSegment.tool.input.todos) ? lastTodoSegment.tool.input.todos : [];
            
            if (todoList.length > 0) {
              // First add the regular message (with TodoWrite filtered out in renderMessage)
              elements.push(element);
              
              // Then add the TodoWrite display separately, wrapped in an assistant message block
              const todoElement = (
              <div
                key={`todo-display-${msg.id}`}
                className={`
                  rounded-lg transition-all relative group
                  bg-surface-primary
                  ${settings.compactMode ? 'p-3 mt-2' : 'p-4 mt-3'}
                `}
              >
                {/* Message Header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="rounded-full p-1.5 flex-shrink-0 bg-interactive/20 text-interactive-on-dark">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1 flex items-baseline gap-2">
                    <span className="font-medium text-text-primary text-sm">
                      {messageTransformer.getAgentName()}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {formatDistanceToNow(parseTimestamp(msg.timestamp))}
                    </span>
                  </div>
                </div>
                
                {/* Todo List Content */}
                <div className="ml-7">
                  <TodoListDisplay todos={todoList} timestamp={msg.timestamp} />
                </div>
              </div>
            );
            elements.push(todoElement);
            } else {
              elements.push(element);
            }
          } else {
            elements.push(element);
          }
        } else {
          elements.push(element);
        }
        i++;
      }
    }
    
    return elements.filter(element => element !== null); // Filter out null elements
  }, [filteredMessages, collapsedMessages, expandedTools, settings, toggleToolExpand]);

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
      {/* Settings Panel */}
      {showSettings && onSettingsChange && (
        <div className="px-4 py-3 border-b border-border-primary bg-surface-secondary">
          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showToolCalls}
                onChange={(e) => onSettingsChange({ ...settings, showToolCalls: e.target.checked })}
                className="rounded border-border-primary"
              />
              <span>Show Tool Calls</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.compactMode}
                onChange={(e) => onSettingsChange({ ...settings, compactMode: e.target.checked })}
                className="rounded border-border-primary"
              />
              <span>Compact Mode</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.showThinking}
                onChange={(e) => onSettingsChange({ ...settings, showThinking: e.target.checked })}
                className="rounded border-border-primary"
              />
              <span>Show Thinking</span>
            </label>
          </div>
        </div>
      )}

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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { API } from '../../../utils/api';
import { User, Bot, Eye, EyeOff, Settings2, CheckCircle, XCircle, ArrowDown } from 'lucide-react';
import { parseTimestamp, formatDistanceToNow } from '../../../utils/timestampUtils';
import { ThinkingPlaceholder, InlineWorkingIndicator } from '../../session/ThinkingPlaceholder';
import { MessageSegment } from './components/MessageSegment';
import { MessageTransformer, UnifiedMessage } from './transformers/MessageTransformer';
import { RichOutputSettings } from './AbstractAIPanel';

const defaultSettings: RichOutputSettings = {
  showToolCalls: true,
  compactMode: false,
  collapseTools: false,
  showThinking: true,
  showSessionInit: false, // Hide by default - it's developer info
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
}

export const RichOutputView = React.forwardRef<{ scrollToPrompt: (promptIndex: number) => void }, RichOutputViewProps>(
  ({ panelId, sessionStatus, settings: propsSettings, onSettingsChange, showSettings, messageTransformer, outputEventName, getOutputsHandler }, ref) => {
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
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
  const wasAtBottomRef = useRef(true); // Start as true to scroll to bottom on first load
  const loadMessagesRef = useRef<(() => Promise<void>) | null>(null);
  const isFirstLoadRef = useRef(true); // Track if this is the first load

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

  const loadMessages = useCallback(async () => {
    // Prevent concurrent loads using ref
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    
    try {
      setError(null);
      
      // For Codex panels, use the getOutputsHandler to get outputs
      if (getOutputsHandler.includes('codex')) {
        const existingOutputs = await window.electron?.invoke(getOutputsHandler, panelId, 1000);
        if (existingOutputs && existingOutputs.length > 0) {
          const transformedMessages = messageTransformer.transform(existingOutputs);
          setMessages(transformedMessages);
        }
      } else {
        // For Claude panels, use the existing API calls
        const [conversationResponse, outputResponse] = await Promise.all([
          API.panels.getConversationMessages(panelId),
          API.panels.getJsonMessages(panelId)
        ]);
        
        // Combine both sources - conversation messages have the actual user prompts
        const userPrompts: any[] = [];
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
        
        // Transform messages using the provided transformer
        const conversationMessages = messageTransformer.transform(allMessages);
        setMessages(conversationMessages);
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
    
    const handleOutputAvailable = (event: any) => {
      // Handle both CustomEvent and Electron IPC events
      const detail = event.detail || event;
      if (detail.sessionId === panelId || detail.panelId === panelId) {
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
      window.electron?.on(outputEventName, handleOutputAvailable);
      window.addEventListener(outputEventName, handleOutputAvailable as any);
    } else {
      window.addEventListener('session-output-available', handleOutputAvailable as any);
    }
    
    return () => {
      clearTimeout(debounceTimer);
      if (outputEventName.includes('codex')) {
        window.electron?.off(outputEventName, handleOutputAvailable);
        window.removeEventListener(outputEventName, handleOutputAvailable as any);
      } else {
        window.removeEventListener('session-output-available', handleOutputAvailable as any);
      }
    };
  }, [panelId, outputEventName, messageTransformer]); // Include dependencies

  // Initial load
  useEffect(() => {
    if (!panelId) return;
    // Reset first load flag when session changes
    isFirstLoadRef.current = true;
    wasAtBottomRef.current = true; // Also reset to true for new sessions
    loadMessages();
  }, [panelId, loadMessages]);

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
      // Always scroll to bottom on first load, or if we were at the bottom before the update
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
    
    // Check if this message has any renderable content
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
          
          {/* Tool calls */}
          {settings.showToolCalls && message.segments
            .filter(seg => seg.type === 'tool_call')
            .map((seg, idx) => (
              <MessageSegment
                key={`${message.id}-tool-${idx}`}
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
      
      // Handle specific system_info types
      if (info.type === 'task_started') {
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
              {info.model_context_window && (
                <span className="text-text-tertiary">
                  • Context: {(info.model_context_window / 1000).toFixed(0)}k tokens
                </span>
              )}
            </div>
          </div>
        );
      }
      
      if (info.type === 'task_complete') {
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
              {info.last_message && (
                <span className="text-text-tertiary">• {info.last_message}</span>
              )}
            </div>
          </div>
        );
      }
      
      if (info.type === 'token_usage') {
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
              {info.input_tokens && <span>In: {info.input_tokens.toLocaleString()}</span>}
              {info.output_tokens && <span>Out: {info.output_tokens.toLocaleString()}</span>}
              {info.total_tokens && <span className="text-text-secondary">Total: {info.total_tokens.toLocaleString()}</span>}
              {info.cached_tokens && info.cached_tokens > 0 && (
                <span className="text-interactive">Cached: {info.cached_tokens.toLocaleString()}</span>
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
    return filteredMessages.map((msg, idx) => {
      const isUser = msg.role === 'user';
      const element = renderMessage(msg, idx, isUser ? userMessageIndex : undefined);
      if (isUser) userMessageIndex++;
      return element;
    }).filter(element => element !== null); // Filter out null elements
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
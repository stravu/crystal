import React, { useState, useCallback, useRef, memo, useEffect } from 'react';
import { Session, GitCommands } from '../../../types/session';
// ViewMode removed - no longer needed
import { X, Cpu, Send, Play, Terminal, ChevronRight, AtSign, Paperclip, Zap, Brain, Target, CheckCircle, Square, FileText, Loader2 } from 'lucide-react';
import FilePathAutocomplete from '../../FilePathAutocomplete';
import { API } from '../../../utils/api';
import { CommitModePill } from '../../CommitModeToggle';
import { Dropdown, type DropdownItem } from '../../ui/Dropdown';
import { Pill } from '../../ui/Pill';
import { SwitchSimple as Switch } from '../../ui/SwitchSimple';

interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
  type: string;
}

interface AttachedText {
  id: string;
  name: string;
  content: string;
  size: number;
}

interface SessionInputWithImagesProps {
  activeSession: Session;
  viewMode?: unknown; // ViewMode removed - kept for compatibility
  input: string;
  setInput: (input: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleTerminalCommand: () => void;
  handleSendInput: (attachedImages?: AttachedImage[], attachedTexts?: AttachedText[]) => void;
  handleContinueConversation: (
    attachedImages?: AttachedImage[],
    attachedTexts?: AttachedText[],
    modelOverride?: string
  ) => void;
  isStravuConnected: boolean;
  setShowStravuSearch: (show: boolean) => void;
  ultrathink: boolean;
  setUltrathink: (ultra: boolean) => void;
  gitCommands: GitCommands | null;
  onFocus?: () => void;
  onBlur?: () => void;
  handleCompactContext?: () => void;
  hasConversationHistory?: boolean;
  contextCompacted?: boolean;
  handleCancelRequest?: () => void;
  panelId?: string; // Add optional panel ID for panel-specific model settings
  contextUsageDisplay?: string;
  contextUpdating?: boolean;
}

export const SessionInputWithImages: React.FC<SessionInputWithImagesProps> = memo(({
  activeSession,
  viewMode,
  input,
  setInput,
  textareaRef,
  handleTerminalCommand,
  handleSendInput,
  handleContinueConversation,
  isStravuConnected,
  setShowStravuSearch,
  ultrathink,
  setUltrathink,
  gitCommands,
  onFocus,
  onBlur,
  handleCompactContext,
  hasConversationHistory,
  contextCompacted = false,
  handleCancelRequest,
  panelId,
  contextUsageDisplay,
  contextUpdating,
}) => {
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedTexts, setAttachedTexts] = useState<AttachedText[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isToolbarActive, setIsToolbarActive] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate auto-commit enabled state
  const effectiveMode = activeSession.commitMode || (activeSession.autoCommit === false ? 'disabled' : 'checkpoint');
  const isAutoCommitEnabled = effectiveMode !== 'disabled';

  // Load model from panel settings if panelId is provided
  useEffect(() => {
    if (panelId) {
      // Fetch model from Claude panel settings
      API.claudePanels.getModel(panelId).then((response) => {
        if (response.success && response.data) {
          setSelectedModel(response.data);
        }
      }).catch((error) => {
        console.error('Failed to fetch panel model:', error);
        setSelectedModel('auto'); // Default fallback
      });
    } else {
      // Fallback for non-panel usage (if any)
      setSelectedModel('auto');
    }
  }, [panelId]); // Reload when panel ID changes

  const generateImageId = () => `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const processFile = async (file: File): Promise<AttachedImage | null> => {
    if (!file.type.startsWith('image/')) {
      console.warn('File is not an image:', file.name);
      return null;
    }

    // Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      console.warn('Image file too large (max 10MB):', file.name);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve({
            id: generateImageId(),
            name: file.name,
            dataUrl: e.target.result as string,
            size: file.size,
            type: file.type,
          });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for text content first
    const textData = e.clipboardData.getData('text/plain');
    const LARGE_TEXT_THRESHOLD = 5000;
    
    if (textData && textData.length > LARGE_TEXT_THRESHOLD) {
      // Large text pasted - convert to attachment
      e.preventDefault();
      
      const textAttachment: AttachedText = {
        id: generateTextId(),
        name: `Pasted Text (${textData.length.toLocaleString()} chars)`,
        content: textData,
        size: textData.length,
      };
      
      setAttachedTexts(prev => [...prev, textAttachment]);
      console.log(`[Large Text] Automatically attached ${textData.length} characters from paste`);
      return;
    }

    // Check for images
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i]);
      }
    }

    if (imageItems.length === 0) return;

    e.preventDefault();

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        const image = await processFile(file);
        if (image) {
          setAttachedImages(prev => [...prev, image]);
        }
      }
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const image = await processFile(file);
      if (image) {
        setAttachedImages(prev => [...prev, image]);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeImage = useCallback((id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  }, []);

  const removeText = useCallback((id: string) => {
    setAttachedTexts(prev => prev.filter(txt => txt.id !== id));
  }, []);

  const generateTextId = () => `txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const shouldSend = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
    const shouldCancel = e.key === 'Escape' && activeSession.status === 'running' && handleCancelRequest;
    
    if (shouldCancel) {
      e.preventDefault();
      handleCancelRequest();
    } else if (shouldSend) {
      e.preventDefault();
      
      // Prevent duplicate submissions
      if (isSubmitting) {
        console.log('[SessionInputWithImages] Ignoring duplicate submission attempt');
        return;
      }
      
      setIsSubmitting(true);
      
      try {
        if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
          await handleTerminalCommand();
        } else if (activeSession.status === 'waiting') {
          await handleSendInput(attachedImages, attachedTexts);
          setAttachedImages([]);
          setAttachedTexts([]);
        } else {
          await handleContinueConversation(attachedImages, attachedTexts, selectedModel);
          setAttachedImages([]);
          setAttachedTexts([]);
        }
      } finally {
        // Reset submission state after a short delay to prevent rapid resubmissions
        setTimeout(() => setIsSubmitting(false), 500);
      }
    }
  };
  
  const onClickSend = async () => {
    // Prevent duplicate submissions
    if (isSubmitting) {
      console.log('[SessionInputWithImages] Ignoring duplicate submission attempt');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
        await handleTerminalCommand();
      } else if (activeSession.status === 'waiting') {
        await handleSendInput(attachedImages, attachedTexts);
        setAttachedImages([]);
        setAttachedTexts([]);
      } else {
        await handleContinueConversation(attachedImages, attachedTexts, selectedModel);
        setAttachedImages([]);
        setAttachedTexts([]);
      }
    } finally {
      // Reset submission state after a short delay to prevent rapid resubmissions
      setTimeout(() => setIsSubmitting(false), 500);
    }
  };

  const placeholder = viewMode === 'terminal'
    ? (activeSession.isRunning ? "Script is running..." : (activeSession.status === 'waiting' ? "Enter your response..." : "Enter terminal command..."))
    : (activeSession.status === 'waiting' ? "Enter your response..." : "Write a command...");

  // Memoize button config to prevent recalculation on every render
  const buttonConfig = React.useMemo(() => {
    if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
      return { text: 'Execute', icon: Play, color: 'green', isPrimary: false };
    } else if (activeSession.status === 'waiting') {
      return { text: 'Send', icon: Send, color: 'blue', isPrimary: false };
    } else {
      return { text: 'Continue', icon: ChevronRight, color: 'blue', isPrimary: true };
    }
  }, [viewMode, activeSession.isRunning, activeSession.status]);

  const ButtonIcon = buttonConfig.icon;

  // Memoize session status to prevent recalculation on every render
  const sessionStatus = React.useMemo(() => {
    switch (activeSession.status) {
      case 'initializing':
        return { color: 'bg-status-warning', pulse: true };
      case 'ready':
        return { color: 'bg-status-success', pulse: false };
      case 'running':
        return { color: 'bg-interactive', pulse: true };
      case 'waiting':
        return { color: 'bg-status-warning', pulse: true };
      case 'stopped':
        return { color: 'bg-text-tertiary', pulse: false };
      case 'completed_unviewed':
        return { color: 'bg-status-success', pulse: true };
      case 'error':
        return { color: 'bg-status-error', pulse: false };
      default:
        return { color: 'bg-text-tertiary', pulse: false };
    }
  }, [activeSession.status]);

  const resolvedContextDisplay = contextUsageDisplay ?? '-- tokens (--%)';

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setIsToolbarActive(true);
    onFocus?.();
  }, [onFocus]);



  return (
    <div className="h-full flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="bg-surface-secondary flex flex-col flex-1 min-h-0">
        {/* Context Bar */}
        <div className="px-4 py-2 border-b border-border-primary bg-surface-primary flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* Session status indicator */}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${sessionStatus.color} ${sessionStatus.pulse ? 'animate-pulse' : ''}`} />
              </div>
              
              {/* Project Badge */}
              <div className="px-2.5 py-1 rounded-full text-xs font-medium
                bg-interactive/10 text-interactive 
                border border-interactive/30
                flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="leading-none">
                  {activeSession.worktreePath.split('/').slice(-3, -2)[0] || 'Project'}
                </span>
              </div>
              
              {/* Branch Badge */}
              {gitCommands?.currentBranch && (
                <div className="px-2.5 py-1 rounded-full text-xs font-medium
                  bg-status-success/10 text-status-success 
                  border border-status-success/30
                  flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12a3 3 0 003 3h6m-6-6l3-3-3-3m6 0a3 3 0 100 6 3 3 0 000-6z" />
                  </svg>
                  <span className="leading-none font-mono">
                    {gitCommands.currentBranch}
                  </span>
                </div>
              )}
              
              {/* Context Compacted Indicator */}
              {contextCompacted && (
                <div className="px-2.5 py-1 rounded-full text-xs font-medium
                  bg-status-warning/10 text-status-warning 
                  border border-status-warning/30
                  flex items-center gap-1.5 animate-pulse">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span className="leading-none">
                    Context Ready
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                {contextUpdating && (
                  <Loader2 className="w-3 h-3 animate-spin text-interactive" aria-hidden="true" />
                )}
                <span>{resolvedContextDisplay}</span>
              </div>
              {/* Mode indicator */}
              {viewMode === 'terminal' && (
                <div className="flex items-center gap-1 text-text-secondary">
                  <Terminal className="w-3 h-3" />
                  <span>Terminal Mode</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Command Input Area */}
        <div
          className="p-4 bg-surface-primary flex-1 flex flex-col min-h-0 overflow-auto"
          data-toolbar-container
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onFocusCapture={() => {
            // When any element in the toolbar gets focus, keep toolbar active
            setIsToolbarActive(true);
          }}
          onBlurCapture={(e) => {
            // Use a timeout to check if focus moved outside the toolbar
            setTimeout(() => {
              const activeElement = document.activeElement;
              const toolbar = e.currentTarget as HTMLElement;

              if (!activeElement || !toolbar || !toolbar.contains(activeElement)) {
                setIsToolbarActive(false);
              }
            }, 0);
          }}
        >
          {/* Attached items (images and text) */}
          {(attachedImages.length > 0 || attachedTexts.length > 0) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {/* Attached text files */}
              {attachedTexts.map(text => (
                <div key={text.id} className="relative group">
                  <div className="h-12 px-3 flex items-center gap-2 bg-surface-secondary rounded border border-border-primary">
                    <FileText className="w-4 h-4 text-text-secondary" />
                    <span className="text-xs text-text-secondary max-w-[150px] truncate">
                      {text.name}
                    </span>
                  </div>
                  <button
                    onClick={() => removeText(text.id)}
                    className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5 text-text-secondary" />
                  </button>
                </div>
              ))}
              
              {/* Attached images */}
              {attachedImages.map(image => (
                <div key={image.id} className="relative group">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="h-12 w-12 object-cover rounded border border-border-primary"
                  />
                  <button
                    onClick={() => removeImage(image.id)}
                    className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5 text-text-secondary" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Clean Input Container */}
          <div className={`
            relative z-10 flex-1 flex flex-col min-h-0
            bg-surface-primary
            rounded-lg border border-border-primary
            shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]
            transition-all duration-200 backdrop-blur-sm
            ${(isFocused || isToolbarActive) ? (buttonConfig.color === 'green' ? 'command-bar-focus-green' : 'command-bar-focus') : ''}
          `}>
            {/* Command prompt field */}
            <div className="relative flex-1 min-h-0 flex">
              <div className="absolute left-4 top-4 text-text-secondary select-none pointer-events-none font-mono text-sm z-10">
                &gt;
              </div>
              <FilePathAutocomplete
                value={input}
                onChange={setInput}
                sessionId={activeSession.id}
                placeholder={isDragging ? "Drop images here..." : placeholder}
                className={`
                  w-full h-full pl-10 pr-4 py-4
                  bg-transparent
                  border-0 focus:outline-none
                  resize-none font-mono text-sm
                  text-text-primary
                  placeholder-text-tertiary
                  transition-colors
                `}
                textareaRef={textareaRef}
                isTextarea={true}
                rows={1}
                onKeyDown={onKeyDown}
                onPaste={handlePaste}
                onFocus={handleFocus}
                onBlur={() => {
                  // Simple blur handling without toolbar check
                  setIsFocused(false);
                  setIsToolbarActive(false);
                  onBlur?.();
                }}
                style={{
                  minHeight: '52px'
                }}
              />
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  for (const file of files) {
                    const image = await processFile(file);
                    if (image) {
                      setAttachedImages(prev => [...prev, image]);
                    }
                  }
                  e.target.value = ''; // Reset input
                }}
              />
            </div>
          </div>

          {/* Unified Action Bar */}
          <div className="flex items-center justify-between mt-3 gap-4 flex-shrink-0">
            {/* Left Section - Tools and Settings */}
            <div className="flex items-center gap-2">
              {/* Attach Button */}
              <Pill
                onClick={() => fileInputRef.current?.click()}
                icon={<Paperclip className="w-3.5 h-3.5" />}
                title="Attach images"
              >
                Attach Image
              </Pill>
              
              {/* Reference Button */}
              {isStravuConnected && (
                <Pill
                  onClick={() => setShowStravuSearch(true)}
                  icon={<AtSign className="w-3.5 h-3.5" />}
                  title="Reference files (@)"
                >
                  Reference
                </Pill>
              )}

              {/* Divider */}
              <div className="h-6 w-px bg-border-primary mx-1" />

              {/* Action Bar - Horizontal row with semantic grouping */}
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <ModelSelector
                  selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel}
                  setShowDropdown={() => {}}
                  panelId={panelId}
                />

                {/* Auto-Commit Mode Pill - always visible */}
                <CommitModePill
                  sessionId={activeSession.id}
                  currentMode={activeSession.commitMode}
                  currentSettings={activeSession.commitModeSettings}
                  autoCommit={activeSession.autoCommit}
                  projectId={activeSession.projectId}
                  isAutoCommitEnabled={isAutoCommitEnabled}
                />

                {/* Toggle Group - subtle visual grouping */}
                <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border-primary/20">
                  {/* Auto-Commit Toggle - Hidden: Now handled by CommitMode system */}
                  {/* <AutoCommitSwitch
                    sessionId={activeSession.id}
                    currentMode={activeSession.commitMode}
                    currentSettings={activeSession.commitModeSettings}
                    autoCommit={activeSession.autoCommit}
                  /> */}
                  
                  {/* Extended Thinking Toggle */}
                  <Switch
                    checked={ultrathink}
                    onCheckedChange={setUltrathink}
                    label="Extended Thinking"
                    icon={<Cpu />}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* Right Section - Context Compaction & Continue Button */}
            <div className="flex items-center gap-2">
              {/* Context Compaction Button */}
              {handleCompactContext && hasConversationHistory && (
                <button
                  onClick={handleCompactContext}
                  disabled={activeSession.status === 'running' || activeSession.status === 'initializing'}
                  className={`
                    px-3.5 py-2 rounded-lg text-sm font-medium
                    transition-all duration-200 flex items-center gap-2
                    hover:scale-[1.02] active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0
                    border
                    ${activeSession.status === 'running' || activeSession.status === 'initializing'
                      ? 'bg-surface-tertiary text-text-muted cursor-not-allowed border-border-secondary' 
                      : contextCompacted 
                        ? 'bg-status-warning/10 text-status-warning hover:bg-status-warning/20 focus:ring-status-warning border-status-warning/30'
                        : 'bg-surface-primary text-text-secondary hover:bg-surface-hover focus:ring-interactive border-border-primary'
                    }
                  `}
                  title={contextCompacted 
                    ? 'Context summary ready - will be added to your next prompt'
                    : 'Generate a summary of the conversation to continue in a new context window'
                  }
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  </svg>
                  <span className="leading-none">
                    {contextCompacted ? 'Context Ready' : 'Compact Context'}
                  </span>
                </button>
              )}
              
              {/* Main Action Button / Cancel Button */}
              {activeSession.status === 'running' && handleCancelRequest ? (
                <button 
                  onClick={handleCancelRequest}
                  className={`
                    px-4 py-2 font-medium group
                    flex items-center gap-2 transition-all duration-200
                    rounded-lg border
                    active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0
                    bg-surface-secondary hover:bg-surface-hover 
                    text-status-error hover:text-status-error/90 
                    border-status-error/30 hover:border-status-error/50
                    focus:ring-status-error/50
                    hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]
                  `}
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span className="font-semibold">Cancel</span>
                  
                  {/* Inline keyboard shortcut */}
                  <span 
                    className="ml-2 text-xs font-mono bg-surface-tertiary px-1.5 py-0.5 rounded opacity-80 group-hover:opacity-100 transition-opacity"
                    title="Cancel Request"
                  >
                    ESC
                  </span>
                </button>
              ) : (
                <button 
                  onClick={onClickSend}
                  disabled={isSubmitting}
                  className={`
                    px-4 py-2 font-medium group
                    flex items-center gap-2 transition-all duration-200
                    rounded-lg border
                    active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0
                    ${isSubmitting 
                      ? 'bg-gray-500 text-gray-300 border-gray-500 cursor-not-allowed opacity-60'
                      : buttonConfig.isPrimary 
                        ? `bg-gradient-to-r from-interactive to-interactive-hover hover:from-interactive-hover hover:to-interactive 
                           text-white border-interactive shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] 
                           focus:ring-interactive hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)]`
                        : buttonConfig.color === 'green' 
                          ? 'bg-surface-secondary hover:bg-surface-hover text-status-success hover:text-status-success/90 border-border-primary focus:ring-status-success' 
                          : 'bg-surface-secondary hover:bg-surface-hover text-interactive hover:text-interactive-hover border-border-primary focus:ring-interactive'
                    }
                  `}
                >
                  <ButtonIcon className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  <span className="font-semibold">{isSubmitting ? 'Processing...' : buttonConfig.text}</span>
                  
                  {/* Inline keyboard shortcut */}
                  <span 
                    className="ml-2 text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded opacity-80 group-hover:opacity-100 transition-opacity"
                    title="Keyboard Shortcut: ⌘ + Enter"
                  >
                    ⌘⏎
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

SessionInputWithImages.displayName = 'SessionInputWithImages';

// Export with both names for compatibility
export const ClaudeInputWithImages = SessionInputWithImages;

// Model Selector Component
interface ModelSelectorProps {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  setShowDropdown: (show: boolean) => void;
  panelId?: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  setSelectedModel,
  setShowDropdown,
  panelId,
}) => {
  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    
    // Save model to panel settings if panelId is provided
    if (panelId) {
      try {
        await API.claudePanels.setModel(panelId, modelId);
      } catch (err) {
        console.error('Failed to save panel model:', err);
      }
    }
    
    // Also save as the default model preference for new panels
    try {
      await API.config.update({ defaultModel: modelId });
    } catch (err) {
      console.error('Failed to save default model preference:', err);
    }
  };

  // Model configurations
  const modelConfigs = {
    'auto': {
      label: 'Auto',
      icon: CheckCircle,
      iconColor: 'text-interactive',
      description: 'Default',
    },
    'sonnet': {
      label: 'Sonnet',
      icon: Target,
      iconColor: 'text-interactive',
      description: 'Balanced',
    },
    'opus': {
      label: 'Opus',
      icon: Brain,
      iconColor: 'text-interactive',
      description: 'Maximum',
    },
    'haiku': {
      label: 'Haiku',
      icon: Zap,
      iconColor: 'text-status-success',
      description: 'Fast',
    },
  };

  const currentConfig = modelConfigs[selectedModel as keyof typeof modelConfigs];
  const Icon = currentConfig?.icon || Target;

  // Create dropdown items
  const dropdownItems: DropdownItem[] = Object.entries(modelConfigs).map(([modelId, config]) => ({
    id: modelId,
    label: config.label,
    description: config.description,
    icon: config.icon,
    iconColor: config.iconColor,
    onClick: () => handleModelChange(modelId),
  }));

  // Create trigger button
  const triggerButton = (
    <Pill
      icon={<Icon className={`w-3.5 h-3.5 ${currentConfig?.iconColor}`} />}
    >
      {currentConfig?.label}
      <svg className="w-3.5 h-3.5 text-text-tertiary" 
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </Pill>
  );

  return (
    <Dropdown
      trigger={triggerButton}
      items={dropdownItems}
      selectedId={selectedModel}
      position="auto"
      width="sm"
      onOpenChange={setShowDropdown}
    />
  );
};

import React, { useState, useCallback, useRef, memo, useEffect } from 'react';
import { Session, GitCommands } from '../../types/session';
import { ViewMode } from '../../hooks/useSessionView';
import { X, Cpu, Send, Play, Terminal, ChevronRight, AtSign, Paperclip, Zap, Brain, Target, CheckCircle, Square } from 'lucide-react';
import FilePathAutocomplete from '../FilePathAutocomplete';
import { API } from '../../utils/api';
import { CommitModePill, AutoCommitSwitch } from '../CommitModeToggle';
import { Dropdown, type DropdownItem } from '../ui/Dropdown';
import { Pill } from '../ui/Pill';
import { SwitchSimple as Switch } from '../ui/SwitchSimple';

interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
  type: string;
}

interface SessionInputWithImagesProps {
  activeSession: Session;
  viewMode: ViewMode;
  input: string;
  setInput: (input: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleTerminalCommand: () => void;
  handleSendInput: (attachedImages?: AttachedImage[]) => void;
  handleContinueConversation: (attachedImages?: AttachedImage[], model?: string) => void;
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
}) => {
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isToolbarActive, setIsToolbarActive] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(activeSession.model || 'claude-sonnet-4-20250514');
  const [textareaHeight, setTextareaHeight] = useState<number>(52);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate auto-commit enabled state
  const effectiveMode = activeSession.commitMode || (activeSession.autoCommit === false ? 'disabled' : 'checkpoint');
  const isAutoCommitEnabled = effectiveMode !== 'disabled';

  useEffect(() => {
    // Update selected model when switching to a different session
    setSelectedModel(activeSession.model || 'claude-sonnet-4-20250514');
  }, [activeSession.id]); // Only reset when session ID changes, not when model updates

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const shouldSend = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
    const shouldCancel = e.key === 'Escape' && activeSession.status === 'running' && handleCancelRequest;
    
    if (shouldCancel) {
      e.preventDefault();
      handleCancelRequest();
    } else if (shouldSend) {
      e.preventDefault();
      if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
        handleTerminalCommand();
      } else if (activeSession.status === 'waiting') {
        handleSendInput(attachedImages);
        setAttachedImages([]);
      } else {
        handleContinueConversation(attachedImages, selectedModel);
        setAttachedImages([]);
      }
    }
  };
  
  const onClickSend = () => {
    if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
      handleTerminalCommand();
    } else if (activeSession.status === 'waiting') {
      handleSendInput(attachedImages);
      setAttachedImages([]);
    } else {
      handleContinueConversation(attachedImages, selectedModel);
      setAttachedImages([]);
    }
  };

  const placeholder = viewMode === 'terminal'
    ? (activeSession.isRunning ? "Script is running..." : (activeSession.status === 'waiting' ? "Enter your response..." : "Enter terminal command..."))
    : (activeSession.status === 'waiting' ? "Enter your response..." : "Write a command...");

  // Determine button config based on state
  const getButtonConfig = () => {
    if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
      return { text: 'Execute', icon: Play, color: 'green', isPrimary: false };
    } else if (activeSession.status === 'waiting') {
      return { text: 'Send', icon: Send, color: 'blue', isPrimary: false };
    } else {
      return { text: 'Continue', icon: ChevronRight, color: 'blue', isPrimary: true };
    }
  };

  const buttonConfig = getButtonConfig();
  const ButtonIcon = buttonConfig.icon;

  // Get session status
  const getSessionStatus = () => {
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
  };

  const sessionStatus = getSessionStatus();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to allow proper shrinking
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, 52), 200);
      setTextareaHeight(newHeight);
    }
  }, [input, textareaRef]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setIsToolbarActive(true);
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    // Check if the blur is due to clicking within the toolbar
    const toolbar = e.currentTarget.closest('[data-toolbar-container]');
    const relatedTarget = e.relatedTarget;
    
    // Only remove focus if we're actually leaving the toolbar area
    if (!toolbar || !relatedTarget || !toolbar.contains(relatedTarget as Node)) {
      setIsFocused(false);
      setIsToolbarActive(false);
      onBlur?.();
    } else {
      // Keep toolbar active if staying within toolbar
      setIsFocused(false); // Input not focused, but toolbar still active
      setIsToolbarActive(true);
    }
  }, [onBlur]);


  return (
    <div className="border-t-2 border-border-primary flex-shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="bg-surface-secondary">
        {/* Context Bar */}
        <div className="px-4 py-2 border-b border-border-primary bg-surface-primary">
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
            {/* Mode indicator */}
            {viewMode === 'terminal' && (
              <div className="flex items-center gap-1 text-text-secondary">
                <Terminal className="w-3 h-3" />
                <span>Terminal Mode</span>
              </div>
            )}
          </div>
        </div>

        {/* Command Input Area */}
        <div 
          className="p-4 bg-surface-primary"
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
              const toolbar = (e as any).currentTarget;
              
              if (!activeElement || !toolbar || !toolbar.contains(activeElement)) {
                setIsToolbarActive(false);
              }
            }, 0);
          }}
        >
          {/* Attached images */}
          {attachedImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
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
            relative z-10
            bg-surface-primary 
            rounded-lg border border-border-primary 
            shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]
            transition-all duration-200 backdrop-blur-sm
            ${(isFocused || isToolbarActive) ? (buttonConfig.color === 'green' ? 'command-bar-focus-green' : 'command-bar-focus') : ''}
          `}>
            {/* Command prompt field */}
            <div className="relative">
              <div className="absolute left-4 top-[50%] -translate-y-[50%] text-text-secondary select-none pointer-events-none font-mono text-sm">
                &gt;
              </div>
              <FilePathAutocomplete
                value={input}
                onChange={setInput}
                sessionId={activeSession.id}
                placeholder={isDragging ? "Drop images here..." : placeholder}
                className={`
                  w-full pl-10 pr-4 py-4 
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
                onBlur={handleBlur as any}
                style={{ 
                  height: `${textareaHeight}px`,
                  minHeight: '52px', 
                  maxHeight: '200px',
                  overflowY: textareaHeight >= 200 ? 'auto' : 'hidden',
                  transition: 'height 0.1s ease-out'
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
          <div className="flex items-center justify-between mt-3 gap-4">
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
                  {/* Auto-Commit Toggle */}
                  <AutoCommitSwitch
                    sessionId={activeSession.id}
                    currentMode={activeSession.commitMode}
                    currentSettings={activeSession.commitModeSettings}
                    autoCommit={activeSession.autoCommit}
                  />
                  
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
                  className={`
                    px-4 py-2 font-medium group
                    flex items-center gap-2 transition-all duration-200
                    rounded-lg border
                    active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0
                    ${buttonConfig.isPrimary 
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
                  <span className="font-semibold">{buttonConfig.text}</span>
                  
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

// Model Selector Component
interface ModelSelectorProps {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  setShowDropdown: (show: boolean) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  setSelectedModel,
  setShowDropdown,
}) => {
  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    
    try {
      await API.config.update({ defaultModel: modelId });
    } catch (err) {
      console.error('Failed to save default model:', err);
    }
  };

  // Model configurations
  const modelConfigs = {
    'claude-sonnet-4-20250514': {
      label: 'Sonnet 4',
      icon: Target,
      iconColor: 'text-interactive',
      description: 'Balanced',
    },
    'claude-opus-4-20250514': {
      label: 'Opus 4',
      icon: Brain,
      iconColor: 'text-interactive',
      description: 'Maximum',
    },
    'claude-3-5-haiku-20241022': {
      label: 'Haiku 3.5',
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
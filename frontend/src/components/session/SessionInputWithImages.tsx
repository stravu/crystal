import React, { useState, useCallback, useRef, memo, useEffect } from 'react';
import { Session, GitCommands } from '../../types/session';
import { ViewMode } from '../../hooks/useSessionView';
import { X, Cpu, Send, Play, Terminal, ChevronRight, AtSign, Paperclip } from 'lucide-react';
import FilePathAutocomplete from '../FilePathAutocomplete';
import { API } from '../../utils/api';
import { CommitModeToggle } from '../CommitModeToggle';

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
  handleToggleAutoCommit: () => void;
  gitCommands: GitCommands | null;
  onFocus?: () => void;
  onBlur?: () => void;
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
  handleToggleAutoCommit,
  gitCommands,
  onFocus,
  onBlur,
}) => {
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(activeSession.model || 'claude-sonnet-4-20250514');
  const [textareaHeight, setTextareaHeight] = useState<number>(52);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (shouldSend) {
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
        return { color: 'bg-yellow-500', pulse: true };
      case 'ready':
        return { color: 'bg-green-500', pulse: false };
      case 'running':
        return { color: 'bg-blue-500', pulse: true };
      case 'waiting':
        return { color: 'bg-orange-500', pulse: true };
      case 'stopped':
        return { color: 'bg-gray-500', pulse: false };
      case 'completed_unviewed':
        return { color: 'bg-green-500', pulse: true };
      case 'error':
        return { color: 'bg-red-500', pulse: false };
      default:
        return { color: 'bg-gray-500', pulse: false };
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
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  return (
    <div className="border-t-2 border-gray-200 dark:border-gray-700 flex-shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="bg-gray-50 dark:bg-gray-900">
        {/* Context Bar */}
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* Session status indicator */}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${sessionStatus.color} ${sessionStatus.pulse ? 'animate-pulse' : ''}`} />
              </div>
              
              {/* Project Badge */}
              <div className="px-2.5 py-1 rounded-full text-xs font-medium
                bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300 
                border border-purple-200 dark:border-purple-800
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
                  bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 
                  border border-green-200 dark:border-green-800
                  flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12a3 3 0 003 3h6m-6-6l3-3-3-3m6 0a3 3 0 100 6 3 3 0 000-6z" />
                  </svg>
                  <span className="leading-none font-mono">
                    {gitCommands.currentBranch}
                  </span>
                </div>
              )}
            </div>
            {/* Mode indicator */}
            {viewMode === 'terminal' && (
              <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                <Terminal className="w-3 h-3" />
                <span>Terminal Mode</span>
              </div>
            )}
          </div>
        </div>

        {/* Command Input Area */}
        <div className="p-4 bg-white dark:bg-gray-800"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Attached images */}
          {attachedImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedImages.map(image => (
                <div key={image.id} className="relative group">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="h-12 w-12 object-cover rounded border border-gray-200 dark:border-gray-700"
                  />
                  <button
                    onClick={() => removeImage(image.id)}
                    className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Clean Input Container */}
          <div className={`
            bg-white dark:bg-gray-800 
            rounded-lg border border-gray-200 dark:border-gray-700 
            shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]
            transition-all duration-200 backdrop-blur-sm
            ${isFocused ? (buttonConfig.color === 'green' ? 'command-bar-focus-green' : 'command-bar-focus') : ''}
          `}>
            {/* Command prompt field */}
            <div className="relative">
              <div className="absolute left-4 top-[50%] -translate-y-[50%] text-gray-500 dark:text-gray-400 select-none pointer-events-none font-mono text-sm">
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
                  text-gray-900 dark:text-gray-100
                  placeholder-gray-500 dark:placeholder-gray-500
                  transition-colors
                `}
                textareaRef={textareaRef}
                isTextarea={true}
                rows={1}
                onKeyDown={onKeyDown}
                onPaste={handlePaste}
                onFocus={handleFocus}
                onBlur={handleBlur}
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
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium
                  bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                  hover:bg-gray-300 dark:hover:bg-gray-600 
                  flex items-center gap-1.5 transition-all duration-200 
                  hover:scale-105 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-950 focus:ring-gray-500"
                title="Attach images"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span className="leading-none">Attach Image</span>
              </button>
              
              {/* Reference Button */}
              {isStravuConnected && (
                <button 
                  onClick={() => setShowStravuSearch(true)}
                  className="px-3.5 py-1.5 rounded-full text-xs font-medium
                    bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                    hover:bg-gray-300 dark:hover:bg-gray-600 
                    flex items-center gap-1.5 transition-all duration-200 
                    hover:scale-105 active:scale-95
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-950 focus:ring-gray-500"
                  title="Reference files (@)"
                >
                  <AtSign className="w-3.5 h-3.5" />
                  <span className="leading-none">Reference</span>
                </button>
              )}

              {/* Divider */}
              <div className="h-6 w-px bg-gray-600 dark:bg-gray-500 mx-1" />

              {/* Model Selector */}
              <div className="relative inline-flex items-center">
                <select 
                  value={selectedModel}
                  onChange={async (e) => {
                    const newModel = e.target.value;
                    setSelectedModel(newModel);
                    
                    try {
                      await API.config.update({ defaultModel: newModel });
                    } catch (err) {
                      console.error('Failed to save default model:', err);
                    }
                  }}
                  className="appearance-none bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 
                    hover:bg-gray-300 dark:hover:bg-gray-600 
                    px-3.5 py-1.5 pr-8 rounded-full text-xs font-medium leading-none
                    transition-all duration-200 cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-offset-2 
                    focus:ring-offset-gray-50 dark:focus:ring-offset-gray-950 focus:ring-purple-500
                    hover:scale-105 active:scale-95"
                >
                  <option value="claude-sonnet-4-20250514">Sonnet 4</option>
                  <option value="claude-opus-4-20250514">Opus 4</option>
                  <option value="claude-3-5-haiku-20241022">Haiku 3.5</option>
                </select>
                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 dark:text-gray-400 pointer-events-none" 
                  fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Commit Mode Toggle */}
              <CommitModeToggle
                sessionId={activeSession.id}
                currentMode={activeSession.commitMode}
                currentSettings={activeSession.commitModeSettings}
                autoCommit={activeSession.autoCommit}
                projectId={activeSession.projectId}
                onModeChange={() => {
                  // Trigger a refresh of the session data
                  handleToggleAutoCommit();
                }}
              />
              
              {/* Deep Analysis Toggle */}
              <button
                onClick={() => setUltrathink(!ultrathink)}
                className={`
                  px-3.5 py-1.5 rounded-full text-xs font-medium
                  transition-all duration-200 flex items-center gap-1.5
                  hover:scale-105 active:scale-95
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-950
                  ${ultrathink 
                    ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/30 focus:ring-blue-500 border border-blue-200 dark:border-blue-800' 
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 focus:ring-gray-500'
                  }
                `}
              >
                <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 flex items-center justify-center
                  ${ultrathink
                    ? 'bg-blue-500 border-blue-500' 
                    : 'border-gray-400 dark:border-gray-500'
                  }`}>
                  {ultrathink && (
                    <Cpu className="w-2 h-2 text-white" />
                  )}
                </div>
                <span className="leading-none">Extended Thinking</span>
              </button>
            </div>

            {/* Right Section - Continue Button */}
            <div className="flex items-center">
              <button 
                onClick={onClickSend}
                className={`
                  px-4 py-2 font-medium group
                  flex items-center gap-2 transition-all duration-200
                  rounded-lg border
                  active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0
                  ${buttonConfig.isPrimary 
                    ? `bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 
                       text-white border-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] 
                       focus:ring-blue-400 hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)]`
                    : buttonConfig.color === 'green' 
                      ? 'bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-green-400 hover:text-green-300 border-gray-600 dark:border-gray-500 focus:ring-green-500' 
                      : 'bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-blue-400 hover:text-blue-300 border-gray-600 dark:border-gray-500 focus:ring-blue-500'
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

SessionInputWithImages.displayName = 'SessionInputWithImages';
import React, { useState, useCallback, useRef, memo, useEffect } from 'react';
import { Session } from '../../types/session';
import { ViewMode } from '../../hooks/useSessionView';
import { X, Image as ImageIcon, Cpu } from 'lucide-react';
import FilePathAutocomplete from '../FilePathAutocomplete';
import { API } from '../../utils/api';

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
}) => {
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(activeSession.model || 'claude-sonnet-4-20250514');
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
    ? (activeSession.isRunning ? "Script is running..." : (activeSession.status === 'waiting' ? "Enter your response... (⌘↵ to send)" : "Enter terminal command... (⌘↵ to send)"))
    : (activeSession.status === 'waiting' ? "Enter your response... (⌘↵ to send)" : "Continue conversation... (⌘↵ to send)");

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 flex-shrink-0">
      {viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting' && (
        <div className="mb-2 flex items-center text-sm text-gray-600 dark:text-gray-400">
          <svg className="w-4 h-4 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Terminal mode: Commands will execute in the worktree directory
        </div>
      )}
      
      {/* Attached images preview */}
      {attachedImages.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachedImages.map(image => (
            <div key={image.id} className="relative group">
              <img
                src={image.dataUrl}
                alt={image.name}
                className="h-20 w-20 object-cover rounded-md border border-gray-300 dark:border-gray-600"
              />
              <button
                onClick={() => removeImage(image.id)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate rounded-b-md">
                {image.name}
              </div>
            </div>
          ))}
        </div>
      )}

      <div 
        className={`flex items-start gap-2 ${isDragging ? 'ring-2 ring-blue-500 rounded-md' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex-1 relative">
          <FilePathAutocomplete
            value={input}
            onChange={setInput}
            sessionId={activeSession.id}
            placeholder={isDragging ? "Drop images here..." : `${placeholder} (use @ to reference files)`}
            className="w-full px-3 py-2 pr-10 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto"
            textareaRef={textareaRef}
            isTextarea={true}
            rows={4}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            style={{ minHeight: '42px', maxHeight: '200px' }}
          />
          <div className="absolute right-2 top-2 flex gap-1">
            {isStravuConnected && (
              <button onClick={() => setShowStravuSearch(true)} className="p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 focus:outline-none focus:text-blue-600 transition-colors" title="Search Stravu files">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 focus:outline-none focus:text-blue-600 transition-colors"
              title="Attach images"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
          </div>
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
        <button 
          onClick={onClickSend} 
          className="px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-w-[100px] font-medium transition-colors"
          style={{ height: '67px' }}
        >
          {viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting' ? 'Run' : (activeSession.status === 'waiting' ? 'Send' : 'Continue')}
        </button>
      </div>
      
      {isDragging && (
        <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
          Drop images here to attach them to your message
        </div>
      )}
      
      <div className="mt-2 flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer group" title="Triggers Claude Code to use its maximum thinking token limit. Slower but better for difficult tasks.">
          <input type="checkbox" checked={ultrathink} onChange={(e) => setUltrathink(e.target.checked)} className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">ultrathink</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer group" title="Automatically commit changes after each prompt">
          <input type="checkbox" checked={activeSession.autoCommit ?? true} onChange={handleToggleAutoCommit} className="h-4 w-4 text-green-600 rounded border-gray-300 dark:border-gray-600 focus:ring-green-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">auto-commit</span>
        </label>
        {/* Model selector for continue conversation */}
        {activeSession.status !== 'waiting' && !(viewMode === 'terminal' && !activeSession.isRunning) && (
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-gray-400" />
            <select
              value={selectedModel}
              onChange={async (e) => {
                const newModel = e.target.value;
                setSelectedModel(newModel);
                
                // Don't update the session in the store immediately
                // The backend will update it when continue is pressed
                
                // Save as default for future sessions
                try {
                  await API.config.update({ defaultModel: newModel });
                } catch (err) {
                  console.error('Failed to save default model:', err);
                }
              }}
              className="text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
              title="AI model to use for continuing the conversation"
            >
              <option value="claude-sonnet-4-20250514">Sonnet 4: Best for most coding tasks</option>
              <option value="claude-opus-4-20250514">Opus 4: Complex architecture, large refactors</option>
              <option value="claude-3-5-haiku-20241022">Haiku 3.5: Fast & cost-effective for simple tasks</option>
            </select>
          </div>
        )}
      </div>
      {activeSession.status !== 'waiting' && !(viewMode === 'terminal' && !activeSession.isRunning) && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          This will interrupt the current session if running and restart with conversation history.
        </p>
      )}
    </div>
  );
});

SessionInputWithImages.displayName = 'SessionInputWithImages';
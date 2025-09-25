import React, { useState, useEffect } from 'react';
import { Send, Settings2, StopCircle, X, Paperclip, FileText } from 'lucide-react';
import type { Session } from '../../../types/session';
import { CODEX_MODELS, DEFAULT_CODEX_MODEL, type OpenAICodexModel, type CodexInputOptions } from '../../../../../shared/types/models';
import { useAIInputPanel } from '../../../hooks/useAIInputPanel';
import { CommitModePill } from '../../CommitModeToggle';

const LAST_CODEX_MODEL_KEY = 'codex.lastSelectedModel';

interface CodexInputPanelProps {
  session: Session;
  panelId: string;
  onSendMessage: (message: string, options?: CodexInputOptions) => Promise<void>;
  disabled?: boolean;
  initialModel?: string;
  onCancel?: () => void;
}

export const CodexInputPanelWithHook: React.FC<CodexInputPanelProps> = ({
  session,
  onSendMessage,
  disabled = false,
  initialModel,
  onCancel
}) => {
  // Initialize with initial model prop, then last selected model from localStorage
  const getInitialModel = (): OpenAICodexModel => {
    // First priority: initialModel prop (from panel state)
    if (initialModel && initialModel in CODEX_MODELS) {
      return initialModel as OpenAICodexModel;
    }
    // Second priority: saved model from localStorage
    const saved = localStorage.getItem(LAST_CODEX_MODEL_KEY);
    if (saved && saved in CODEX_MODELS) {
      return saved as OpenAICodexModel;
    }
    // Default fallback
    return DEFAULT_CODEX_MODEL;
  };
  
  const [options, setOptions] = useState({
    model: getInitialModel(),
    modelProvider: 'openai' as const,
    sandboxMode: 'workspace-write' as 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch: false
  });

  // Use the shared hook for common functionality
  const {
    input,
    setInput,
    isSubmitting,
    attachedImages,
    attachedTexts,
    isDragging,
    showOptions,
    setShowOptions,
    textareaHeight,
    textareaRef,
    fileInputRef,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    removeImage,
    removeText,
    handleFileSelect,
  } = useAIInputPanel({
    onSendMessage: async (message) => {
      // Codex doesn't use attachments in the same way as Claude
      await onSendMessage(message, options);
    },
    onCancel,
    disabled
  });

  // Calculate auto-commit enabled state  
  const effectiveMode = session.commitMode || (session.autoCommit === false ? 'disabled' : 'checkpoint');
  const isAutoCommitEnabled = effectiveMode !== 'disabled';

  // Save model selection to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(LAST_CODEX_MODEL_KEY, options.model);
  }, [options.model]);

  const handleSubmit = async () => {
    if (!input.trim() || isSubmitting || disabled) return;

    const message = input.trim();
    setInput('');

    try {
      await onSendMessage(message, options);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input on error
      setInput(message);
    } finally {
      // Refocus textarea
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle cancel on Escape
    if (e.key === 'Escape' && session.status === 'running' && onCancel) {
      e.preventDefault();
      onCancel();
      return;
    }
    
    // Codex uses Enter without modifier
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border-primary bg-surface-primary">
      {/* Options Panel */}
      {showOptions && (
        <div className="px-4 py-3 border-b border-border-primary bg-surface-secondary">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <label className="text-text-secondary">Model:</label>
              <select
                value={options.model}
                onChange={(e) => setOptions({ ...options, model: e.target.value as OpenAICodexModel })}
                className="px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary font-medium"
                title={CODEX_MODELS[options.model as OpenAICodexModel]?.description || 'Select model'}
              >
                {Object.values(CODEX_MODELS).map(model => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-text-secondary">Sandbox:</label>
              <select
                value={options.sandboxMode}
                onChange={(e) => setOptions({ ...options, sandboxMode: e.target.value as 'read-only' | 'workspace-write' | 'danger-full-access' })}
                className="px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary"
              >
                <option value="read-only">Read Only</option>
                <option value="workspace-write">Workspace Write</option>
                <option value="danger-full-access">Full Access</option>
              </select>
            </div>

            {/* Commit Mode Controls */}
            <div className="flex items-center gap-3">
              {/* Auto-Commit Toggle - Hidden: Now handled by CommitMode system */}
              {/* <label className="text-text-secondary">Auto-Commit:</label>
              <div className="flex items-center gap-2">
                <AutoCommitSwitch
                  sessionId={session.id}
                  currentMode={session.commitMode}
                  currentSettings={session.commitModeSettings}
                  autoCommit={session.autoCommit}
                />
                <CommitModePill */}
              <CommitModePill
                sessionId={session.id}
                currentMode={session.commitMode}
                currentSettings={session.commitModeSettings}
                autoCommit={session.autoCommit}
                projectId={session.projectId}
                isAutoCommitEnabled={isAutoCommitEnabled}
              />
            </div>

            {/* Web Search toggle hidden for Codex as it doesn't work */}
            {/* <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.webSearch}
                  onChange={(e) => setOptions({ ...options, webSearch: e.target.checked })}
                  className="rounded border-border-primary"
                />
                Web Search
              </label>
            </div> */}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div 
        className="flex flex-col gap-2 p-3"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Attached items */}
        {(attachedImages.length > 0 || attachedTexts.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2">
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

        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
            title="Codex Options"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
            title="Attach images"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isDragging 
                  ? "Drop images here..." 
                  : session.status === 'waiting' 
                    ? "Enter your response..." 
                    : "Ask Codex anything..."
              }
              disabled={isSubmitting || disabled}
              className="w-full px-3 py-2 bg-bg-primary border border-border-primary rounded-lg 
                       text-text-primary placeholder-text-tertiary resize-none
                       focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary
                       disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '40px', maxHeight: '200px', height: `${textareaHeight}px` }}
              rows={1}
            />
          </div>

          {/* Action buttons */}
          {session.status === 'running' && onCancel ? (
            <button
              onClick={onCancel}
              className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
              title="Stop Codex"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isSubmitting || disabled}
              className="p-2 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10 
                       rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Send message (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Status Indicator */}
      {session.status === 'running' && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Codex is thinking...</span>
          </div>
        </div>
      )}
    </div>
  );
};
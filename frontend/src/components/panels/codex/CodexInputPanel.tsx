import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Settings2, StopCircle } from 'lucide-react';
import type { Session } from '../../../../../shared/types';

interface CodexInputPanelProps {
  session: Session;
  panelId: string;
  onSendMessage: (message: string, options?: any) => Promise<void>;
  disabled?: boolean;
}

export const CodexInputPanel: React.FC<CodexInputPanelProps> = ({
  session,
  panelId,
  onSendMessage,
  disabled = false
}) => {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [options, setOptions] = useState({
    model: 'gpt-5',
    modelProvider: 'openai',
    approvalPolicy: 'manual' as 'manual' | 'auto',
    sandboxMode: 'workspace-write' as 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch: false
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!input.trim() || isSubmitting || disabled) return;

    const message = input.trim();
    setInput('');
    setIsSubmitting(true);

    try {
      await onSendMessage(message, options);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input on error
      setInput(message);
    } finally {
      setIsSubmitting(false);
      // Refocus textarea
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
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
              <span className="px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary font-medium">
                GPT-5
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-text-secondary">Approval:</label>
              <select
                value={options.approvalPolicy}
                onChange={(e) => setOptions({ ...options, approvalPolicy: e.target.value as 'manual' | 'auto' })}
                className="px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary"
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-text-secondary">Sandbox:</label>
              <select
                value={options.sandboxMode}
                onChange={(e) => setOptions({ ...options, sandboxMode: e.target.value as any })}
                className="px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary"
              >
                <option value="read-only">Read Only</option>
                <option value="workspace-write">Workspace Write</option>
                <option value="danger-full-access">Full Access</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.webSearch}
                  onChange={(e) => setOptions({ ...options, webSearch: e.target.checked })}
                  className="rounded border-border-primary"
                />
                Web Search
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="flex items-end gap-2 p-3">
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
          title="Codex Options"
        >
          <Settings2 className="w-4 h-4" />
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              session.status === 'waiting' 
                ? "Enter your response..." 
                : "Ask Codex anything..."
            }
            disabled={isSubmitting || disabled}
            className="w-full px-3 py-2 bg-bg-primary border border-border-primary rounded-lg 
                     text-text-primary placeholder-text-tertiary resize-none
                     focus:outline-none focus:ring-1 focus:ring-accent-primary focus:border-accent-primary
                     disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '40px', maxHeight: '200px' }}
            rows={1}
          />
        </div>

        {session.status === 'running' ? (
          <button
            onClick={() => {/* TODO: Implement interrupt */}}
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
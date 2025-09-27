import React, { useState, useEffect } from 'react';
import { Session } from '../../types/session';
// ViewMode removed - no longer needed
import { Cpu } from 'lucide-react';
import { API } from '../../utils/api';

interface SessionInputProps {
  activeSession: Session;
  input: string;
  setInput: (input: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleSendInput: () => void;
  handleContinueConversation: (
    attachedImages?: unknown[],
    attachedTexts?: unknown[],
    modelOverride?: string
  ) => Promise<void> | void;
  isStravuConnected: boolean;
  setShowStravuSearch: (show: boolean) => void;
  ultrathink: boolean;
  setUltrathink: (ultra: boolean) => void;
  handleToggleAutoCommit: () => void;
}

export const SessionInput: React.FC<SessionInputProps> = ({
  activeSession,
  input,
  setInput,
  textareaRef,
  handleSendInput,
  handleContinueConversation,
  isStravuConnected,
  setShowStravuSearch,
  ultrathink,
  setUltrathink,
  handleToggleAutoCommit,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Model is now managed at panel level, not session level
    console.log('[SessionInput] Session changed:', {
      id: activeSession.id,
      name: activeSession.name
    });
    setSelectedModel('auto');
  }, [activeSession.id]); // Only reset when session ID changes

  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const shouldSend = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
    if (shouldSend) {
      e.preventDefault();
      
      // Prevent duplicate submissions
      if (isSubmitting) {
        console.log('[SessionInput] Ignoring duplicate submission attempt');
        return;
      }
      
      setIsSubmitting(true);
      
      try {
        if (activeSession.status === 'waiting') {
          await handleSendInput();
        } else {
          await handleContinueConversation(undefined, undefined, selectedModel);
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
      console.log('[SessionInput] Ignoring duplicate submission attempt');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (activeSession.status === 'waiting') {
        await handleSendInput();
      } else {
        await handleContinueConversation(undefined, undefined, selectedModel);
      }
    } finally {
      // Reset submission state after a short delay to prevent rapid resubmissions
      setTimeout(() => setIsSubmitting(false), 500);
    }
  };

  const placeholder = activeSession.status === 'waiting' ? "Enter your response... (⌘↵ to send)" : "Continue conversation... (⌘↵ to send)";

  return (
    <div className="border-t border-border-primary p-4 bg-surface-primary flex-shrink-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full px-3 py-2 pr-10 bg-surface-secondary border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary placeholder-text-tertiary resize-none overflow-y-auto"
            placeholder={placeholder}
            style={{ minHeight: '42px', maxHeight: '200px' }}
          />
          {isStravuConnected && (
            <button onClick={() => setShowStravuSearch(true)} className="absolute right-2 top-2 p-1 text-text-tertiary hover:text-interactive focus:outline-none focus:text-interactive transition-colors" title="Search Stravu files">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </button>
          )}
        </div>
        <button 
          onClick={onClickSend} 
          disabled={isSubmitting}
          className={`px-4 text-white rounded-md min-w-[100px] font-medium transition-colors ${
            isSubmitting 
              ? 'bg-gray-500 cursor-not-allowed' 
              : 'bg-interactive hover:bg-interactive-hover'
          }`}
          style={{ height: '67px' }}
        >
          {isSubmitting ? 'Processing...' : (activeSession.status === 'waiting' ? 'Send' : 'Continue')}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer group" title="Triggers Claude Code to use its maximum thinking token limit. Slower but better for difficult tasks.">
          <input type="checkbox" checked={ultrathink} onChange={(e) => setUltrathink(e.target.checked)} className="h-4 w-4 text-interactive rounded border-border-primary focus:ring-interactive" />
          <span className="text-sm text-text-secondary">ultrathink</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer group" title="Automatically commit changes after each prompt">
          <input type="checkbox" checked={activeSession.autoCommit ?? true} onChange={handleToggleAutoCommit} className="h-4 w-4 text-status-success rounded border-border-primary focus:ring-status-success" />
          <span className="text-sm text-text-secondary">auto-commit</span>
        </label>
        {/* Model selector for continue conversation */}
        {activeSession.status !== 'waiting' && (
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-text-tertiary" />
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
              className="text-sm px-2 py-1 border border-border-primary rounded focus:outline-none focus:ring-1 focus:ring-interactive text-text-primary bg-surface-secondary"
              title="AI model to use for continuing the conversation"
            >
              <option value="auto">Auto: Claude Code's default selection</option>
              <option value="sonnet">Sonnet: Best for most coding tasks</option>
              <option value="opus">Opus: Complex architecture, large refactors</option>
              <option value="haiku">Haiku: Fast & cost-effective for simple tasks</option>
            </select>
          </div>
        )}
      </div>
      {activeSession.status !== 'waiting' && (
        <p className="text-sm text-text-tertiary mt-2">
          This will interrupt the current session if running and restart with conversation history.
        </p>
      )}
    </div>
  );
}; 

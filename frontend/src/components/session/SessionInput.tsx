import React, { useState, useEffect } from 'react';
import { Session } from '../../types/session';
import { ViewMode } from '../../hooks/useSessionView';
import { Cpu } from 'lucide-react';
import { API } from '../../utils/api';

interface SessionInputProps {
  activeSession: Session;
  viewMode: ViewMode;
  input: string;
  setInput: (input: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleTerminalCommand: () => void;
  handleSendInput: () => void;
  handleContinueConversation: (model?: string) => void;
  isStravuConnected: boolean;
  setShowStravuSearch: (show: boolean) => void;
  ultrathink: boolean;
  setUltrathink: (ultra: boolean) => void;
  handleToggleAutoCommit: () => void;
}

export const SessionInput: React.FC<SessionInputProps> = ({
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
  const [selectedModel, setSelectedModel] = useState<string>(activeSession.model || 'claude-sonnet-4-20250514');

  useEffect(() => {
    // Update selected model when switching to a different session
    console.log('[SessionInput] Session changed:', {
      id: activeSession.id,
      model: activeSession.model,
      name: activeSession.name
    });
    setSelectedModel(activeSession.model || 'claude-sonnet-4-20250514');
  }, [activeSession.id]); // Only reset when session ID changes, not when model updates

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const shouldSend = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
    if (shouldSend) {
      e.preventDefault();
      if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
        handleTerminalCommand();
      } else if (activeSession.status === 'waiting') {
        handleSendInput();
      } else {
        handleContinueConversation(selectedModel);
      }
    }
  };
  
  const onClickSend = () => {
    if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
      handleTerminalCommand();
    } else if (activeSession.status === 'waiting') {
      handleSendInput();
    } else {
      handleContinueConversation(selectedModel);
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
      <div className="flex items-start gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-full px-3 py-2 pr-10 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto"
            placeholder={placeholder}
            style={{ minHeight: '42px', maxHeight: '200px' }}
          />
          {isStravuConnected && (
            <button onClick={() => setShowStravuSearch(true)} className="absolute right-2 top-2 p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 focus:outline-none focus:text-blue-600 transition-colors" title="Search Stravu files">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </button>
          )}
        </div>
        <button 
          onClick={onClickSend} 
          className="px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-w-[100px] font-medium transition-colors"
          style={{ height: '67px' }}
        >
          {viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting' ? 'Run' : (activeSession.status === 'waiting' ? 'Send' : 'Continue')}
        </button>
      </div>
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
}; 
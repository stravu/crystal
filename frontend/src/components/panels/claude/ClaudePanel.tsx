import React, { useState } from 'react';
import { ToolPanel } from '../../../../../shared/types/panels';
import { RichOutputWithSidebar } from './RichOutputWithSidebar';
import { MessagesView } from './MessagesView';
import { ClaudeInputWithImages } from './ClaudeInputWithImages';
import { useClaudePanel } from '../../../hooks/useClaudePanel';
import { RichOutputSettings } from './RichOutputView';

export type ClaudeViewMode = 'richOutput' | 'messages';

interface ClaudePanelProps {
  panel: ToolPanel;
  isActive: boolean;
}

export const ClaudePanel: React.FC<ClaudePanelProps> = ({ panel, isActive }) => {
  // Panel-specific view mode (richOutput vs messages)
  const [viewMode, setViewMode] = useState<ClaudeViewMode>('richOutput');
  
  // Settings state for Rich Output view
  const [showRichOutputSettings, setShowRichOutputSettings] = useState(false);
  const [richOutputSettings, setRichOutputSettings] = useState<RichOutputSettings>(() => {
    const saved = localStorage.getItem('richOutputSettings');
    return saved ? JSON.parse(saved) : {
      showToolCalls: true,
      compactMode: false,
      collapseTools: false,
      showThinking: true,
      showSessionInit: false,
    };
  });
  
  const handleRichOutputSettingsChange = (newSettings: RichOutputSettings) => {
    setRichOutputSettings(newSettings);
    localStorage.setItem('richOutputSettings', JSON.stringify(newSettings));
  };

  // Use the Claude-specific hook with panel ID instead of session ID
  const hook = useClaudePanel(panel.id, isActive);

  // Get session for ClaudeInputWithImages (which still expects a session)
  // This will be updated in a future refactor to work with panel directly
  const activeSession = hook.activeSession;


  if (!activeSession) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-medium text-text-primary mb-2">
            No Session Found
          </h3>
          <p className="text-sm text-text-secondary">
            This Claude panel is not associated with an active session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-bg-primary">
      {/* View Toggle Tabs */}
      <div className="flex border-b border-border-primary bg-surface-secondary">
        <button
          onClick={() => setViewMode('richOutput')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'richOutput'
              ? 'text-interactive border-interactive bg-interactive/5'
              : 'text-text-tertiary border-transparent hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Output
        </button>
        <button
          onClick={() => setViewMode('messages')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'messages'
              ? 'text-interactive border-interactive bg-interactive/5'
              : 'text-text-tertiary border-transparent hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Messages
        </button>

        {/* Settings button for Rich Output */}
        {viewMode === 'richOutput' && (
          <button
            onClick={() => setShowRichOutputSettings(!showRichOutputSettings)}
            className={`ml-auto px-3 py-2 text-sm transition-colors ${
              showRichOutputSettings
                ? 'text-interactive bg-interactive/10'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
            title="Rich Output Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {viewMode === 'richOutput' && (
          <div className="h-full block w-full">
            <RichOutputWithSidebar 
              panelId={panel.id}
              sessionStatus={activeSession.status}
              settings={richOutputSettings}
              onSettingsChange={handleRichOutputSettingsChange}
            />
          </div>
        )}
        
        {viewMode === 'messages' && (
          <div className="h-full flex flex-col overflow-hidden w-full">
            <MessagesView panelId={panel.id} />
          </div>
        )}
      </div>

      {/* Claude Input - Always visible at bottom */}
      {!activeSession.archived && (
        <ClaudeInputWithImages
          activeSession={activeSession}
          viewMode="richOutput" // Claude panel always uses richOutput mode
          input={hook.input}
          setInput={hook.setInput}
          textareaRef={hook.textareaRef}
          handleTerminalCommand={hook.handleTerminalCommand}
          handleSendInput={hook.handleSendInput}
          handleContinueConversation={hook.handleContinueConversation}
          isStravuConnected={hook.isStravuConnected}
          setShowStravuSearch={hook.setShowStravuSearch}
          ultrathink={hook.ultrathink}
          setUltrathink={hook.setUltrathink}
          gitCommands={hook.gitCommands}
          handleCompactContext={hook.handleCompactContext}
          hasConversationHistory={hook.hasConversationHistory}
          contextCompacted={hook.contextCompacted}
          handleCancelRequest={hook.handleStopSession}
        />
      )}

      {/* Show archived message if session is archived */}
      {activeSession.archived && (
        <div className="border-t-2 border-border-primary flex-shrink-0 bg-surface-secondary p-4">
          <div className="text-center text-text-secondary">
            <svg className="w-8 h-8 mx-auto mb-2 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="text-sm">
              This session has been archived. You can view the conversation history but cannot send new messages.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
// Default export for lazy loading
export default ClaudePanel;

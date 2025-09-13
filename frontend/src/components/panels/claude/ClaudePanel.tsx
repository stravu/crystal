import React, { useState } from 'react';
import { ToolPanel } from '../../../../../shared/types/panels';
import { RichOutputWithSidebar } from './RichOutputWithSidebar';
import { MessagesView } from './MessagesView';
import { SessionStats } from './SessionStats';
import { ClaudeInputWithImages } from './ClaudeInputWithImages';
import { useClaudePanel } from '../../../hooks/useClaudePanel';
import { RichOutputSettings } from './RichOutputView';
import { ClaudeSettingsPanel } from './ClaudeSettingsPanel';
import { Settings } from 'lucide-react';

export type ClaudeViewMode = 'richOutput' | 'messages' | 'stats';

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
      {/* Panel Header with Segmented Control */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-surface-primary">
        {/* Segmented Control for View Mode */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">View</span>
          <div className="inline-flex rounded-lg bg-surface-secondary p-0.5">
            <button
              onClick={() => setViewMode('richOutput')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'richOutput'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Output
            </button>
            <button
              onClick={() => setViewMode('messages')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'messages'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => setViewMode('stats')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'stats'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Stats
            </button>
          </div>
        </div>

        {/* Settings button for Rich Output */}
        {viewMode === 'richOutput' && (
          <button
            onClick={() => setShowRichOutputSettings(!showRichOutputSettings)}
            className={`px-2 py-1 rounded-md text-xs transition-all flex items-center gap-1.5 ${
              showRichOutputSettings
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
            }`}
            title="Configure display settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
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
        
        {viewMode === 'stats' && (
          <div className="h-full flex flex-col overflow-hidden w-full">
            <SessionStats sessionId={activeSession.id} />
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

      {/* Rich Output Settings Panel */}
      {viewMode === 'richOutput' && showRichOutputSettings && (
        <ClaudeSettingsPanel
          settings={richOutputSettings}
          onSettingsChange={handleRichOutputSettingsChange}
          onClose={() => setShowRichOutputSettings(false)}
        />
      )}
    </div>
  );
};
// Default export for lazy loading
export default ClaudePanel;

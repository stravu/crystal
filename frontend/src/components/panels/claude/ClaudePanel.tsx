import React, { useState, useEffect } from 'react';
import { AIPanelProps } from '../ai/AbstractAIPanel';
import { RichOutputWithSidebar } from './RichOutputWithSidebar';
import { MessagesView } from '../ai/MessagesView';
import { SessionStats } from './SessionStats';
import { ClaudeInputWithImages } from './ClaudeInputWithImages';
import { useClaudePanel } from '../../../hooks/useClaudePanel';
import { ClaudeSettingsPanel } from './ClaudeSettingsPanel';
import { ClaudeMessageTransformer } from '../ai/transformers/ClaudeMessageTransformer';
import { Settings } from 'lucide-react';

export const ClaudePanel: React.FC<AIPanelProps> = ({ panel, isActive }) => {
  const hook = useClaudePanel(panel.id, isActive);
  const [activeView, setActiveView] = useState<'richOutput' | 'messages' | 'stats'>('richOutput');
  const [showSettings, setShowSettings] = useState(false);
  const [richOutputSettings, setRichOutputSettings] = useState(() => {
    const saved = localStorage.getItem('richOutputSettings');
    return saved ? JSON.parse(saved) : {
      showToolCalls: true,
      compactMode: false,
      collapseTools: false,
      showThinking: true,
      showSessionInit: false,
    };
  });

  const transformer = new ClaudeMessageTransformer();
  const activeSession = hook.activeSession;

  const handleRichOutputSettingsChange = (newSettings: any) => {
    setRichOutputSettings(newSettings);
    localStorage.setItem('richOutputSettings', JSON.stringify(newSettings));
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        <div className="text-center p-8">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-xl font-semibold mb-2">Claude Panel</h2>
          <p className="text-sm">No active session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border-primary bg-surface-primary shadow-sm">
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-2">
            <div className="flex">
              <button
                onClick={() => setActiveView('richOutput')}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  activeView === 'richOutput'
                    ? 'text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Output
                {activeView === 'richOutput' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-interactive" />
                )}
              </button>
              <button
                onClick={() => setActiveView('messages')}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  activeView === 'messages'
                    ? 'text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Messages
                {activeView === 'messages' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-interactive" />
                )}
              </button>
              <button
                onClick={() => setActiveView('stats')}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  activeView === 'stats'
                    ? 'text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Stats
                {activeView === 'stats' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-interactive" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">Claude</span>
            {activeView === 'richOutput' && (
              <button
                onClick={toggleSettings}
                className="p-1.5 rounded hover:bg-surface-hover transition-colors"
                title="Display settings"
              >
                <Settings className="w-4 h-4 text-text-secondary" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'richOutput' && (
          <RichOutputWithSidebar 
            panelId={panel.id}
            sessionStatus={activeSession.status}
            settings={richOutputSettings}
            onSettingsChange={handleRichOutputSettingsChange}
            transformer={transformer}
          />
        )}
        {activeView === 'messages' && (
          <MessagesView 
            panelId={panel.id}
            agentType="claude"
            outputEventName="session:output"
          />
        )}
        {activeView === 'stats' && (
          <SessionStats sessionId={activeSession.id} />
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <ClaudeSettingsPanel
          settings={richOutputSettings}
          onSettingsChange={handleRichOutputSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Claude Input - Always visible at bottom if not archived */}
      {!activeSession.archived && (
        <ClaudeInputWithImages
          activeSession={activeSession}
          viewMode="richOutput"
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
          handleCancelRequest={hook.handleCancelRequest}
        />
      )}

      {/* Show archived message if session is archived */}
      {activeSession.archived && (
        <div className="bg-surface-secondary border-t border-border-primary px-4 py-3 text-center text-text-muted text-sm">
          This session is archived. Unarchive it to continue the conversation.
        </div>
      )}
    </div>
  );
};

// Default export for lazy loading
export default ClaudePanel;
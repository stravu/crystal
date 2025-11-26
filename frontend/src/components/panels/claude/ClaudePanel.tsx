import React, { useState, useEffect } from 'react';
import { AIPanelProps, RichOutputSettings } from '../ai/AbstractAIPanel';
import { RichOutputWithSidebar } from './RichOutputWithSidebar';
import { MessagesView } from '../ai/MessagesView';
import { SessionStats } from './SessionStats';
import { ClaudeInputWithImages } from './ClaudeInputWithImages';
import { useClaudePanel } from '../../../hooks/useClaudePanel';
import { ClaudeSettingsPanel } from './ClaudeSettingsPanel';
import { ClaudeMessageTransformer } from '../ai/transformers/ClaudeMessageTransformer';
import { Settings } from 'lucide-react';
import { useConfigStore } from '../../../stores/configStore';
import type { ClaudePanelState } from '../../../../../shared/types/panels';
import { ResizablePanel } from '../../ResizablePanel';

export const ClaudePanel: React.FC<AIPanelProps> = React.memo(({ panel, isActive }) => {
  const hook = useClaudePanel(panel.id, isActive);
  const [activeView, setActiveView] = useState<'richOutput' | 'messages' | 'stats'>('richOutput');
  const [showSettings, setShowSettings] = useState(false);
  const [richOutputSettings, setRichOutputSettings] = useState(() => {
    const saved = localStorage.getItem('richOutputSettings');
    return saved ? JSON.parse(saved) : {
      showToolCalls: true,
      compactMode: false,
      collapseTools: true,  // Changed to true for collapsed by default
      showThinking: true,
      showSessionInit: false,
    };
  });

  // Create transformer once and memoize it
  const transformer = React.useMemo(() => new ClaudeMessageTransformer(), []);
  const activeSession = hook.activeSession;
  const devModeEnabled = useConfigStore((state) => state.config?.devMode ?? false);
  const showDebugTabs = devModeEnabled;

  const claudePanelState = (panel.state.customState as ClaudePanelState | undefined) ?? {};
  const contextUsage = claudePanelState.contextUsage ?? null;
  const autoContextRunState = claudePanelState.autoContextRunState ?? 'idle';
  const isContextUpdating = autoContextRunState === 'running';
  const contextDisplay = contextUsage ?? '-- tokens (--%)';

  // Extract and store slash commands when we get JSON messages with init
  useEffect(() => {
    if (!activeSession) return;

    const handleSlashCommandsFromMessages = () => {
      const jsonMessages = activeSession.jsonMessages || [];

      // Look for init message with slash_commands
      const initMessage = jsonMessages.find((msg: { type?: string; subtype?: string; slash_commands?: string[] }) =>
        msg.type === 'system' && msg.subtype === 'init' && msg.slash_commands
      );

      if (initMessage && Array.isArray(initMessage.slash_commands)) {
        console.log('[slash-debug] Found init message with slash commands for Crystal session:', activeSession.id);
        console.log('[slash-debug] Commands:', initMessage.slash_commands);

        try {
          const slashCommandsKey = `slashCommands_${activeSession.id}`;
          localStorage.setItem(slashCommandsKey, JSON.stringify(initMessage.slash_commands));
          console.log('[slash-debug] Stored slash commands for Crystal session:', activeSession.id);
        } catch (e) {
          console.warn('[slash-debug] Failed to store slash commands for Crystal session:', e);
        }
      }
    };

    handleSlashCommandsFromMessages();
  }, [activeSession?.jsonMessages, activeSession?.id]);

  const handleRichOutputSettingsChange = (newSettings: RichOutputSettings) => {
    setRichOutputSettings(newSettings);
    localStorage.setItem('richOutputSettings', JSON.stringify(newSettings));
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  useEffect(() => {
    if (!devModeEnabled && activeView !== 'richOutput') {
      setActiveView('richOutput');
    }
  }, [devModeEnabled, activeView]);

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
      {showDebugTabs && (
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
                {devModeEnabled && (
                  <>
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
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
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
      )}

      {/* Main content area */}
      <ClaudeMainContent
        panelId={panel.id}
        activeView={activeView}
        showDebugTabs={showDebugTabs}
        devModeEnabled={devModeEnabled}
        activeSession={activeSession}
        richOutputSettings={richOutputSettings}
        handleRichOutputSettingsChange={handleRichOutputSettingsChange}
        transformer={transformer}
        toggleSettings={toggleSettings}
      />

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
        <ResizablePanel
          defaultHeight={200}
          minHeight={140}
          maxHeight={600}
          storageKey="claude-input-panel-height"
        >
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
            handleCancelRequest={hook.handleStopSession}
            contextUsageDisplay={contextDisplay}
            contextUpdating={isContextUpdating}
            panelId={panel.id}
          />
        </ResizablePanel>
      )}

      {/* Show archived message if session is archived */}
      {activeSession.archived && (
        <div className="bg-surface-secondary border-t border-border-primary px-4 py-3 text-center text-text-muted text-sm">
          This session is archived. Unarchive it to continue the conversation.
        </div>
      )}

    </div>
  );
});

ClaudePanel.displayName = 'ClaudePanel';

// Memoized main content component to prevent unnecessary re-renders when input changes
const ClaudeMainContent = React.memo<{
  panelId: string;
  activeView: string;
  showDebugTabs: boolean;
  devModeEnabled: boolean;
  activeSession: { id: string; status: string };
  richOutputSettings: RichOutputSettings;
  handleRichOutputSettingsChange: (settings: RichOutputSettings) => void;
  transformer: ClaudeMessageTransformer;
  toggleSettings: () => void;
}>(({ panelId, activeView, showDebugTabs, devModeEnabled, activeSession, richOutputSettings, handleRichOutputSettingsChange, transformer, toggleSettings }) => {
  return (
    <div className="flex-1 overflow-hidden relative">
      {!showDebugTabs && (
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={toggleSettings}
            className="p-2 rounded border border-border-primary bg-surface-secondary shadow-sm hover:bg-surface-hover transition-colors"
            title="Display settings"
            aria-label="Open Claude settings"
          >
            <Settings className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
      )}
      {activeView === 'richOutput' && (
        <RichOutputWithSidebar
          panelId={panelId}
          sessionStatus={activeSession.status}
          settings={richOutputSettings}
          onSettingsChange={handleRichOutputSettingsChange}
          transformer={transformer}
        />
      )}
      {devModeEnabled && activeView === 'messages' && (
        <MessagesView
          panelId={panelId}
          agentType="claude"
          outputEventName="session:output"
        />
      )}
      {devModeEnabled && activeView === 'stats' && (
        <SessionStats sessionId={activeSession.id} />
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function - only re-render if these specific props change
  return (
    prevProps.panelId === nextProps.panelId &&
    prevProps.activeView === nextProps.activeView &&
    prevProps.showDebugTabs === nextProps.showDebugTabs &&
    prevProps.devModeEnabled === nextProps.devModeEnabled &&
    prevProps.activeSession.id === nextProps.activeSession.id &&
    prevProps.activeSession.status === nextProps.activeSession.status &&
    prevProps.richOutputSettings === nextProps.richOutputSettings &&
    prevProps.transformer === nextProps.transformer
  );
});

ClaudeMainContent.displayName = 'ClaudeMainContent';

// Default export for lazy loading
export default ClaudePanel;

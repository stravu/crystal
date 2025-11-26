import React, { useState, useEffect, useMemo } from 'react';
import { ToolPanel } from '../../../../../shared/types/panels';
import { AIViewMode, RichOutputSettings } from '../ai/AbstractAIPanel';
import { RichOutputWithSidebar } from '../claude/RichOutputWithSidebar';
import { MessagesView } from '../ai/MessagesView';
import { CodexMessageTransformer } from '../ai/transformers/CodexMessageTransformer';
import { CodexStatsView } from './CodexStatsView';
import { CodexDebugStateView } from './CodexDebugStateView';
import { CodexInputPanelStyled } from './CodexInputPanelStyled';
import { useCodexPanel } from '../../../hooks/useCodexPanel';
import { DEFAULT_CODEX_MODEL, type CodexInputOptions } from '../../../../../shared/types/models';
import { useConfigStore } from '../../../stores/configStore';
import { ResizablePanel } from '../../ResizablePanel';

interface CodexPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}

export const CodexPanel: React.FC<CodexPanelProps> = React.memo(({ panel, isActive }) => {
  // Panel-specific view mode
  const [viewMode, setViewMode] = useState<AIViewMode>('richOutput');
  
  // Settings state for Rich Output view
  const [richOutputSettings, setRichOutputSettings] = useState<RichOutputSettings>(() => {
    const saved = localStorage.getItem('codexRichOutputSettings');
    return saved ? JSON.parse(saved) : {
      showToolCalls: true,
      compactMode: false,
      collapseTools: true,  // Changed to true for collapsed by default
      showThinking: true,
      showSessionInit: false,
    };
  });
  
  // Get the model from panel state
  const codexState = panel.state?.customState as {
    model?: string;
    thinkingLevel?: 'low' | 'medium' | 'high';
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
    webSearch?: boolean;
  } | undefined;
  const model = codexState?.model || DEFAULT_CODEX_MODEL;
  const devModeEnabled = useConfigStore((state) => state.config?.devMode ?? false);
  const showDebugTabs = devModeEnabled;

  const handleRichOutputSettingsChange = (newSettings: RichOutputSettings) => {
    setRichOutputSettings(newSettings);
    localStorage.setItem('codexRichOutputSettings', JSON.stringify(newSettings));
  };
  
  // Create message transformer
  const messageTransformer = useMemo(() => new CodexMessageTransformer(), []);

  // Use the Codex-specific hook
  const hook = useCodexPanel(panel.id, isActive);

  useEffect(() => {
    if (!devModeEnabled && viewMode !== 'richOutput') {
      setViewMode('richOutput');
    }
  }, [devModeEnabled, viewMode]);

  // Get session for CodexInputPanel
  const activeSession = hook.activeSession;

  if (!activeSession) {
    return (
      <div className="h-full w-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-medium text-text-primary mb-2">
            No Session Found
          </h3>
          <p className="text-sm text-text-secondary">
            This Codex panel is not associated with an active session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-bg-primary">
      {/* Panel Header with Segmented Control */}
      {showDebugTabs && (
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
            {devModeEnabled && (
              <>
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
                <button
                  onClick={() => setViewMode('debugState')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    viewMode === 'debugState'
                      ? 'bg-bg-primary text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Debug State
                </button>
              </>
            )}
            </div>
          </div>

          {/* Empty div for spacing */}
          <div></div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {viewMode === 'richOutput' && (
          <div className="h-full block w-full">
            <RichOutputWithSidebar
              panelId={panel.id}
              sessionStatus={activeSession.status}
              settings={richOutputSettings}
              onSettingsChange={handleRichOutputSettingsChange}
              transformer={messageTransformer}
              showSystemMessages={showDebugTabs}
            />
          </div>
        )}
        
        {devModeEnabled && viewMode === 'messages' && (
          <div className="h-full flex flex-col overflow-hidden w-full">
            <MessagesView 
              panelId={panel.id} 
              agentType="codex"
              outputEventName="codexPanel:output"
              getMessagesHandler="codexPanel:getOutputs"
            />
          </div>
        )}

        {devModeEnabled && viewMode === 'stats' && (
          <div className="h-full flex flex-col overflow-hidden w-full">
            <CodexStatsView sessionId={activeSession.id} />
          </div>
        )}

        {devModeEnabled && viewMode === 'debugState' && (
          <div className="h-full flex flex-col overflow-hidden w-full">
            <CodexDebugStateView sessionId={activeSession.id} panelId={panel.id} />
          </div>
        )}
      </div>

      {/* Codex Input - Always visible at bottom */}
      {!activeSession.archived && (
        <ResizablePanel
          defaultHeight={200}
          minHeight={140}
          maxHeight={600}
          storageKey="codex-input-panel-height"
        >
          <CodexInputPanelStyled
            session={activeSession}
            panelId={panel.id}
            panel={panel}
            onSendMessage={hook.handleSendMessage as (message: string, options?: CodexInputOptions) => Promise<void>}
            disabled={hook.isProcessing}
            initialModel={model}
            onCancel={hook.handleInterrupt}
          />
        </ResizablePanel>
      )}
    </div>
  );
});

CodexPanel.displayName = 'CodexPanel';

// Default export for lazy loading
export default CodexPanel;

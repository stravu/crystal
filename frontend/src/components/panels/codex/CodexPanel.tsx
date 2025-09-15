import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { ToolPanel } from '../../../../../shared/types/panels';
import { AIViewMode, RichOutputSettings } from '../ai/AbstractAIPanel';
import { CodexRichOutputView } from './CodexRichOutputView';
import { CodexMessagesView } from './CodexMessagesView';
import { CodexStatsView } from './CodexStatsView';
import { CodexInputPanel } from './CodexInputPanel';
import { useCodexPanel } from '../../../hooks/useCodexPanel';

interface CodexPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}

export const CodexPanel: React.FC<CodexPanelProps> = ({ panel, isActive }) => {
  console.log(`[codex-debug] CodexPanel rendering: Panel ${panel.id}, Active: ${isActive}`);
  
  // Panel-specific view mode
  const [viewMode, setViewMode] = useState<AIViewMode>('richOutput');
  
  // Settings state for Rich Output view
  const [showRichOutputSettings, setShowRichOutputSettings] = useState(false);
  const [richOutputSettings, setRichOutputSettings] = useState<RichOutputSettings>(() => {
    const saved = localStorage.getItem('codexRichOutputSettings');
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
    localStorage.setItem('codexRichOutputSettings', JSON.stringify(newSettings));
  };

  // Use the Codex-specific hook
  const hook = useCodexPanel(panel.id, isActive);
  
  useEffect(() => {
    console.log(`[codex-debug] CodexPanel mounted/updated: Panel ${panel.id}, ViewMode: ${viewMode}, Session: ${hook.activeSession?.id || 'none'}`);
  }, [panel.id, viewMode, hook.activeSession?.id]);

  // Get session for CodexInputPanel
  const activeSession = hook.activeSession;
  
  console.log(`[codex-debug] CodexPanel state: Panel ${panel.id}, Session: ${activeSession?.id || 'none'}, Processing: ${hook.isProcessing}`);

  if (!activeSession) {
    console.warn(`[codex-debug] No active session for panel ${panel.id}`);
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-surface-primary">
        {/* Segmented Control for View Mode */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">View</span>
          <div className="inline-flex rounded-lg bg-surface-secondary p-0.5">
            <button
              onClick={() => {
                console.log(`[codex-debug] View mode changed to richOutput for panel ${panel.id}`);
                setViewMode('richOutput');
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'richOutput'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Output
            </button>
            <button
              onClick={() => {
                console.log(`[codex-debug] View mode changed to messages for panel ${panel.id}`);
                setViewMode('messages');
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'messages'
                  ? 'bg-bg-primary text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Messages
            </button>
            <button
              onClick={() => {
                console.log(`[codex-debug] View mode changed to stats for panel ${panel.id}`);
                setViewMode('stats');
              }}
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

        {/* Model indicator and settings button */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">
            Model: <span className="text-text-secondary font-medium">GPT-4o</span>
          </span>
          
          {viewMode === 'richOutput' && (
            <button
              onClick={() => {
                console.log(`[codex-debug] Settings toggled for panel ${panel.id}: ${!showRichOutputSettings}`);
                setShowRichOutputSettings(!showRichOutputSettings);
              }}
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
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {viewMode === 'richOutput' && (
          <div className="h-full block w-full">
            <CodexRichOutputView 
              panelId={panel.id}
              sessionStatus={activeSession.status}
              settings={richOutputSettings}
              onSettingsChange={handleRichOutputSettingsChange}
              showSettings={showRichOutputSettings}
            />
          </div>
        )}
        
        {viewMode === 'messages' && (
          <div className="h-full flex flex-col overflow-hidden w-full">
            <CodexMessagesView panelId={panel.id} />
          </div>
        )}
        
        {viewMode === 'stats' && (
          <div className="h-full flex flex-col overflow-hidden w-full">
            <CodexStatsView sessionId={activeSession.id} />
          </div>
        )}
      </div>

      {/* Codex Input - Always visible at bottom */}
      {!activeSession.archived && (
        <CodexInputPanel
          session={activeSession}
          panelId={panel.id}
          onSendMessage={hook.handleSendMessage}
          disabled={hook.isProcessing}
        />
      )}
    </div>
  );
};

// Default export for lazy loading
export default CodexPanel;
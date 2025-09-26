import React from 'react';
import { Settings } from 'lucide-react';
import { ToolPanel } from '../../../../../shared/types/panels';
import { Session } from '../../../types/session';

/**
 * Common view modes for AI agent panels
 */
export type AIViewMode = 'richOutput' | 'messages' | 'stats' | 'debugState';

/**
 * Common settings for rich output display
 */
export interface RichOutputSettings {
  showToolCalls: boolean;
  compactMode: boolean;
  collapseTools: boolean;
  showThinking: boolean;
  showSessionInit: boolean;
}

/**
 * Props for AI agent panels
 */
export interface AIPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}

/**
 * State for AI agent panels
 */
export interface AIPanelState {
  viewMode: AIViewMode;
  showSettings: boolean;
  richOutputSettings: RichOutputSettings;
}

/**
 * Base component for AI agent panels
 * This provides the common structure and functionality that all AI panels share
 */
export abstract class AbstractAIPanel<T extends AIPanelProps = AIPanelProps> extends React.Component<T, AIPanelState> {
  
  constructor(props: T) {
    super(props);
    
    // Initialize state with defaults
    this.state = {
      viewMode: 'richOutput',
      showSettings: false,
      richOutputSettings: this.loadRichOutputSettings()
    };
  }

  /**
   * Get the agent name for display and storage keys
   */
  protected abstract getAgentName(): string;

  /**
   * Get the active session for this panel
   */
  protected abstract getActiveSession(): Session | null;

  /**
   * Render the rich output view component
   */
  protected abstract renderRichOutputView(): React.ReactNode;

  /**
   * Render the messages view component
   */
  protected abstract renderMessagesView(): React.ReactNode;

  /**
   * Render the stats view component
   */
  protected abstract renderStatsView(): React.ReactNode;

  /**
   * Render the input component
   */
  protected abstract renderInputComponent(): React.ReactNode;

  /**
   * Render the settings panel (optional override)
   */
  protected abstract renderSettingsPanel(): React.ReactNode;

  /**
   * Get additional header elements (optional override)
   */
  protected renderHeaderExtras(): React.ReactNode {
    return null;
  }

  /**
   * Load rich output settings from localStorage
   */
  protected loadRichOutputSettings(): RichOutputSettings {
    const key = `${this.getAgentName().toLowerCase()}RichOutputSettings`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : {
      showToolCalls: true,
      compactMode: false,
      collapseTools: true,  // Collapse tools by default
      showThinking: true,
      showSessionInit: false,
    };
  }

  /**
   * Save rich output settings to localStorage
   */
  protected handleRichOutputSettingsChange = (newSettings: RichOutputSettings) => {
    const key = `${this.getAgentName().toLowerCase()}RichOutputSettings`;
    this.setState({ richOutputSettings: newSettings });
    localStorage.setItem(key, JSON.stringify(newSettings));
  };

  /**
   * Handle view mode change
   */
  protected setViewMode = (viewMode: AIViewMode) => {
    this.setState({ viewMode });
  };

  /**
   * Toggle settings panel visibility
   */
  protected toggleSettings = () => {
    this.setState(prev => ({ showSettings: !prev.showSettings }));
  };

  /**
   * Get view mode button class names
   */
  protected getViewModeButtonClass(mode: AIViewMode): string {
    return `px-3 py-1 text-xs font-medium rounded-md transition-all ${
      this.state.viewMode === mode
        ? 'bg-bg-primary text-text-primary shadow-sm'
        : 'text-text-secondary hover:text-text-primary'
    }`;
  }

  /**
   * Get the view mode display name
   */
  protected getViewModeDisplayName(mode: AIViewMode): string {
    switch (mode) {
      case 'richOutput':
        return 'Output';
      case 'messages':
        return 'Messages';
      case 'stats':
        return 'Stats';
      default:
        return mode;
    }
  }

  /**
   * Main render method - provides the common structure
   */
  public render(): React.ReactNode {
    const activeSession = this.getActiveSession();

    if (!activeSession) {
      return (
        <div className="h-full w-full flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h3 className="text-lg font-medium text-text-primary mb-2">
              No Session Found
            </h3>
            <p className="text-sm text-text-secondary">
              This {this.getAgentName()} panel is not associated with an active session.
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
              {(['richOutput', 'messages', 'stats'] as AIViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => this.setViewMode(mode)}
                  className={this.getViewModeButtonClass(mode)}
                >
                  {this.getViewModeDisplayName(mode)}
                </button>
              ))}
            </div>
          </div>

          {/* Settings button and header extras */}
          <div className="flex items-center gap-2">
            {this.renderHeaderExtras()}
            
            {this.state.viewMode === 'richOutput' && (
              <button
                onClick={() => this.toggleSettings()}
                className={`px-2 py-1 rounded-md text-xs transition-all flex items-center gap-1.5 ${
                  this.state.showSettings
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
          {this.state.viewMode === 'richOutput' && (
            <div className="h-full block w-full">
              {this.renderRichOutputView()}
            </div>
          )}
          
          {this.state.viewMode === 'messages' && (
            <div className="h-full flex flex-col overflow-hidden w-full">
              {this.renderMessagesView()}
            </div>
          )}
          
          {this.state.viewMode === 'stats' && (
            <div className="h-full flex flex-col overflow-hidden w-full">
              {this.renderStatsView()}
            </div>
          )}
        </div>

        {/* Input Component - Always visible at bottom if not archived */}
        {!activeSession.archived && this.renderInputComponent()}

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

        {/* Settings Panel */}
        {this.state.viewMode === 'richOutput' && this.state.showSettings && this.renderSettingsPanel()}
      </div>
    );
  }
}
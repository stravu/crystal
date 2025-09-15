import React from 'react';
import { ToolPanel } from '../../../../../shared/types/panels';

/**
 * Common view modes for AI agent panels
 */
export type AIViewMode = 'richOutput' | 'messages' | 'stats';

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
 * Base component interface for AI agent panels
 * This provides the common structure that all AI panels should follow
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
   * Get the agent-specific hook for panel management
   */
  protected abstract getAgentHook(): any;

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
   * Load rich output settings from localStorage
   */
  protected loadRichOutputSettings(): RichOutputSettings {
    const key = `${this.getAgentName().toLowerCase()}RichOutputSettings`;
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : {
      showToolCalls: true,
      compactMode: false,
      collapseTools: false,
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
}
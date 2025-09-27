import React from 'react';
import { AbstractInputPanel, AbstractInputPanelState, InputOptions, AbstractInputPanelProps } from '../ai/AbstractInputPanel';
import { CODEX_MODELS, DEFAULT_CODEX_MODEL, type OpenAICodexModel, type CodexInputOptions } from '../../../../../shared/types/models';
import { CommitModePill } from '../../CommitModeToggle';

const LAST_CODEX_MODEL_KEY = 'codex.lastSelectedModel';

interface CodexInputPanelProps extends AbstractInputPanelProps {
  disabled?: boolean;
  initialModel?: string;
}

// Using shared CodexInputOptions interface from models.ts

interface CodexInputPanelState extends AbstractInputPanelState {
  options: CodexInputOptions;
}

class CodexInputPanelClass extends AbstractInputPanel<CodexInputPanelProps, CodexInputPanelState> {
  protected getInitialState(): Partial<CodexInputPanelState> {
    return {
      options: this.initializeOptions(),
    };
  }

  private initializeOptions(): CodexInputOptions {
    const { initialModel } = this.props;
    
    // First priority: initialModel prop (from panel state)
    if (initialModel && initialModel in CODEX_MODELS) {
      return {
        model: initialModel as OpenAICodexModel,
        modelProvider: 'openai' as const,
        sandboxMode: 'workspace-write',
        webSearch: false,
      };
    }
    
    // Second priority: saved model from localStorage
    const saved = localStorage.getItem(LAST_CODEX_MODEL_KEY);
    if (saved && saved in CODEX_MODELS) {
      return {
        model: saved as OpenAICodexModel,
        modelProvider: 'openai' as const,
        sandboxMode: 'workspace-write',
        webSearch: false,
      };
    }
    
    // Default fallback
    return {
      model: DEFAULT_CODEX_MODEL,
      modelProvider: 'openai',
      sandboxMode: 'workspace-write',
      webSearch: false,
    };
  }

  componentDidUpdate(prevProps: CodexInputPanelProps, prevState: CodexInputPanelState) {
    super.componentDidUpdate(prevProps, prevState);
    
    // Save model selection to localStorage whenever it changes
    if (prevState.options?.model !== this.state.options.model) {
      localStorage.setItem(LAST_CODEX_MODEL_KEY, this.state.options.model);
    }
  }

  getDefaultOptions(): InputOptions {
    return this.state.options;
  }

  getPlaceholder(): string {
    const { session } = this.props;
    return session.status === 'waiting' 
      ? "Enter your response..." 
      : "Ask Codex anything...";
  }

  protected handleSubmit = async () => {
    const { onSendMessage, disabled } = this.props;
    const { input, isSubmitting, options } = this.state;
    
    if (!input.trim() || isSubmitting || disabled) return;

    const message = input.trim();
    this.setState({ input: '', isSubmitting: true });

    try {
      // Codex sends options differently - as direct parameters
      await onSendMessage(message, options);
      // Clear attachments on successful send
      this.setState({ attachedImages: [], attachedTexts: [] });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore input on error
      this.setState({ input: message });
    } finally {
      this.setState({ isSubmitting: false });
      // Refocus textarea
      this.inputRef.current?.focus();
    }
  };

  renderOptionsPanel(): React.ReactNode {
    const { options } = this.state;
    const { session } = this.props;
    
    // Calculate auto-commit enabled state
    const effectiveMode = session.commitMode || (session.autoCommit === false ? 'disabled' : 'checkpoint');
    const isAutoCommitEnabled = effectiveMode !== 'disabled';
    
    return (
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <label className="text-text-secondary">Model:</label>
          <select
            value={options.model}
            onChange={(e) => this.setState({ 
              options: { ...options, model: e.target.value as OpenAICodexModel }
            })}
            className="px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary font-medium"
            title={CODEX_MODELS[options.model as OpenAICodexModel]?.description || 'Select model'}
          >
            {Object.values(CODEX_MODELS).map(model => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-text-secondary">Sandbox:</label>
          <select
            value={options.sandboxMode}
            onChange={(e) => this.setState({ 
              options: { ...options, sandboxMode: e.target.value as 'read-only' | 'workspace-write' | 'danger-full-access' }
            })}
            className="px-2 py-1 bg-bg-primary border border-border-primary rounded text-text-primary"
          >
            <option value="read-only">Read Only</option>
            <option value="workspace-write">Workspace Write</option>
            <option value="danger-full-access">Full Access</option>
          </select>
        </div>

        {/* Commit Mode Controls */}
        <div className="flex items-center gap-3">
          {/* Auto-Commit Toggle - Hidden: Now handled by CommitMode system */}
          {/* <label className="text-text-secondary">Auto-Commit:</label>
          <div className="flex items-center gap-2">
            <AutoCommitSwitch
              sessionId={session.id}
              currentMode={session.commitMode}
              currentSettings={session.commitModeSettings}
              autoCommit={session.autoCommit}
            />
            <CommitModePill */}
          <CommitModePill
            sessionId={session.id}
            currentMode={session.commitMode}
            currentSettings={session.commitModeSettings}
            autoCommit={session.autoCommit}
            projectId={session.projectId}
            isAutoCommitEnabled={isAutoCommitEnabled}
          />
        </div>

        {/* Web Search toggle hidden for Codex as it doesn't work */}
        {/* <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={options.webSearch}
              onChange={(e) => this.setState({ 
                options: { ...options, webSearch: e.target.checked }
              })}
              className="rounded border-border-primary"
            />
            Web Search
          </label>
        </div> */}
      </div>
    );
  }

  renderActionButtons(): React.ReactNode {
    // Codex doesn't have additional action buttons like Claude
    return null;
  }

  protected renderStatusIndicator(): React.ReactNode {
    const { session } = this.props;
    
    if (session.status === 'running') {
      return (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Codex is thinking...</span>
          </div>
        </div>
      );
    }
    return null;
  }
}

// Create a functional component wrapper for easier use
export const CodexInputPanelRefactored: React.FC<CodexInputPanelProps> = (props) => {
  return <CodexInputPanelClass {...props} />;
};
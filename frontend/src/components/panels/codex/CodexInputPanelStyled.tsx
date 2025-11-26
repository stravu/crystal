import React, { useState, KeyboardEvent, useEffect, useCallback, memo } from 'react';
import { Send, X, Paperclip, FileText, Square, ChevronRight, Zap, Target, Brain, CheckCircle, Gauge } from 'lucide-react';
import type { Session, GitCommands } from '../../../types/session';
import type { ToolPanel } from '../../../../../shared/types/panels';
import { CODEX_MODELS, DEFAULT_CODEX_MODEL, type OpenAICodexModel, type CodexInputOptions } from '../../../../../shared/types/models';
import { useAIInputPanel } from '../../../hooks/useAIInputPanel';
import FilePathAutocomplete from '../../FilePathAutocomplete';
import { Dropdown, type DropdownItem } from '../../ui/Dropdown';
import { Pill } from '../../ui/Pill';
import { CommitModePill } from '../../CommitModeToggle';
import { API } from '../../../utils/api';

// Settings are now stored in database, no longer using localStorage

interface CodexInputPanelStyledProps {
  session: Session;
  panelId: string;
  panel?: ToolPanel;
  onSendMessage: (message: string, options?: CodexInputOptions) => Promise<void>;
  disabled?: boolean;
  initialModel?: string;
  onCancel?: () => void;
  gitCommands?: GitCommands | null;
}

export const CodexInputPanelStyled: React.FC<CodexInputPanelStyledProps> = memo(({
  session,
  panelId,
  onSendMessage,
  disabled = false,
  onCancel,
  gitCommands,
  panel
}) => {
  // Initialize model
  // Initialize state with defaults, will be updated from database
  const [selectedModel, setSelectedModel] = useState<OpenAICodexModel>(DEFAULT_CODEX_MODEL);
  const [sandboxMode, setSandboxMode] = useState<'read-only' | 'workspace-write' | 'danger-full-access'>('workspace-write');
  const [webSearch, setWebSearch] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isToolbarActive, setIsToolbarActive] = useState(false);

  // Use the shared hook for common functionality
  const {
    input,
    setInput,
    isSubmitting,
    attachedImages,
    attachedTexts,
    isDragging,
    textareaRef,
    fileInputRef,
    handlePaste,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    removeImage,
    removeText,
    handleFileSelect,
    handleSubmit: hookHandleSubmit,
  } = useAIInputPanel({
    onSendMessage: async (message, _additionalOptions, images, texts) => {
      // Pass the message and attachments to the handler
      // The hook (useCodexPanel) will handle saving attachments and formatting
      const options = {
        model: selectedModel,
        modelProvider: 'openai' as const,
        sandboxMode,
        webSearch,
        thinkingLevel,
        attachedImages: images,
        attachedTexts: texts
      };
      await onSendMessage(message, options);
    },
    onCancel,
    disabled
  });

  // Load settings from database on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await API.codexPanels.getSettings(panelId);
        if (result.success && result.data) {
          const settings = result.data;
          if (settings.model && settings.model in CODEX_MODELS) {
            setSelectedModel(settings.model as OpenAICodexModel);
          }
          if (settings.sandboxMode) {
            setSandboxMode(settings.sandboxMode);
          }
          if (settings.webSearch !== undefined) {
            setWebSearch(settings.webSearch);
          }
          if (settings.thinkingLevel) {
            setThinkingLevel(settings.thinkingLevel);
          }
          setSettingsLoaded(true);
        }
      } catch (error) {
        console.error('Failed to load Codex panel settings:', error);
        setSettingsLoaded(true); // Mark as loaded even on error to prevent blocking
      }
    };
    
    loadSettings();
  }, [panelId]);

  // Save settings to database when they change
  useEffect(() => {
    if (!settingsLoaded) return; // Don't save until initial load is complete
    
    const saveSettings = async () => {
      try {
        await API.codexPanels.setSettings(panelId, {
          model: selectedModel,
          sandboxMode,
          webSearch,
          thinkingLevel
        });
      } catch (error) {
        console.error('Failed to save Codex panel settings:', error);
      }
    };
    
    saveSettings();
  }, [selectedModel, sandboxMode, webSearch, thinkingLevel, settingsLoaded, panelId]);
  
  // Update model and thinking level when panel changes (e.g., when switching sessions)
  useEffect(() => {
    const customState = panel?.state?.customState as {
      codexConfig?: {
        model?: string;
        thinkingLevel?: 'low' | 'medium' | 'high';
        sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
        webSearch?: boolean;
      };
    } | undefined;
    
    // Update model
    if (customState?.codexConfig?.model) {
      const storedModel = customState.codexConfig.model;
      if (storedModel in CODEX_MODELS) {
        setSelectedModel(storedModel as OpenAICodexModel);
      }
    }
    
    // Update thinking level
    if (customState?.codexConfig?.thinkingLevel) {
      const storedLevel = customState.codexConfig.thinkingLevel;
      if (storedLevel === 'low' || storedLevel === 'medium' || storedLevel === 'high') {
        setThinkingLevel(storedLevel);
      }
    }
    
    // Update sandbox mode
    if (customState?.codexConfig?.sandboxMode) {
      const storedMode = customState.codexConfig.sandboxMode;
      if (storedMode === 'read-only' || storedMode === 'workspace-write' || storedMode === 'danger-full-access') {
        setSandboxMode(storedMode);
      }
    }
    
    // Update web search
    if (customState?.codexConfig?.webSearch !== undefined) {
      setWebSearch(customState.codexConfig.webSearch);
    }
  }, [panel?.state?.customState]);

  const handleSubmit = async () => {
    // Use the hook's handleSubmit which includes attachments
    await hookHandleSubmit({
      model: selectedModel,
      modelProvider: 'openai',
      sandboxMode,
      webSearch,
      thinkingLevel
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const shouldCancel = e.key === 'Escape' && session.status === 'running' && onCancel;
    
    if (shouldCancel) {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setIsToolbarActive(true);
  }, []);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    const toolbar = e.currentTarget?.closest?.('[data-toolbar-container]');
    const relatedTarget = e.relatedTarget;
    
    if (!toolbar || !relatedTarget || !(toolbar instanceof Element) || !toolbar.contains(relatedTarget as Node)) {
      setIsFocused(false);
      setIsToolbarActive(false);
    } else {
      setIsFocused(false);
      setIsToolbarActive(true);
    }
  }, []);

  // Get session status
  const getSessionStatus = () => {
    switch (session.status) {
      case 'initializing':
        return { color: 'bg-status-warning', pulse: true };
      case 'ready':
        return { color: 'bg-status-success', pulse: false };
      case 'running':
        return { color: 'bg-interactive', pulse: true };
      case 'waiting':
        return { color: 'bg-status-warning', pulse: true };
      case 'stopped':
        return { color: 'bg-text-tertiary', pulse: false };
      case 'completed_unviewed':
        return { color: 'bg-status-success', pulse: true };
      case 'error':
        return { color: 'bg-status-error', pulse: false };
      default:
        return { color: 'bg-text-tertiary', pulse: false };
    }
  };

  const sessionStatus = getSessionStatus();
  const placeholder = session.status === 'waiting' 
    ? "Enter your response..." 
    : "Ask Codex anything...";

  // Calculate auto-commit enabled state
  const effectiveMode = session.commitMode || (session.autoCommit === false ? 'disabled' : 'checkpoint');
  const isAutoCommitEnabled = effectiveMode !== 'disabled';

  return (
    <div className="h-full flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
      <div className="bg-surface-secondary flex flex-col flex-1 min-h-0">
        {/* Context Bar */}
        <div className="px-4 py-2 border-b border-border-primary bg-surface-primary flex-shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* Session status indicator */}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${sessionStatus.color} ${sessionStatus.pulse ? 'animate-pulse' : ''}`} />
              </div>
              
              {/* Project Badge */}
              <div className="px-2.5 py-1 rounded-full text-xs font-medium
                bg-interactive/10 text-interactive 
                border border-interactive/30
                flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="leading-none">
                  {session.worktreePath.split('/').slice(-3, -2)[0] || 'Project'}
                </span>
              </div>
              
              {/* Branch Badge */}
              {gitCommands?.currentBranch && (
                <div className="px-2.5 py-1 rounded-full text-xs font-medium
                  bg-status-success/10 text-status-success 
                  border border-status-success/30
                  flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3v12a3 3 0 003 3h6m-6-6l3-3-3-3m6 0a3 3 0 100 6 3 3 0 000-6z" />
                  </svg>
                  <span className="leading-none font-mono">
                    {gitCommands.currentBranch}
                  </span>
                </div>
              )}
            </div>
            
            {/* Codex Indicator */}
            <div className="flex items-center gap-1 text-text-secondary">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span>Codex AI</span>
            </div>
          </div>
        </div>

        {/* Command Input Area */}
        <div
          className="p-4 bg-surface-primary flex-1 flex flex-col min-h-0 overflow-auto"
          data-toolbar-container
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Attached items */}
          {(attachedImages.length > 0 || attachedTexts.length > 0) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachedTexts.map(text => (
                <div key={text.id} className="relative group">
                  <div className="h-12 px-3 flex items-center gap-2 bg-surface-secondary rounded border border-border-primary">
                    <FileText className="w-4 h-4 text-text-secondary" />
                    <span className="text-xs text-text-secondary max-w-[150px] truncate">
                      {text.name}
                    </span>
                  </div>
                  <button
                    onClick={() => removeText(text.id)}
                    className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5 text-text-secondary" />
                  </button>
                </div>
              ))}
              
              {attachedImages.map(image => (
                <div key={image.id} className="relative group">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    className="h-12 w-12 object-cover rounded border border-border-primary"
                  />
                  <button
                    onClick={() => removeImage(image.id)}
                    className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5 text-text-secondary" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Clean Input Container */}
          <div className={`
            relative z-10 flex-1 flex flex-col min-h-0
            bg-surface-primary
            rounded-lg border border-border-primary
            shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.15)]
            transition-all duration-200 backdrop-blur-sm
            ${(isFocused || isToolbarActive) ? 'command-bar-focus' : ''}
          `}>
            {/* Command prompt field */}
            <div className="relative flex-1 min-h-0 flex">
              <div className="absolute left-4 top-4 text-text-secondary select-none pointer-events-none font-mono text-sm z-10">
                &gt;
              </div>
              <FilePathAutocomplete
                value={input}
                onChange={setInput}
                sessionId={session.id}
                placeholder={isDragging ? "Drop images here..." : placeholder}
                className={`
                  w-full h-full pl-10 pr-4 py-4
                  bg-transparent
                  border-0 focus:outline-none
                  resize-none font-mono text-sm
                  text-text-primary
                  placeholder-text-tertiary
                  transition-colors
                `}
                textareaRef={textareaRef}
                isTextarea={true}
                rows={1}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onFocus={handleFocus}
                onBlur={() => handleBlur({} as React.FocusEvent)}
                style={{
                  minHeight: '52px'
                }}
              />
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>

          {/* Unified Action Bar */}
          <div className="flex items-center justify-between mt-3 gap-4 flex-shrink-0">
            {/* Left Section - Tools and Settings */}
            <div className="flex items-center gap-2">
              {/* Attach Button */}
              <Pill
                onClick={() => fileInputRef.current?.click()}
                icon={<Paperclip className="w-3.5 h-3.5" />}
                title="Attach images or paste large text blocks"
              >
                Attach
              </Pill>

              {/* Divider */}
              <div className="h-6 w-px bg-border-primary mx-1" />

              {/* Model Selector */}
              <ModelSelector
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
              />

              {/* Thinking Level Selector */}
              <ThinkingLevelSelector
                thinkingLevel={thinkingLevel}
                setThinkingLevel={setThinkingLevel}
              />

              {/* Auto-Commit Mode Pill - always visible */}
              <CommitModePill
                sessionId={session.id}
                currentMode={session.commitMode}
                currentSettings={session.commitModeSettings}
                autoCommit={session.autoCommit}
                projectId={session.projectId}
                isAutoCommitEnabled={isAutoCommitEnabled}
              />

              {/* Toggle Group - subtle visual grouping */}
              <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border-primary/20">
                {/* Auto-Commit Toggle - Hidden: Now handled by CommitMode system */}
                {/* <AutoCommitSwitch
                  sessionId={session.id}
                  currentMode={session.commitMode}
                  currentSettings={session.commitModeSettings}
                  autoCommit={session.autoCommit}
                /> */}

                {/* Options Pills */}
                <div className="flex items-center gap-2">
                  {/* Sandbox Mode */}
                  <SandboxSelector
                    sandboxMode={sandboxMode}
                    setSandboxMode={setSandboxMode}
                  />

                  {/* Web Search Toggle - Hidden for Codex as it doesn't work */}
                  {/* <div title="Allow AI to search the web for up-to-date information">
                    <Switch
                      checked={webSearch}
                      onCheckedChange={setWebSearch}
                      label="Web Search"
                      size="sm"
                    />
                  </div> */}
                </div>
              </div>
            </div>

            {/* Right Section - Send/Cancel Button */}
            <div className="flex items-center gap-2">
              {session.status === 'running' && onCancel ? (
                <button 
                  onClick={onCancel}
                  className={`
                    px-4 py-2 font-medium group
                    flex items-center gap-2 transition-all duration-200
                    rounded-lg border
                    active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0
                    bg-surface-secondary hover:bg-surface-hover 
                    text-status-error hover:text-status-error/90 
                    border-status-error/30 hover:border-status-error/50
                    focus:ring-status-error/50
                    hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]
                  `}
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span className="font-semibold">Cancel</span>
                  <span className="ml-2 text-xs font-mono bg-surface-tertiary px-1.5 py-0.5 rounded opacity-80 group-hover:opacity-100 transition-opacity">
                    ESC
                  </span>
                </button>
              ) : (
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting || !input.trim()}
                  className={`
                    px-4 py-2 font-medium group
                    flex items-center gap-2 transition-all duration-200
                    rounded-lg border
                    active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0
                    ${isSubmitting || !input.trim()
                      ? 'bg-gray-500 text-gray-300 border-gray-500 cursor-not-allowed opacity-60'
                      : session.status === 'waiting'
                        ? 'bg-surface-secondary hover:bg-surface-hover text-interactive hover:text-interactive-hover border-border-primary focus:ring-interactive'
                        : 'bg-gradient-to-r from-interactive to-interactive-hover hover:from-interactive-hover hover:to-interactive text-white border-interactive shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] focus:ring-interactive hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)]'
                    }
                  `}
                >
                  {session.status === 'waiting' ? (
                    <Send className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  )}
                  <span className="font-semibold">
                    {isSubmitting ? 'Processing...' : session.status === 'waiting' ? 'Send' : 'Continue'}
                  </span>
                  <span className="ml-2 text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded opacity-80 group-hover:opacity-100 transition-opacity">
                    ⌘⏎
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status Indicator */}
      {session.status === 'running' && (
        <div className="bg-surface-primary border-t border-border-primary px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Codex is processing your request...</span>
          </div>
        </div>
      )}
    </div>
  );
});

CodexInputPanelStyled.displayName = 'CodexInputPanelStyled';

// Model Selector Component
interface ModelSelectorProps {
  selectedModel: OpenAICodexModel;
  setSelectedModel: (model: OpenAICodexModel) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  setSelectedModel,
}) => {
  // Model configurations with icons - matching actual CODEX_MODELS
  const modelConfigs = {
    'auto': {
      label: 'Auto',
      icon: CheckCircle,
      iconColor: 'text-interactive',
      description: 'Auto-select',
    },
    'gpt-5': {
      label: 'GPT-5',
      icon: Brain,
      iconColor: 'text-interactive',
      description: 'Standard',
    },
    'gpt-5-codex': {
      label: 'GPT-5 Codex',
      icon: Zap,
      iconColor: 'text-status-success',
      description: 'Optimized for coding',
    },
  };

  const currentConfig = modelConfigs[selectedModel as keyof typeof modelConfigs] || modelConfigs['gpt-5'];
  const Icon = currentConfig.icon;

  // Create dropdown items
  const dropdownItems: DropdownItem[] = Object.entries(CODEX_MODELS).map(([modelId, model]) => {
    const config = modelConfigs[modelId as keyof typeof modelConfigs];
    return {
      id: modelId,
      label: model.label,
      description: model.description,
      icon: config?.icon || Target,
      iconColor: config?.iconColor || 'text-interactive',
      onClick: () => setSelectedModel(modelId as OpenAICodexModel),
    };
  });

  // Create trigger button
  const triggerButton = (
    <Pill
      icon={<Icon className={`w-3.5 h-3.5 ${currentConfig.iconColor}`} />}
      title={`Model: ${currentConfig.description}. Click to change.`}
    >
      {currentConfig.label}
      <svg className="w-3.5 h-3.5 text-text-tertiary" 
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </Pill>
  );

  return (
    <Dropdown
      trigger={triggerButton}
      items={dropdownItems}
      selectedId={selectedModel}
      position="auto"
      width="sm"
      onOpenChange={() => {}}
    />
  );
};

// Sandbox Mode Selector Component
interface SandboxSelectorProps {
  sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
  setSandboxMode: (mode: 'read-only' | 'workspace-write' | 'danger-full-access') => void;
}

const SandboxSelector: React.FC<SandboxSelectorProps> = ({
  sandboxMode,
  setSandboxMode,
}) => {
  const modeConfigs = {
    'read-only': { 
      label: 'Read Only', 
      color: 'text-text-secondary',
      description: 'AI can only read files, cannot make any changes'
    },
    'workspace-write': { 
      label: 'Workspace', 
      color: 'text-interactive',
      description: 'AI can read and write files within the workspace'
    },
    'danger-full-access': { 
      label: 'Full Access', 
      color: 'text-status-warning',
      description: 'AI has full system access (use with caution)'
    },
  };

  const currentConfig = modeConfigs[sandboxMode];

  const dropdownItems: DropdownItem[] = Object.entries(modeConfigs).map(([mode, config]) => ({
    id: mode,
    label: config.label,
    description: config.description,
    onClick: () => setSandboxMode(mode as 'read-only' | 'workspace-write' | 'danger-full-access'),
  }));

  const getTooltipText = () => {
    return `Sandbox Mode: ${currentConfig.description}`;
  };

  const triggerButton = (
    <Pill title={getTooltipText()}>
      <span className={currentConfig.color}>{currentConfig.label}</span>
      <svg className="w-3.5 h-3.5 text-text-tertiary" 
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </Pill>
  );

  return (
    <Dropdown
      trigger={triggerButton}
      items={dropdownItems}
      selectedId={sandboxMode}
      position="auto"
      width="sm"
      onOpenChange={() => {}}
    />
  );
};

// Thinking Level Selector Component
interface ThinkingLevelSelectorProps {
  thinkingLevel: 'low' | 'medium' | 'high';
  setThinkingLevel: (level: 'low' | 'medium' | 'high') => void;
}

const ThinkingLevelSelector: React.FC<ThinkingLevelSelectorProps> = ({
  thinkingLevel,
  setThinkingLevel,
}) => {
  const levelConfigs = {
    'low': {
      label: 'Low',
      icon: Gauge,
      iconColor: 'text-interactive',
      description: 'Faster responses with less reasoning'
    },
    'medium': {
      label: 'Medium',
      icon: Brain,
      iconColor: 'text-interactive',
      description: 'Balanced speed and reasoning'
    },
    'high': {
      label: 'High',
      icon: Zap,
      iconColor: 'text-status-success',
      description: 'Slower but more thorough reasoning'
    }
  };

  const currentConfig = levelConfigs[thinkingLevel];
  const Icon = currentConfig.icon;

  const dropdownItems: DropdownItem[] = Object.entries(levelConfigs).map(([level, config]) => ({
    id: level,
    label: config.label,
    description: config.description,
    icon: config.icon,
    iconColor: config.iconColor,
    onClick: () => setThinkingLevel(level as 'low' | 'medium' | 'high'),
  }));

  const triggerButton = (
    <Pill
      icon={<Icon className={`w-3.5 h-3.5 ${currentConfig.iconColor}`} />}
      title={`Thinking Level: ${currentConfig.description}. Click to change.`}
    >
      {currentConfig.label}
      <svg className="w-3.5 h-3.5 text-text-tertiary" 
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </Pill>
  );

  return (
    <Dropdown
      trigger={triggerButton}
      items={dropdownItems}
      selectedId={thinkingLevel}
      position="auto"
      width="sm"
      onOpenChange={() => {}}
    />
  );
};
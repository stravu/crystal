import React, { useState } from 'react';
import { FileText, RotateCcw, ChevronDown, Settings, GitCommit } from 'lucide-react';
import type { CommitMode, CommitModeSettings } from '../../../shared/types';
import { CommitModeSettings as CommitModeSettingsComponent } from './CommitModeSettings';
import { Dropdown, DropdownMenuItem, type DropdownItem } from './ui/Dropdown';
import { Button } from './ui/Button';
import { Pill } from './ui/Pill';
import { SwitchSimple as Switch } from './ui/SwitchSimple';
import { cn } from '../utils/cn';

interface CommitModeToggleProps {
  sessionId: string;
  currentMode?: CommitMode;
  currentSettings?: string; // JSON string
  autoCommit?: boolean; // For backwards compatibility
  projectId?: number;
  onModeChange?: (mode: CommitMode, settings: CommitModeSettings) => void;
}

interface CommitModePillProps {
  sessionId: string;
  currentMode?: CommitMode;
  currentSettings?: string;
  autoCommit?: boolean;
  projectId?: number;
  onModeChange?: (mode: CommitMode, settings: CommitModeSettings) => void;
  isAutoCommitEnabled: boolean;
}

interface AutoCommitSwitchProps {
  sessionId: string;
  currentMode?: CommitMode;
  currentSettings?: string;
  autoCommit?: boolean;
  onModeChange?: (mode: CommitMode, settings: CommitModeSettings) => void;
}

// Auto-Commit Mode Pill Component
export const CommitModePill: React.FC<CommitModePillProps> = ({
  sessionId,
  currentMode,
  currentSettings,
  autoCommit,
  projectId,
  onModeChange,
  isAutoCommitEnabled,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Parse current settings or use defaults
  let parsedSettings: CommitModeSettings;
  try {
    parsedSettings = currentSettings ? JSON.parse(currentSettings) : { mode: 'checkpoint' };
  } catch {
    parsedSettings = { mode: 'checkpoint' };
  }

  // Determine effective mode (backwards compatibility)
  const effectiveMode = currentMode || (autoCommit === false ? 'disabled' : 'checkpoint');
  
  // Get the active commit mode (defaults to checkpoint if enabled)
  const activeCommitMode: 'structured' | 'checkpoint' = isAutoCommitEnabled 
    ? (effectiveMode === 'structured' ? 'structured' : 'checkpoint')
    : 'checkpoint'; // Default for when auto-commit gets enabled

  const getModeConfig = (mode: 'structured' | 'checkpoint') => {
    switch (mode) {
      case 'structured':
        return {
          icon: FileText,
          label: 'Structured',
        };
      case 'checkpoint':
        return {
          icon: RotateCcw,
          label: 'Checkpoint',
        };
    }
  };

  const handleCommitModeChange = async (newMode: 'structured' | 'checkpoint') => {
    const newSettings: CommitModeSettings = {
      ...parsedSettings,
      mode: newMode,
    };

    // Update via IPC
    try {
      await window.electronAPI.invoke('commit-mode:update-session-settings', sessionId, newSettings);
      
      // Notify parent component
      if (onModeChange) {
        onModeChange(newMode, newSettings);
      }
    } catch (error) {
      console.error('Failed to update commit mode:', error);
    }

    setShowDropdown(false);
  };

  const handleSettingsUpdate = async (mode: CommitMode, settings: CommitModeSettings) => {
    try {
      await window.electronAPI.invoke('commit-mode:update-session-settings', sessionId, settings);
      
      if (onModeChange) {
        onModeChange(mode, settings);
      }
    } catch (error) {
      console.error('Failed to update commit mode settings:', error);
    }
  };

  // Create dropdown items for commit modes
  const dropdownItems: DropdownItem[] = [
    {
      id: 'structured',
      label: 'Structured',
      description: 'Claude creates commits',
      icon: FileText,
      iconColor: 'text-text-secondary',
      onClick: () => handleCommitModeChange('structured'),
      variant: 'default',
    },
    {
      id: 'checkpoint',
      label: 'Checkpoint',
      description: 'Auto-commit after each prompt',
      icon: RotateCcw,
      iconColor: 'text-text-secondary',
      onClick: () => handleCommitModeChange('checkpoint'),
      variant: 'success',
    },
  ];

  const config = getModeConfig(activeCommitMode);
  const Icon = config.icon;
  
  const modeSelectorPill = (
    <Pill
      variant="default"
      isActive={isAutoCommitEnabled} // Show active styling when enabled
      icon={<Icon className={cn(
        'w-3.5 h-3.5',
        isAutoCommitEnabled ? 'text-text-on-interactive' : 'text-text-secondary'
      )} />}
      className={cn(
        'transition-all duration-200 shadow-sm',
        !isAutoCommitEnabled && 'opacity-50 cursor-default'
      )}
      disabled={!isAutoCommitEnabled}
    >
      {config.label}
      <ChevronDown className={cn(
        'w-3 h-3 transition-transform',
        showDropdown ? 'rotate-180' : '',
        isAutoCommitEnabled ? 'text-text-on-interactive' : 'text-text-secondary'
      )} />
    </Pill>
  );

  // Create the footer with settings button
  const dropdownFooter = (
    <DropdownMenuItem
      icon={Settings}
      label="Commit Mode Settings..."
      onClick={() => {
        setShowDropdown(false);
        setShowSettings(true);
      }}
    />
  );

  return (
    <>
      {isAutoCommitEnabled ? (
        <Dropdown
          trigger={modeSelectorPill}
          items={dropdownItems}
          selectedId={activeCommitMode}
          footer={dropdownFooter}
          position="auto"
          onOpenChange={setShowDropdown}
        />
      ) : (
        modeSelectorPill
      )}

      {/* Settings Dialog */}
      {showSettings && (
        <div className="fixed inset-0 bg-modal-overlay flex items-center justify-center z-modal-backdrop">
          <div className="bg-surface-primary rounded-lg shadow-modal max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto z-modal">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4 text-text-primary">Commit Mode Settings</h2>
              
              <CommitModeSettingsComponent
                projectId={projectId}
                mode={effectiveMode}
                settings={parsedSettings}
                onChange={handleSettingsUpdate}
              />

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  onClick={() => setShowSettings(false)}
                  variant="secondary"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Auto-Commit Switch Component
export const AutoCommitSwitch: React.FC<AutoCommitSwitchProps> = ({
  sessionId,
  currentMode,
  currentSettings,
  autoCommit,
  onModeChange,
}) => {
  // Parse current settings or use defaults
  let parsedSettings: CommitModeSettings;
  try {
    parsedSettings = currentSettings ? JSON.parse(currentSettings) : { mode: 'checkpoint' };
  } catch {
    parsedSettings = { mode: 'checkpoint' };
  }

  // Determine effective mode (backwards compatibility)
  const effectiveMode = currentMode || (autoCommit === false ? 'disabled' : 'checkpoint');
  
  // Auto-Commit is enabled when mode is not 'disabled'
  const isAutoCommitEnabled = effectiveMode !== 'disabled';
  
  // Get the active commit mode (defaults to checkpoint if enabled)
  const activeCommitMode: 'structured' | 'checkpoint' = isAutoCommitEnabled 
    ? (effectiveMode === 'structured' ? 'structured' : 'checkpoint')
    : 'checkpoint'; // Default for when auto-commit gets enabled

  const handleAutoCommitToggle = async (enabled: boolean) => {
    const newMode: CommitMode = enabled ? activeCommitMode : 'disabled';
    const newSettings: CommitModeSettings = {
      ...parsedSettings,
      mode: newMode,
    };

    // Update via IPC
    try {
      await window.electronAPI.invoke('commit-mode:update-session-settings', sessionId, newSettings);
      
      // Notify parent component
      if (onModeChange) {
        onModeChange(newMode, newSettings);
      }
    } catch (error) {
      console.error('Failed to update commit mode:', error);
    }
  };

  return (
    <Switch
      checked={isAutoCommitEnabled}
      onCheckedChange={handleAutoCommitToggle}
      label="Auto-Commit"
      icon={<GitCommit />}
      size="sm"
    />
  );
};

// Legacy wrapper component for backwards compatibility
export const CommitModeToggle: React.FC<CommitModeToggleProps> = (props) => {
  // Determine effective mode for isAutoCommitEnabled calculation
  const effectiveMode = props.currentMode || (props.autoCommit === false ? 'disabled' : 'checkpoint');
  const isAutoCommitEnabled = effectiveMode !== 'disabled';

  return (
    <div className="inline-flex flex-col items-start gap-0.5">
      <AutoCommitSwitch {...props} />
      <div className="ml-5 mt-0">
        <CommitModePill {...props} isAutoCommitEnabled={isAutoCommitEnabled} />
      </div>
    </div>
  );
};
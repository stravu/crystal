import React, { useState } from 'react';
import { GitCommit, Shield, Zap, ChevronDown, Settings } from 'lucide-react';
import type { CommitMode, CommitModeSettings } from '../../../shared/types';
import { CommitModeSettings as CommitModeSettingsComponent } from './CommitModeSettings';

interface CommitModeToggleProps {
  sessionId: string;
  currentMode?: CommitMode;
  currentSettings?: string; // JSON string
  autoCommit?: boolean; // For backwards compatibility
  projectId?: number;
  onModeChange?: (mode: CommitMode, settings: CommitModeSettings) => void;
}

export const CommitModeToggle: React.FC<CommitModeToggleProps> = ({
  sessionId,
  currentMode,
  currentSettings,
  autoCommit,
  projectId,
  onModeChange,
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

  const getModeConfig = () => {
    switch (effectiveMode) {
      case 'structured':
        return {
          icon: Shield,
          label: 'Structured',
          color: 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/30 border-blue-200 dark:border-blue-800',
          iconColor: 'text-blue-600 dark:text-blue-400',
        };
      case 'checkpoint':
        return {
          icon: Zap,
          label: 'Checkpoint',
          color: 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-950/30 border-green-200 dark:border-green-800',
          iconColor: 'text-green-600 dark:text-green-400',
        };
      case 'disabled':
        return {
          icon: GitCommit,
          label: 'Disabled',
          color: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600',
          iconColor: 'text-gray-600 dark:text-gray-400',
        };
    }
  };

  const config = getModeConfig();
  const Icon = config.icon;

  const handleQuickModeChange = async (newMode: CommitMode) => {
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

  return (
    <>
      <div className="relative" style={{ overflow: 'visible' }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={`
            px-3.5 py-1.5 rounded-full text-xs font-medium
            transition-all duration-200 flex items-center gap-1.5
            hover:scale-105 active:scale-95
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 dark:focus:ring-offset-gray-950
            border ${config.color}
          `}
        >
          <Icon className={`w-3.5 h-3.5 ${config.iconColor}`} />
          <span className="leading-none">{config.label}</span>
          <ChevronDown className={`w-3 h-3 ${showDropdown ? 'rotate-180' : ''} transition-transform`} />
        </button>

        {/* Dropdown Menu */}
        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute right-0 bottom-full mb-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 z-[9999]">
              <div className="p-1.5">
                {/* Quick Mode Selection */}
                <button
                  onClick={() => handleQuickModeChange('structured')}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2 ${
                    effectiveMode === 'structured' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Structured</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Claude creates commits</div>
                  </div>
                  {effectiveMode === 'structured' && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  )}
                </button>

                <button
                  onClick={() => handleQuickModeChange('checkpoint')}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2 ${
                    effectiveMode === 'checkpoint' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Zap className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Checkpoint</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Auto-commit after each prompt</div>
                  </div>
                  {effectiveMode === 'checkpoint' && (
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </button>

                <button
                  onClick={() => handleQuickModeChange('disabled')}
                  className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-center gap-2 ${
                    effectiveMode === 'disabled' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <GitCommit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Disabled</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">Manual commits only</div>
                  </div>
                  {effectiveMode === 'disabled' && (
                    <div className="w-2 h-2 bg-gray-500 rounded-full" />
                  )}
                </button>

                <div className="border-t border-gray-200 dark:border-gray-600 my-1.5" />

                {/* Settings Button */}
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setShowSettings(true);
                  }}
                  className="w-full text-left px-3 py-2.5 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium">Commit Mode Settings...</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Settings Dialog */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Commit Mode Settings</h2>
              
              <CommitModeSettingsComponent
                projectId={projectId}
                mode={effectiveMode}
                settings={parsedSettings}
                onChange={handleSettingsUpdate}
              />

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
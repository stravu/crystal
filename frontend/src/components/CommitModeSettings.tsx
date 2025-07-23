import { useState, useEffect } from 'react';
import { GitCommit, Shield, Zap, AlertTriangle, Info } from 'lucide-react';
import type { CommitMode, CommitModeSettings, ProjectCharacteristics } from '../../../shared/types';
import { DEFAULT_STRUCTURED_PROMPT_TEMPLATE, DEFAULT_COMMIT_MODE_SETTINGS } from '../../../shared/types';

interface CommitModeSettingsProps {
  projectId?: number;
  mode: CommitMode;
  settings?: CommitModeSettings;
  onChange: (mode: CommitMode, settings: CommitModeSettings) => void;
  className?: string;
}

export function CommitModeSettings({ 
  projectId, 
  mode, 
  settings = DEFAULT_COMMIT_MODE_SETTINGS,
  onChange,
  className = ''
}: CommitModeSettingsProps) {
  const [characteristics, setCharacteristics] = useState<ProjectCharacteristics | null>(null);
  const [loadingCharacteristics, setLoadingCharacteristics] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [localSettings, setLocalSettings] = useState<CommitModeSettings>({
    ...DEFAULT_COMMIT_MODE_SETTINGS,
    ...settings,
    mode
  });

  // Detect project characteristics
  useEffect(() => {
    if (projectId) {
      setLoadingCharacteristics(true);
      window.electronAPI.invoke('commit-mode:get-project-characteristics', projectId.toString())
        .then((chars: ProjectCharacteristics) => {
          setCharacteristics(chars);
          // If no mode is set yet, use the suggested mode
          if (!mode || mode === 'checkpoint') {
            const newSettings = { ...localSettings, mode: chars.suggestedMode };
            setLocalSettings(newSettings);
            onChange(chars.suggestedMode, newSettings);
          }
        })
        .catch((error: any) => {
          console.error('Failed to detect project characteristics:', error);
        })
        .finally(() => {
          setLoadingCharacteristics(false);
        });
    }
  }, [projectId]);

  // Check for checkpoint mode warnings
  useEffect(() => {
    if (localSettings.mode === 'checkpoint' && projectId) {
      window.electronAPI.invoke('commit-mode:check-checkpoint-warning', projectId.toString())
        .then((result: { shouldWarn: boolean; reason?: string }) => {
          setShowWarning(result.shouldWarn);
        })
        .catch((error: any) => {
          console.error('Failed to check checkpoint warning:', error);
        });
    } else {
      setShowWarning(false);
    }
  }, [localSettings.mode, projectId]);

  const handleModeChange = (newMode: CommitMode) => {
    const newSettings = { ...localSettings, mode: newMode };
    setLocalSettings(newSettings);
    onChange(newMode, newSettings);
  };

  const handleSettingChange = <K extends keyof CommitModeSettings>(
    key: K,
    value: CommitModeSettings[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onChange(localSettings.mode, newSettings);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Commit Mode
        </label>
        
        {/* Recommendation Banner */}
        {characteristics && !loadingCharacteristics && (
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium">Recommended: {characteristics.suggestedMode} mode</p>
                <p className="text-xs mt-1 opacity-90">
                  {characteristics.hasHusky && 'Pre-commit hooks detected (.husky). '}
                  {characteristics.hasChangeset && 'Changesets detected. '}
                  {characteristics.hasConventionalCommits && 'Conventional commits detected. '}
                  {!characteristics.hasHusky && !characteristics.hasChangeset && !characteristics.hasConventionalCommits && 
                    'No special commit requirements detected. '}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {/* Structured Mode */}
          <label className="relative flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <input
              type="radio"
              name="commitMode"
              value="structured"
              checked={localSettings.mode === 'structured'}
              onChange={() => handleModeChange('structured')}
              className="mt-1 mr-3"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Structured Mode</span>
                {characteristics?.suggestedMode === 'structured' && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Claude creates commits with proper messages. Respects pre-commit hooks and project conventions.
              </p>
            </div>
          </label>

          {/* Checkpoint Mode */}
          <label className="relative flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <input
              type="radio"
              name="commitMode"
              value="checkpoint"
              checked={localSettings.mode === 'checkpoint'}
              onChange={() => handleModeChange('checkpoint')}
              className="mt-1 mr-3"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Checkpoint Mode</span>
                {characteristics?.suggestedMode === 'checkpoint' && (
                  <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Auto-commit after each prompt. Fast and simple, bypasses hooks with --no-verify.
              </p>
            </div>
          </label>

          {/* Disabled Mode */}
          <label className="relative flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <input
              type="radio"
              name="commitMode"
              value="disabled"
              checked={localSettings.mode === 'disabled'}
              onChange={() => handleModeChange('disabled')}
              className="mt-1 mr-3"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span className="font-medium text-gray-900 dark:text-gray-100">Disabled Mode</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                No auto-commits. You handle all commits manually.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Warning for checkpoint mode */}
      {showWarning && localSettings.mode === 'checkpoint' && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-700 dark:text-amber-300">
              <p className="font-medium">Warning: Pre-commit hooks detected</p>
              <p className="text-xs mt-1">
                Checkpoint commits will bypass pre-commit hooks. This may cause CI failures.
                Consider using Structured mode for this project.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mode-specific settings */}
      {localSettings.mode === 'structured' && (
        <div className="space-y-3 pt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Commit Prompt Template
            </label>
            <textarea
              value={localSettings.structuredPromptTemplate || DEFAULT_STRUCTURED_PROMPT_TEMPLATE}
              onChange={(e) => handleSettingChange('structuredPromptTemplate', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 text-sm"
              placeholder="Instructions for Claude on how to commit..."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This will be appended to Claude's prompts to guide commit behavior.
            </p>
          </div>

        </div>
      )}

      {localSettings.mode === 'checkpoint' && (
        <div className="pt-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Commit Prefix
          </label>
          <input
            type="text"
            value={localSettings.checkpointPrefix || DEFAULT_COMMIT_MODE_SETTINGS.checkpointPrefix}
            onChange={(e) => handleSettingChange('checkpointPrefix', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
            placeholder="checkpoint: "
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Prefix for automatic checkpoint commits.
          </p>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from 'react';
import { GitCommit, Shield, Zap, AlertTriangle, Info } from 'lucide-react';
import type { CommitMode, CommitModeSettings, ProjectCharacteristics } from '../../../shared/types';
import { DEFAULT_STRUCTURED_PROMPT_TEMPLATE, DEFAULT_COMMIT_MODE_SETTINGS } from '../../../shared/types';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Checkbox } from './ui/Input';
import { cn } from '../utils/cn';

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
        .catch((error: unknown) => {
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
        .catch((error: unknown) => {
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
        <label className="block text-sm font-medium text-text-primary mb-2">
          Commit Mode
        </label>
        
        {/* Recommendation Banner */}
        {characteristics && !loadingCharacteristics && (
          <Card variant="bordered" className="mb-3 bg-interactive/10 border-interactive/30" padding="sm">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-interactive mt-0.5 flex-shrink-0" />
              <div className="text-sm text-interactive">
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
          </Card>
        )}

        <div className="space-y-2">
          {/* Structured Mode */}
          <Card 
            variant="interactive"
            className={cn(
              "cursor-pointer transition-all",
              localSettings.mode === 'structured' 
                ? "bg-interactive/10 border-interactive" 
                : "hover:border-interactive/30"
            )}
            onClick={() => handleModeChange('structured')}
            padding="md"
          >
            <label className="relative flex items-start cursor-pointer">
              <input
                type="radio"
                name="commitMode"
                value="structured"
                checked={localSettings.mode === 'structured'}
                onChange={() => handleModeChange('structured')}
                className="mt-1 mr-3 text-interactive focus:ring-interactive"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-interactive" />
                  <span className="font-medium text-text-primary">Structured Mode</span>
                  {characteristics?.suggestedMode === 'structured' && (
                    <Badge variant="primary" size="sm">
                      Recommended
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-text-secondary mt-1">
                  Claude creates commits with proper messages. Respects pre-commit hooks and project conventions.
                </p>
              </div>
            </label>
          </Card>

          {/* Checkpoint Mode */}
          <Card 
            variant="interactive"
            className={cn(
              "cursor-pointer transition-all",
              localSettings.mode === 'checkpoint' 
                ? "bg-status-success/10 border-status-success" 
                : "hover:border-status-success/30"
            )}
            onClick={() => handleModeChange('checkpoint')}
            padding="md"
          >
            <label className="relative flex items-start cursor-pointer">
              <input
                type="radio"
                name="commitMode"
                value="checkpoint"
                checked={localSettings.mode === 'checkpoint'}
                onChange={() => handleModeChange('checkpoint')}
                className="mt-1 mr-3 text-status-success focus:ring-status-success"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-status-success" />
                  <span className="font-medium text-text-primary">Checkpoint Mode</span>
                  {characteristics?.suggestedMode === 'checkpoint' && (
                    <Badge variant="success" size="sm">
                      Recommended
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-text-secondary mt-1">
                  Auto-commit after each prompt. Fast and simple, bypasses hooks with --no-verify.
                </p>
              </div>
            </label>
          </Card>

          {/* Disabled Mode */}
          <Card 
            variant="interactive"
            className={cn(
              "cursor-pointer transition-all",
              localSettings.mode === 'disabled' 
                ? "bg-surface-tertiary border-border-secondary" 
                : "hover:border-border-primary"
            )}
            onClick={() => handleModeChange('disabled')}
            padding="md"
          >
            <label className="relative flex items-start cursor-pointer">
              <input
                type="radio"
                name="commitMode"
                value="disabled"
                checked={localSettings.mode === 'disabled'}
                onChange={() => handleModeChange('disabled')}
                className="mt-1 mr-3 text-text-tertiary focus:ring-text-tertiary"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <GitCommit className="w-4 h-4 text-text-muted" />
                  <span className="font-medium text-text-primary">Disabled Mode</span>
                </div>
                <p className="text-sm text-text-secondary mt-1">
                  No auto-commits. You handle all commits manually.
                </p>
              </div>
            </label>
          </Card>
        </div>
      </div>

      {/* Warning for checkpoint mode */}
      {showWarning && localSettings.mode === 'checkpoint' && (
        <Card variant="bordered" className="bg-status-warning/10 border-status-warning/30" padding="sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 flex-shrink-0" />
            <div className="text-sm text-status-warning">
              <p className="font-medium">Warning: Pre-commit hooks detected</p>
              <p className="text-xs mt-1 opacity-90">
                Checkpoint commits will bypass pre-commit hooks. This may cause CI failures.
                Consider using Structured mode for this project.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Mode-specific settings */}
      {localSettings.mode === 'structured' && (
        <div className="space-y-3 pt-2">
          <Textarea
            label="Commit Prompt Template"
            value={localSettings.structuredPromptTemplate || DEFAULT_STRUCTURED_PROMPT_TEMPLATE}
            onChange={(e) => handleSettingChange('structuredPromptTemplate', e.target.value)}
            rows={4}
            placeholder="Instructions for Claude on how to commit..."
            helperText="This will be appended to Claude's prompts to guide commit behavior."
            fullWidth
          />

          <Checkbox
            id="allowClaudeTools"
            label="Allow Claude to run tools (e.g., pnpm changeset)"
            checked={localSettings.allowClaudeTools || false}
            onChange={(e) => handleSettingChange('allowClaudeTools', e.target.checked)}
          />
        </div>
      )}

      {localSettings.mode === 'checkpoint' && (
        <div className="pt-2">
          <Input
            label="Commit Prefix"
            value={localSettings.checkpointPrefix || DEFAULT_COMMIT_MODE_SETTINGS.checkpointPrefix}
            onChange={(e) => handleSettingChange('checkpointPrefix', e.target.value)}
            placeholder="checkpoint: "
            helperText="Prefix for automatic checkpoint commits."
            fullWidth
          />
        </div>
      )}
    </div>
  );
}
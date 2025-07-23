import { useState, useEffect } from 'react';
import { NotificationSettings } from './NotificationSettings';
import { StravuConnection } from './StravuConnection';
import { useNotifications } from '../hooks/useNotifications';
import { API } from '../utils/api';
import type { AppConfig } from '../types/config';
import { Shield, ShieldOff, Sun, Moon } from 'lucide-react';
import { Input, Textarea, Checkbox } from './ui/Input';
import { Button } from './ui/Button';
import { useTheme } from '../contexts/ThemeContext';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [_config, setConfig] = useState<AppConfig | null>(null);
  const [verbose, setVerbose] = useState(false);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [claudeExecutablePath, setClaudeExecutablePath] = useState('');
  const [defaultPermissionMode, setDefaultPermissionMode] = useState<'approve' | 'ignore'>('ignore');
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(true);
  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    playSound: true,
    notifyOnStatusChange: true,
    notifyOnWaiting: true,
    notifyOnComplete: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'stravu'>('general');
  const { updateSettings } = useNotifications();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  const fetchConfig = async () => {
    try {
      const response = await API.config.get();
      if (!response.success) throw new Error(response.error || 'Failed to fetch config');
      const data = response.data;
      setConfig(data);
      setVerbose(data.verbose || false);
      setAnthropicApiKey(data.anthropicApiKey || '');
      setGlobalSystemPrompt(data.systemPromptAppend || '');
      setClaudeExecutablePath(data.claudeExecutablePath || '');
      setDefaultPermissionMode(data.defaultPermissionMode || 'ignore');
      setAutoCheckUpdates(data.autoCheckUpdates !== false); // Default to true
      
      // Load notification settings
      if (data.notifications) {
        setNotificationSettings(data.notifications);
        // Update the useNotifications hook with loaded settings
        updateSettings(data.notifications);
      }
    } catch (err) {
      setError('Failed to load configuration');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await API.config.update({ 
        verbose, 
        anthropicApiKey, 
        systemPromptAppend: globalSystemPrompt, 
        claudeExecutablePath,
        defaultPermissionMode,
        autoCheckUpdates,
        notifications: notificationSettings
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update configuration');
      }

      // Update the useNotifications hook with new settings
      updateSettings(notificationSettings);

      // Refresh config from server
      await fetchConfig();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-modal-overlay flex items-center justify-center z-50">
      <div className="bg-surface-primary rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-border-primary">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-primary">
          <h2 className="text-xl font-bold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Tabs */}
          <div className="flex border-b border-border-primary mb-6">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'general'
                ? 'text-interactive border-b-2 border-interactive'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'notifications'
                ? 'text-interactive border-b-2 border-interactive'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            Notifications
          </button>
          <button
            onClick={() => setActiveTab('stravu')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'stravu'
                ? 'text-interactive border-b-2 border-interactive'
                : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            Stravu Integration
          </button>
        </div>

        {activeTab === 'general' && (
          <form id="settings-form" onSubmit={handleSubmit} className="space-y-4">

          <div>
            <Checkbox
              label="Enable verbose logging"
              checked={verbose}
              onChange={(e) => setVerbose(e.target.checked)}
            />
            <p className="text-xs text-text-muted mt-1">
              Shows detailed logs for debugging session creation and Claude Code execution
            </p>
          </div>

          {/* Theme toggle */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Theme
            </label>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center space-x-3 px-4 py-2 bg-surface-secondary hover:bg-surface-hover rounded-md transition-colors"
            >
              {theme === 'light' ? (
                <>
                  <Sun className="w-5 h-5 text-status-warning" />
                  <span className="text-text-primary">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-5 h-5 text-interactive" />
                  <span className="text-text-primary">Dark Mode</span>
                </>
              )}
            </button>
            <p className="text-xs text-text-tertiary mt-1">
              Toggle between light and dark theme
            </p>
          </div>

          <Input
            label="Anthropic API Key (Optional)"
            type="password"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder="sk-ant-..."
            fullWidth
            helperText="Used for auto-generating session names with AI (NOT for Claude Code itself). If not provided, fallback names will be used."
          />

          <Textarea
            label="Global System Prompt (Optional)"
            value={globalSystemPrompt}
            onChange={(e) => setGlobalSystemPrompt(e.target.value)}
            placeholder="Additional instructions to append to every prompt..."
            rows={3}
            fullWidth
            helperText="This text will be automatically appended to every initial prompt sent to Claude Code across ALL projects. For project-specific prompts, use the project settings."
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Default Permission Mode
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="defaultPermissionMode"
                  value="ignore"
                  checked={defaultPermissionMode === 'ignore'}
                  onChange={(e) => setDefaultPermissionMode(e.target.value as 'ignore' | 'approve')}
                  className="text-interactive"
                />
                <div className="flex items-center gap-2">
                  <ShieldOff className="w-4 h-4 text-text-tertiary" />
                  <span className="text-sm text-text-secondary">Skip Permissions (Default)</span>
                  <span className="text-xs text-text-tertiary">(faster, less secure)</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="defaultPermissionMode"
                  value="approve"
                  checked={defaultPermissionMode === 'approve'}
                  onChange={(e) => setDefaultPermissionMode(e.target.value as 'ignore' | 'approve')}
                  className="text-interactive"
                />
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-status-success" />
                  <span className="text-sm text-text-secondary">Approve Actions</span>
                  <span className="text-xs text-text-tertiary">(safer, interactive)</span>
                </div>
              </label>
            </div>
            <p className="text-xs text-text-tertiary mt-2">
              When enabled, Claude will ask for permission before performing potentially dangerous actions. This sets the default for new sessions.
            </p>
          </div>

          <div>
            <label htmlFor="claudeExecutablePath" className="block text-sm font-medium text-text-secondary mb-1">
              Claude Executable Path (Optional)
            </label>
            <div className="flex gap-2">
              <input
                id="claudeExecutablePath"
                type="text"
                value={claudeExecutablePath}
                onChange={(e) => setClaudeExecutablePath(e.target.value)}
                className="flex-1 px-3 py-2 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary"
                placeholder="/usr/local/bin/claude"
              />
              <button
                type="button"
                onClick={async () => {
                  const result = await API.dialog.openFile({
                    title: 'Select Claude Executable',
                    buttonLabel: 'Select',
                    properties: ['openFile'],
                    filters: [
                      { name: 'Executables', extensions: ['*'] }
                    ]
                  });
                  if (result.success && result.data) {
                    setClaudeExecutablePath(result.data);
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface-tertiary border border-border-primary rounded-md hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-interactive"
              >
                Browse
              </button>
            </div>
            <p className="text-xs text-text-tertiary mt-1">
              Full path to the claude executable. Leave empty to use the claude command from PATH. This is useful if Claude is installed in a non-standard location.
            </p>
          </div>

          <div>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={autoCheckUpdates}
                    onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                    className="rounded border-border-primary text-interactive focus:ring-interactive"
                  />
                  <span className="text-sm font-medium text-text-secondary">Check for updates automatically</span>
                </label>
                <p className="text-xs text-text-tertiary mt-1">
                  Automatically check for new Crystal releases on GitHub every 24 hours. You'll be notified when updates are available.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const response = await API.checkForUpdates();
                    if (response.success && response.data) {
                      if (response.data.hasUpdate) {
                        // Update will be shown via the version update event
                      } else {
                        alert('You are running the latest version of Crystal!');
                      }
                    }
                  } catch (error) {
                    console.error('Failed to check for updates:', error);
                    alert('Failed to check for updates. Please try again later.');
                  }
                }}
                className="ml-4 px-3 py-1 text-sm font-medium text-interactive hover:text-interactive-hover focus:outline-none"
              >
                Check Now
              </button>
            </div>
          </div>


          {error && (
            <div className="text-status-error text-sm">{error}</div>
          )}
          </form>
        )}
        
        {activeTab === 'notifications' && (
          <NotificationSettings
            settings={notificationSettings}
            onUpdateSettings={(updates) => {
              setNotificationSettings(prev => ({ ...prev, ...updates }));
            }}
          />
        )}
        
        {activeTab === 'stravu' && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <img 
                src="./stravu-logo.png" 
                alt="Stravu Logo" 
                className="w-16 h-16 object-contain flex-shrink-0"
              />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-text-primary mb-2">
                  Stravu - The way AI-first teams collaborate
                </h2>
                <p className="text-sm text-text-tertiary mb-3">
                  Connect Crystal to your Stravu workspace to seamlessly integrate your team's knowledge and documentation into your AI-powered development workflow.
                </p>
                <a 
                  href="https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-interactive hover:text-interactive-hover text-sm font-medium inline-flex items-center gap-1"
                >
                  Learn more about Stravu
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
            <div className="border-t border-border-primary pt-6">
              <StravuConnection />
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        {(activeTab === 'general' || activeTab === 'notifications') && (
          <div className="flex justify-end space-x-3 p-6 border-t border-border-primary">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type={activeTab === 'general' ? 'submit' : 'button'}
              form={activeTab === 'general' ? 'settings-form' : undefined}
              onClick={activeTab === 'notifications' ? (e) => handleSubmit(e as any) : undefined}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
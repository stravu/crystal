import { useState, useEffect } from 'react';
import { NotificationSettings } from './NotificationSettings';
import { StravuConnection } from './StravuConnection';
import { useNotifications } from '../hooks/useNotifications';
import { API } from '../utils/api';
import type { AppConfig } from '../types/config';
import { Shield, ShieldOff } from 'lucide-react';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'notifications'>('general');
  const { settings, updateSettings } = useNotifications();

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
        autoCheckUpdates
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update configuration');
      }

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'general'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'notifications'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Notifications
          </button>
        </div>

        {activeTab === 'general' ? (
          <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={verbose}
                onChange={(e) => setVerbose(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Enable verbose logging</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Shows detailed logs for debugging session creation and Claude Code execution
            </p>
          </div>

          <div>
            <label htmlFor="anthropicApiKey" className="block text-sm font-medium text-gray-700 mb-1">
              Anthropic API Key (Optional)
            </label>
            <input
              id="anthropicApiKey"
              type="password"
              value={anthropicApiKey}
              onChange={(e) => setAnthropicApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Used for auto-generating session names with AI (NOT for Claude Code itself). If not provided, fallback names will be used.
            </p>
          </div>

          <div>
            <label htmlFor="globalSystemPrompt" className="block text-sm font-medium text-gray-700 mb-1">
              Global System Prompt (Optional)
            </label>
            <textarea
              id="globalSystemPrompt"
              value={globalSystemPrompt}
              onChange={(e) => setGlobalSystemPrompt(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="Additional instructions to append to every prompt..."
              rows={3}
            />
            <p className="text-xs text-gray-500 mt-1">
              This text will be automatically appended to every initial prompt sent to Claude Code across ALL projects. For project-specific prompts, use the project settings.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="text-blue-600"
                />
                <div className="flex items-center gap-2">
                  <ShieldOff className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-900">Skip Permissions</span>
                  <span className="text-xs text-gray-500">(faster, less secure)</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="defaultPermissionMode"
                  value="approve"
                  checked={defaultPermissionMode === 'approve'}
                  onChange={(e) => setDefaultPermissionMode(e.target.value as 'ignore' | 'approve')}
                  className="text-blue-600"
                />
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-900">Manual Approval</span>
                  <span className="text-xs text-gray-500">(safer, interactive)</span>
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              When enabled, Claude will ask for permission before performing potentially dangerous actions. This sets the default for new sessions.
            </p>
          </div>

          <div>
            <label htmlFor="claudeExecutablePath" className="block text-sm font-medium text-gray-700 mb-1">
              Claude Executable Path (Optional)
            </label>
            <div className="flex gap-2">
              <input
                id="claudeExecutablePath"
                type="text"
                value={claudeExecutablePath}
                onChange={(e) => setClaudeExecutablePath(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Browse
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Full path to the claude executable. Leave empty to use the claude command from PATH. This is useful if Claude is installed in a non-standard location.
            </p>
          </div>

          {/* Stravu Integration Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Stravu Integration</h3>
            <StravuConnection />
          </div>
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoCheckUpdates}
                onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Check for updates automatically</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Automatically check for new Crystal releases on GitHub every 24 hours. You'll be notified when updates are available.
            </p>
          </div>
          {/* Stravu Integration Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Stravu Integration</h3>
            <StravuConnection />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <NotificationSettings
            settings={settings}
            onUpdateSettings={updateSettings}
          />
        )}
      </div>
    </div>
  );
}
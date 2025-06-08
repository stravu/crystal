import { useState, useEffect } from 'react';
import { NotificationSettings } from './NotificationSettings';
import { useNotifications } from '../hooks/useNotifications';
import { API } from '../utils/api';
import type { AppConfig } from '../types/config';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [_config, setConfig] = useState<AppConfig | null>(null);
  const [verbose, setVerbose] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [claudeExecutablePath, setClaudeExecutablePath] = useState('');
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
      setOpenaiApiKey(data.openaiApiKey || '');
      setGlobalSystemPrompt(data.systemPromptAppend || '');
      setClaudeExecutablePath(data.claudeExecutablePath || '');
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
        openaiApiKey, 
        systemPromptAppend: globalSystemPrompt, 
        claudeExecutablePath 
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
            <label htmlFor="openaiApiKey" className="block text-sm font-medium text-gray-700 mb-1">
              OpenAI API Key (Optional)
            </label>
            <input
              id="openaiApiKey"
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="sk-..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Required for auto-generating worktree names with AI. If not provided, fallback names will be used.
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
            <label htmlFor="claudeExecutablePath" className="block text-sm font-medium text-gray-700 mb-1">
              Claude Executable Path (Optional)
            </label>
            <input
              id="claudeExecutablePath"
              type="text"
              value={claudeExecutablePath}
              onChange={(e) => setClaudeExecutablePath(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
              placeholder="/usr/local/bin/claude"
            />
            <p className="text-xs text-gray-500 mt-1">
              Full path to the claude executable. Leave empty to use the claude command from PATH. This is useful if Claude is installed in a non-standard location.
            </p>
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
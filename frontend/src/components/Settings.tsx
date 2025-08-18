import { useState, useEffect } from 'react';
import { NotificationSettings } from './NotificationSettings';
import { StravuConnection } from './StravuConnection';
import { useNotifications } from '../hooks/useNotifications';
import { API } from '../utils/api';
import type { AppConfig } from '../types/config';
import { useConfigStore } from '../stores/configStore';
import { 
  Shield, 
  ShieldOff, 
  Sun, 
  Moon, 
  Settings as SettingsIcon,
  Palette,
  Zap,
  RefreshCw,
  FileText,
  Eye
} from 'lucide-react';
import { Input, Textarea, Checkbox } from './ui/Input';
import { Button } from './ui/Button';
import { useTheme } from '../contexts/ThemeContext';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { CollapsibleCard } from './ui/CollapsibleCard';
import { SettingsSection } from './ui/SettingsSection';

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
  const [devMode, setDevMode] = useState(false);
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
  const { fetchConfig: refreshConfigStore } = useConfigStore();

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
      setDevMode(data.devMode || false);
      
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
        devMode,
        notifications: notificationSettings
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update configuration');
      }

      // Update the useNotifications hook with new settings
      updateSettings(notificationSettings);

      // Refresh config from server
      await fetchConfig();
      
      // Also refresh the global config store
      await refreshConfigStore();
      
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
      <ModalHeader 
        title="Crystal Settings" 
        icon={<SettingsIcon className="w-5 h-5" />}
        onClose={onClose}
      />

      <ModalBody>
        {/* Tabs */}
        <div className="flex border-b border-border-primary mb-8">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'notifications'
                ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            Notifications
          </button>
          <button
            onClick={() => setActiveTab('stravu')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'stravu'
                ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            Stravu Integration
          </button>
        </div>

        {activeTab === 'general' && (
          <form id="settings-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Appearance */}
            <CollapsibleCard
              title="Appearance & Theme"
              subtitle="Customize how Crystal looks and feels"
              icon={<Palette className="w-5 h-5" />}
              defaultExpanded={true}
            >
              <SettingsSection
                title="Theme Mode"
                description="Choose between light and dark theme"
                icon={theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              >
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center gap-3 px-4 py-3 bg-surface-secondary hover:bg-surface-hover rounded-lg transition-colors border border-border-secondary w-full"
                >
                  {theme === 'light' ? (
                    <>
                      <Sun className="w-5 h-5 text-status-warning" />
                      <span className="text-text-primary font-medium">Light Mode</span>
                      <span className="ml-auto text-xs text-text-tertiary">Currently active</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-5 h-5 text-interactive" />
                      <span className="text-text-primary font-medium">Dark Mode</span>
                      <span className="ml-auto text-xs text-text-tertiary">Currently active</span>
                    </>
                  )}
                </button>
              </SettingsSection>
            </CollapsibleCard>

            {/* AI Integration */}
            <CollapsibleCard
              title="AI Integration"
              subtitle="Configure Claude integration and smart features"
              icon={<Zap className="w-5 h-5" />}
              defaultExpanded={true}
            >
              <SettingsSection
                title="Smart Session Names"
                description="Let Claude automatically generate meaningful names for your sessions"
                icon={<FileText className="w-4 h-4" />}
              >
                <Input
                  label="Anthropic API Key"
                  type="password"
                  value={anthropicApiKey}
                  onChange={(e) => setAnthropicApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  fullWidth
                  helperText="Optional: Used only for generating session names. Your main Claude Code API key is separate."
                />
              </SettingsSection>

              <SettingsSection
                title="Default Security Mode"
                description="How Claude should handle potentially risky operations"
                icon={defaultPermissionMode === 'approve' ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
              >
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-surface-hover transition-colors border border-border-secondary">
                    <input
                      type="radio"
                      name="defaultPermissionMode"
                      value="ignore"
                      checked={defaultPermissionMode === 'ignore'}
                      onChange={(e) => setDefaultPermissionMode(e.target.value as 'ignore' | 'approve')}
                      className="text-interactive mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldOff className="w-4 h-4 text-text-tertiary" />
                        <span className="text-sm font-medium text-text-primary">Fast & Flexible</span>
                        <span className="ml-auto px-2 py-0.5 text-xs bg-status-warning/20 text-status-warning rounded-full">Default</span>
                      </div>
                      <p className="text-xs text-text-tertiary leading-relaxed">
                        Claude executes commands quickly without asking permission. Great for development workflows.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-surface-hover transition-colors border border-border-secondary">
                    <input
                      type="radio"
                      name="defaultPermissionMode"
                      value="approve"
                      checked={defaultPermissionMode === 'approve'}
                      onChange={(e) => setDefaultPermissionMode(e.target.value as 'ignore' | 'approve')}
                      className="text-interactive mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-4 h-4 text-status-success" />
                        <span className="text-sm font-medium text-text-primary">Secure & Controlled</span>
                      </div>
                      <p className="text-xs text-text-tertiary leading-relaxed">
                        Claude asks for your approval before running potentially risky commands. Safer for production code.
                      </p>
                    </div>
                  </label>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Global Instructions"
                description="Add custom instructions that apply to all your projects"
                icon={<FileText className="w-4 h-4" />}
              >
                <Textarea
                  label="Global System Prompt"
                  value={globalSystemPrompt}
                  onChange={(e) => setGlobalSystemPrompt(e.target.value)}
                  placeholder="Always use TypeScript... Follow our team's coding standards..."
                  rows={3}
                  fullWidth
                  helperText="These instructions will be added to every Claude session across all projects."
                />
              </SettingsSection>
            </CollapsibleCard>

            {/* System Updates */}
            <CollapsibleCard
              title="Updates & Maintenance"
              subtitle="Keep Crystal up to date with the latest features"
              icon={<RefreshCw className="w-5 h-5" />}
              defaultExpanded={false}
            >
              <SettingsSection
                title="Automatic Updates"
                description="Stay current with new features and bug fixes"
                icon={<RefreshCw className="w-4 h-4" />}
              >
                <div className="flex items-center justify-between p-3 bg-surface-secondary rounded-lg border border-border-secondary">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      label="Check for updates automatically"
                      checked={autoCheckUpdates}
                      onChange={(e) => setAutoCheckUpdates(e.target.checked)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
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
                  >
                    Check Now
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary mt-2">
                  We check GitHub for new releases every 24 hours. Updates require manual installation.
                </p>
              </SettingsSection>
            </CollapsibleCard>

            {/* Advanced Options */}
            <CollapsibleCard
              title="Advanced Options"
              subtitle="Technical settings for power users"
              icon={<Eye className="w-5 h-5" />}
              defaultExpanded={false}
              variant="subtle"
            >
              <SettingsSection
                title="Debugging"
                description="Enable detailed logging for troubleshooting"
                icon={<FileText className="w-4 h-4" />}
              >
                <Checkbox
                  label="Enable verbose logging"
                  checked={verbose}
                  onChange={(e) => setVerbose(e.target.checked)}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  Shows detailed logs for session creation and Claude Code execution. Useful for debugging issues.
                </p>
                
                <div className="mt-4">
                  <Checkbox
                    label="Enable dev mode"
                    checked={devMode}
                    onChange={(e) => setDevMode(e.target.checked)}
                  />
                  <p className="text-xs text-text-tertiary mt-1">
                    Adds a "Messages" tab to each session showing raw JSON responses from Claude Code. Useful for debugging and development.
                  </p>
                </div>
              </SettingsSection>

              <SettingsSection
                title="Custom Claude Installation"
                description="Override the default Claude executable path"
                icon={<FileText className="w-4 h-4" />}
              >
                <div className="flex gap-2">
                  <input
                    id="claudeExecutablePath"
                    type="text"
                    value={claudeExecutablePath}
                    onChange={(e) => setClaudeExecutablePath(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary"
                    placeholder="/usr/local/bin/claude"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
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
                  >
                    Browse
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary mt-1">
                  Leave empty to use the 'claude' command from your system PATH.
                </p>
              </SettingsSection>
            </CollapsibleCard>

            {error && (
              <div className="text-status-error text-sm bg-status-error/10 border border-status-error/30 rounded-lg p-4">
                {error}
              </div>
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
            {/* Stravu Introduction */}
            <CollapsibleCard
              title="About Stravu Integration"
              subtitle="Connect your team's knowledge to your AI workflow"
              icon={
                <img 
                  src="./stravu-logo.png" 
                  alt="Stravu Logo" 
                  className="w-5 h-5 object-contain"
                />
              }
              defaultExpanded={true}
              variant="subtle"
            >
              <div className="space-y-4">
                <p className="text-sm text-text-secondary leading-relaxed">
                  Stravu is the knowledge platform for AI-first teams. Connect Crystal to your Stravu workspace to give Claude access to your team's documentation, best practices, and institutional knowledge.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-surface-tertiary rounded-lg">
                    <h4 className="font-medium text-text-primary mb-1">🚀 Smart Context</h4>
                    <p className="text-text-tertiary">Claude automatically pulls relevant docs and standards</p>
                  </div>
                  <div className="p-3 bg-surface-tertiary rounded-lg">
                    <h4 className="font-medium text-text-primary mb-1">👥 Team Alignment</h4>
                    <p className="text-text-tertiary">Ensure AI follows your team's patterns and conventions</p>
                  </div>
                  <div className="p-3 bg-surface-tertiary rounded-lg">
                    <h4 className="font-medium text-text-primary mb-1">📚 Knowledge Base</h4>
                    <p className="text-text-tertiary">Surface relevant documentation during development</p>
                  </div>
                  <div className="p-3 bg-surface-tertiary rounded-lg">
                    <h4 className="font-medium text-text-primary mb-1">🔄 Always Current</h4>
                    <p className="text-text-tertiary">Real-time sync with your latest team knowledge</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border-secondary">
                  <a 
                    href="https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-interactive hover:text-interactive-hover text-sm inline-flex items-center gap-2 font-medium transition-colors"
                  >
                    Learn more about Stravu
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <span className="text-xs text-text-tertiary">
                    Made by the Crystal team
                  </span>
                </div>
              </div>
            </CollapsibleCard>

            {/* Connection Management */}
            <CollapsibleCard
              title="Connection Management"
              subtitle="Connect and manage your Stravu workspace integration"
              icon={<Zap className="w-5 h-5" />}
              defaultExpanded={true}
            >
              <StravuConnection />
            </CollapsibleCard>
          </div>
        )}
      </ModalBody>

      {/* Footer */}
      {(activeTab === 'general' || activeTab === 'notifications') && (
        <ModalFooter>
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
            variant="primary"
          >
            Save Changes
          </Button>
        </ModalFooter>
      )}
    </Modal>
  );
}
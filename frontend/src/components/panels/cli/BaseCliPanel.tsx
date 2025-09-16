import React, { useState, useCallback, useMemo } from 'react';
import { Settings, HelpCircle, Download, RefreshCw, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
// import { ToolPanel } from '../../../../../shared/types/panels';
import { 
  CliPanel, 
  CliViewMode, 
  CliPanelSettings, 
  CliPanelConfig, 
  getCliPanelConfig,
  CliProcessStatus 
} from '../../../../../shared/types/cliPanels';

/**
 * Props for the base CLI panel component
 */
export interface BaseCliPanelProps {
  /** The panel data */
  panel: CliPanel;
  
  /** Whether this panel is currently active */
  isActive: boolean;
  
  /** CLI tool ID (claude, aider, etc.) */
  cliToolId: string;
  
  /** Current view mode */
  viewMode: CliViewMode;
  
  /** View mode change handler */
  onViewModeChange: (mode: CliViewMode) => void;
  
  /** Panel settings */
  settings: CliPanelSettings;
  
  /** Settings change handler */
  onSettingsChange: (settings: CliPanelSettings) => void;
  
  /** Children render function for tool-specific content */
  children: (props: BaseCliPanelChildProps) => React.ReactNode;
  
  /** Optional custom header content */
  headerContent?: React.ReactNode;
  
  /** Optional custom footer content */
  footerContent?: React.ReactNode;
  
  /** Error state */
  error?: string | null;
  
  /** Loading state */
  isLoading?: boolean;
  
  /** Process status */
  processStatus?: CliProcessStatus;
  
  /** Action handlers */
  onRefresh?: () => void;
  onExport?: () => void;
  onHelp?: () => void;
  onRestart?: () => void;
}

/**
 * Props passed to child components
 */
export interface BaseCliPanelChildProps {
  /** Panel ID */
  panelId: string;
  
  /** CLI tool ID */
  cliToolId: string;
  
  /** Current view mode */
  viewMode: CliViewMode;
  
  /** Panel settings */
  settings: CliPanelSettings;
  
  /** Whether panel is active */
  isActive: boolean;
  
  /** Process status */
  processStatus?: CliProcessStatus;
  
  /** CLI panel configuration */
  config: CliPanelConfig;
}

/**
 * Status indicator component
 */
const StatusIndicator: React.FC<{ status?: CliProcessStatus }> = ({ status }) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'initializing':
        return { icon: RefreshCw, color: 'text-blue-500', label: 'Initializing...', spinning: true };
      case 'ready':
        return { icon: CheckCircle, color: 'text-green-500', label: 'Ready' };
      case 'processing':
        return { icon: Zap, color: 'text-yellow-500', label: 'Processing...', spinning: true };
      case 'waiting':
        return { icon: Clock, color: 'text-blue-500', label: 'Waiting for input' };
      case 'error':
        return { icon: AlertCircle, color: 'text-red-500', label: 'Error' };
      case 'stopped':
        return { icon: AlertCircle, color: 'text-gray-500', label: 'Stopped' };
      case 'restarting':
        return { icon: RefreshCw, color: 'text-orange-500', label: 'Restarting...', spinning: true };
      default:
        return { icon: AlertCircle, color: 'text-gray-400', label: 'Unknown' };
    }
  };

  const { icon: Icon, color, label, spinning } = getStatusInfo();

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon 
        className={`w-3.5 h-3.5 ${color} ${spinning ? 'animate-spin' : ''}`} 
      />
      <span className={`${color} font-medium`}>{label}</span>
    </div>
  );
};

/**
 * View mode selector component
 */
const ViewModeSelector: React.FC<{
  currentMode: CliViewMode;
  availableModes: CliViewMode[];
  onChange: (mode: CliViewMode) => void;
}> = ({ currentMode, availableModes, onChange }) => {
  const getModeLabel = (mode: CliViewMode) => {
    switch (mode) {
      case 'output': return 'Output';
      case 'messages': return 'Messages';
      case 'stats': return 'Stats';
      case 'settings': return 'Settings';
      case 'help': return 'Help';
      default: return mode;
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
        View
      </span>
      <div className="inline-flex rounded-lg bg-surface-secondary p-0.5">
        {availableModes.map((mode) => (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              currentMode === mode
                ? 'bg-bg-primary text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {getModeLabel(mode)}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Action button component
 */
const ActionButton: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
}> = ({ icon: Icon, label, onClick, isActive, disabled, variant = 'default' }) => {
  const getButtonClasses = () => {
    const base = 'px-2 py-1 rounded-md text-xs transition-all flex items-center gap-1.5';
    
    if (disabled) {
      return `${base} text-text-disabled cursor-not-allowed opacity-50`;
    }
    
    if (isActive) {
      return `${base} bg-surface-hover text-text-primary`;
    }
    
    switch (variant) {
      case 'primary':
        return `${base} text-text-primary hover:bg-surface-hover bg-primary-subtle`;
      case 'danger':
        return `${base} text-red-500 hover:bg-red-50 hover:text-red-600`;
      default:
        return `${base} text-text-secondary hover:text-text-primary hover:bg-surface-hover`;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={getButtonClasses()}
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{label}</span>
    </button>
  );
};

/**
 * Base CLI panel component providing common UI elements and functionality
 * 
 * This component serves as the foundation for all CLI tool panels (Claude, Aider, etc.)
 * providing consistent header, view management, settings, and error handling.
 */
export const BaseCliPanel: React.FC<BaseCliPanelProps> = ({
  panel,
  isActive,
  cliToolId,
  viewMode,
  onViewModeChange,
  settings,
  onSettingsChange,
  children,
  headerContent,
  footerContent,
  error,
  isLoading,
  processStatus,
  onRefresh,
  onExport,
  onHelp
}) => {
  const [showSettings, setShowSettings] = useState(false);
  
  // Get CLI panel configuration
  const config = useMemo(() => getCliPanelConfig(cliToolId), [cliToolId]);
  
  // Filter available view modes based on config and features
  const availableViewModes = useMemo(() => {
    let modes = config.display.availableViewModes || ['output'];
    
    // Remove modes that aren't supported by the current configuration
    if (!config.features.settingsPanel) {
      modes = modes.filter(m => m !== 'settings');
    }
    if (!config.features.statsView) {
      modes = modes.filter(m => m !== 'stats');
    }
    if (!config.features.helpDocumentation) {
      modes = modes.filter(m => m !== 'help');
    }
    
    return modes;
  }, [config]);

  // Handle settings panel toggle
  const handleSettingsToggle = useCallback(() => {
    if (viewMode === 'settings') {
      // If settings view is active, go back to previous view
      onViewModeChange('output');
    } else {
      setShowSettings(!showSettings);
    }
  }, [viewMode, showSettings, onViewModeChange]);

  // Handle error display
  const errorContent = error && (
    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            {cliToolId.charAt(0).toUpperCase() + cliToolId.slice(1)} Error
          </p>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">
            {error}
          </p>
        </div>
      </div>
    </div>
  );

  // Prepare child props
  const childProps: BaseCliPanelChildProps = {
    panelId: panel.id,
    cliToolId,
    viewMode,
    settings,
    isActive,
    processStatus,
    config
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-bg-primary">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary bg-surface-primary">
        <div className="flex items-center gap-4">
          {/* View Mode Selector */}
          <ViewModeSelector
            currentMode={viewMode}
            availableModes={availableViewModes}
            onChange={onViewModeChange}
          />
          
          {/* Status Indicator */}
          <StatusIndicator status={processStatus} />
          
          {/* Custom Header Content */}
          {headerContent}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          {onRefresh && (
            <ActionButton
              icon={RefreshCw}
              label="Refresh"
              onClick={onRefresh}
              disabled={isLoading}
            />
          )}
          
          {/* Export Button */}
          {onExport && config.features.exportSupport && (
            <ActionButton
              icon={Download}
              label="Export"
              onClick={onExport}
              disabled={isLoading}
            />
          )}
          
          {/* Help Button */}
          {onHelp && config.features.helpDocumentation && (
            <ActionButton
              icon={HelpCircle}
              label="Help"
              onClick={onHelp}
            />
          )}
          
          {/* Settings Button */}
          {config.features.settingsPanel && (
            <ActionButton
              icon={Settings}
              label="Settings"
              onClick={handleSettingsToggle}
              isActive={showSettings || viewMode === 'settings'}
            />
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2">
          {errorContent}
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-bg-primary bg-opacity-75 flex items-center justify-center z-10">
          <div className="flex items-center gap-2 text-text-secondary">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        {children(childProps)}
      </div>

      {/* Settings Panel Overlay */}
      {showSettings && viewMode !== 'settings' && config.features.settingsPanel && (
        <div className="absolute bottom-0 left-0 right-0 bg-surface-primary border-t border-border-primary shadow-lg">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-primary">
                {config.display.titleTemplate || 'CLI Panel'} Settings
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-text-secondary hover:text-text-primary text-xs"
              >
                Close
              </button>
            </div>
            
            {/* Basic settings UI - can be extended by specific tools */}
            <div className="space-y-3">
              {/* Model Selector */}
              {config.display.showModelSelector && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Model
                  </label>
                  <select 
                    value={settings.defaultModel || 'auto'}
                    onChange={(e) => onSettingsChange({ ...settings, defaultModel: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-bg-primary"
                  >
                    <option value="auto">Auto</option>
                    {/* Tool-specific models would be populated here */}
                  </select>
                </div>
              )}
              
              {/* Permission Controls */}
              {config.display.showPermissionControls && (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Permission Mode
                  </label>
                  <select 
                    value={settings.defaultPermissionMode || 'ignore'}
                    onChange={(e) => onSettingsChange({ 
                      ...settings, 
                      defaultPermissionMode: e.target.value as 'approve' | 'ignore' 
                    })}
                    className="w-full px-2 py-1 text-xs border border-border-primary rounded bg-bg-primary"
                  >
                    <option value="ignore">Skip permissions</option>
                    <option value="approve">Approve permissions</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Footer Content */}
      {footerContent}
    </div>
  );
};

export default BaseCliPanel;
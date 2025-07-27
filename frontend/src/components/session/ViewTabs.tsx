import React from 'react';
import { ViewMode } from '../../hooks/useSessionView';
import { cn } from '../../utils/cn';
import { MessageSquare, GitCompare, Terminal, FileEdit, LayoutDashboard, Eye, Settings } from 'lucide-react';

interface ViewTabsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  unreadActivity: {
    messages: boolean;
    changes: boolean;
    terminal: boolean;
    editor: boolean;
    dashboard: boolean;
    richOutput: boolean;
  };
  setUnreadActivity: (activity: any) => void;
  jsonMessagesCount: number;
  isTerminalRunning: boolean;
  onSettingsClick?: () => void;
  showSettings?: boolean;
}

export const ViewTabs: React.FC<ViewTabsProps> = ({
  viewMode,
  setViewMode,
  unreadActivity,
  setUnreadActivity,
  jsonMessagesCount,
  isTerminalRunning,
  onSettingsClick,
  showSettings,
}) => {
  const tabs: { 
    mode: ViewMode; 
    label: string; 
    icon: React.ReactNode;
    count?: number;
    activity?: boolean;
    status?: boolean;
  }[] = [
    { 
      mode: 'richOutput', 
      label: 'Output', 
      icon: <Eye className="w-4 h-4" />,
      activity: unreadActivity.richOutput 
    },
    { 
      mode: 'messages', 
      label: 'Messages', 
      icon: <MessageSquare className="w-4 h-4" />,
      count: jsonMessagesCount, 
      activity: unreadActivity.messages 
    },
    { 
      mode: 'changes', 
      label: 'Diff', 
      icon: <GitCompare className="w-4 h-4" />,
      activity: unreadActivity.changes 
    },
    { 
      mode: 'terminal', 
      label: 'Terminal', 
      icon: <Terminal className="w-4 h-4" />,
      activity: unreadActivity.terminal, 
      status: isTerminalRunning 
    },
    { 
      mode: 'editor', 
      label: 'Editor', 
      icon: <FileEdit className="w-4 h-4" />,
      activity: unreadActivity.editor 
    },
    { 
      mode: 'dashboard', 
      label: 'Dashboard', 
      icon: <LayoutDashboard className="w-4 h-4" />,
      activity: unreadActivity.dashboard 
    },
  ];

  return (
    <div className="flex items-center px-4 bg-surface-secondary" role="tablist">
      {tabs.map(({ mode, label, icon, count, activity, status }) => (
        <button
          key={mode}
          role="tab"
          aria-selected={viewMode === mode}
          onClick={() => {
            setViewMode(mode);
            setUnreadActivity((prev: any) => ({ ...prev, [mode]: false }));
          }}
          className={cn(
            "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all",
            "border-b-2 hover:text-text-primary",
            viewMode === mode ? [
              "text-text-primary border-interactive",
              "bg-gradient-to-t from-interactive/5 to-transparent"
            ] : [
              "text-text-secondary border-transparent",
              "hover:border-border-secondary hover:bg-surface-hover/50"
            ]
          )}
        >
          {/* Icon */}
          <span className={cn(
            "transition-colors",
            viewMode === mode ? "text-interactive" : "text-text-tertiary"
          )}>
            {icon}
          </span>
          
          {/* Label */}
          <span>{label}</span>
          
          {/* Count */}
          {count !== undefined && count > 0 && (
            <span className={cn(
              "ml-1 px-1.5 py-0.5 text-xs rounded-full",
              viewMode === mode 
                ? "bg-interactive/20 text-interactive" 
                : "bg-surface-tertiary text-text-tertiary"
            )}>
              {count}
            </span>
          )}
          
          {/* Status indicator */}
          {status && (
            <span className="ml-1 inline-block w-2 h-2 bg-status-success rounded-full animate-pulse" />
          )}
          
          {/* Activity indicator */}
          {activity && viewMode !== mode && (
            <span className="absolute top-2 right-2 h-2 w-2 bg-status-error rounded-full animate-pulse" />
          )}
        </button>
      ))}
      
      {/* Settings button - only show for Rich Output view */}
      {viewMode === 'richOutput' && onSettingsClick && (
        <button
          onClick={onSettingsClick}
          className={cn(
            "ml-auto mr-2 px-3 py-2 rounded-md transition-all flex items-center gap-2",
            "text-text-secondary hover:text-text-primary text-sm",
            showSettings ? [
              "bg-surface-hover text-text-primary",
              "ring-1 ring-border-secondary"
            ] : [
              "hover:bg-surface-hover"
            ]
          )}
          title="Configure Rich Output display settings"
        >
          <Settings className="w-4 h-4" />
          <span>Display Settings</span>
        </button>
      )}
    </div>
  );
};
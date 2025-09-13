import React, { useEffect } from 'react';
import { ViewMode } from '../../hooks/useSessionView';
import { cn } from '../../utils/cn';
import { GitCompare, Terminal, FileEdit, Eye, ScrollText, Code } from 'lucide-react';
import { useConfigStore } from '../../stores/configStore';

interface ViewTabsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  unreadActivity: {
    changes: boolean;
    terminal: boolean;
    logs: boolean;
    editor: boolean;
    richOutput: boolean;
    messages?: boolean;
  };
  setUnreadActivity: (activity: any) => void;
  isTerminalRunning: boolean;
}

export const ViewTabs: React.FC<ViewTabsProps> = ({
  viewMode,
  setViewMode,
  unreadActivity,
  setUnreadActivity,
  isTerminalRunning,
}) => {
  const { config, fetchConfig } = useConfigStore();
  
  // Fetch config on mount if not loaded
  useEffect(() => {
    if (!config) {
      fetchConfig();
    }
  }, [config, fetchConfig]);
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
      mode: 'changes', 
      label: 'Diff', 
      icon: <GitCompare className="w-4 h-4" />,
      activity: unreadActivity.changes 
    },
    { 
      mode: 'terminal', 
      label: 'Terminal', 
      icon: <Terminal className="w-4 h-4" />,
      activity: false, // Terminal is independent - no unread indicators
      status: isTerminalRunning 
    },
    { 
      mode: 'logs', 
      label: 'Logs', 
      icon: <ScrollText className="w-4 h-4" />,
      activity: unreadActivity.logs 
    },
    { 
      mode: 'editor', 
      label: 'Editor', 
      icon: <FileEdit className="w-4 h-4" />,
      activity: unreadActivity.editor 
    },
  ];
  
  // Add Messages tab if dev mode is enabled
  if (config?.devMode) {
    tabs.push({
      mode: 'messages' as ViewMode,
      label: 'Messages',
      icon: <Code className="w-4 h-4" />,
      activity: unreadActivity.messages
    });
  }

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
    </div>
  );
};
import React from 'react';
import { ViewMode } from '../../hooks/useSessionView';
import { cn } from '../../utils/cn';
import { GitCompare, Terminal, FileEdit, Eye, Settings, GitBranch, MoreVertical } from 'lucide-react';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';

interface ViewTabsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  unreadActivity: {
    changes: boolean;
    terminal: boolean;
    editor: boolean;
    richOutput: boolean;
  };
  setUnreadActivity: (activity: any) => void;
  isTerminalRunning: boolean;
  onSettingsClick?: () => void;
  showSettings?: boolean;
  branchActions?: Array<{
    id: string;
    label: string;
    icon: any;
    onClick: () => void;
    disabled: boolean;
    variant: 'default' | 'success' | 'danger';
    description: string;
  }>;
  isMerging?: boolean;
}

export const ViewTabs: React.FC<ViewTabsProps> = ({
  viewMode,
  setViewMode,
  unreadActivity,
  setUnreadActivity,
  isTerminalRunning,
  onSettingsClick,
  showSettings,
  branchActions,
  isMerging,
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
      
      {/* Branch Actions button - positioned after tabs */}
      {branchActions && branchActions.length > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <Dropdown
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 px-3 py-2"
                disabled={isMerging}
              >
                <GitBranch className="w-4 h-4" />
                <span>Git Branch Actions</span>
                <MoreVertical className="w-3 h-3" />
              </Button>
            }
            items={branchActions}
            position="bottom-right"
          />
        </div>
      )}
      
      {/* Settings button - only show for Rich Output view */}
      {viewMode === 'richOutput' && onSettingsClick && (
        <button
          onClick={onSettingsClick}
          className={cn(
            branchActions && branchActions.length > 0 ? "mr-2" : "ml-auto mr-2",
            "px-3 py-2 rounded-md transition-all flex items-center gap-2",
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
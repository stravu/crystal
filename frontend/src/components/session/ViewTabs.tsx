import React from 'react';
import { ViewMode } from '../../hooks/useSessionView';
import { Card } from '../ui/Card';

interface ViewTabsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  unreadActivity: {
    output: boolean;
    messages: boolean;
    changes: boolean;
    terminal: boolean;
    editor: boolean;
    richOutput: boolean;
  };
  setUnreadActivity: (activity: any) => void;
  jsonMessagesCount: number;
  isTerminalRunning: boolean;
}

export const ViewTabs: React.FC<ViewTabsProps> = ({
  viewMode,
  setViewMode,
  unreadActivity,
  setUnreadActivity,
  jsonMessagesCount,
  isTerminalRunning,
}) => {
  const tabs: { mode: ViewMode; label: string; count?: number, activity?: boolean, status?: boolean }[] = [
    { mode: 'output', label: 'Output', activity: unreadActivity.output },
    { mode: 'richOutput', label: 'Rich Output', activity: unreadActivity.richOutput },
    { mode: 'messages', label: 'Messages', count: jsonMessagesCount, activity: unreadActivity.messages },
    { mode: 'changes', label: 'View Diff', activity: unreadActivity.changes },
    { mode: 'terminal', label: 'Terminal', activity: unreadActivity.terminal, status: isTerminalRunning },
    { mode: 'editor', label: 'File Editor', activity: unreadActivity.editor },
  ];

  return (
    <div className="flex flex-col gap-2 relative z-10 mt-6">
      <Card variant="bordered" padding="none" className="flex overflow-hidden flex-shrink-0">
        {tabs.map(({ mode, label, count, activity, status }) => (
          <button
            key={mode}
            onClick={() => {
              setViewMode(mode);
              setUnreadActivity((prev: any) => ({ ...prev, [mode]: false }));
            }}
            className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 relative block transition-colors ${
              viewMode === mode
                ? 'bg-interactive text-white'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            {label} {count !== undefined && `(${count})`}
            {status && <span className="ml-1 inline-block w-2 h-2 bg-status-success rounded-full animate-pulse"></span>}
            {activity && viewMode !== mode && <span className="absolute -top-1 -right-1 h-2 w-2 bg-status-error rounded-full"></span>}
          </button>
        ))}
      </Card>
    </div>
  );
}; 
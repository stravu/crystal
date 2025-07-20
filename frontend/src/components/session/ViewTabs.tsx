import React from 'react';
import { ViewMode } from '../../hooks/useSessionView';

interface ViewTabsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  unreadActivity: {
    output: boolean;
    messages: boolean;
    changes: boolean;
    terminal: boolean;
    editor: boolean;
    dashboard: boolean;
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
    { mode: 'messages', label: 'Messages', count: jsonMessagesCount, activity: unreadActivity.messages },
    { mode: 'changes', label: 'View Diff', activity: unreadActivity.changes },
    { mode: 'terminal', label: 'Terminal', activity: unreadActivity.terminal, status: isTerminalRunning },
    { mode: 'editor', label: 'File Editor', activity: unreadActivity.editor },
    { mode: 'dashboard', label: 'Dashboard', activity: unreadActivity.dashboard },
  ];

  return (
    <div className="flex flex-col gap-2 relative z-10 mt-6">
      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0">
        {tabs.map(({ mode, label, count, activity, status }) => (
          <button
            key={mode}
            onClick={() => {
              setViewMode(mode);
              setUnreadActivity((prev: any) => ({ ...prev, [mode]: false }));
            }}
            className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 relative block ${
              viewMode === mode
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {label} {count !== undefined && `(${count})`}
            {status && <span className="ml-1 inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>}
            {activity && viewMode !== mode && <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>}
          </button>
        ))}
      </div>
    </div>
  );
}; 
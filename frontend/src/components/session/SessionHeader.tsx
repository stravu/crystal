import React from 'react';
import { Session, GitCommands } from '../../types/session';
import { StatusIndicator } from '../StatusIndicator';
import { ViewTabs } from './ViewTabs';
import { ViewMode } from '../../hooks/useSessionView';
import { CommitModeIndicator } from '../CommitModeIndicator';

interface SessionHeaderProps {
  activeSession: Session;
  isEditingName: boolean;
  editName: string;
  setEditName: (name: string) => void;
  handleNameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleSaveEditName: () => void;
  handleStartEditName: () => void;
  isMerging: boolean;
  handleGitPull: () => void;
  handleGitPush: () => void;
  handleRebaseMainIntoWorktree: () => void;
  hasChangesToRebase: boolean;
  gitCommands: GitCommands | null;
  handleSquashAndRebaseToMain: () => void;
  handleOpenIDE: () => void;
  mergeError: string | null;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  unreadActivity: {
    output: boolean;
    messages: boolean;
    changes: boolean;
    terminal: boolean;
    editor: boolean;
  };
  setUnreadActivity: (activity: any) => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({
  activeSession,
  isEditingName,
  editName,
  setEditName,
  handleNameKeyDown,
  handleSaveEditName,
  handleStartEditName,
  isMerging,
  handleGitPull,
  handleGitPush,
  handleRebaseMainIntoWorktree,
  hasChangesToRebase,
  gitCommands,
  handleSquashAndRebaseToMain,
  handleOpenIDE,
  mergeError,
  viewMode,
  setViewMode,
  unreadActivity,
  setUnreadActivity,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 relative">
          {isEditingName ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              onBlur={handleSaveEditName}
              className="font-bold text-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 rounded border border-gray-400 dark:border-gray-600 focus:border-blue-500 focus:outline-none w-full"
              autoFocus
            />
          ) : (
            <h2 
              className="font-bold text-xl text-gray-900 dark:text-gray-100 truncate cursor-pointer hover:text-gray-700 dark:hover:text-gray-600"
              onDoubleClick={handleStartEditName}
              title="Double-click to rename"
            >
              {activeSession.name}
            </h2>
          )}
          {/* Status Indicator */}
          <div className="flex items-center gap-2 mt-2">
            <StatusIndicator key={`status-${activeSession.id}-${activeSession.status}`} session={activeSession} size="medium" showText showProgress />
            <CommitModeIndicator mode={activeSession.commitMode} />
          </div>
          
          {/* Git Actions */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="flex flex-wrap items-center gap-2 relative z-20">
              {activeSession.isMainRepo ? (
                <>
                  <div className="group relative">
                    <button onClick={handleGitPull} disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'} className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed' : 'bg-gray-700 border-blue-600 text-blue-400 hover:bg-blue-900/20 hover:border-blue-500'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>
                      <span className="text-sm font-medium">{isMerging ? 'Pulling...' : 'Pull'}</span>
                    </button>
                    {/* Tooltip */}
                  </div>
                  <div className="group relative">
                    <button onClick={handleGitPush} disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'} className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed' : 'bg-gray-700 border-green-600 text-green-400 hover:bg-green-900/20 hover:border-green-500'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" /></svg>
                      <span className="text-sm font-medium">{isMerging ? 'Pushing...' : 'Push'}</span>
                    </button>
                    {/* Tooltip */}
                  </div>
                </>
              ) : (
                <>
                  <div className="group relative">
                    <button onClick={handleRebaseMainIntoWorktree} disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hasChangesToRebase} className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hasChangesToRebase ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-gray-700 border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>
                      <span className="text-sm font-medium">{isMerging ? 'Rebasing...' : `Rebase from local ${gitCommands?.mainBranch || 'main'}`}</span>
                    </button>
                    {/* Tooltip */}
                  </div>
                  <div className="group relative">
                    <button onClick={handleSquashAndRebaseToMain} disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'} className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-gray-700 border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" /></svg>
                      <span className="text-sm font-medium">{isMerging ? 'Squashing...' : `Rebase to ${gitCommands?.mainBranch || 'main'}`}</span>
                    </button>
                    {/* Tooltip */}
                  </div>
                  <div className="group relative">
                    <button onClick={handleOpenIDE} disabled={activeSession.status === 'initializing'} className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${activeSession.status === 'initializing' ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-white dark:bg-gray-700 border-purple-500 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20'}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                      <span className="text-sm font-medium">Open IDE</span>
                    </button>
                    {/* Tooltip */}
                  </div>
                </>
              )}
            </div>
          </div>
          {mergeError && (
            <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded-md">
              <p className="text-sm text-red-400">{mergeError}</p>
            </div>
          )}
        </div>
        <ViewTabs
          viewMode={viewMode}
          setViewMode={setViewMode}
          unreadActivity={unreadActivity}
          setUnreadActivity={setUnreadActivity}
          jsonMessagesCount={activeSession.jsonMessages?.length || 0}
          isTerminalRunning={activeSession.isRunning || false}
        />
      </div>
    </div>
  );
}; 
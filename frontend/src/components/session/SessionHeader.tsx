import React from 'react';
import { Session, GitCommands } from '../../types/session';
import { StatusIndicator } from '../StatusIndicator';
import { ViewTabs } from './ViewTabs';
import { ViewMode } from '../../hooks/useSessionView';
import { CommitModeIndicator } from '../CommitModeIndicator';
import { Button } from '../ui/Button';

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
  isOpeningIDE?: boolean;
  hasIdeCommand?: boolean;
  mergeError: string | null;
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
  isOpeningIDE = false,
  hasIdeCommand = true,
  mergeError,
  viewMode,
  setViewMode,
  unreadActivity,
  setUnreadActivity,
}) => {
  return (
    <div className="bg-surface-primary border-b border-border-primary px-4 py-3 flex-shrink-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 relative">
          {isEditingName ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              onBlur={handleSaveEditName}
              className="font-bold text-xl bg-surface-primary text-text-primary px-2 py-1 rounded border border-border-primary focus:border-interactive focus:outline-none w-full"
              autoFocus
            />
          ) : (
            <h2 
              className="font-bold text-xl text-text-primary truncate cursor-pointer hover:text-text-secondary"
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
                    <Button
                      onClick={handleGitPull}
                      disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                      size="sm"
                      variant="secondary"
                      loading={isMerging}
                      className="rounded-full border-interactive text-interactive hover:bg-interactive/20 hover:border-interactive-hover disabled:border-border-tertiary"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>
                      Pull
                    </Button>
                    {/* Tooltip */}
                  </div>
                  <div className="group relative">
                    <Button
                      onClick={handleGitPush}
                      disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                      size="sm"
                      variant="secondary"
                      loading={isMerging}
                      className="rounded-full border-status-success text-status-success hover:bg-status-success/20 hover:border-status-success-hover disabled:border-border-tertiary"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" /></svg>
                      Push
                    </Button>
                    {/* Tooltip */}
                  </div>
                </>
              ) : (
                <>
                  <div className="group relative">
                    <Button
                      onClick={handleRebaseMainIntoWorktree}
                      disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hasChangesToRebase}
                      size="sm"
                      variant="secondary"
                      loading={isMerging}
                      className="rounded-full border-interactive text-interactive hover:bg-interactive/10 disabled:border-border-tertiary"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" /></svg>
                      {isMerging ? 'Rebasing...' : `Rebase from local ${gitCommands?.mainBranch || 'main'}`}
                    </Button>
                    {/* Tooltip */}
                  </div>
                  <div className="group relative">
                    <Button
                      onClick={handleSquashAndRebaseToMain}
                      disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                      size="sm"
                      variant="secondary"
                      loading={isMerging}
                      className="rounded-full border-status-success text-status-success hover:bg-status-success/10 disabled:border-border-tertiary"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" /></svg>
                      {isMerging ? 'Squashing...' : `Rebase to ${gitCommands?.mainBranch || 'main'}`}
                    </Button>
                    {/* Tooltip */}
                  </div>
                  <div className="group relative">
                    <Button
                      onClick={handleOpenIDE}
                      disabled={activeSession.status === 'initializing' || isOpeningIDE || !hasIdeCommand}
                      size="sm"
                      variant="secondary"
                      loading={isOpeningIDE}
                      className="rounded-full border-interactive text-interactive hover:bg-interactive/10 disabled:border-border-tertiary"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                      {isOpeningIDE ? 'Opening...' : 'Open IDE'}
                    </Button>
                    {!hasIdeCommand && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-surface-inverted rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                        No IDE command configured for this project
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {mergeError && (
            <div className="mt-2 p-2 bg-status-error/20 border border-status-error rounded-md">
              <p className="text-sm text-status-error">{mergeError}</p>
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
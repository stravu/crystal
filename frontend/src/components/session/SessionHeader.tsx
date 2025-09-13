import React from 'react';
import { Session } from '../../types/session';
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
  mergeError: string | null;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  unreadActivity: {
    changes: boolean;
    terminal: boolean;
    logs: boolean;
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
  mergeError,
  viewMode,
  setViewMode,
  unreadActivity,
  setUnreadActivity,
}) => {

  return (
    <div className="bg-surface-primary border-b border-border-primary flex-shrink-0">
      {/* Top Row: Session Identity (left) and Session Actions (right) */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          {/* Cluster 1: Session Identity (left-aligned) */}
          <div className="flex-1 min-w-0">
            {/* Session Name */}
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
                className="font-bold text-xl text-text-primary truncate cursor-pointer hover:text-text-secondary transition-colors"
                onDoubleClick={handleStartEditName}
                title="Double-click to rename"
              >
                {activeSession.name}
              </h2>
            )}
            
            {/* Status and Mode Indicators */}
            <div className="flex items-center gap-3 mt-2">
              <StatusIndicator 
                key={`status-${activeSession.id}-${activeSession.status}`} 
                session={activeSession} 
                size="medium" 
                showText 
                showProgress 
              />
              {activeSession.commitMode && activeSession.commitMode !== 'disabled' && (
                <CommitModeIndicator mode={activeSession.commitMode} />
              )}
            </div>
          </div>

        </div>

        {/* Error Messages */}
        {mergeError && (
          <div className="mt-3 p-2 bg-status-error/10 border border-status-error/30 rounded-md">
            <p className="text-sm text-status-error">{mergeError}</p>
          </div>
        )}
      </div>

      {/* Cluster 2: Workspace Views (below, full width) */}
      <div className="border-t border-border-primary">
        <ViewTabs
          viewMode={viewMode}
          setViewMode={setViewMode}
          unreadActivity={unreadActivity}
          setUnreadActivity={setUnreadActivity}
          isTerminalRunning={activeSession.isRunning || false}
        />
      </div>
    </div>
  );
};
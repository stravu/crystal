import { useState, useEffect, memo, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useNavigationStore } from '../stores/navigationStore';
import { StatusIndicator } from './StatusIndicator';
import { GitStatusIndicator } from './GitStatusIndicator';
import { ConfirmDialog } from './ConfirmDialog';
import { RunScriptConfigDialog } from './RunScriptConfigDialog';
import { NimbalystInstallDialog } from './NimbalystInstallDialog';
import { API } from '../utils/api';
import { Star, Archive } from 'lucide-react';
import { NimbalystIcon } from './icons/NimbalystIcon';
import type { Session, GitStatus } from '../types/session';
import { useContextMenu } from '../contexts/ContextMenuContext';
import { IconButton } from './ui/IconButton';
import { cn } from '../utils/cn';
import { AnalyticsService } from '../services/analyticsService';

interface SessionListItemProps {
  session: Session;
  isNested?: boolean;
}

// Memoized component to prevent unnecessary re-renders
export const SessionListItem = memo(function SessionListItem({ session, isNested = false }: SessionListItemProps) {
  const { activeSessionId, setActiveSession, deletingSessionIds, addDeletingSessionId, removeDeletingSessionId } = useSessionStore();
  const { navigateToSessions } = useNavigationStore();
  const isActive = activeSessionId === session.id;
  const isDeleting = deletingSessionIds.has(session.id);
  const [hasRunScript, setHasRunScript] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);
  const [gitStatus, setGitStatus] = useState<GitStatus | undefined>(session.gitStatus);
  const { menuState, openMenu, closeMenu, isMenuOpen } = useContextMenu();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showRunScriptConfig, setShowRunScriptConfig] = useState(false);
  const [showNimbalystInstall, setShowNimbalystInstall] = useState(false);
  const [gitStatusLoading, setGitStatusLoading] = useState(false);
  
  
  // Performance optimization: Remove unnecessary subscription
  // The component already receives the session as a prop, which will cause re-render when it changes
  // No need for an additional store subscription that runs for every session item on every store change
  
  // Sync git status loading state from store
  useEffect(() => {
    const loading = useSessionStore.getState().isGitStatusLoading(session.id);
    setGitStatusLoading(loading);
  }, [session.id]);
  
  useEffect(() => {
    // Check if this session's project has a run script
    const checkRunScript = () => {
      API.sessions.hasRunScript(session.id)
        .then(response => {
          if (response.success) {
            setHasRunScript(response.data);
          }
        })
        .catch(console.error);
    };

    checkRunScript();

    // Listen for custom project update events from the global useIPCEvents hook  
    const handleProjectUpdate = (event: CustomEvent) => {
      const project = event.detail;
      // Check if this session belongs to the updated project
      if (session.projectId === project.id) {
        // Re-check if the run script exists for this session
        checkRunScript();
      }
    };
    
    window.addEventListener('project-updated', handleProjectUpdate as EventListener);

    return () => {
      window.removeEventListener('project-updated', handleProjectUpdate as EventListener);
    };
    // Only re-run when the actual session ID changes to prevent memory leaks
  }, [session.id]);

  // Combine script-related effects
  useEffect(() => {
    // Check if this session is currently running
    API.sessions.getRunningSession()
      .then(response => {
        if (response.success) {
          setIsRunning(response.data === session.id);
        }
      })
      .catch(console.error);

    // Listen for script session changes
    const handleScriptSessionChange = (event: CustomEvent) => {
      setIsRunning(event.detail === session.id);
    };

    // Listen for script closing state
    const handleScriptClosing = (event: CustomEvent) => {
      setIsClosing(event.detail === session.id);
    };

    window.addEventListener('script-session-changed', handleScriptSessionChange as EventListener);
    window.addEventListener('script-closing', handleScriptClosing as EventListener);
    
    return () => {
      window.removeEventListener('script-session-changed', handleScriptSessionChange as EventListener);
      window.removeEventListener('script-closing', handleScriptClosing as EventListener);
    };
  }, [session.id]);

  useEffect(() => {
    // Optimized git status fetching - rely on centralized smart polling instead of individual fetches
    const fetchGitStatusIfNeeded = async () => {
      // Only fetch if we don't have git status yet and session is active/viable
      if (!session.archived && session.status !== 'error' && !gitStatus && !session.gitStatus) {
        try {
          setGitStatusLoading(true);
          // Use queue-based initial load to prevent overwhelming the system
          const response = await window.electronAPI.invoke('sessions:get-git-status', session.id, false, true);
          if (response.success && response.gitStatus) {
            setGitStatus(response.gitStatus);
          }
          setGitStatusLoading(false);
        } catch (error) {
          console.warn('Error fetching initial git status:', error);
          setGitStatusLoading(false);
        }
      }
    };

    // Use session.gitStatus if available, or fetch only once if needed
    if (session.gitStatus) {
      setGitStatus(session.gitStatus);
    } else {
      fetchGitStatusIfNeeded();
    }

    // Listen for custom git status events from the global useIPCEvents hook
    const handleGitStatusUpdate = (event: CustomEvent) => {
      const { sessionId, gitStatus } = event.detail;
      if (sessionId === session.id) {
        setGitStatus(gitStatus);
        setGitStatusLoading(false);
      }
    };
    
    // Listen for git status loading events to show immediate feedback
    const handleGitStatusLoading = (event: CustomEvent) => {
      const { sessionId } = event.detail;
      if (sessionId === session.id) {
        setGitStatusLoading(true);
      }
    };
    
    window.addEventListener('git-status-updated', handleGitStatusUpdate as EventListener);
    window.addEventListener('git-status-loading', handleGitStatusLoading as EventListener);

    return () => {
      window.removeEventListener('git-status-updated', handleGitStatusUpdate as EventListener);
      window.removeEventListener('git-status-loading', handleGitStatusLoading as EventListener);
    };
    // Reduced dependency array to prevent excessive re-runs
  }, [session.id, session.archived, session.status, session.gitStatus]);

  const handleRunScript = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!hasRunScript) {
      setShowRunScriptConfig(true);
      return;
    }

    try {
      // Check if there's a running script that needs to be stopped
      const runningSessionResponse = await API.sessions.getRunningSession();
      if (runningSessionResponse.success && runningSessionResponse.data) {
        // Set closing state for the currently running session
        window.dispatchEvent(new CustomEvent('script-closing', { detail: runningSessionResponse.data }));
      }
      
      // First stop any currently running script
      // The stopScript method now waits for full cleanup before returning
      await API.sessions.stopScript();
      
      // Clear closing state after stop completes
      window.dispatchEvent(new CustomEvent('script-closing', { detail: null }));
      
      // Note: Script output now goes to logs, not terminal
      // No need to clear terminal output here
      
      // Then run the script for this session
      const response = await API.sessions.runScript(session.id);

      if (!response.success) {
        throw new Error(response.error || 'Failed to run script');
      }

      // Update running state for all sessions
      window.dispatchEvent(new CustomEvent('script-session-changed', { detail: session.id }));
    } catch (error) {
      console.error('Error running script:', error);
      // Clear closing state on error
      window.dispatchEvent(new CustomEvent('script-closing', { detail: null }));
      alert('Failed to run script');
    }
  }, [hasRunScript, session.id]);

  const handleStopScript = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Set closing state for this session
      setIsClosing(true);
      const response = await API.sessions.stopScript(session.id);

      if (!response.success) {
        throw new Error(response.error || 'Failed to stop script');
      }

      // Clear closing state
      setIsClosing(false);
      // Update running state for all sessions
      window.dispatchEvent(new CustomEvent('script-session-changed', { detail: null }));
    } catch (error) {
      console.error('Error stopping script:', error);
      setIsClosing(false);
      alert('Failed to stop script');
    } finally {
      // Ensure closing state is cleared
      setIsClosing(false);
    }
  };

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the session
    
    // Prevent deletion if already being deleted
    if (isDeleting) return;
    
    // Show the confirmation dialog
    setShowArchiveConfirm(true);
  }, [isDeleting]);

  const handleConfirmArchive = useCallback(async () => {
    addDeletingSessionId(session.id);
    try {
      const response = await API.sessions.delete(session.id);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to archive session');
      }
      
      // If this was the active session, clear the selection
      if (isActive) {
        setActiveSession(null);
      }
    } catch (error) {
      console.error('Error archiving session:', error);
      alert('Failed to archive session');
    } finally {
      removeDeletingSessionId(session.id);
    }
  }, [isDeleting, session.name, session.id, session.isMainRepo, session.worktreePath, isActive, addDeletingSessionId, removeDeletingSessionId, setActiveSession]);

  const handleSaveEdit = async () => {
    if (editName.trim() === '') {
      setEditName(session.name);
      setIsEditing(false);
      return;
    }

    if (editName === session.name) {
      setIsEditing(false);
      return;
    }

    try {
      const response = await API.sessions.rename(session.id, editName.trim());
      if (!response.success) {
        throw new Error(response.error || 'Failed to rename session');
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error renaming session:', error);
      alert('Failed to rename session');
      setEditName(session.name);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(session.name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu('session', session, { x: e.clientX, y: e.clientY });
  };

  const handleRename = () => {
    closeMenu();
    setEditName(session.name);
    setIsEditing(true);
  };

  const handleDeleteFromMenu = () => {
    closeMenu();
    handleDelete({ stopPropagation: () => {} } as React.MouseEvent);
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const response = await API.sessions.toggleFavorite(session.id);

      if (!response.success) {
        throw new Error(response.error || 'Failed to toggle favorite status');
      }

    } catch (error) {
      console.error('Error toggling favorite status:', error);
      alert('Failed to toggle favorite status');
    }
  };

  const handleOpenInNimbalyst = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      // Track button click
      const sessionIdHash = await AnalyticsService.hashSessionId(session.id);
      await AnalyticsService.trackNimbalystButtonClicked({
        session_id_hash: sessionIdHash
      });

      // Check if Nimbalyst is installed
      const checkResponse = await window.electronAPI.nimbalyst.checkInstalled();

      if (!checkResponse.success) {
        throw new Error(checkResponse.error || 'Failed to check Nimbalyst installation');
      }

      if (!checkResponse.data) {
        // Track install dialog shown
        await AnalyticsService.trackNimbalystInstallDialogShown({
          session_id_hash: sessionIdHash
        });

        // Show install dialog if not installed
        setShowNimbalystInstall(true);
        return;
      }

      // Open the worktree in Nimbalyst
      const openResponse = await window.electronAPI.nimbalyst.openWorktree(session.worktreePath);

      if (!openResponse.success) {
        throw new Error(openResponse.error || 'Failed to open worktree in Nimbalyst');
      }

      // Track successful open
      await AnalyticsService.trackNimbalystOpened({
        session_id_hash: sessionIdHash
      });

    } catch (error) {
      console.error('Error opening in Nimbalyst:', error);
      alert('Failed to open in Nimbalyst');
    }
  };
  
  return (
    <>
      <div
        className={cn(
          'w-full text-left rounded-md flex items-center space-x-2 transition-all group',
          isNested ? 'px-2 py-1.5 text-sm' : 'px-3 py-2',
          isActive 
            ? 'bg-interactive/20 text-text-primary shadow-sm ring-1 ring-interactive/20 dark:ring-interactive/30' 
            : 'hover:bg-surface-hover text-text-secondary hover:shadow-sm'
        )}
        onContextMenu={handleContextMenu}
      >
        <button
          onClick={() => {
            setActiveSession(session.id);
            navigateToSessions();
          }}
          className="flex items-center justify-start space-x-3 flex-1 min-w-0"
        >
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-sm bg-surface-primary text-text-primary px-2 py-1 rounded border border-border-primary focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/20"
              autoFocus
            />
          ) : (
            <span className={cn(
              'flex-1 truncate text-sm text-left flex items-center gap-2',
              (isActive || session.status === 'completed_unviewed') && 'font-semibold',
              session.status === 'completed_unviewed' && 'text-interactive'
            )} title={session.name}>
              {(gitStatus || gitStatusLoading) && !session.archived && (
                <GitStatusIndicator gitStatus={gitStatus} size="small" sessionId={session.id} isLoading={gitStatusLoading} />
              )}
              <StatusIndicator session={session} size="small" />
              <span className="ml-1">{session.name}</span>
              {!!session.isMainRepo && (
                <span className="ml-1 text-xs text-interactive">(main)</span>
              )}
            </span>
          )}
          {!isEditing && (isRunning || isClosing) && (
            <span className={cn(
              'text-xs',
              isClosing ? 'text-status-warning' : 'text-status-success'
            )}>
              {isClosing ? '⏸️ Closing' : '▶️ Running'}
            </span>
          )}
        </button>
        <div className="flex items-center space-x-1">
          {!isEditing && (
            <>
              {!session.archived && (
                <IconButton
                  onClick={handleToggleFavorite}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'transition-all',
                    session.isFavorite
                      ? 'text-status-warning hover:text-status-warning-hover'
                      : 'text-text-tertiary opacity-0 group-hover:opacity-100'
                  )}
                  aria-label={session.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  icon={
                    <Star
                      className="w-4 h-4"
                      fill={session.isFavorite ? 'currentColor' : 'none'}
                      strokeWidth={session.isFavorite ? 0 : 2}
                    />
                  }
                />
              )}
              {!session.archived && (
                <IconButton
                  onClick={handleOpenInNimbalyst}
                  variant="ghost"
                  size="sm"
                  className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-500"
                  aria-label="Open in Nimbalyst"
                  icon={<NimbalystIcon size={18} className="text-current" />}
                />
              )}
              {!session.archived && (
                <button
                  onClick={isRunning ? handleStopScript : handleRunScript}
                  className={cn(
                    'opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded',
                    isClosing
                      ? 'cursor-wait text-status-warning'
                      : isRunning 
                      ? 'hover:bg-status-error/10 text-status-error hover:text-status-error' 
                      : hasRunScript
                        ? 'hover:bg-status-success/10 text-status-success hover:text-status-success'
                        : 'hover:bg-surface-hover text-text-tertiary hover:text-text-secondary'
                  )}
                  title={isClosing ? 'Closing script...' : isRunning ? 'Stop script' : (hasRunScript ? 'Run script' : 'No run script configured - Click to configure')}
                  disabled={isClosing}
                >
                  {isClosing ? '⏸️' : isRunning ? '⏹️' : '▶️'}
                </button>
              )}
              {!session.archived && (
                <IconButton
                  onClick={handleDelete}
                  disabled={isDeleting}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                    'hover:bg-status-warning/10',
                    isDeleting && 'cursor-not-allowed'
                  )}
                  aria-label="Archive session"
                  icon={
                    isDeleting ? (
                      <span className="text-text-tertiary">⏳</span>
                    ) : (
                      <Archive className="w-4 h-4 text-status-warning hover:text-status-warning" />
                    )
                  }
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {isMenuOpen('session', session.id) && menuState.position && (
        <div
          className="context-menu fixed bg-surface-primary border border-border-primary rounded-md shadow-lg py-1 z-50 min-w-[150px]"
          style={{ top: menuState.position.y, left: menuState.position.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleRename}
            className="w-full text-left px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            Rename
          </button>
          <button
            onClick={() => {
              closeMenu();
              if (isRunning) {
                handleStopScript({ stopPropagation: () => {} } as React.MouseEvent);
              } else {
                handleRunScript({ stopPropagation: () => {} } as React.MouseEvent);
              }
            }}
            disabled={isClosing}
            className={cn(
              'w-full text-left px-4 py-2 text-sm',
              isClosing 
                ? 'text-text-tertiary cursor-wait' 
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            )}
          >
            {isClosing ? 'Closing Script...' : isRunning ? 'Stop Script' : 'Run Script'}
          </button>
          <div className="border-t border-border-primary my-1" />
          <button
            onClick={handleDeleteFromMenu}
            className="w-full text-left px-4 py-2 text-sm text-status-error hover:bg-surface-hover hover:text-status-error"
          >
            Archive
          </button>
        </div>
      )}
      
      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={handleConfirmArchive}
        title={`Archive Session`}
        message={`Archive session "${session.name}"? This will:\n\n• Move the session to the archived sessions list\n• Preserve all session history and outputs\n${session.isMainRepo ? '• Close the active Claude Code connection' : `• Remove the git worktree locally (${session.worktreePath?.split('/').pop() || 'worktree'})`}`}
        confirmText="Archive"
        confirmButtonClass="bg-amber-600 hover:bg-amber-700 text-white"
        icon={<Archive className="w-6 h-6 text-amber-500 flex-shrink-0" />}
      />
      
      <RunScriptConfigDialog
        isOpen={showRunScriptConfig}
        onClose={() => setShowRunScriptConfig(false)}
      />

      <NimbalystInstallDialog
        isOpen={showNimbalystInstall}
        onClose={() => setShowNimbalystInstall(false)}
      />
    </>
  );
});
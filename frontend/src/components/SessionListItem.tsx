import { useState, useEffect } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { StatusIndicator } from './StatusIndicator';
import { API } from '../utils/api';
import { Star, Archive } from 'lucide-react';
import type { Session } from '../types/session';

interface SessionListItemProps {
  session: Session;
  isNested?: boolean;
}

export function SessionListItem({ session, isNested = false }: SessionListItemProps) {
  const { activeSessionId, setActiveSession, deletingSessionIds, addDeletingSessionId, removeDeletingSessionId } = useSessionStore();
  const isActive = activeSessionId === session.id;
  const isDeleting = deletingSessionIds.has(session.id);
  const [hasRunScript, setHasRunScript] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  
  // Force re-render when session status changes
  const [, forceUpdate] = useState({});
  useEffect(() => {
    // Subscribe to session updates to ensure UI updates when this session's status changes
    const unsubscribe = useSessionStore.subscribe((state) => {
      const updatedSession = state.sessions.find(s => s.id === session.id) || 
        (state.activeMainRepoSession?.id === session.id ? state.activeMainRepoSession : null);
      
      if (updatedSession && updatedSession.status !== session.status) {
        forceUpdate({});
      }
    });
    
    // Also listen for custom session status change events
    const handleStatusChange = (event: CustomEvent) => {
      if (event.detail.sessionId === session.id) {
        forceUpdate({});
      }
    };
    
    window.addEventListener('session-status-changed', handleStatusChange as EventListener);
    
    return () => {
      unsubscribe();
      window.removeEventListener('session-status-changed', handleStatusChange as EventListener);
    };
  }, [session.id, session.status]);
  
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

    // Listen for project updates
    let unsubscribe: (() => void) | undefined;
    
    if (window.electronAPI?.events?.onProjectUpdated) {
      unsubscribe = window.electronAPI.events.onProjectUpdated((project) => {
        // Check if this session belongs to the updated project
        if (session.projectId === project.id) {
          // Re-check if the run script exists for this session
          checkRunScript();
        }
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [session.id, session.projectId]);

  useEffect(() => {
    // Check if this session is currently running
    API.sessions.getRunningSession()
      .then(response => {
        if (response.success) {
          setIsRunning(response.data === session.id);
        }
      })
      .catch(console.error);
  }, [session.id]);

  useEffect(() => {
    // Listen for script session changes
    const handleScriptSessionChange = (event: CustomEvent) => {
      setIsRunning(event.detail === session.id);
    };

    window.addEventListener('script-session-changed', handleScriptSessionChange as EventListener);
    return () => {
      window.removeEventListener('script-session-changed', handleScriptSessionChange as EventListener);
    };
  }, [session.id]);

  useEffect(() => {
    // Listen for script closing state
    const handleScriptClosing = (event: CustomEvent) => {
      setIsClosing(event.detail === session.id);
    };

    window.addEventListener('script-closing', handleScriptClosing as EventListener);
    return () => {
      window.removeEventListener('script-closing', handleScriptClosing as EventListener);
    };
  }, [session.id]);

  const handleRunScript = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!hasRunScript) {
      alert('No run script configured for this project.\n\nRun scripts are the commands needed to run your application so you can easily test changes.\n\nTo configure a run script:\n1. Click the settings icon (⚙️) next to your project (only shows on hover)\n\n2. Enter your \'Build Script\' to run at worktree creation (Optional)\n\n3. Enter your run script command(s) to run your application for testing');
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
      
      // Clear any previous script output for this session
      useSessionStore.getState().clearScriptOutput(session.id);
      
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
  };

  const handleStopScript = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      console.log('Stopping script...');
      // Set closing state for this session
      setIsClosing(true);
      const response = await API.sessions.stopScript();

      if (!response.success) {
        throw new Error(response.error || 'Failed to stop script');
      }

      console.log('Script stop request successful');
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

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the session
    
    // Prevent deletion if already being deleted
    if (isDeleting) return;
    
    const confirmMessage = `Archive session "${session.name}"? This will:\n` +
      `• Move the session to the archived sessions list\n` +
      `• Preserve all session history and outputs\n` +
      (session.isMainRepo ? `• Close the active Claude Code connection` : `• Remove the git worktree (${session.worktreePath?.split('/').pop() || 'worktree'})`);
    
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) return;
    
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
  };

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
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const closeContextMenu = () => {
    setShowContextMenu(false);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    if (showContextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showContextMenu]);

  const handleRename = () => {
    closeContextMenu();
    setEditName(session.name);
    setIsEditing(true);
  };

  const handleDeleteFromMenu = () => {
    closeContextMenu();
    handleDelete({ stopPropagation: () => {} } as React.MouseEvent);
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('[SessionListItem] Toggling favorite for session:', session.id, 'Current status:', session.isFavorite);
    
    try {
      const response = await API.sessions.toggleFavorite(session.id);
      console.log('[SessionListItem] Toggle favorite response:', response);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to toggle favorite status');
      }
      
      console.log('[SessionListItem] Successfully toggled favorite status to:', response.data?.isFavorite);
    } catch (error) {
      console.error('Error toggling favorite status:', error);
      alert('Failed to toggle favorite status');
    }
  };
  
  return (
    <>
      <div
        className={`w-full text-left ${isNested ? 'px-2 py-1.5' : 'px-3 py-2'} rounded-md flex items-center space-x-2 transition-colors group ${
          isActive 
            ? 'bg-blue-100 dark:bg-gray-700 text-gray-900 dark:text-white' 
            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
        } ${isNested ? 'text-sm' : ''}`}
        onContextMenu={handleContextMenu}
      >
        <button
          onClick={() => {
            console.log('[SessionListItem] Clicking session:', session.id, session.name);
            setActiveSession(session.id);
          }}
          className="flex items-center justify-start space-x-3 flex-1 min-w-0"
        >
          <StatusIndicator session={session} size="small" />
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded border border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          ) : (
            <span className="flex-1 truncate text-sm text-left">
              {session.name}
              {!!session.isMainRepo && (
                <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">(main)</span>
              )}
            </span>
          )}
          {!isEditing && (isRunning || isClosing) && (
            <span className={isClosing ? "text-amber-600 dark:text-amber-400 text-xs" : "text-green-600 dark:text-green-400 text-xs"}>
              {isClosing ? '⏸️ Closing' : '▶️ Running'}
            </span>
          )}
        </button>
        <div className="flex items-center space-x-1">
          {!isEditing && (
            <>
              {!session.archived && (
                <button
                  onClick={handleToggleFavorite}
                  className={`p-1 rounded transition-all ${
                    session.isFavorite 
                      ? 'text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300' 
                      : 'text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100'
                  } hover:bg-gray-100 dark:hover:bg-gray-700/50`}
                  title={session.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star 
                    className="w-4 h-4" 
                    fill={session.isFavorite ? 'currentColor' : 'none'}
                    strokeWidth={session.isFavorite ? 0 : 2}
                  />
                </button>
              )}
              {!session.archived && (
                <button
                  onClick={isRunning ? handleStopScript : handleRunScript}
                  className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${
                    isClosing
                      ? 'cursor-wait text-amber-600 dark:text-amber-400'
                      : isRunning 
                      ? 'hover:bg-red-100 dark:hover:bg-red-600/20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300' 
                      : hasRunScript
                        ? 'hover:bg-green-100 dark:hover:bg-green-600/20 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-600/20 text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400'
                  }`}
                  title={isClosing ? 'Closing script...' : isRunning ? 'Stop script' : (hasRunScript ? 'Run script' : 'No run script configured - Click to configure')}
                  disabled={isClosing}
                >
                  {isClosing ? '⏸️' : isRunning ? '⏹️' : '▶️'}
                </button>
              )}
              {!session.archived && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-600/20 ${
                    isDeleting ? 'cursor-not-allowed' : ''
                  }`}
                  title="Archive session"
                >
                  {isDeleting ? (
                    <span className="text-gray-600 dark:text-gray-400">⏳</span>
                  ) : (
                    <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300" />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 z-50 min-w-[150px]"
          style={{ top: contextMenuPosition.y, left: contextMenuPosition.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleRename}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
          >
            Rename
          </button>
          <button
            onClick={() => {
              closeContextMenu();
              if (isRunning) {
                handleStopScript({ stopPropagation: () => {} } as React.MouseEvent);
              } else {
                handleRunScript({ stopPropagation: () => {} } as React.MouseEvent);
              }
            }}
            disabled={isClosing}
            className={`w-full text-left px-4 py-2 text-sm ${
              isClosing 
                ? 'text-gray-400 dark:text-gray-600 cursor-wait' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {isClosing ? 'Closing Script...' : isRunning ? 'Stop Script' : 'Run Script'}
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={handleDeleteFromMenu}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-700 dark:hover:text-red-300"
          >
            {session.isMainRepo ? 'Archive' : 'Delete'}
          </button>
        </div>
      )}
    </>
  );
}
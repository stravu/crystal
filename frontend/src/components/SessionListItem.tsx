import { useState, useEffect } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { StatusIndicator } from './StatusIndicator';
import { API } from '../utils/api';
import type { Session } from '../types/session';

interface SessionListItemProps {
  session: Session;
}

export function SessionListItem({ session }: SessionListItemProps) {
  const { activeSessionId, setActiveSession } = useSessionStore();
  const isActive = activeSessionId === session.id;
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasRunScript, setHasRunScript] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  
  useEffect(() => {
    // Check if this session's project has a run script
    API.sessions.hasRunScript(session.id)
      .then(response => {
        if (response.success) {
          setHasRunScript(response.data);
        }
      })
      .catch(console.error);
  }, [session.id]);

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

  const handleRunScript = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!hasRunScript) {
      alert('No run script configured for this project. Please configure run script in Project Settings.');
      return;
    }

    try {
      // First stop any currently running script
      await API.sessions.stopScript();
      
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
      alert('Failed to run script');
    }
  };

  const handleStopScript = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      console.log('Stopping script...');
      const response = await API.sessions.stopScript();

      if (!response.success) {
        throw new Error(response.error || 'Failed to stop script');
      }

      console.log('Script stop request successful');
      // Update running state for all sessions
      window.dispatchEvent(new CustomEvent('script-session-changed', { detail: null }));
    } catch (error) {
      console.error('Error stopping script:', error);
      alert('Failed to stop script');
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the session
    
    const confirmed = window.confirm(`Delete session "${session.name}" and its worktree? This action cannot be undone.`);
    if (!confirmed) return;
    
    setIsDeleting(true);
    try {
      const response = await API.sessions.delete(session.id);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete session');
      }
      
      // If this was the active session, clear the selection
      if (isActive) {
        setActiveSession(null);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Failed to delete session');
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <div
      className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-2 transition-colors group ${
        isActive 
          ? 'bg-gray-700 text-white' 
          : 'hover:bg-gray-700/50 text-gray-300'
      }`}
    >
      <button
        onClick={() => setActiveSession(session.id)}
        className="flex items-center space-x-3 flex-1 min-w-0"
      >
        <StatusIndicator session={session} size="small" />
        <span className="flex-1 truncate text-sm">
          {session.name}
        </span>
        {isRunning && (
          <span className="text-green-400 text-xs">▶️ Running</span>
        )}
      </button>
      <div className="flex items-center space-x-1">
        {hasRunScript && (
          <button
            onClick={isRunning ? handleStopScript : handleRunScript}
            className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${
              isRunning 
                ? 'hover:bg-red-600/20 text-red-400 hover:text-red-300' 
                : 'hover:bg-green-600/20 text-green-400 hover:text-green-300'
            }`}
            title={isRunning ? 'Stop script' : 'Run script'}
          >
            {isRunning ? '⏹️' : '▶️'}
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-600/20 ${
            isDeleting ? 'cursor-not-allowed' : ''
          }`}
          title="Delete session and worktree"
        >
          {isDeleting ? (
            <span className="text-gray-400">⏳</span>
          ) : (
            <span className="text-red-400 hover:text-red-300">🗑️</span>
          )}
        </button>
      </div>
    </div>
  );
}
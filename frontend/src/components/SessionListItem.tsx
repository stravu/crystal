import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { StatusIndicator } from './StatusIndicator';
import type { Session } from '../types/session';

interface SessionListItemProps {
  session: Session;
}

export function SessionListItem({ session }: SessionListItemProps) {
  const { activeSessionId, setActiveSession } = useSessionStore();
  const isActive = activeSessionId === session.id;
  const [isDeleting, setIsDeleting] = useState(false);
  

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the session
    
    const confirmed = window.confirm(`Delete session "${session.name}" and its worktree? This action cannot be undone.`);
    if (!confirmed) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete session');
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
      </button>
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
  );
}
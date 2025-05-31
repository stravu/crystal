import { useSessionStore } from '../stores/sessionStore';
import type { Session } from '../types/session';

interface SessionListItemProps {
  session: Session;
}

export function SessionListItem({ session }: SessionListItemProps) {
  const { activeSessionId, setActiveSession } = useSessionStore();
  const isActive = activeSessionId === session.id;
  
  const getStatusIcon = () => {
    switch (session.status) {
      case 'initializing':
        return '⏳';
      case 'ready':
        return '✅';
      case 'running':
        return '▶️';
      case 'waiting':
        return '⏸️';
      case 'stopped':
        return '⏹️';
      case 'error':
        return '❌';
      default:
        return '•';
    }
  };
  
  const getStatusColor = () => {
    switch (session.status) {
      case 'waiting':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      case 'running':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };
  
  return (
    <button
      onClick={() => setActiveSession(session.id)}
      className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-2 transition-colors ${
        isActive 
          ? 'bg-gray-700 text-white' 
          : 'hover:bg-gray-700/50 text-gray-300'
      }`}
    >
      <span className={`text-sm ${getStatusColor()}`}>
        {getStatusIcon()}
      </span>
      <span className="flex-1 truncate text-sm">
        {session.name}
      </span>
    </button>
  );
}
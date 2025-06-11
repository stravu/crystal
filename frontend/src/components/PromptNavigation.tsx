import { useEffect, useState } from 'react';
import { formatDistanceToNow } from '../utils/formatters';
import { API } from '../utils/api';
import { useSessionStore } from '../stores/sessionStore';

interface PromptMarker {
  id: number;
  session_id: string;
  prompt_text: string;
  output_index: number;
  output_line?: number;
  timestamp: string;
}

interface PromptNavigationProps {
  sessionId: string;
  onNavigateToPrompt: (marker: PromptMarker) => void;
}

export function PromptNavigation({ sessionId, onNavigateToPrompt }: PromptNavigationProps) {
  const [prompts, setPrompts] = useState<PromptMarker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const activeSession = useSessionStore((state) => state.sessions.find(s => s.id === sessionId));

  const calculateDuration = (currentPrompt: PromptMarker, nextPrompt?: PromptMarker, isLast: boolean = false): string => {
    const startTime = new Date(currentPrompt.timestamp).getTime();
    
    // For the last prompt, only show duration if session is not actively running
    if (isLast && activeSession && (activeSession.status === 'running' || activeSession.status === 'waiting')) {
      const durationMs = Date.now() - startTime;
      const seconds = Math.floor(durationMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      
      if (hours > 0) {
        return `${hours}h ${minutes % 60}m (ongoing)`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s (ongoing)`;
      } else {
        return `${seconds}s (ongoing)`;
      }
    }
    
    const endTime = nextPrompt ? new Date(nextPrompt.timestamp).getTime() : Date.now();
    const durationMs = endTime - startTime;
    
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  useEffect(() => {
    if (!sessionId) return;

    const fetchPrompts = async () => {
      setIsLoading(true);
      try {
        const response = await API.sessions.getPrompts(sessionId);
        if (response.success) {
          setPrompts(response.data);
        }
      } catch (error) {
        console.error('Error fetching prompt markers:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
    
    // Only refresh prompts when session status changes, not on a timer
    // This reduces unnecessary API calls from every 5 seconds to only when needed
  }, [sessionId, activeSession?.status]);

  // Use requestAnimationFrame for smooth UI updates instead of setInterval
  useEffect(() => {
    if (!activeSession || (activeSession.status !== 'running' && activeSession.status !== 'waiting')) {
      return;
    }

    let animationId: number;
    let lastUpdate = 0;
    const UPDATE_INTERVAL = 5000; // Update every 5 seconds instead of every second

    const updateOngoingDuration = (timestamp: number) => {
      if (timestamp - lastUpdate >= UPDATE_INTERVAL) {
        setPrompts(prev => [...prev]); // Force re-render for duration updates
        lastUpdate = timestamp;
      }
      animationId = requestAnimationFrame(updateOngoingDuration);
    };

    animationId = requestAnimationFrame(updateOngoingDuration);
    return () => cancelAnimationFrame(animationId);
  }, [activeSession?.status]);

  const handlePromptClick = (marker: PromptMarker) => {
    setSelectedPromptId(marker.id);
    onNavigateToPrompt(marker);
  };

  if (isLoading && prompts.length === 0) {
    return (
      <div className="w-64 bg-gray-50 border-l border-gray-300 p-4">
        <h3 className="font-semibold text-gray-700 mb-4">Prompt History</h3>
        <div className="text-gray-500 text-sm">Loading prompts...</div>
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-50 border-l border-gray-300 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-700">Prompt History</h3>
        <p className="text-xs text-gray-500 mt-1">Click to navigate</p>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {prompts.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm">
            No prompts yet. Start by entering a prompt below.
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {prompts.map((marker, index) => (
              <button
                key={marker.id}
                onClick={() => handlePromptClick(marker)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedPromptId === marker.id
                    ? 'bg-blue-100 border-blue-300 border'
                    : 'hover:bg-gray-100 border border-transparent'
                }`}
              >
                <div className="flex items-start space-x-2">
                  <span className="text-blue-500 font-mono text-sm mt-0.5">
                    #{index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 line-clamp-2">
                      {marker.prompt_text}
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                      <span>{formatDistanceToNow(new Date(marker.timestamp))} ago</span>
                      <span className="text-gray-400">•</span>
                      <span className="font-medium text-gray-600">
                        {calculateDuration(marker, prompts[index + 1], index === prompts.length - 1)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
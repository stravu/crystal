import { useEffect, useState } from 'react';
import { formatDistanceToNow } from '../utils/formatters';

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

  useEffect(() => {
    if (!sessionId) return;

    const fetchPrompts = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/sessions/${sessionId}/prompts`);
        if (response.ok) {
          const data = await response.json();
          setPrompts(data);
        }
      } catch (error) {
        console.error('Error fetching prompt markers:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
    
    // Refresh prompts every 5 seconds while session is active
    const interval = setInterval(fetchPrompts, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

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
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(marker.timestamp))} ago
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
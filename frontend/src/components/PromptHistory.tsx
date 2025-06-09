import { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { API } from '../utils/api';

interface PromptHistoryItem {
  id: string;
  prompt: string;
  sessionName: string;
  sessionId: string;
  createdAt: string;
  status: string;
}

export function PromptHistory() {
  const [prompts, setPrompts] = useState<PromptHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const createSession = useSessionStore((state) => state.createSession);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const sessions = useSessionStore((state) => state.sessions);

  useEffect(() => {
    fetchPromptHistory();
  }, []);

  const fetchPromptHistory = async () => {
    try {
      setLoading(true);
      const response = await API.prompts.getAll();
      if (response.success) {
        setPrompts(response.data);
      } else {
        throw new Error(response.error || 'Failed to fetch prompt history');
      }
    } catch (error) {
      console.error('Error fetching prompt history:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPrompts = prompts.filter(prompt =>
    prompt.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prompt.sessionName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleReusePrompt = async (prompt: PromptHistoryItem) => {
    try {
      // Generate a default worktree name based on the prompt
      const worktreeTemplate = prompt.sessionName.replace(/[-]\d+$/, '') || 'session';
      
      await createSession({
        prompt: prompt.prompt,
        worktreeTemplate,
        count: 1
      });
    } catch (error) {
      console.error('Error reusing prompt:', error);
    }
  };

  const handlePromptClick = async (promptItem: PromptHistoryItem) => {
    // Check if the session still exists
    const sessionExists = sessions.some(s => s.id === promptItem.sessionId);
    
    if (sessionExists) {
      // Set the selected prompt
      setSelectedPromptId(promptItem.id);
      
      // Switch to the session
      setActiveSession(promptItem.sessionId);
      
      // Get the prompt marker information
      try {
        const response = await API.prompts.getByPromptId(promptItem.id);
        if (response.success && response.data) {
          // Dispatch an event that SessionView can listen for
          window.dispatchEvent(new CustomEvent('navigateToPrompt', {
            detail: {
              sessionId: promptItem.sessionId,
              promptMarker: response.data
            }
          }));
        }
      } catch (error) {
        console.error('Error getting prompt details:', error);
      }
    } else {
      // Session no longer exists, show a message or handle appropriately
      console.warn('Session no longer exists:', promptItem.sessionId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'stopped':
        return 'text-green-600 bg-green-50';
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'running':
        return 'text-blue-600 bg-blue-50';
      case 'waiting':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const truncatePrompt = (prompt: string, maxLength: number = 100) => {
    return prompt.length > maxLength ? prompt.substring(0, maxLength) + '...' : prompt;
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 p-6 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Prompt History</h1>
        <div className="relative">
          <input
            type="text"
            placeholder="Search prompts or session names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-gray-500">Loading prompt history...</div>
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center text-gray-500">
              <div className="text-lg mb-2">
                {searchTerm ? 'No prompts found' : 'No prompt history yet'}
              </div>
              <div className="text-sm">
                {searchTerm 
                  ? 'Try adjusting your search terms'
                  : 'Create a session to start building your prompt history'
                }
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {filteredPrompts.map((promptItem) => (
              <div
                key={promptItem.id}
                className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                  selectedPromptId === promptItem.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200'
                }`}
                onClick={() => handlePromptClick(promptItem)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {promptItem.sessionName}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(promptItem.status)}`}>
                        {promptItem.status}
                      </span>
                    </div>
                    
                    <p className="text-gray-700 mb-3 leading-relaxed">
                      {truncatePrompt(promptItem.prompt, 200)}
                    </p>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>
                        Created {new Date(promptItem.createdAt).toLocaleDateString()} at{' '}
                        {new Date(promptItem.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2 ml-4">
                    <button
                      onClick={() => handleReusePrompt(promptItem)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Reuse
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(promptItem.prompt)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                
                {promptItem.prompt.length > 200 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-blue-600 text-sm hover:text-blue-800">
                      Show full prompt
                    </summary>
                    <p className="mt-2 text-gray-700 whitespace-pre-wrap">
                      {promptItem.prompt}
                    </p>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
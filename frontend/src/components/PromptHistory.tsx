import { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { API } from '../utils/api';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { Search, Copy } from 'lucide-react';

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
        return 'text-status-success bg-status-success/10';
      case 'error':
        return 'text-status-error bg-status-error/10';
      case 'running':
        return 'text-interactive bg-interactive/10';
      case 'waiting':
        return 'text-status-warning bg-status-warning/10';
      default:
        return 'text-text-tertiary bg-surface-tertiary';
    }
  };

  const truncatePrompt = (prompt: string, maxLength: number = 100) => {
    return prompt.length > maxLength ? prompt.substring(0, maxLength) + '...' : prompt;
  };

  return (
    <div className="h-full flex flex-col bg-bg-primary overflow-hidden">
      {/* Header */}
      <div className="border-b border-border-primary p-6 flex-shrink-0">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Prompt History</h1>
        <div className="relative">
          <Input
            type="text"
            placeholder="Search prompts or session names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            fullWidth
            className="pl-10"
          />
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-text-tertiary pointer-events-none" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-text-secondary">Loading prompt history...</div>
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-center text-text-secondary">
              <div className="text-lg mb-2">
                {searchTerm ? 'No prompts found' : 'No prompt history yet'}
              </div>
              <div className="text-sm text-text-tertiary">
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
              <Card
                key={promptItem.id}
                variant={selectedPromptId === promptItem.id ? 'interactive' : 'bordered'}
                className={`cursor-pointer transition-all ${
                  selectedPromptId === promptItem.id
                    ? 'border-interactive bg-interactive/10'
                    : ''
                }`}
                onClick={() => handlePromptClick(promptItem)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-medium text-text-primary truncate">
                        {promptItem.sessionName}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(promptItem.status)}`}>
                        {promptItem.status}
                      </span>
                    </div>
                    
                    <p className="text-text-secondary mb-3 leading-relaxed">
                      {truncatePrompt(promptItem.prompt, 200)}
                    </p>
                    
                    <div className="flex items-center justify-between text-sm text-text-tertiary">
                      <span>
                        Created {new Date(promptItem.createdAt).toLocaleDateString()} at{' '}
                        {new Date(promptItem.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2 ml-4">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReusePrompt(promptItem);
                      }}
                      size="sm"
                    >
                      Reuse
                    </Button>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(promptItem.prompt);
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
                
                {promptItem.prompt.length > 200 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-interactive-on-dark text-sm transition-colors">
                      Show full prompt
                    </summary>
                    <p className="mt-2 text-text-secondary whitespace-pre-wrap">
                      {promptItem.prompt}
                    </p>
                  </details>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
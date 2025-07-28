import { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { API } from '../utils/api';
import { Search } from 'lucide-react';
import { Modal, ModalHeader, ModalBody } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Badge } from './ui/Badge';

interface PromptHistoryItem {
  id: string;
  prompt: string;
  sessionName: string;
  sessionId: string;
  createdAt: string;
  status: string;
}

interface PromptHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PromptHistoryModal({ isOpen, onClose }: PromptHistoryModalProps) {
  const [prompts, setPrompts] = useState<PromptHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const createSession = useSessionStore((state) => state.createSession);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const sessions = useSessionStore((state) => state.sessions);

  useEffect(() => {
    if (isOpen) {
      fetchPromptHistory();
    }
  }, [isOpen]);

  // Modal component handles escape key automatically

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

  const handleReusePrompt = async (prompt: PromptHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Generate a default worktree name based on the prompt
      const worktreeTemplate = prompt.sessionName.replace(/[-]\d+$/, '') || 'session';
      
      await createSession({
        prompt: prompt.prompt,
        worktreeTemplate,
        count: 1
      });
      
      // Close the modal after creating the session
      onClose();
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
      
      // Close the modal after navigation
      onClose();
    } else {
      // Session no longer exists, show a message or handle appropriately
      console.warn('Session no longer exists:', promptItem.sessionId);
    }
  };

  const handleCopyPrompt = (prompt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(prompt);
  };

  const getStatusVariant = (status: string): 'success' | 'error' | 'warning' | 'info' | 'default' => {
    switch (status) {
      case 'completed':
      case 'stopped':
        return 'success';
      case 'error':
        return 'error';
      case 'running':
        return 'info';
      case 'waiting':
        return 'warning';
      default:
        return 'default';
    }
  };

  const truncatePrompt = (prompt: string, maxLength: number = 100) => {
    return prompt.length > maxLength ? prompt.substring(0, maxLength) + '...' : prompt;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
      <ModalHeader title="Prompt History" onClose={onClose} />
      
      <div className="p-6 border-b border-border-primary">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-text-muted" />
          </div>
          <Input
            type="text"
            placeholder="Search prompts or session names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <ModalBody className="p-6">
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
            <div className="space-y-4">
              {filteredPrompts.map((promptItem) => (
                <div
                  key={promptItem.id}
                  className={`border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                    selectedPromptId === promptItem.id
                      ? 'border-interactive bg-interactive/10'
                      : 'border-border-primary bg-surface-secondary hover:bg-surface-tertiary'
                  }`}
                  onClick={() => handlePromptClick(promptItem)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-medium text-text-primary truncate">
                          {promptItem.sessionName}
                        </h3>
                        <Badge variant={getStatusVariant(promptItem.status)} size="sm">
                          {promptItem.status}
                        </Badge>
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
                        onClick={(e) => handleReusePrompt(promptItem, e)}
                        variant="primary"
                        size="sm"
                      >
                        Reuse
                      </Button>
                      <Button
                        onClick={(e) => handleCopyPrompt(promptItem.prompt, e)}
                        variant="secondary"
                        size="sm"
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  
                  {promptItem.prompt.length > 200 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-interactive text-sm hover:text-interactive-hover">
                        Show full prompt
                      </summary>
                      <p className="mt-2 text-text-secondary whitespace-pre-wrap">
                        {promptItem.prompt}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
      </ModalBody>
    </Modal>
  );
}
import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useNotifications } from './hooks/useNotifications';
import { Sidebar } from './components/Sidebar';
import { SessionView } from './components/SessionView';
import { PromptHistory } from './components/PromptHistory';
import Help from './components/Help';
import Welcome from './components/Welcome';
import { MainProcessLogger } from './components/MainProcessLogger';
import { ErrorDialog } from './components/ErrorDialog';
import { PermissionDialog } from './components/PermissionDialog';
import { StravuStatusIndicator } from './components/StravuStatusIndicator';
import { useErrorStore } from './stores/errorStore';
import { useSessionStore } from './stores/sessionStore';
import { API } from './utils/api';

type ViewMode = 'sessions' | 'prompts';

interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  input: any;
  timestamp: number;
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<PermissionRequest | null>(null);
  const { currentError, clearError } = useErrorStore();
  const { sessions, isLoaded } = useSessionStore();
  
  useSocket();
  useNotifications();

  useEffect(() => {
    // Only show welcome screen on first launch when no data exists
    const checkInitialState = async () => {
      const hideWelcome = localStorage.getItem('crystal-hide-welcome');
      if (!hideWelcome && isLoaded) {
        // Check if there are any projects
        try {
          const projectsResponse = await API.projects.getAll();
          const hasProjects = projectsResponse.success && projectsResponse.data && projectsResponse.data.length > 0;
          const hasSessions = sessions.length > 0;
          
          // Only show welcome if no projects and no sessions exist
          if (!hasProjects && !hasSessions) {
            setIsWelcomeOpen(true);
          }
        } catch (error) {
          console.error('Error checking initial state:', error);
        }
      }
    };
    
    if (isLoaded) {
      checkInitialState();
    }
  }, [isLoaded, sessions.length]);
  
  useEffect(() => {
    // Set up permission request listener
    const handlePermissionRequest = (request: PermissionRequest) => {
      console.log('[App] Received permission request:', request);
      setCurrentPermissionRequest(request);
    };
    
    window.electron?.on('permission:request', handlePermissionRequest);
    
    return () => {
      window.electron?.off('permission:request', handlePermissionRequest);
    };
  }, []);
  
  const handlePermissionResponse = async (requestId: string, behavior: 'allow' | 'deny', updatedInput?: any, message?: string) => {
    try {
      await API.permissions.respond(requestId, {
        behavior,
        updatedInput,
        message
      });
      setCurrentPermissionRequest(null);
    } catch (error) {
      console.error('Failed to respond to permission request:', error);
    }
  };

  return (
    <div className="h-screen flex overflow-hidden">
      <MainProcessLogger />
      {/* Draggable title bar area */}
      <div 
        className="fixed top-0 left-0 right-0 h-8 z-50 flex items-center justify-end pr-4" 
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Stravu status indicator in top-right */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <StravuStatusIndicator />
        </div>
      </div>
      <Sidebar viewMode={viewMode} onViewModeChange={setViewMode} onHelpClick={() => setIsHelpOpen(true)} />
      {viewMode === 'sessions' ? <SessionView /> : <PromptHistory />}
      <Help isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <Welcome isOpen={isWelcomeOpen} onClose={() => setIsWelcomeOpen(false)} />
      <ErrorDialog 
        isOpen={!!currentError}
        onClose={clearError}
        title={currentError?.title}
        error={currentError?.error || ''}
        details={currentError?.details}
        command={currentError?.command}
      />
      <PermissionDialog
        request={currentPermissionRequest}
        onRespond={handlePermissionResponse}
        session={currentPermissionRequest ? sessions.find(s => s.id === currentPermissionRequest.sessionId) : undefined}
      />
    </div>
  );
}

export default App;
import { useState, useEffect } from 'react';
import { useIPCEvents } from './hooks/useIPCEvents';
import { useNotifications } from './hooks/useNotifications';
import { useResizable } from './hooks/useResizable';
import { Sidebar } from './components/Sidebar';
import { SessionView } from './components/SessionView';
import { PromptHistoryModal } from './components/PromptHistoryModal';
import Help from './components/Help';
import Welcome from './components/Welcome';
import { AboutDialog } from './components/AboutDialog';
import { UpdateDialog } from './components/UpdateDialog';
import { MainProcessLogger } from './components/MainProcessLogger';
import { ErrorDialog } from './components/ErrorDialog';
import { PermissionDialog } from './components/PermissionDialog';
import { DiscordPopup } from './components/DiscordPopup';
import { useErrorStore } from './stores/errorStore';
import { useSessionStore } from './stores/sessionStore';
import { API } from './utils/api';

interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  input: any;
  timestamp: number;
}

function App() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateVersionInfo, setUpdateVersionInfo] = useState<any>(null);
  const [currentPermissionRequest, setCurrentPermissionRequest] = useState<PermissionRequest | null>(null);
  const [isDiscordOpen, setIsDiscordOpen] = useState(false);
  const [hasCheckedWelcome, setHasCheckedWelcome] = useState(false);
  const [isPromptHistoryOpen, setIsPromptHistoryOpen] = useState(false);
  const { currentError, clearError } = useErrorStore();
  const { sessions, isLoaded } = useSessionStore();
  
  const { width: sidebarWidth, startResize } = useResizable({
    defaultWidth: 320,  // Increased from 256px (w-64)
    minWidth: 200,
    maxWidth: 600,
    storageKey: 'crystal-sidebar-width'
  });
  
  useIPCEvents();
  const { showNotification } = useNotifications();

  // Add keyboard shortcut for prompt history
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + P to open prompt history
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setIsPromptHistoryOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Show welcome screen and Discord popup intelligently based on user state
    // This should only run once when the app is loaded, not when sessions change
    const checkInitialState = async () => {
      if (!window.electron?.invoke) {
        console.log('[Welcome Debug] Electron API not available');
        return;
      }
      
      // Get preferences from database
      const hideWelcomeResult = await window.electron.invoke('preferences:get', 'hide_welcome');
      const welcomeShownResult = await window.electron.invoke('preferences:get', 'welcome_shown');
      const hideDiscordResult = await window.electron.invoke('preferences:get', 'hide_discord');
      
      const hideWelcome = hideWelcomeResult?.data === 'true';
      const hasSeenWelcome = welcomeShownResult?.data === 'true';
      const hideDiscord = hideDiscordResult?.data === 'true';
      
      console.log('[Welcome Debug] Checking welcome screen state:', {
        hideWelcomeRaw: hideWelcomeResult?.data,
        hideWelcome,
        hasSeenWelcome,
        hideDiscord,
        isLoaded
      });
      
      // Track whether we're showing the welcome screen
      let welcomeScreenShown = false;
      
      // If user explicitly said "don't show again", respect that preference
      if (hideWelcome) {
        console.log('[Welcome Debug] User has hidden welcome screen, not showing');
        welcomeScreenShown = false;
      } else if (isLoaded) {
        try {
          const projectsResponse = await API.projects.getAll();
          const hasProjects = projectsResponse.success && projectsResponse.data && projectsResponse.data.length > 0;
          // Get sessions from the API to avoid stale closure
          const sessionsResponse = await API.sessions.getAll();
          const hasSessions = sessionsResponse.success && sessionsResponse.data && sessionsResponse.data.length > 0;
          
          // Show welcome if:
          // 1. First time user (no projects and never seen welcome)
          // 2. Returning user with no active data (no projects and no sessions)
          const isFirstTimeUser = !hasProjects && !hasSeenWelcome;
          const isReturningUserWithNoData = !hasProjects && !hasSessions && hasSeenWelcome;
          
          console.log('[Welcome Debug] Conditions:', {
            hasProjects,
            hasSessions,
            isFirstTimeUser,
            isReturningUserWithNoData
          });
          
          if (isFirstTimeUser || isReturningUserWithNoData) {
            console.log('[Welcome Debug] Showing welcome screen');
            setIsWelcomeOpen(true);
            welcomeScreenShown = true;
            // Mark that welcome has been shown at least once
            await window.electron.invoke('preferences:set', 'welcome_shown', 'true');
          } else {
            console.log('[Welcome Debug] Not showing welcome screen');
            welcomeScreenShown = false;
          }
        } catch (error) {
          console.error('Error checking initial state:', error);
          welcomeScreenShown = false;
        }
      }
      
      // If welcome screen is not shown and Discord hasn't been hidden, check if we should show Discord popup
      if (!welcomeScreenShown && !hideDiscord && isLoaded) {
        console.log('[Discord Debug] Welcome screen not shown, checking Discord popup...');
        
        try {
          // Get the last app open to see if Discord was already shown
          const result = await window.electron.invoke('app:get-last-open');
          console.log('[Discord Debug] Last app open result:', result);
          
          if (result?.success && result.data) {
            const lastOpen = result.data;
            console.log('[Discord Debug] Last app open data:', lastOpen);
            
            // Show Discord popup if it hasn't been shown yet
            if (!lastOpen.discord_shown) {
              console.log('[Discord Debug] Showing Discord popup!');
              setIsDiscordOpen(true);
              // Mark that we're showing the Discord popup
              if (window.electron?.invoke) {
                await window.electron.invoke('app:update-discord-shown');
              }
            } else {
              console.log('[Discord Debug] Not showing Discord popup because it was already shown');
            }
          } else {
            // No previous app open - show Discord popup
            console.log('[Discord Debug] No previous app open found, showing Discord popup');
            setIsDiscordOpen(true);
            // Will update discord shown status after recording app open
          }
        } catch (error) {
          console.error('[Discord Debug] Error checking Discord popup:', error);
        }
        
        // Record this app open
        console.log('[Discord Debug] Recording current app open');
        if (window.electron?.invoke) {
          await window.electron.invoke('app:record-open', hideWelcome, false);
          
          // If we showed Discord popup and there was no previous app open, update the status
          const result = await window.electron.invoke('app:get-last-open');
          if (!result?.data?.discord_shown && isDiscordOpen) {
            await window.electron.invoke('app:update-discord-shown');
          }
        }
      }
    };
    
    if (isLoaded && !hasCheckedWelcome) {
      checkInitialState();
      setHasCheckedWelcome(true);
    }
  }, [isLoaded, hasCheckedWelcome]); // Remove sessions.length from dependencies to prevent re-runs

  // Discord popup logic is now combined with welcome screen logic above
  
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

  useEffect(() => {
    // Set up version update listener
    if (!window.electronAPI?.events) return;
    
    const handleVersionUpdate = (versionInfo: any) => {
      console.log('[App] Version update available:', versionInfo);
      setUpdateVersionInfo(versionInfo);
      setIsUpdateDialogOpen(true);
      showNotification(
        `🚀 Update Available - Crystal v${versionInfo.latest}`,
        'A new version of Crystal is available!',
        '/favicon.ico'
      );
    };
    
    // Set up the listener using the events API
    const removeListener = window.electronAPI.events.onVersionUpdateAvailable(handleVersionUpdate);
    
    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, [showNotification]);
  
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
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900">
      <MainProcessLogger />
      {/* Draggable title bar area */}
      <div 
        className="fixed top-0 left-0 right-0 h-8 z-50 flex items-center justify-end pr-4" 
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
      </div>
      <Sidebar 
        onHelpClick={() => setIsHelpOpen(true)}
        onAboutClick={() => setIsAboutOpen(true)}
        onPromptHistoryClick={() => setIsPromptHistoryOpen(true)}
        width={sidebarWidth}
        onResize={startResize}
      />
      <SessionView />
      <Help isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <Welcome isOpen={isWelcomeOpen} onClose={() => setIsWelcomeOpen(false)} />
      <AboutDialog isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <UpdateDialog 
        isOpen={isUpdateDialogOpen} 
        onClose={() => setIsUpdateDialogOpen(false)}
        versionInfo={updateVersionInfo}
      />
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
      <DiscordPopup 
        isOpen={isDiscordOpen} 
        onClose={() => setIsDiscordOpen(false)} 
      />
      <PromptHistoryModal
        isOpen={isPromptHistoryOpen}
        onClose={() => setIsPromptHistoryOpen(false)}
      />
    </div>
  );
}

export default App;
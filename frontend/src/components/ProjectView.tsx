import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ProjectDashboard } from './ProjectDashboard';
import { API } from '../utils/api';
import { useSessionStore } from '../stores/sessionStore';
import { Session } from '../types/session';
import { cn } from '../utils/cn';
import { BarChart3 } from 'lucide-react';
import { PanelTabBar } from './panels/PanelTabBar';
import { PanelContainer } from './panels/PanelContainer';
import { usePanelStore } from '../stores/panelStore';
import { panelApi } from '../services/panelApi';
import { ToolPanel, ToolPanelType } from '../../../shared/types/panels';
import { SessionProvider } from '../contexts/SessionContext';

export type ProjectViewMode = 'dashboard';

interface ProjectViewProps {
  projectId: number;
  projectName: string;
  onGitPull: () => void;
  onGitPush: () => void;
  isMerging: boolean;
}

// Dashboard tab component
const ProjectDashboardTab: React.FC<{ showDashboard: boolean; onToggleDashboard: () => void }> = ({
  showDashboard,
  onToggleDashboard
}) => {
  return (
    <div className="flex items-center bg-surface-secondary" role="tablist">
      <button
        role="tab"
        aria-selected={showDashboard}
        onClick={onToggleDashboard}
        className={cn(
          "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all",
          "border-b-2 hover:text-text-primary",
          showDashboard ? [
            "text-text-primary border-interactive",
            "bg-gradient-to-t from-interactive/5 to-transparent"
          ] : [
            "text-text-secondary border-transparent",
            "hover:border-border-secondary hover:bg-surface-hover/50"
          ]
        )}
      >
        <span className={cn(
          "transition-colors",
          showDashboard ? "text-interactive" : "text-text-tertiary"
        )}>
          <BarChart3 className="w-4 h-4" />
        </span>
        <span>Dashboard</span>
      </button>
    </div>
  );
};

export const ProjectView: React.FC<ProjectViewProps> = ({ 
  projectId, 
  projectName, 
  onGitPull, 
  onGitPush, 
  isMerging
}) => {
    const [showDashboard, setShowDashboard] = useState(true);
  const [mainRepoSessionId, setMainRepoSessionId] = useState<string | null>(null);
  const [mainRepoSession, setMainRepoSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  
  // Panel store state and actions
  const {
    panels,
    activePanels,
    setPanels,
    setActivePanel: setActivePanelInStore,
    addPanel,
    removePanel
  } = usePanelStore();
  
  // Load panels when main repo session changes
  useEffect(() => {
    if (mainRepoSessionId) {
      console.log('[ProjectView] Loading panels for project session:', mainRepoSessionId);
      panelApi.loadPanelsForSession(mainRepoSessionId).then(loadedPanels => {
        console.log('[ProjectView] Loaded panels:', loadedPanels);
        setPanels(mainRepoSessionId, loadedPanels);
      });
      
      panelApi.getActivePanel(mainRepoSessionId).then(activePanel => {
        console.log('[ProjectView] Active panel from backend:', activePanel);
        if (activePanel) {
          setActivePanelInStore(mainRepoSessionId, activePanel.id);
        }
      });
    }
  }, [mainRepoSessionId, setPanels, setActivePanelInStore]);
  
  // Get panels for current main repo session
  const sessionPanels = useMemo(
    () => panels[mainRepoSessionId || ''] || [],
    [panels, mainRepoSessionId]
  );

  const currentActivePanel = useMemo(
    () => sessionPanels.find(p => p.id === activePanels[mainRepoSessionId || '']),
    [sessionPanels, activePanels, mainRepoSessionId]
  );
  
  // Panel event handlers
  const handlePanelSelect = useCallback(
    async (panel: ToolPanel) => {
      if (!mainRepoSessionId) return;
      setActivePanelInStore(mainRepoSessionId, panel.id);
      await panelApi.setActivePanel(mainRepoSessionId, panel.id);
      setShowDashboard(false);
    },
    [mainRepoSessionId, setActivePanelInStore]
  );

  const handlePanelClose = useCallback(
    async (panel: ToolPanel) => {
      if (!mainRepoSessionId) return;
      
      // Find next panel to activate
      const panelIndex = sessionPanels.findIndex(p => p.id === panel.id);
      const nextPanel = sessionPanels[panelIndex + 1] || sessionPanels[panelIndex - 1];
      
      // Remove from store first for immediate UI update
      removePanel(mainRepoSessionId, panel.id);
      
      // Set next active panel if available
      if (nextPanel) {
        setActivePanelInStore(mainRepoSessionId, nextPanel.id);
        await panelApi.setActivePanel(mainRepoSessionId, nextPanel.id);
      } else {
        // If no panels left, show dashboard
        setShowDashboard(true);
      }
      
      // Delete on backend
      await panelApi.deletePanel(panel.id);
    },
    [mainRepoSessionId, sessionPanels, removePanel, setActivePanelInStore]
  );

  const handlePanelCreate = useCallback(
    async (type: ToolPanelType) => {
      if (!mainRepoSessionId) return;
      
      await panelApi.createPanel({
        sessionId: mainRepoSessionId,
        type
      });
      setShowDashboard(false);
    },
    [mainRepoSessionId]
  );
  
  // Wrapped git operations
  const handleGitPull = useCallback(() => {
    // Find or create a Claude panel
    const claudePanel = sessionPanels.find(p => p.type === 'claude');
    if (claudePanel) {
      handlePanelSelect(claudePanel);
    } else {
      handlePanelCreate('claude');
    }
    onGitPull();
  }, [onGitPull, sessionPanels, handlePanelSelect, handlePanelCreate]);
  
  const handleGitPush = useCallback(() => {
    // Find or create a Claude panel
    const claudePanel = sessionPanels.find(p => p.type === 'claude');
    if (claudePanel) {
      handlePanelSelect(claudePanel);
    } else {
      handlePanelCreate('claude');
    }
    onGitPush();
  }, [onGitPush, sessionPanels, handlePanelSelect, handlePanelCreate]);
  
  // We don't need terminal handling or the hook for now, as panels handle their own terminals
  
  // Debug logging
  useEffect(() => {
    console.log('[ProjectView] Session state:', { 
      mainRepoSessionId, 
      mainRepoSession: mainRepoSession?.id,
      showDashboard,
      activeSessionInStore: useSessionStore.getState().activeSessionId
    });
  }, [mainRepoSessionId, mainRepoSession, showDashboard]);

  // Get or create main repo session when panels are needed
  useEffect(() => {
    // Create main repo session when component mounts to support panels
    const getMainRepoSession = async () => {
      setIsLoadingSession(true);
      try {
        const response = await API.sessions.getOrCreateMainRepoSession(projectId);
        if (response.success && response.data) {
          setMainRepoSessionId(response.data.id);
          setMainRepoSession(response.data);
          
          // Subscribe to session updates
          const sessions = useSessionStore.getState().sessions;
          const mainSession = sessions.find(s => s.id === response.data.id);
          if (mainSession) {
            setMainRepoSession(mainSession);
          }
          
          // Set as active session
          useSessionStore.getState().setActiveSession(response.data.id);
        }
      } catch (error) {
        console.error('Failed to get main repo session:', error);
      } finally {
        setIsLoadingSession(false);
      }
    };

    getMainRepoSession();
  }, [projectId]);
  
  // Subscribe to session updates - optimized to check for actual changes
  useEffect(() => {
    if (!mainRepoSessionId) return;
    
    let previousSession = useSessionStore.getState().sessions.find(s => s.id === mainRepoSessionId);
    const unsubscribe = useSessionStore.subscribe((state) => {
      const session = state.sessions.find(s => s.id === mainRepoSessionId);
      // Only update if session actually changed
      if (session && session !== previousSession) {
        previousSession = session;
        setMainRepoSession(session);
      }
    });
    
    return unsubscribe;
  }, [mainRepoSessionId]);

  // Listen for panel updates from the backend
  useEffect(() => {
    if (!mainRepoSessionId) return;
    
    // Handle panel creation events (for auto-created panels like logs)
    const handlePanelCreated = (panel: ToolPanel) => {
      console.log('[ProjectView] Received panel:created event:', panel);
      
      // Only add if it's for the current session
      if (panel.sessionId === mainRepoSessionId) {
        // The store's addPanel now checks for duplicates, so we can safely call it
        addPanel(panel);
        // Hide dashboard when a panel is created
        setShowDashboard(false);
      }
    };
    
    // Listen for panel events
    const unsubscribeCreated = window.electronAPI?.events?.onPanelCreated?.(handlePanelCreated);
    
    // Cleanup
    return () => {
      unsubscribeCreated?.();
    };
  }, [mainRepoSessionId, addPanel, setShowDashboard]);
  
  // We don't need Stravu connection status here anymore as it's handled in panels
  
  // Toggle dashboard
  const handleToggleDashboard = useCallback(() => {
    setShowDashboard(!showDashboard);
    if (!showDashboard && currentActivePanel) {
      // If showing dashboard, deactivate current panel
      setActivePanelInStore(mainRepoSessionId || '', '');
    }
  }, [showDashboard, currentActivePanel, setActivePanelInStore, mainRepoSessionId]);


  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
      {/* Project Header */}
      <div className="bg-surface-primary border-b border-border-primary px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 relative">
            <h2 className="font-bold text-xl text-text-primary truncate">
              {projectName}
            </h2>
            
            {/* Git Actions for Main Project */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="flex flex-wrap items-center gap-2 relative z-20">
                <div className="group relative">
                  <button 
                    onClick={handleGitPull} 
                    disabled={isMerging} 
                    className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                      isMerging 
                        ? 'bg-surface-secondary border-border-secondary text-text-disabled cursor-not-allowed' 
                        : 'bg-surface-secondary border-status-info text-status-info hover:bg-status-info/10 hover:border-status-info/70'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" />
                    </svg>
                    <span className="text-sm font-medium">{isMerging ? 'Pulling...' : 'Pull'}</span>
                  </button>
                </div>
                <div className="group relative">
                  <button 
                    onClick={handleGitPush} 
                    disabled={isMerging} 
                    className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                      isMerging 
                        ? 'bg-surface-secondary border-border-secondary text-text-disabled cursor-not-allowed' 
                        : 'bg-surface-secondary border-status-success text-status-success hover:bg-status-success/10 hover:border-status-success/70'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
                    </svg>
                    <span className="text-sm font-medium">{isMerging ? 'Pushing...' : 'Push'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Tab */}
      <ProjectDashboardTab 
        showDashboard={showDashboard}
        onToggleDashboard={handleToggleDashboard}
      />
      
      {/* Tool Panel Bar */}
      {mainRepoSessionId && (
        <SessionProvider session={mainRepoSession}>
          <PanelTabBar
            panels={sessionPanels}
            activePanel={currentActivePanel}
            onPanelSelect={handlePanelSelect}
            onPanelClose={handlePanelClose}
            onPanelCreate={handlePanelCreate}
            context="project"
          />
        </SessionProvider>
      )}

      {/* Content Area */}
      <div className="flex-1 flex relative min-h-0">
        <div className="flex-1 relative">
          {showDashboard ? (
            /* Dashboard View */
            <div className="h-full flex flex-col p-6">
              <ProjectDashboard 
                projectId={projectId} 
                projectName={projectName} 
              />
            </div>
          ) : (
            /* Panel Views */
            <>
              {isLoadingSession || !mainRepoSessionId ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-interactive mx-auto mb-4"></div>
                    <p className="text-text-secondary">Loading panels...</p>
                  </div>
                </div>
              ) : sessionPanels.length > 0 && currentActivePanel ? (
                <SessionProvider session={mainRepoSession}>
                  {sessionPanels.map(panel => (
                    <div 
                      key={panel.id} 
                      className="absolute inset-0"
                      style={{ display: panel.id === currentActivePanel.id ? 'block' : 'none' }}
                    >
                      <PanelContainer
                        panel={panel}
                        isActive={panel.id === currentActivePanel.id}
                      />
                    </div>
                  ))}
                </SessionProvider>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-text-secondary mb-4">No panels open</p>
                    <p className="text-text-tertiary text-sm">Click "Add Tool" above to create a panel</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
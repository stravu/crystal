import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API } from '../utils/api';
import { useSessionStore } from '../stores/sessionStore';
import { Session } from '../types/session';
import { PanelTabBar } from './panels/PanelTabBar';
import { PanelContainer } from './panels/PanelContainer';
import { usePanelStore } from '../stores/panelStore';
import { panelApi } from '../services/panelApi';
import { ToolPanel, ToolPanelType } from '../../../shared/types/panels';
import { SessionProvider } from '../contexts/SessionContext';

interface ProjectViewProps {
  projectId: number;
  projectName: string;
  onGitPull: () => void;
  onGitPush: () => void;
  isMerging: boolean;
}

export const ProjectView: React.FC<ProjectViewProps> = ({ 
  projectId, 
  projectName, 
  onGitPull, 
  onGitPush, 
  isMerging
}) => {
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
  
  // Load panels when main repo session changes and ensure dashboard panel exists
  useEffect(() => {
    if (mainRepoSessionId) {
      console.log('[ProjectView] Loading panels for project session:', mainRepoSessionId);
      panelApi.loadPanelsForSession(mainRepoSessionId).then(async (loadedPanels) => {
        console.log('[ProjectView] Loaded panels:', loadedPanels);
        
        // Check if dashboard panel exists, create if not
        const dashboardPanel = loadedPanels.find(p => p.type === 'dashboard');
        const setupTasksPanel = loadedPanels.find(p => p.type === 'setup-tasks');
        
        let panelsCreated = false;
        
        if (!dashboardPanel) {
          console.log('[ProjectView] Creating dashboard panel for project');
          await panelApi.createPanel({
            sessionId: mainRepoSessionId,
            type: 'dashboard',
            title: 'Dashboard',
            metadata: { permanent: true }
          });
          panelsCreated = true;
        }
        
        if (!setupTasksPanel) {
          console.log('[ProjectView] Creating setup-tasks panel for project');
          await panelApi.createPanel({
            sessionId: mainRepoSessionId,
            type: 'setup-tasks',
            title: 'Setup',
            metadata: { permanent: true }
          });
          panelsCreated = true;
        }
        
        // Reload panels if any were created
        const finalPanels = panelsCreated 
          ? await panelApi.loadPanelsForSession(mainRepoSessionId)
          : loadedPanels;
        
        setPanels(mainRepoSessionId, finalPanels);
        
        // Determine which panel should be active
        const activePanel = await panelApi.getActivePanel(mainRepoSessionId);
        const setupPanel = finalPanels.find(p => p.type === 'setup-tasks');
        const dashPanel = finalPanels.find(p => p.type === 'dashboard');
        
        if (!activePanel) {
          // No active panel - prioritize setup-tasks if it exists, otherwise dashboard
          const panelToActivate = setupPanel || dashPanel;
          if (panelToActivate) {
            setActivePanelInStore(mainRepoSessionId, panelToActivate.id);
            await panelApi.setActivePanel(mainRepoSessionId, panelToActivate.id);
          }
        } else {
          // There's already an active panel, use it
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
    },
    [mainRepoSessionId, setActivePanelInStore]
  );

  const handlePanelClose = useCallback(
    async (panel: ToolPanel) => {
      if (!mainRepoSessionId) return;
      
      // Don't allow closing dashboard or setup-tasks panels
      if (panel.type === 'dashboard' || panel.type === 'setup-tasks') {
        console.log('[ProjectView] Cannot close permanent panel:', panel.type);
        return;
      }
      
      // Find next panel to activate
      const panelIndex = sessionPanels.findIndex(p => p.id === panel.id);
      let nextPanel = sessionPanels[panelIndex + 1] || sessionPanels[panelIndex - 1];
      
      // If no other panel or the next panel is the same, fall back to dashboard
      if (!nextPanel || nextPanel.id === panel.id) {
        nextPanel = sessionPanels.find(p => p.type === 'dashboard') || sessionPanels[0];
      }
      
      // Remove from store first for immediate UI update
      removePanel(mainRepoSessionId, panel.id);
      
      // Set next active panel (should always have dashboard)
      if (nextPanel) {
        setActivePanelInStore(mainRepoSessionId, nextPanel.id);
        await panelApi.setActivePanel(mainRepoSessionId, nextPanel.id);
      }
      
      // Delete on backend
      await panelApi.deletePanel(panel.id);
    },
    [mainRepoSessionId, sessionPanels, removePanel, setActivePanelInStore]
  );

  const handlePanelCreate = useCallback(
    async (type: ToolPanelType) => {
      if (!mainRepoSessionId) return;
      
      const newPanel = await panelApi.createPanel({
        sessionId: mainRepoSessionId,
        type
      });
      
      // Immediately add the panel and set it as active
      // The panel:created event will also fire, but addPanel checks for duplicates
      addPanel(newPanel);
      setActivePanelInStore(mainRepoSessionId, newPanel.id);
    },
    [mainRepoSessionId, addPanel, setActivePanelInStore]
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
      activePanelType: currentActivePanel?.type,
      activeSessionInStore: useSessionStore.getState().activeSessionId
    });
  }, [mainRepoSessionId, mainRepoSession, currentActivePanel]);

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
      }
    };
    
    // Listen for panel events
    const unsubscribeCreated = window.electronAPI?.events?.onPanelCreated?.(handlePanelCreated);
    
    // Cleanup
    return () => {
      unsubscribeCreated?.();
    };
  }, [mainRepoSessionId, addPanel]);
  
  // We don't need Stravu connection status here anymore as it's handled in panels


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

      {/* Tool Panel Bar (Dashboard is now part of the panel system) */}
      {mainRepoSessionId && (
        <SessionProvider session={mainRepoSession} projectName={projectName}>
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
          {isLoadingSession || !mainRepoSessionId ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-interactive mx-auto mb-4"></div>
                <p className="text-text-secondary">Loading panels...</p>
              </div>
            </div>
          ) : sessionPanels.length > 0 && currentActivePanel ? (
            <SessionProvider session={mainRepoSession} projectName={projectName}>
              {sessionPanels.map(panel => (
                <div 
                  key={panel.id} 
                  className="absolute inset-0"
                  style={{ display: panel.id === currentActivePanel.id ? 'block' : 'none' }}
                >
                  <PanelContainer
                    panel={panel}
                    isActive={panel.id === currentActivePanel.id}
                    isMainRepo={!!mainRepoSession?.isMainRepo}
                  />
                </div>
              ))}
            </SessionProvider>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-text-secondary mb-4">Loading dashboard...</p>
                <p className="text-text-tertiary text-sm">Setting up project panels</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

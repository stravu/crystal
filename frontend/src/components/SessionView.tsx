import { useRef, useEffect, useState, memo, useMemo, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useNavigationStore } from '../stores/navigationStore';
import { EmptyState } from './EmptyState';
// import CombinedDiffView from './panels/diff/CombinedDiffView'; // Removed - now in panels
import { StravuFileSearch } from './StravuFileSearch';
import { Inbox } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useSessionView } from '../hooks/useSessionView';
import { SessionHeader } from './session/SessionHeader';
// import { SessionInputWithImages } from './panels/claude/ClaudeInputWithImages'; // Removed - now in panels
import { GitErrorDialog } from './session/GitErrorDialog';
import { CommitMessageDialog } from './session/CommitMessageDialog';
// import { FileEditor } from './panels/editor/FileEditor'; // Removed - now in panels
import { ProjectView } from './ProjectView';
import { API } from '../utils/api';
// import { RichOutputWithSidebar } from './panels/claude/RichOutputWithSidebar'; // Removed - now in panels
// import { RichOutputSettings } from './panels/claude/RichOutputView'; // Removed - not needed
// import { LogsView } from './panels/logPanel/LogsView'; // Removed - now in panels
// import { MessagesView } from './panels/claude/MessagesView'; // Removed - now in panels
import { usePanelStore } from '../stores/panelStore';
import { panelApi } from '../services/panelApi';
import { PanelTabBar } from './panels/PanelTabBar';
import { PanelContainer } from './panels/PanelContainer';
import { SessionProvider } from '../contexts/SessionContext';
import { ToolPanel, ToolPanelType } from '../../../shared/types/panels';
import { Download, Upload, GitMerge, Code2 } from 'lucide-react';
import type { Project } from '../types/project';

export const SessionView = memo(() => {
  const { activeView, activeProjectId } = useNavigationStore();
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [isMergingProject, setIsMergingProject] = useState(false);
  const [sessionProject, setSessionProject] = useState<Project | null>(null);

  // Get active session by subscribing directly to store state
  // This ensures the component re-renders when git status or other session properties update
  const activeSession = useSessionStore((state) => {
    if (!state.activeSessionId) return undefined;
    // Check main repo session first
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === state.activeSessionId) {
      return state.activeMainRepoSession;
    }
    // Otherwise look in regular sessions
    return state.sessions.find(session => session.id === state.activeSessionId);
  });

  // Panel store state and actions
  const {
    panels,
    activePanels,
    setPanels,
    setActivePanel: setActivePanelInStore,
    addPanel,
    removePanel,
    updatePanelState,
  } = usePanelStore();

  // Load panels when session changes
  useEffect(() => {
    if (activeSession?.id) {
      console.log('[SessionView] Loading panels for session:', activeSession.id);
      panelApi.loadPanelsForSession(activeSession.id).then(loadedPanels => {
        console.log('[SessionView] Loaded panels:', loadedPanels);
        setPanels(activeSession.id, loadedPanels);
      });
      
      panelApi.getActivePanel(activeSession.id).then(activePanel => {
        console.log('[SessionView] Active panel from backend:', activePanel);
        if (activePanel) {
          setActivePanelInStore(activeSession.id, activePanel.id);
        }
      });
    }
  }, [activeSession?.id, setPanels, setActivePanelInStore]);
  
  // Listen for panel updates from the backend
  useEffect(() => {
    if (!activeSession?.id) return;
    
    // Handle panel creation events (for logs panel auto-creation)
    const handlePanelCreated = (panel: ToolPanel) => {
      console.log('[SessionView] Received panel:created event:', panel);
      
      // Only add if it's for the current session
      if (panel.sessionId === activeSession.id) {
        // Check if panel already exists to prevent duplicates
        const existingPanels = panels[activeSession.id] || [];
        const panelExists = existingPanels.some(p => p.id === panel.id);
        
        if (!panelExists) {
          console.log('[SessionView] Adding new panel to store:', panel);
          addPanel(panel);
        } else {
          console.log('[SessionView] Panel already exists, not adding duplicate:', panel.id);
        }
      }
    };
    
    const handlePanelUpdated = (updatedPanel: ToolPanel) => {
      console.log('[SessionView] Received panel:updated event:', updatedPanel);
      
      // Only update if it's for the current session
      if (updatedPanel.sessionId === activeSession.id) {
        console.log('[SessionView] Updating panel in store:', updatedPanel);
        updatePanelState(updatedPanel);
      }
    };
    
    // Listen for panel events
    const unsubscribeCreated = window.electronAPI?.events?.onPanelCreated?.(handlePanelCreated);
    const unsubscribeUpdated = window.electronAPI?.events?.onPanelUpdated?.(handlePanelUpdated);
    
    // Cleanup
    return () => {
      unsubscribeCreated?.();
      unsubscribeUpdated?.();
    };
  }, [activeSession?.id, addPanel, updatePanelState, panels]);

  // Get panels for current session with memoization
  const sessionPanels = useMemo(
    () => panels[activeSession?.id || ''] || [],
    [panels, activeSession?.id]
  );

  const currentActivePanel = useMemo(
    () => sessionPanels.find(p => p.id === activePanels[activeSession?.id || '']),
    [sessionPanels, activePanels, activeSession?.id]
  );
  
  // Check if session has Claude panels
  const hasClaudePanels = useMemo(
    () => sessionPanels.some(panel => panel.type === 'claude'),
    [sessionPanels]
  );
  
  // Debug logging
  console.log('[SessionView] Session panels:', sessionPanels);
  console.log('[SessionView] Active panel ID:', activePanels[activeSession?.id || '']);
  console.log('[SessionView] Current active panel:', currentActivePanel);
  console.log('[SessionView] Has Claude panels:', hasClaudePanels);

  // FIX: Memoize all callbacks to prevent re-renders
  const handlePanelSelect = useCallback(
    async (panel: ToolPanel) => {
      if (!activeSession) return;
      setActivePanelInStore(activeSession.id, panel.id);
      await panelApi.setActivePanel(activeSession.id, panel.id);
    },
    [activeSession, setActivePanelInStore]
  );

  const handlePanelClose = useCallback(
    async (panel: ToolPanel) => {
      if (!activeSession) return;
      
      // Find next panel to activate
      const panelIndex = sessionPanels.findIndex(p => p.id === panel.id);
      const nextPanel = sessionPanels[panelIndex + 1] || sessionPanels[panelIndex - 1];
      
      // Remove from store first for immediate UI update
      removePanel(activeSession.id, panel.id);
      
      // Set next active panel if available
      if (nextPanel) {
        setActivePanelInStore(activeSession.id, nextPanel.id);
        await panelApi.setActivePanel(activeSession.id, nextPanel.id);
      }
      
      // Delete on backend
      await panelApi.deletePanel(panel.id);
    },
    [activeSession, sessionPanels, removePanel, setActivePanelInStore]
  );

  const handlePanelCreate = useCallback(
    async (type: ToolPanelType) => {
      if (!activeSession) return;
      
      // For Codex panels, include the last selected model and thinking level in initial state
      let initialState: { customState?: unknown } | undefined = undefined;
      if (type === 'codex') {
        const savedModel = localStorage.getItem('codex.lastSelectedModel');
        const savedThinkingLevel = localStorage.getItem('codex.lastSelectedThinkingLevel');
        
        initialState = {
          customState: {
            codexConfig: {
              model: savedModel || 'auto',
              modelProvider: 'openai',
              thinkingLevel: savedThinkingLevel || 'medium',
              sandboxMode: 'workspace-write',
              webSearch: false
            }
          }
        };
      }
      
      await panelApi.createPanel({
        sessionId: activeSession.id,
        type,
        initialState
      });
      
      // Don't add to store here - the panel:created event will handle it
      // This prevents duplicate panels from appearing
    },
    [activeSession]
  );

  // Load project data for active session
  useEffect(() => {
    const loadSessionProject = async () => {
      if (activeSession?.projectId) {
        try {
          const response = await API.projects.getAll();
          if (response.success && response.data) {
            const project = response.data.find((p: Project) => p.id === activeSession.projectId);
            if (project) {
              setSessionProject(project);
            }
          }
        } catch (error) {
          console.error('Failed to load session project:', error);
        }
      } else {
        setSessionProject(null);
      }
    };
    loadSessionProject();
  }, [activeSession?.projectId]);

  // Load project data when activeProjectId changes
  useEffect(() => {
    if (activeView === 'project' && activeProjectId) {
      const loadProjectData = async () => {
        setIsProjectLoading(true);
        try {
          // Get all projects and find the one we need
          const response = await API.projects.getAll();
          if (response.success && response.data) {
            const project = response.data.find((p: Project) => p.id === activeProjectId);
            if (project) {
              setProjectData(project);
            }
          }
        } catch (error) {
          console.error('Failed to load project data:', error);
        } finally {
          setIsProjectLoading(false);
        }
      };
      loadProjectData();
    } else {
      setProjectData(null);
    }
  }, [activeView, activeProjectId]);

  const handleProjectGitPull = async () => {
    if (!activeProjectId || !projectData) return;
    setIsMergingProject(true);
    try {
      // Get or create main repo session for this project
      const sessionResponse = await API.sessions.getOrCreateMainRepoSession(activeProjectId);
      if (sessionResponse.success && sessionResponse.data) {
        const response = await API.sessions.gitPull(sessionResponse.data.id);
        if (!response.success) {
          console.error('Git pull failed:', response.error);
        }
      }
    } catch (error) {
      console.error('Failed to perform git pull:', error);
    } finally {
      setIsMergingProject(false);
    }
  };

  const handleProjectGitPush = async () => {
    if (!activeProjectId || !projectData) return;
    setIsMergingProject(true);
    try {
      // Get or create main repo session for this project
      const sessionResponse = await API.sessions.getOrCreateMainRepoSession(activeProjectId);
      if (sessionResponse.success && sessionResponse.data) {
        const response = await API.sessions.gitPush(sessionResponse.data.id);
        if (!response.success) {
          console.error('Git push failed:', response.error);
        }
      }
    } catch (error) {
      console.error('Failed to perform git push:', error);
    } finally {
      setIsMergingProject(false);
    }
  };

  const terminalRef = useRef<HTMLDivElement>(null);
  // scriptTerminalRef removed - terminals now handled by panels

  const hook = useSessionView(activeSession, terminalRef);
  
  // Create branch actions for the panel bar
  const branchActions = useMemo(() => {
    if (!activeSession) return [];
    
    return activeSession.isMainRepo ? [
      {
        id: 'pull',
        label: 'Pull from Remote',
        icon: Download,
        onClick: hook.handleGitPull,
        disabled: hook.isMerging || activeSession.status === 'running' || activeSession.status === 'initializing',
        variant: 'default' as const,
        description: hook.gitCommands?.getPullCommand ? `git ${hook.gitCommands.getPullCommand()}` : 'git pull'
      },
      {
        id: 'push',
        label: 'Push to Remote', 
        icon: Upload,
        onClick: hook.handleGitPush,
        disabled: hook.isMerging || activeSession.status === 'running' || activeSession.status === 'initializing',
        variant: 'success' as const,
        description: hook.gitCommands?.getPushCommand ? `git ${hook.gitCommands.getPushCommand()}` : 'git push'
      }
    ] : [
      {
        id: 'rebase-from-main',
        label: `Rebase from ${hook.gitCommands?.mainBranch || 'main'}`,
        icon: GitMerge,
        onClick: hook.handleRebaseMainIntoWorktree,
        disabled: hook.isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hook.hasChangesToRebase,
        variant: 'default' as const,
        description: hook.gitCommands?.getRebaseFromMainCommand ? hook.gitCommands.getRebaseFromMainCommand() : `Pulls latest changes from ${hook.gitCommands?.mainBranch || 'main'}`
      },
      {
        id: 'rebase-to-main',
        label: `Rebase to ${hook.gitCommands?.mainBranch || 'main'}`,
        icon: GitMerge,
        onClick: hook.handleSquashAndRebaseToMain,
        disabled: hook.isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || 
                  (!activeSession.gitStatus?.totalCommits || activeSession.gitStatus?.totalCommits === 0 || activeSession.gitStatus?.ahead === 0),
        variant: 'success' as const,
        description: (!activeSession.gitStatus?.totalCommits || activeSession.gitStatus?.totalCommits === 0 || activeSession.gitStatus?.ahead === 0) ? 
                     'No commits to rebase' : 
                     (hook.gitCommands?.getSquashAndRebaseToMainCommand ? hook.gitCommands.getSquashAndRebaseToMainCommand() : `Squashes all commits and rebases onto ${hook.gitCommands?.mainBranch || 'main'}`)
      },
      {
        id: 'open-ide',
        label: hook.isOpeningIDE ? 'Opening...' : 'Open in IDE',
        icon: Code2,
        onClick: hook.handleOpenIDE,
        disabled: activeSession.status === 'initializing' || hook.isOpeningIDE || !sessionProject?.open_ide_command,
        variant: 'default' as const,
        description: sessionProject?.open_ide_command ? 'Open the worktree in your default IDE' : 'No IDE command configured'
      }
    ];
  }, [activeSession, hook.isMerging, hook.gitCommands, hook.hasChangesToRebase, hook.handleGitPull, hook.handleGitPush, hook.handleRebaseMainIntoWorktree, hook.handleSquashAndRebaseToMain, hook.handleOpenIDE, hook.isOpeningIDE, sessionProject?.open_ide_command, activeSession?.gitStatus]);
  
  // Removed unused variables - now handled by panels

  // Show project view if navigation is set to project
  if (activeView === 'project' && activeProjectId) {
    if (isProjectLoading || !projectData) {
      return (
        <div className="flex-1 flex flex-col overflow-hidden bg-surface-secondary p-6">
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-interactive mx-auto mb-4"></div>
              <p className="text-text-secondary">Loading project...</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <ProjectView
        projectId={activeProjectId}
        projectName={projectData.name || 'Project'}
        onGitPull={handleProjectGitPull}
        onGitPush={handleProjectGitPush}
        isMerging={isMergingProject}
      />
    );
  }

  if (!activeSession) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
        <EmptyState
          icon={Inbox}
          title="No Session Selected"
          description="Select a session from the sidebar to view its output, or create a new session to get started."
          className="flex-1"
        />
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
      <SessionHeader
        activeSession={activeSession}
        isEditingName={hook.isEditingName}
        editName={hook.editName}
        setEditName={hook.setEditName}
        handleNameKeyDown={hook.handleNameKeyDown}
        handleSaveEditName={hook.handleSaveEditName}
        handleStartEditName={hook.handleStartEditName}
        mergeError={hook.mergeError}
      />
      
      {/* Tool Panel Bar - ALWAYS VISIBLE */}
      <SessionProvider session={activeSession} gitBranchActions={branchActions} isMerging={hook.isMerging}>
        <PanelTabBar
          panels={sessionPanels}
          activePanel={currentActivePanel}
          onPanelSelect={handlePanelSelect}
          onPanelClose={handlePanelClose}
          onPanelCreate={handlePanelCreate}
        />
      </SessionProvider>
      
      <div className="flex-1 flex relative min-h-0">
        <div className="flex-1 relative">
          {/* Render all panels but only show the active one - keeps terminals alive */}
          {sessionPanels.length > 0 && currentActivePanel ? (
            <SessionProvider session={activeSession} gitBranchActions={branchActions} isMerging={hook.isMerging}>
              {sessionPanels.map(panel => (
                <div 
                  key={panel.id} 
                  className="absolute inset-0"
                  style={{ display: panel.id === currentActivePanel.id ? 'block' : 'none' }}
                >
                  <PanelContainer
                    panel={panel}
                    isActive={panel.id === currentActivePanel.id}
                    isMainRepo={!!activeSession.isMainRepo}
                  />
                </div>
              ))}
            </SessionProvider>
          ) : (
            <>
              {/* Legacy view content removed - all functionality now in panels */}
            </>
          )}
        </div>
      </div>
      
      {/* Legacy session-level prompt bar removed - now handled by panels */}
      
      {/* Legacy session-level prompt bar - COMMENTED OUT for Claude panel integration
      {hook.viewMode !== 'terminal' && !currentActivePanel && (
        <SessionInputWithImages
          activeSession={activeSession}
          viewMode={hook.viewMode}
          input={hook.input}
          setInput={hook.setInput}
          textareaRef={hook.textareaRef}
          handleTerminalCommand={hook.handleTerminalCommand}
          handleSendInput={hook.handleSendInput}
          handleContinueConversation={hook.handleContinueConversation}
          isStravuConnected={hook.isStravuConnected}
          setShowStravuSearch={hook.setShowStravuSearch}
          ultrathink={hook.ultrathink}
          setUltrathink={hook.setUltrathink}
          gitCommands={hook.gitCommands}
          handleCompactContext={hook.handleCompactContext}
          hasConversationHistory={hook.hasConversationHistory}
          contextCompacted={hook.contextCompacted}
          handleCancelRequest={hook.handleStopSession}
        />
      )}
      */}

      <CommitMessageDialog
        isOpen={hook.showCommitMessageDialog}
        onClose={() => hook.setShowCommitMessageDialog(false)}
        dialogType={hook.dialogType}
        gitCommands={hook.gitCommands}
        commitMessage={hook.commitMessage}
        setCommitMessage={hook.setCommitMessage}
        shouldSquash={hook.shouldSquash}
        setShouldSquash={hook.setShouldSquash}
        onConfirm={hook.performSquashWithCommitMessage}
        isMerging={hook.isMerging}
      />

      <GitErrorDialog
        isOpen={hook.showGitErrorDialog}
        onClose={() => hook.setShowGitErrorDialog(false)}
        errorDetails={hook.gitErrorDetails}
        getGitErrorTips={hook.getGitErrorTips}
        onAbortAndUseClaude={hook.handleAbortRebaseAndUseClaude}
      />

      <StravuFileSearch
        isOpen={hook.showStravuSearch}
        onClose={() => hook.setShowStravuSearch(false)}
        onFileSelect={hook.handleStravuFileSelect}
      />

    </div>
  );
});

SessionView.displayName = 'SessionView';

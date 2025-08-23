import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ProjectDashboard } from './ProjectDashboard';
import { FileEditor } from './FileEditor';
import { SessionInputWithImages } from './session/SessionInputWithImages';
import { RichOutputWithSidebar } from './session/RichOutputWithSidebar';
import { RichOutputSettings } from './session/RichOutputView';
import { API } from '../utils/api';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme } from '../contexts/ThemeContext';
import { useSessionStore } from '../stores/sessionStore';
import { Session } from '../types/session';
import { useSessionView } from '../hooks/useSessionView';
import { cn } from '../utils/cn';
import { createVisibilityAwareInterval } from '../utils/performanceUtils';
import { BarChart3, Eye, FolderTree, Terminal as TerminalIcon } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

export type ProjectViewMode = 'dashboard' | 'output' | 'files' | 'terminal';

interface ProjectViewProps {
  projectId: number;
  projectName: string;
  onGitPull: () => void;
  onGitPush: () => void;
  isMerging: boolean;
  onViewModeChange?: (mode: ProjectViewMode) => void;
}

interface ProjectViewTabsProps {
  viewMode: ProjectViewMode;
  setViewMode: (mode: ProjectViewMode) => void;
}

const ProjectViewTabs: React.FC<ProjectViewTabsProps> = ({ viewMode, setViewMode }) => {
  const tabs: { 
    mode: ProjectViewMode; 
    label: string; 
    icon: React.ReactNode;
  }[] = [
    { 
      mode: 'dashboard', 
      label: 'Dashboard', 
      icon: <BarChart3 className="w-4 h-4" />
    },
    { 
      mode: 'output', 
      label: 'Output', 
      icon: <Eye className="w-4 h-4" />
    },
    { 
      mode: 'files', 
      label: 'Files', 
      icon: <FolderTree className="w-4 h-4" />
    },
    { 
      mode: 'terminal', 
      label: 'Terminal', 
      icon: <TerminalIcon className="w-4 h-4" />
    },
  ];

  return (
    <div className="flex items-center bg-surface-secondary" role="tablist">
      {tabs.map(({ mode, label, icon }) => (
        <button
          key={mode}
          role="tab"
          aria-selected={viewMode === mode}
          onClick={() => setViewMode(mode)}
          className={cn(
            "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all",
            "border-b-2 hover:text-text-primary",
            viewMode === mode ? [
              "text-text-primary border-interactive",
              "bg-gradient-to-t from-interactive/5 to-transparent"
            ] : [
              "text-text-secondary border-transparent",
              "hover:border-border-secondary hover:bg-surface-hover/50"
            ]
          )}
        >
          {/* Icon */}
          <span className={cn(
            "transition-colors",
            viewMode === mode ? "text-interactive" : "text-text-tertiary"
          )}>
            {icon}
          </span>
          
          {/* Label */}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
};

export const ProjectView: React.FC<ProjectViewProps> = ({ 
  projectId, 
  projectName, 
  onGitPull, 
  onGitPush, 
  isMerging,
  onViewModeChange 
}) => {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ProjectViewMode>('dashboard');
  const [mainRepoSessionId, setMainRepoSessionId] = useState<string | null>(null);
  const [mainRepoSession, setMainRepoSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isStravuConnected, setIsStravuConnected] = useState(false);
  
  // Rich Output settings state (similar to SessionView)
  const [richOutputSettings, setRichOutputSettings] = useState<RichOutputSettings>(() => {
    const saved = localStorage.getItem('richOutputSettings');
    return saved ? JSON.parse(saved) : {
      showToolCalls: true,
      compactMode: false,
      collapseTools: false,
      showThinking: true,
      showSessionInit: false,
    };
  });
  
  const handleRichOutputSettingsChange = (newSettings: RichOutputSettings) => {
    setRichOutputSettings(newSettings);
    localStorage.setItem('richOutputSettings', JSON.stringify(newSettings));
  };
  
  // Notify parent component when view mode changes
  useEffect(() => {
    if (onViewModeChange) {
      onViewModeChange(viewMode);
    }
  }, [viewMode, onViewModeChange]);
  
  // Set main repo session as active when output tab is selected
  useEffect(() => {
    if (viewMode === 'output' && mainRepoSession) {
      useSessionStore.getState().setActiveSession(mainRepoSession.id);
    }
  }, [viewMode, mainRepoSession]);
  
  // Wrapped git operations that switch to output tab
  const handleGitPull = useCallback(() => {
    setViewMode('output');
    onGitPull();
  }, [onGitPull]);
  
  const handleGitPush = useCallback(() => {
    setViewMode('output');
    onGitPush();
  }, [onGitPush]);
  
  // Handle terminal command
  const handleTerminalCommand = useCallback(() => {
    if (!mainRepoSessionId) return;
    setViewMode('terminal');
  }, [mainRepoSessionId]);
  const terminalRef = useRef<HTMLDivElement>(null);
  const scriptTerminalRef = useRef<HTMLDivElement>(null);
  
  // Terminal state
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const lastProcessedOutputLength = useRef(0);
  
  // Use the same hook as SessionView for output handling
  const hook = useSessionView(mainRepoSession || undefined, undefined, scriptTerminalRef);
  
  // Debug logging
  useEffect(() => {
    console.log('[ProjectView] Session state:', { 
      mainRepoSessionId, 
      mainRepoSession: mainRepoSession?.id,
      viewMode,
      activeSessionInStore: useSessionStore.getState().activeSessionId
    });
  }, [mainRepoSessionId, mainRepoSession, viewMode]);

  // Terminal initialization function
  const initTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstance.current || !mainRepoSessionId) return;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      rows: 30,
      cols: 80,
      scrollback: 100000,
      fastScrollModifier: 'ctrl',
      theme: theme === 'dark' ? {
        background: '#1a1a1a',
        foreground: '#ffffff',
        cursor: '#ffffff',
      } : {
        background: '#ffffff',
        foreground: '#000000',
        cursor: '#000000',
      }
    });

    const addon = new FitAddon();
    term.loadAddon(addon);
    term.open(terminalRef.current);
    addon.fit();

    terminalInstance.current = term;
    fitAddon.current = addon;

    // Handle terminal input
    term.onData((data) => {
      if (mainRepoSessionId) {
        API.sessions.sendTerminalInput(mainRepoSessionId, data).catch(error => {
          console.error('Failed to send terminal input:', error);
        });
      }
    });

    // Handle window resize
    const handleResize = () => {
      if (fitAddon.current && terminalInstance.current) {
        fitAddon.current.fit();
        if (mainRepoSessionId) {
          API.sessions.resizeTerminal(
            mainRepoSessionId,
            terminalInstance.current.cols,
            terminalInstance.current.rows
          );
        }
      }
    };

    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [terminalRef, mainRepoSessionId, theme]);

  // Remove output terminal initialization - now handled by useSessionView

  // Get or create main repo session only when needed (not for dashboard)
  useEffect(() => {
    // Only create main repo session when switching to tabs that need it
    if (viewMode === 'dashboard') {
      // Don't create session for dashboard view
      return;
    }
    
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
          
          // Set as active session if currently on output tab
          if (viewMode === 'output') {
            useSessionStore.getState().setActiveSession(response.data.id);
          }
        }
      } catch (error) {
        console.error('Failed to get main repo session:', error);
      } finally {
        setIsLoadingSession(false);
      }
    };

    getMainRepoSession();
  }, [projectId, viewMode]);
  
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

  // Initialize terminal when switching to terminal view
  useEffect(() => {
    if (viewMode === 'terminal' && mainRepoSessionId) {
      initTerminal();
      
      // Pre-create the backend PTY session
      API.sessions.preCreateTerminal(mainRepoSessionId).then(response => {
        if (response.success) {
          console.log('[ProjectView Terminal] Backend PTY pre-created for session', mainRepoSessionId);
        }
      }).catch(error => {
        console.error('[ProjectView Terminal] Failed to pre-create backend PTY:', error);
      });
    }
  }, [viewMode, mainRepoSessionId, initTerminal]);

  // Output loading is now handled by useSessionView hook

  // Subscribe to script output for this session - optimized to check for actual changes
  useEffect(() => {
    if (!mainRepoSessionId) return;

    let previousOutput = useSessionStore.getState().terminalOutput[mainRepoSessionId];
    const unsubscribe = useSessionStore.subscribe((state) => {
      const sessionOutput = state.terminalOutput[mainRepoSessionId] || [];
      // Only update if output actually changed
      if (sessionOutput !== previousOutput) {
        previousOutput = sessionOutput;
        setScriptOutput(sessionOutput);
      }
    });

    // Get initial state
    const initialOutput = useSessionStore.getState().terminalOutput[mainRepoSessionId] || [];
    setScriptOutput(initialOutput);

    return unsubscribe;
  }, [mainRepoSessionId]);

  // Session output updates are now handled by useSessionView hook

  // Performance: Memoize terminal output join
  const fullScriptOutputMemo = useMemo(() => {
    if (!scriptOutput || scriptOutput.length === 0) return '';
    
    // For very large arrays, join in chunks
    const CHUNK_SIZE = 500;
    if (scriptOutput.length > CHUNK_SIZE) {
      let result = '';
      for (let i = 0; i < scriptOutput.length; i += CHUNK_SIZE) {
        const chunk = scriptOutput.slice(i, Math.min(i + CHUNK_SIZE, scriptOutput.length));
        result += chunk.join('');
      }
      return result;
    }
    
    return scriptOutput.join('');
  }, [scriptOutput]);
  
  // Write script output to terminal
  useEffect(() => {
    if (!terminalInstance.current || !mainRepoSessionId) return;
    
    const fullScriptOutput = fullScriptOutputMemo;
    
    // Handle case where output was cleared
    if (fullScriptOutput.length === 0 && lastProcessedOutputLength.current > 0) {
      terminalInstance.current.reset();
      lastProcessedOutputLength.current = 0;
      return;
    }
    
    // Write new output
    if (fullScriptOutput.length > lastProcessedOutputLength.current) {
      const newOutput = fullScriptOutput.substring(lastProcessedOutputLength.current);
      terminalInstance.current.write(newOutput);
      lastProcessedOutputLength.current = fullScriptOutput.length;
    }
  }, [fullScriptOutputMemo, mainRepoSessionId]);

  // Output terminal updates are now handled by useSessionView hook
  
  // Elapsed time tracking is now handled by useSessionView hook
  
  // Check Stravu connection status with visibility-aware updates
  useEffect(() => {
    const checkStravuConnection = async () => {
      try {
        const response = await API.stravu.getConnectionStatus();
        setIsStravuConnected(response.success && response.data.status === 'connected');
      } catch (err) {
        setIsStravuConnected(false);
      }
    };
    checkStravuConnection();
    
    // Use visibility-aware interval to reduce background processing
    const cleanup = createVisibilityAwareInterval(
      checkStravuConnection,
      30000,  // 30 seconds when visible
      120000  // 2 minutes when not visible
    );
    return cleanup;
  }, []);
  
  // formatElapsedTime is now provided by useSessionView hook

  // Add clear terminal function
  const handleClearTerminal = useCallback(() => {
    if (terminalInstance.current) {
      terminalInstance.current.reset();
      lastProcessedOutputLength.current = 0;
      setScriptOutput([]);
    }
  }, []);


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

      {/* View Tabs */}
      <ProjectViewTabs viewMode={viewMode} setViewMode={setViewMode} />

      {/* Project Content */}
      <div className="flex-1 flex relative min-h-0">
        <div className="flex-1 relative">
          {/* Dashboard View */}
          <div className={`h-full ${viewMode === 'dashboard' ? 'flex flex-col p-6' : 'hidden'}`}>
            <ProjectDashboard 
              projectId={projectId} 
              projectName={projectName} 
            />
          </div>
          
          {/* File Tree View */}
          <div className={`h-full ${viewMode === 'files' ? 'block' : 'hidden'}`}>
            {isLoadingSession || !mainRepoSessionId ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-interactive mx-auto mb-4"></div>
                  <p className="text-text-secondary">Loading file tree...</p>
                </div>
              </div>
            ) : (
              <FileEditor sessionId={mainRepoSessionId} />
            )}
          </div>
          
          {/* Terminal View */}
          <div className={`h-full ${viewMode === 'terminal' ? 'flex flex-col' : 'hidden'} bg-surface-primary`}>
            <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border-primary">
              <div className="text-sm text-text-secondary">
                Terminal - {projectName}
              </div>
              {mainRepoSessionId && (
                <button
                  onClick={handleClearTerminal}
                  className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
                  title="Clear terminal"
                >
                  <svg 
                    className="w-4 h-4" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                    />
                  </svg>
                </button>
              )}
            </div>
            {isLoadingSession || !mainRepoSessionId ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-interactive mx-auto mb-4"></div>
                  <p className="text-text-secondary">Loading terminal...</p>
                </div>
              </div>
            ) : (
              <div ref={terminalRef} className="flex-1" />
            )}
          </div>
          
          {/* Output View */}
          <div className={`h-full ${viewMode === 'output' ? 'block' : 'hidden'}`}>
            {isLoadingSession || !mainRepoSessionId ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-interactive mx-auto mb-4"></div>
                  <p className="text-text-secondary">Loading output...</p>
                </div>
              </div>
            ) : (
              <RichOutputWithSidebar 
                sessionId={mainRepoSessionId}
                sessionStatus={mainRepoSession?.status}
                settings={richOutputSettings}
                onSettingsChange={handleRichOutputSettingsChange}
              />
            )}
          </div>
        </div>
      </div>
      
      {viewMode === 'output' && mainRepoSession && (
        <SessionInputWithImages
          activeSession={mainRepoSession}
          viewMode="richOutput"
          input={hook.input}
          setInput={hook.setInput}
          textareaRef={hook.textareaRef}
          handleTerminalCommand={handleTerminalCommand}
          handleSendInput={hook.handleSendInput}
          handleContinueConversation={hook.handleContinueConversation}
          isStravuConnected={isStravuConnected}
          setShowStravuSearch={hook.setShowStravuSearch}
          ultrathink={hook.ultrathink}
          setUltrathink={hook.setUltrathink}
          gitCommands={hook.gitCommands}
          handleCompactContext={hook.handleCompactContext}
          hasConversationHistory={hook.hasConversationHistory}
          contextCompacted={hook.contextCompacted}
        />
      )}
    </div>
  );
};
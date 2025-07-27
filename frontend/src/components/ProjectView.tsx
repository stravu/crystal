import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ProjectDashboard } from './ProjectDashboard';
import { FileEditor } from './FileEditor';
import { SessionInputWithImages } from './session/SessionInputWithImages';
import { API } from '../utils/api';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme } from '../contexts/ThemeContext';
import { useSessionStore } from '../stores/sessionStore';
import { Session } from '../types/session';
import { useSessionView } from '../hooks/useSessionView';
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
  const tabs: { mode: ProjectViewMode; label: string }[] = [
    { mode: 'dashboard', label: 'Dashboard' },
    { mode: 'output', label: 'Output' },
    { mode: 'files', label: 'File Tree' },
    { mode: 'terminal', label: 'Terminal' },
  ];

  return (
    <div className="flex flex-col gap-2 relative z-10 mt-6">
      <div className="flex bg-surface-secondary rounded-lg border border-border-primary overflow-hidden flex-shrink-0">
        {tabs.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 relative block transition-colors ${
              viewMode === mode
                ? 'bg-interactive text-interactive-on-dark'
                : 'text-text-primary hover:bg-surface-hover'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
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
  const outputTerminalRef = useRef<HTMLDivElement>(null);
  const scriptTerminalRef = useRef<HTMLDivElement>(null);
  
  // Terminal state
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const lastProcessedOutputLength = useRef(0);
  
  // Use the same hook as SessionView for output handling
  const hook = useSessionView(mainRepoSession || undefined, outputTerminalRef, scriptTerminalRef);
  
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

  // Get or create main repo session for file operations
  useEffect(() => {
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
  
  // Subscribe to session updates
  useEffect(() => {
    if (!mainRepoSessionId) return;
    
    const unsubscribe = useSessionStore.subscribe((state) => {
      const session = state.sessions.find(s => s.id === mainRepoSessionId);
      if (session) {
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

  // Subscribe to script output for this session
  useEffect(() => {
    if (!mainRepoSessionId) return;

    const unsubscribe = useSessionStore.subscribe((state) => {
      const sessionOutput = state.scriptOutput[mainRepoSessionId] || [];
      setScriptOutput(sessionOutput);
    });

    // Get initial state
    const initialOutput = useSessionStore.getState().scriptOutput[mainRepoSessionId] || [];
    setScriptOutput(initialOutput);

    return unsubscribe;
  }, [mainRepoSessionId]);

  // Session output updates are now handled by useSessionView hook

  // Write script output to terminal
  useEffect(() => {
    if (!terminalInstance.current || !mainRepoSessionId) return;
    
    const fullScriptOutput = scriptOutput.join('');
    
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
  }, [scriptOutput, mainRepoSessionId]);

  // Output terminal updates are now handled by useSessionView hook
  
  // Elapsed time tracking is now handled by useSessionView hook
  
  // Check Stravu connection status
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
    const interval = setInterval(checkStravuConnection, 30000);
    return () => clearInterval(interval);
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
          <ProjectViewTabs viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </div>

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
          <div className={`h-full ${viewMode === 'output' ? 'flex flex-col' : 'hidden'} bg-gray-50 dark:bg-black relative`}>
            {hook.isLoadingOutput && (
              <div className="absolute top-4 left-4 text-gray-600 dark:text-gray-400 z-10">Loading output...</div>
            )}
            <div 
              ref={outputTerminalRef} 
              className="flex-1 min-h-0"
            />
            {mainRepoSession && (mainRepoSession.status === 'running' || mainRepoSession.status === 'initializing') && (
              <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex-shrink-0">
                <div className="flex items-center justify-between text-gray-700 dark:text-gray-300">
                  <div className="flex items-center space-x-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot"></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                    <span className="text-sm font-medium">
                      {mainRepoSession.status === 'initializing' ? 'Starting Claude Code...' : 'Claude is working...'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                      {mainRepoSession.status === 'initializing' ? '⚡' : hook.formatElapsedTime(hook.elapsedTime)}
                    </div>
                    <button onClick={hook.handleStopSession} className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
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
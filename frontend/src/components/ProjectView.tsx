import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ProjectDashboard } from './ProjectDashboard';
import { FileEditor } from './FileEditor';
import { API } from '../utils/api';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTheme } from '../contexts/ThemeContext';
import { useSessionStore } from '../stores/sessionStore';
import '@xterm/xterm/css/xterm.css';

export type ProjectViewMode = 'dashboard' | 'files' | 'terminal';

interface ProjectViewProps {
  projectId: number;
  projectName: string;
  onGitPull: () => void;
  onGitPush: () => void;
  isMerging: boolean;
}

interface ProjectViewTabsProps {
  viewMode: ProjectViewMode;
  setViewMode: (mode: ProjectViewMode) => void;
}

const ProjectViewTabs: React.FC<ProjectViewTabsProps> = ({ viewMode, setViewMode }) => {
  const tabs: { mode: ProjectViewMode; label: string }[] = [
    { mode: 'dashboard', label: 'Dashboard' },
    { mode: 'files', label: 'File Tree' },
    { mode: 'terminal', label: 'Terminal' },
  ];

  return (
    <div className="flex flex-col gap-2 relative z-10 mt-6">
      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0">
        {tabs.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 relative block ${
              viewMode === mode
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
  isMerging 
}) => {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = useState<ProjectViewMode>('dashboard');
  const [mainRepoSessionId, setMainRepoSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  
  // Terminal state
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const lastProcessedOutputLength = useRef(0);

  // Terminal initialization function
  const initTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstance.current || !mainRepoSessionId) return;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      rows: 30,
      cols: 80,
      scrollback: 2000,
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

  // Get or create main repo session for file operations
  useEffect(() => {
    const getMainRepoSession = async () => {
      setIsLoadingSession(true);
      try {
        const response = await API.sessions.getOrCreateMainRepoSession(projectId);
        if (response.success && response.data) {
          setMainRepoSessionId(response.data.id);
        }
      } catch (error) {
        console.error('Failed to get main repo session:', error);
      } finally {
        setIsLoadingSession(false);
      }
    };

    getMainRepoSession();
  }, [projectId]);

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

  // Add clear terminal function
  const handleClearTerminal = useCallback(() => {
    if (terminalInstance.current) {
      terminalInstance.current.reset();
      lastProcessedOutputLength.current = 0;
      setScriptOutput([]);
    }
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Project Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 relative">
            <h2 className="font-bold text-xl text-gray-900 dark:text-gray-100 truncate">
              {projectName}
            </h2>
            
            {/* Git Actions for Main Project */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <div className="flex flex-wrap items-center gap-2 relative z-20">
                <div className="group relative">
                  <button 
                    onClick={onGitPull} 
                    disabled={isMerging} 
                    className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                      isMerging 
                        ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed' 
                        : 'bg-gray-700 border-blue-600 text-blue-400 hover:bg-blue-900/20 hover:border-blue-500'
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
                    onClick={onGitPush} 
                    disabled={isMerging} 
                    className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                      isMerging 
                        ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed' 
                        : 'bg-gray-700 border-green-600 text-green-400 hover:bg-green-900/20 hover:border-green-500'
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading file tree...</p>
                </div>
              </div>
            ) : (
              <FileEditor sessionId={mainRepoSessionId} />
            )}
          </div>
          
          {/* Terminal View */}
          <div className={`h-full ${viewMode === 'terminal' ? 'flex flex-col' : 'hidden'} bg-gray-50 dark:bg-black`}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Terminal - {projectName}
              </div>
              {mainRepoSessionId && (
                <button
                  onClick={handleClearTerminal}
                  className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading terminal...</p>
                </div>
              </div>
            ) : (
              <div ref={terminalRef} className="flex-1" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
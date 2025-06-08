import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { JsonMessageView } from './JsonMessageView';
import { StatusIndicator } from './StatusIndicator';
import { PromptNavigation } from './PromptNavigation';
import CombinedDiffView from './CombinedDiffView';
import { API } from '../utils/api';
import '@xterm/xterm/css/xterm.css';

export function SessionView() {
  const activeSession = useSessionStore((state) => state.getActiveSession());
  
  // Track previous session ID to detect changes
  const previousSessionIdRef = useRef<string | null>(null);
  
  
  // Instead of subscribing to script output, we'll get it when needed
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const [formattedOutput, setFormattedOutput] = useState<string>('');
  const [currentSessionIdForOutput, setCurrentSessionIdForOutput] = useState<string | null>(null);
  const [isPathCollapsed, setIsPathCollapsed] = useState(true);
  
  // Subscribe to script output changes manually
  useEffect(() => {
    if (!activeSession) {
      setScriptOutput([]);
      return;
    }
    
    const unsubscribe = useSessionStore.subscribe((state) => {
      const sessionScriptOutput = state.scriptOutput[activeSession.id] || [];
      setScriptOutput(sessionScriptOutput);
    });
    
    // Get initial value
    const initialOutput = useSessionStore.getState().scriptOutput[activeSession.id] || [];
    setScriptOutput(initialOutput);
    
    return unsubscribe;
  }, [activeSession?.id]);
  
  // Clear terminal immediately when session changes, then format new content
  useEffect(() => {
    const currentSessionId = activeSession?.id || null;
    const previousSessionId = previousSessionIdRef.current;
    
    // Update the previous session ID for next comparison
    previousSessionIdRef.current = currentSessionId;
    
    // Only clear and reload if the session actually changed
    if (currentSessionId === previousSessionId) {
      return;
    }
    
    if (!activeSession) {
      setFormattedOutput('');
      // Clear terminal immediately
      if (terminalInstance.current) {
        terminalInstance.current.clear();
      }
      return;
    }
    
    const sessionId = activeSession.id; // Capture the session ID
    
    // Immediately clear terminal and output when session changes
    setFormattedOutput('');
    setCurrentSessionIdForOutput(sessionId); // Track which session this output belongs to
    if (terminalInstance.current) {
      terminalInstance.current.clear();
    }
    // Also clear script terminal to prevent cross-session contamination
    if (scriptTerminalInstance.current) {
      scriptTerminalInstance.current.reset();
      scriptTerminalInstance.current.writeln('Terminal ready for script execution...\r\n');
    }
    // Reset output length tracking so new content gets written
    lastProcessedOutputLength.current = 0;
    lastProcessedScriptOutputLength.current = 0;
    
    // Don't format output here - let it happen after loadOutputContent completes
  }, [activeSession?.id]); // Changed dependency to activeSession?.id to trigger on session change
  
  // Separate effect for updating content when messages change (but not clearing)
  useEffect(() => {
    if (!activeSession) return;
    
    const sessionId = activeSession.id; // Capture the session ID
    
    // Skip formatting if terminal was just cleared (output length is 0 after a session switch)
    if (lastProcessedOutputLength.current === 0 && formattedOutput === '') {
      // Let the loadOutputContent handle initial formatting
      return;
    }
    
    const formatOutput = async () => {
      // Get the current session fresh from the store to avoid stale closure
      const currentActiveSession = useSessionStore.getState().getActiveSession();
      
      // Only format if we're still on the same session that triggered this effect
      if (!currentActiveSession || currentActiveSession.id !== sessionId) {
        return;
      }
      
      const { formatJsonForOutputEnhanced } = await import('../utils/toolFormatter');
      let formatted = '';
      
      // Format JSON messages
      if (currentActiveSession.jsonMessages) {
        for (const msg of currentActiveSession.jsonMessages) {
          formatted += formatJsonForOutputEnhanced(msg);
        }
      }
      
      // Add any non-JSON output
      if (currentActiveSession.output && currentActiveSession.output.length > 0) {
        formatted += currentActiveSession.output.join('');
      }
      
      // Only set the formatted output if we're still on the same session
      const finalActiveSession = useSessionStore.getState().getActiveSession();
      if (finalActiveSession && finalActiveSession.id === sessionId) {
        setFormattedOutput(formatted);
        setCurrentSessionIdForOutput(sessionId);
      }
    };
    
    formatOutput();
  }, [activeSession?.jsonMessages, activeSession?.output]);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const scriptTerminalRef = useRef<HTMLDivElement>(null);
  const scriptTerminalInstance = useRef<Terminal | null>(null);
  const scriptFitAddon = useRef<FitAddon | null>(null);
  const [input, setInput] = useState('');
  const [isLoadingOutput, setIsLoadingOutput] = useState(false);
  const [viewMode, setViewMode] = useState<'output' | 'messages' | 'changes' | 'terminal'>('output');
  const [showPromptNav, setShowPromptNav] = useState(true);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastProcessedOutputLength = useRef(0);
  const lastProcessedScriptOutputLength = useRef(0);
  
  const loadOutputContent = async (sessionId: string, retryCount = 0) => {
    if (!terminalInstance.current) return;
    
    setIsLoadingOutput(true);
    setLoadError(null);
    
    try {
      // First, clear any existing output for this session to prevent stale data
      useSessionStore.getState().clearSessionOutput(sessionId);
      
      const response = await API.sessions.getOutput(sessionId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to load output');
      }
      
      const outputs = response.data;
      
      // Check if we're still on the same session before adding outputs
      const currentActiveSession = useSessionStore.getState().getActiveSession();
      if (!currentActiveSession || currentActiveSession.id !== sessionId) {
        return;
      }
      
      // Store outputs for this session
      outputs.forEach((output: any) => {
        useSessionStore.getState().addSessionOutput(output);
      });
      
      // After loading all outputs, format them for display
      const sessionAfterLoad = useSessionStore.getState().getActiveSession();
      if (sessionAfterLoad && sessionAfterLoad.id === sessionId) {
        const { formatJsonForOutputEnhanced } = await import('../utils/toolFormatter');
        let formatted = '';
        
        // Format JSON messages
        if (sessionAfterLoad.jsonMessages) {
          for (const msg of sessionAfterLoad.jsonMessages) {
            formatted += formatJsonForOutputEnhanced(msg);
          }
        }
        
        // Add any non-JSON output
        if (sessionAfterLoad.output && sessionAfterLoad.output.length > 0) {
          formatted += sessionAfterLoad.output.join('');
        }
        
        setFormattedOutput(formatted);
        setCurrentSessionIdForOutput(sessionId);
      }
      
      setLoadError(null);
    } catch (error) {
      console.error('Error fetching session output:', error);
      
      if (retryCount < 2) {
        // Retry after a short delay
        setTimeout(() => {
          // Check if still the active session before retrying
          const currentActiveSession = useSessionStore.getState().getActiveSession();
          if (currentActiveSession && currentActiveSession.id === sessionId) {
            loadOutputContent(sessionId, retryCount + 1);
          }
        }, 1000);
      } else {
        setLoadError(error instanceof Error ? error.message : 'Failed to load output content');
      }
    } finally {
      setIsLoadingOutput(false);
    }
  };
  
  useEffect(() => {
    if (!terminalRef.current || !activeSession) return;

    // Initialize terminal if not already created
    if (!terminalInstance.current) {
      terminalInstance.current = new Terminal({
        cursorBlink: true,
        convertEol: true,
        rows: 30,
        cols: 80,
        scrollback: 50000, // Increase scrollback buffer to 50k lines
        theme: {
          background: '#1a1a1a',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        }
      });
      
      fitAddon.current = new FitAddon();
      terminalInstance.current.loadAddon(fitAddon.current);
      terminalInstance.current.open(terminalRef.current);
      // Delay initial fit to ensure container is properly sized
      setTimeout(() => {
        if (fitAddon.current) {
          fitAddon.current.fit();
        }
      }, 100);
    }

    // Reset terminal when switching sessions (preserves scrollback capability)
    terminalInstance.current.reset();
    lastProcessedOutputLength.current = 0;
    setFormattedOutput(''); // Reset formatted output

    // Load output content with retry logic - pass session ID to avoid closure issues
    loadOutputContent(activeSession.id);
  }, [activeSession?.id]);

  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;

    // Reset script terminal when switching sessions (preserves scrollback capability)
    scriptTerminalInstance.current.reset();
    scriptTerminalInstance.current.writeln('Terminal ready for script execution...\r\n');
    lastProcessedScriptOutputLength.current = 0;
  }, [activeSession?.id]);

  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;

    // Load existing script output for this session after terminal is cleared
    const existingOutput = scriptOutput.join('');
    if (existingOutput && lastProcessedScriptOutputLength.current === 0) {
      scriptTerminalInstance.current.write(existingOutput);
      lastProcessedScriptOutputLength.current = existingOutput.length;
    }
  }, [activeSession?.id, scriptOutput]);

  useEffect(() => {
    if (!scriptTerminalRef.current || viewMode !== 'terminal') return;

    // Initialize script terminal if not already created
    if (!scriptTerminalInstance.current) {
      scriptTerminalInstance.current = new Terminal({
        cursorBlink: false,
        convertEol: true,
        rows: 30,
        cols: 80,
        scrollback: 50000, // Increase scrollback buffer to 50k lines
        theme: {
          background: '#0f172a',
          foreground: '#e2e8f0',
          cursor: '#e2e8f0',
          black: '#1e293b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#f1f5f9',
          brightBlack: '#475569',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff'
        }
      });
      
      scriptFitAddon.current = new FitAddon();
      scriptTerminalInstance.current.loadAddon(scriptFitAddon.current);
      scriptTerminalInstance.current.open(scriptTerminalRef.current);
      // Delay initial fit to ensure container is properly sized
      setTimeout(() => {
        if (scriptFitAddon.current) {
          scriptFitAddon.current.fit();
        }
      }, 100);
      
      // Add initial message
      scriptTerminalInstance.current.writeln('Terminal ready for script execution...\r\n');
      lastProcessedScriptOutputLength.current = 0;
    }
    
    // We'll load existing output in a separate effect
  }, [viewMode]);

  // Separate effect to load existing script output when switching to terminal view
  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession || viewMode !== 'terminal') return;
    
    // Get the current script output from the store without subscribing
    const currentScriptOutput = useSessionStore.getState().scriptOutput[activeSession.id] || [];
    
    // Only load if we haven't processed any output yet
    if (lastProcessedScriptOutputLength.current === 0 && currentScriptOutput.length > 0) {
      const existingOutput = currentScriptOutput.join('');
      scriptTerminalInstance.current.write(existingOutput);
      lastProcessedScriptOutputLength.current = existingOutput.length;
    }
  }, [viewMode, activeSession?.id]);

  useEffect(() => {
    if (!terminalInstance.current) return;

    // Get the current active session directly from the store to ensure freshness
    const currentActiveSession = useSessionStore.getState().getActiveSession();
    if (!currentActiveSession) return;

    // If we have no formatted output, don't write anything
    if (!formattedOutput) return;

    // Critical check: Only write if the formatted output belongs to the current session
    if (currentSessionIdForOutput !== currentActiveSession.id) {
      return;
    }

    // If terminal was cleared (lastProcessedOutputLength is 0), write all content
    // Otherwise, write only new formatted output
    if (lastProcessedOutputLength.current === 0) {
      // Write all content after terminal was cleared
      terminalInstance.current.write(formattedOutput);
      lastProcessedOutputLength.current = formattedOutput.length;
      terminalInstance.current.scrollToBottom();
    } else if (formattedOutput.length > lastProcessedOutputLength.current) {
      // Write only new content
      const newOutput = formattedOutput.substring(lastProcessedOutputLength.current);
      terminalInstance.current.write(newOutput);
      lastProcessedOutputLength.current = formattedOutput.length;
      terminalInstance.current.scrollToBottom();
    }
  }, [formattedOutput, activeSession?.id, currentSessionIdForOutput]);

  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;

    const fullScriptOutput = scriptOutput.join('');
    
    // If script output is empty or shorter than what we've processed, reset terminal
    if (fullScriptOutput.length < lastProcessedScriptOutputLength.current || fullScriptOutput.length === 0) {
      scriptTerminalInstance.current.reset();
      scriptTerminalInstance.current.writeln('Terminal ready for script execution...\r\n');
      lastProcessedScriptOutputLength.current = 0;
    }
    
    // Write only new script output
    if (fullScriptOutput.length > lastProcessedScriptOutputLength.current) {
      const newOutput = fullScriptOutput.substring(lastProcessedScriptOutputLength.current);
      scriptTerminalInstance.current.write(newOutput);
      lastProcessedScriptOutputLength.current = fullScriptOutput.length;
      // Scroll to bottom to show latest output
      scriptTerminalInstance.current.scrollToBottom();
    }
  }, [scriptOutput, activeSession?.id]);


  useEffect(() => {
    // Cleanup terminals on unmount
    return () => {
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
        terminalInstance.current = null;
      }
      if (scriptTerminalInstance.current) {
        scriptTerminalInstance.current.dispose();
        scriptTerminalInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Handle window resize for both terminals
    const handleResize = () => {
      if (fitAddon.current && terminalInstance.current) {
        fitAddon.current.fit();
      }
      if (scriptFitAddon.current && scriptTerminalInstance.current) {
        scriptFitAddon.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fit terminal when view mode changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewMode === 'output' && fitAddon.current && terminalInstance.current) {
        fitAddon.current.fit();
      } else if (viewMode === 'terminal' && scriptFitAddon.current && scriptTerminalInstance.current) {
        scriptFitAddon.current.fit();
      }
    }, 100); // Small delay to ensure DOM is updated
    
    return () => clearTimeout(timer);
  }, [viewMode]);

  // Use ResizeObserver for more reliable resize detection
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    
    if (terminalRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (fitAddon.current && terminalInstance.current && viewMode === 'output') {
          fitAddon.current.fit();
        }
      });
      resizeObserver.observe(terminalRef.current);
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [viewMode]);

  // Use ResizeObserver for script terminal
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    
    if (scriptTerminalRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (scriptFitAddon.current && scriptTerminalInstance.current && viewMode === 'terminal') {
          scriptFitAddon.current.fit();
        }
      });
      resizeObserver.observe(scriptTerminalRef.current);
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [viewMode]);
  
  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select or create a session to get started
      </div>
    );
  }
  
  const handleSendInput = async () => {
    if (!input.trim()) return;
    
    try {
      const response = await API.sessions.sendInput(activeSession.id, input + '\n');
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to send input');
      }
      
      setInput('');
    } catch (error) {
      console.error('Error sending input:', error);
    }
  };

  const handleContinueConversation = async () => {
    if (!input.trim()) return;
    
    try {
      const response = await API.sessions.continue(activeSession.id);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to continue conversation');
      }
      
      setInput('');
    } catch (error) {
      console.error('Error continuing conversation:', error);
    }
  };

  const handleNavigateToPrompt = (marker: any) => {
    // For now, we'll just scroll to the approximate position
    // In a real implementation, we'd calculate the actual line position
    if (terminalInstance.current && marker.output_line) {
      terminalInstance.current.scrollToLine(marker.output_line);
    }
  };

  const handleStopSession = async () => {
    try {
      const response = await API.sessions.stop(activeSession.id);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to stop session');
      }
    } catch (error) {
      console.error('Error stopping session:', error);
    }
  };

  const handleMergeMainToWorktree = async () => {
    setIsMerging(true);
    setMergeError(null);
    
    try {
      const response = await API.sessions.mergeMainToWorktree(activeSession.id);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to merge main to worktree');
      }
      
      // If successful, you might want to show a success message
      // For now, we'll just clear any errors
      setMergeError(null);
    } catch (error) {
      console.error('Error merging main to worktree:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to merge main to worktree');
    } finally {
      setIsMerging(false);
    }
  };

  const handleMergeWorktreeToMain = async () => {
    setIsMerging(true);
    setMergeError(null);
    
    try {
      const response = await API.sessions.mergeWorktreeToMain(activeSession.id);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to merge worktree to main');
      }
      
      // If successful, you might want to show a success message
      // For now, we'll just clear any errors
      setMergeError(null);
    } catch (error) {
      console.error('Error merging worktree to main:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to merge worktree to main');
    } finally {
      setIsMerging(false);
    }
  };
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 mb-2">
          <img src="/src/assets/crystal-logo.svg" alt="Crystal" className="h-8 w-8" />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-xl text-gray-900 truncate">{activeSession.name}</h2>
            <div className="flex items-center space-x-1 mt-1">
              <button
                onClick={() => setIsPathCollapsed(!isPathCollapsed)}
                className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 transition-colors"
                title={isPathCollapsed ? 'Show full path' : 'Hide full path'}
              >
                <svg 
                  className={`w-3 h-3 transition-transform ${isPathCollapsed ? '' : 'rotate-90'}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </button>
              {isPathCollapsed ? (
                <span className="text-sm text-gray-600 font-mono">
                  .../{activeSession.worktreePath.split('/').slice(-2).join('/')}
                </span>
              ) : (
                <span className="text-sm text-gray-600 font-mono">{activeSession.worktreePath}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusIndicator session={activeSession} size="medium" showText showProgress />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleMergeMainToWorktree}
                  disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors flex items-center space-x-1 whitespace-nowrap ${
                    isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                  title="Merge main branch into this worktree"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  <span className="hidden sm:inline">{isMerging ? 'Merging...' : 'Main → Worktree'}</span>
                  <span className="sm:hidden">{isMerging ? '...' : 'M→W'}</span>
                </button>
                <button
                  onClick={handleMergeWorktreeToMain}
                  disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors flex items-center space-x-1 whitespace-nowrap ${
                    isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                  title="Rebase worktree on main and fast-forward merge (no merge commits)"
                >
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  <span className="hidden sm:inline">{isMerging ? 'Rebasing...' : 'Worktree → Main (FF)'}</span>
                  <span className="sm:hidden">{isMerging ? '...' : 'W→M'}</span>
                </button>
              </div>
            </div>
            {mergeError && (
              <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-md">
                <p className="text-sm text-red-700">{mergeError}</p>
              </div>
            )}
            <div className="mt-2 p-3 bg-gray-50 rounded-md border border-gray-200 max-h-40 overflow-y-auto">
              <p className="text-sm text-gray-700 font-medium mb-1">Original Prompt:</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{activeSession.prompt}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden flex-shrink-0">
            <button
              onClick={() => setViewMode('output')}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 ${
                viewMode === 'output' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Output
            </button>
            <button
              onClick={() => setViewMode('messages')}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 ${
                viewMode === 'messages' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Messages ({activeSession.jsonMessages?.length || 0})
            </button>
            <button
              onClick={() => setViewMode('changes')}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 ${
                viewMode === 'changes' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Changes
            </button>
            <button
              onClick={() => setViewMode('terminal')}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 inline-flex items-center ${
                viewMode === 'terminal' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Terminal {activeSession.isRunning && (
                <span className="ml-1 inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              )}
            </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => activeSession && loadOutputContent(activeSession.id)}
                disabled={isLoadingOutput || !activeSession}
                className="p-1 text-gray-600 hover:bg-gray-200 rounded disabled:opacity-50"
                title="Reload output content"
              >
                <svg className={`w-5 h-5 ${isLoadingOutput ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => setShowPromptNav(!showPromptNav)}
                className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                title={showPromptNav ? 'Hide prompt navigation' : 'Show prompt navigation'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {showPromptNav ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        <div className="flex-1 relative">
          {isLoadingOutput && (
            <div className="absolute top-4 left-4 text-gray-400 z-10">Loading output...</div>
          )}
          <div className={`bg-gray-900 h-full ${viewMode === 'output' ? 'block' : 'hidden'} relative`}>
            <div ref={terminalRef} className="h-full" />
            {/* Error state with reload button */}
            {loadError && viewMode === 'output' && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-300 mb-2">Failed to load output content</p>
                  <p className="text-gray-500 text-sm mb-4">{loadError}</p>
                  <button
                    onClick={() => activeSession && loadOutputContent(activeSession.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Reload Output
                  </button>
                </div>
              </div>
            )}
            {/* Working indicator */}
            {(activeSession.status === 'running' || activeSession.status === 'initializing') && (
              <div className="absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 px-4 py-2">
                <div className="flex items-center space-x-3 text-gray-300">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  <span className="text-sm font-medium">
                    {activeSession.status === 'initializing' ? 'Starting Claude Code...' : 'Claude is working...'}
                  </span>
                  <div className="flex-1 ml-4">
                    <div className="h-1 bg-gray-600 rounded-full overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400 to-transparent w-1/3 animate-slide-progress"></div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {activeSession.status === 'initializing' ? '⚡' : '🧠'}
                  </div>
                  <button
                    onClick={handleStopSession}
                    className="ml-2 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center space-x-1"
                    title="Stop Claude Code"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={`h-full ${viewMode === 'messages' ? 'block' : 'hidden'}`}>
            <JsonMessageView messages={activeSession.jsonMessages || []} />
          </div>
          <div className={`h-full ${viewMode === 'changes' ? 'block' : 'hidden'}`}>
            <CombinedDiffView sessionId={activeSession.id} selectedExecutions={[]} />
          </div>
          <div className={`h-full ${viewMode === 'terminal' ? 'block' : 'hidden'} bg-gray-900`}>
            <div ref={scriptTerminalRef} className="h-full" />
          </div>
        </div>
        {showPromptNav && (
          <PromptNavigation 
            sessionId={activeSession.id} 
            onNavigateToPrompt={handleNavigateToPrompt}
          />
        )}
      </div>
      
      <div className="border-t border-gray-300 p-4 bg-white flex-shrink-0">
        <div className="flex space-x-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (activeSession.status === 'waiting') {
                  handleSendInput();
                } else {
                  handleContinueConversation();
                }
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white resize-none min-h-[42px] max-h-[150px] overflow-y-auto"
            placeholder={
              activeSession.status === 'waiting' 
                ? "Enter your response..." 
                : "Continue conversation with a new message..."
            }
            rows={2}
          />
          <button
            onClick={activeSession.status === 'waiting' ? handleSendInput : handleContinueConversation}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {activeSession.status === 'waiting' ? 'Send' : 'Continue'}
          </button>
        </div>
        {activeSession.status !== 'waiting' && (
          <p className="text-sm text-gray-500 mt-2">
            This will interrupt the current session if running and restart with conversation history.
          </p>
        )}
      </div>
    </div>
  );
}
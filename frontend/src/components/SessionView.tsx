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
  
  // State declarations - declare early to avoid reference errors
  const [viewMode, setViewMode] = useState<'output' | 'messages' | 'changes' | 'terminal'>('output');
  const [unreadActivity, setUnreadActivity] = useState<{
    output: boolean;
    messages: boolean;
    changes: boolean;
    terminal: boolean;
  }>({
    output: false,
    messages: false,
    changes: false,
    terminal: false,
  });
  
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
      
      // Mark terminal tab as having new activity if not currently viewing it
      if (viewMode !== 'terminal' && sessionScriptOutput.length > 0) {
        setUnreadActivity(prev => ({ ...prev, terminal: true }));
      }
    });
    
    // Get initial value
    const initialOutput = useSessionStore.getState().scriptOutput[activeSession.id] || [];
    setScriptOutput(initialOutput);
    
    return unsubscribe;
  }, [activeSession?.id, viewMode]);
  
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
  
  // Track if this is a newly created session waiting for first output
  const [isWaitingForFirstOutput, setIsWaitingForFirstOutput] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  
  // Track message and output counts for change detection
  const messageCount = activeSession?.jsonMessages?.length || 0;
  const outputCount = activeSession?.output?.length || 0;
  
  // Separate effect for updating content when messages change (but not clearing)
  useEffect(() => {
    if (!activeSession) return;
    
    const sessionId = activeSession.id; // Capture the session ID
    
    // Skip formatting only if we have no data to format
    if (messageCount === 0 && outputCount === 0) {
      return;
    }
    
    // If we're waiting for first output and it arrives, trigger a reload
    if (isWaitingForFirstOutput && (messageCount > 0 || outputCount > 0)) {
      setIsWaitingForFirstOutput(false);
      // Reload the output content now that we have data
      loadOutputContent(sessionId);
      return;
    }
    
    const formatOutput = async () => {
      // Get the current session fresh from the store to avoid stale closure
      const currentActiveSession = useSessionStore.getState().getActiveSession();
      
      // Only format if we're still on the same session that triggered this effect
      if (!currentActiveSession || currentActiveSession.id !== sessionId) {
        return;
      }
      
      // Since the backend now returns formatted stdout for JSON messages,
      // we just need to concatenate all stdout outputs in order
      let formatted = '';
      
      // Add all stdout output (which now includes formatted JSON messages)
      if (currentActiveSession.output && currentActiveSession.output.length > 0) {
        formatted = currentActiveSession.output.join('');
      }
      
      console.log(`[SessionView] Formatting output for session ${sessionId}, length: ${formatted.length}`);
      
      // Only set the formatted output if we're still on the same session
      const finalActiveSession = useSessionStore.getState().getActiveSession();
      if (finalActiveSession && finalActiveSession.id === sessionId) {
        setFormattedOutput(formatted);
        setCurrentSessionIdForOutput(sessionId);
      }
    };
    
    formatOutput();
  }, [activeSession?.id, messageCount, outputCount, isWaitingForFirstOutput]);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const scriptTerminalRef = useRef<HTMLDivElement>(null);
  const scriptTerminalInstance = useRef<Terminal | null>(null);
  const scriptFitAddon = useRef<FitAddon | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [isLoadingOutput, setIsLoadingOutput] = useState(false);
  const previousMessageCountRef = useRef(0);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Git operation state
  const [gitCommands, setGitCommands] = useState<{rebaseCommands: string[], squashCommands: string[], mainBranch?: string, currentBranch?: string} | null>(null);
  const [hasChangesToRebase, setHasChangesToRebase] = useState<boolean>(false);
  const [showCommitMessageDialog, setShowCommitMessageDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [dialogType, setDialogType] = useState<'rebase' | 'squash'>('rebase');
  const [showGitErrorDialog, setShowGitErrorDialog] = useState(false);
  const [gitErrorDetails, setGitErrorDetails] = useState<{
    title: string;
    message: string;
    command?: string;
    commands?: string[];
    output: string;
    workingDirectory?: string;
    projectPath?: string;
  } | null>(null);
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
      
      // After loading all outputs, we don't need to format here anymore
      // The formatting will happen in the useEffect that watches for changes
      
      setLoadError(null);
    } catch (error) {
      console.error('Error fetching session output:', error);
      
      if (retryCount < 3) {
        // Retry after a short delay, with increasing delays for new sessions
        const delay = activeSession?.status === 'initializing' ? 1500 : 1000;
        setTimeout(() => {
          // Check if still the active session before retrying
          const currentActiveSession = useSessionStore.getState().getActiveSession();
          if (currentActiveSession && currentActiveSession.id === sessionId) {
            loadOutputContent(sessionId, retryCount + 1);
          }
        }, delay);
      } else {
        // Don't show error for new sessions, they might just be starting up
        if (activeSession?.status !== 'initializing') {
          setLoadError(error instanceof Error ? error.message : 'Failed to load output content');
        }
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

    // For newly created sessions (status: initializing), add a delay before loading output
    // This gives Claude Code time to start producing output
    if (activeSession.status === 'initializing') {
      // Show a message while Claude Code is starting up
      terminalInstance.current.writeln('\r\n🚀 Starting Claude Code session...\r\n');
      
      // Mark that we're waiting for first output
      setIsWaitingForFirstOutput(true);
      
      // Try loading immediately first to get any initial prompt
      loadOutputContent(activeSession.id);
      
      // Then also try again after a delay in case more output arrives
      setTimeout(() => {
        // Only reload if we're still on the same session
        const currentActiveSession = useSessionStore.getState().getActiveSession();
        if (currentActiveSession && currentActiveSession.id === activeSession.id) {
          loadOutputContent(activeSession.id);
        }
      }, 2000);
    } else {
      // For existing sessions, load immediately
      setIsWaitingForFirstOutput(false);
      loadOutputContent(activeSession.id);
    }
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
      console.log(`[SessionView] Writing all content to terminal, length: ${formattedOutput.length}`);
      terminalInstance.current.write(formattedOutput);
      lastProcessedOutputLength.current = formattedOutput.length;
      terminalInstance.current.scrollToBottom();
    } else if (formattedOutput.length > lastProcessedOutputLength.current) {
      // Write only new content
      const newOutput = formattedOutput.substring(lastProcessedOutputLength.current);
      console.log(`[SessionView] Writing new content to terminal, length: ${newOutput.length}`);
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
  
  // Track changes in messages and mark as unread if not viewing
  useEffect(() => {
    if (!activeSession) return;
    
    const currentMessageCount = activeSession.jsonMessages?.length || 0;
    
    if (activeSession.jsonMessages && currentMessageCount > previousMessageCountRef.current) {
      if (viewMode !== 'messages') {
        setUnreadActivity(prev => ({ ...prev, messages: true }));
      }
    }
    
    previousMessageCountRef.current = currentMessageCount;
  }, [activeSession?.jsonMessages?.length, viewMode]);

  // Track elapsed time when session is running
  useEffect(() => {
    if (!activeSession) return;
    
    if (activeSession.status === 'running' || activeSession.status === 'initializing') {
      // Start the timer
      if (!startTime) {
        setStartTime(Date.now());
      }
      
      // Update elapsed time every second
      const interval = setInterval(() => {
        if (startTime) {
          setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
        }
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      // Reset timer when session stops
      setStartTime(null);
      setElapsedTime(0);
    }
  }, [activeSession?.status, startTime]);
  
  // Reset unread badges when session changes
  useEffect(() => {
    setUnreadActivity({
      output: false,
      messages: false,
      changes: false,
      terminal: false,
    });
  }, [activeSession?.id]);

  // Load git commands and check for changes to rebase
  useEffect(() => {
    if (!activeSession) {
      setGitCommands(null);
      setHasChangesToRebase(false);
      return;
    }
    
    const loadGitData = async () => {
      try {
        // Load git commands for tooltips
        const commandsResponse = await API.sessions.getGitCommands(activeSession.id);
        if (commandsResponse.success) {
          setGitCommands(commandsResponse.data);
        }
        
        // Check if there are changes to rebase
        const changesResponse = await API.sessions.hasChangesToRebase(activeSession.id);
        if (changesResponse.success) {
          setHasChangesToRebase(changesResponse.data);
        }
      } catch (error) {
        console.error('Error loading git data:', error);
      }
    };
    
    loadGitData();
  }, [activeSession?.id]);
  
  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = 'auto';
      // Set height to scrollHeight but constrain to min/max
      const scrollHeight = textareaRef.current.scrollHeight;
      const minHeight = 42; // ~2 lines
      const maxHeight = 200; // ~10 lines
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
    }
  }, [input]);
  
  // Watch for session status changes from 'stopped' to 'initializing' (indicating a continue)
  const previousStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeSession) return;
    
    const previousStatus = previousStatusRef.current;
    const currentStatus = activeSession.status;
    
    // If status changed from stopped/waiting to initializing, reload output
    if (previousStatus && 
        (previousStatus === 'stopped' || previousStatus === 'waiting') && 
        currentStatus === 'initializing') {
      // Reload output content when session restarts
      setTimeout(() => {
        loadOutputContent(activeSession.id);
      }, 200);
    }
    
    previousStatusRef.current = currentStatus;
  }, [activeSession?.status, activeSession?.id]);
  
  const handleNavigateToPrompt = (marker: any) => {
    console.log('[SessionView] handleNavigateToPrompt called with marker:', marker);
    
    if (!terminalInstance.current) {
      console.warn('[SessionView] Terminal instance not available');
      return;
    }
    
    // Ensure we're in output view
    if (viewMode !== 'output') {
      setViewMode('output');
      // Give the terminal time to render before scrolling
      setTimeout(() => {
        navigateToPromptInTerminal(marker);
      }, 200);
    } else {
      navigateToPromptInTerminal(marker);
    }
  };
  
  const navigateToPromptInTerminal = (marker: any) => {
    if (!terminalInstance.current || !activeSession) return;
    
    // Search for the prompt text in the terminal buffer
    const searchTerm = marker.prompt_text;
    if (!searchTerm) {
      console.warn('[SessionView] No prompt text to search for');
      return;
    }
    
    // Get the terminal buffer
    const buffer = terminalInstance.current.buffer.active;
    const totalLines = buffer.length;
    
    // Search from top to bottom for the prompt text
    let foundLine = -1;
    const searchTextStart = searchTerm.substring(0, 50).trim();
    
    for (let i = 0; i < totalLines; i++) {
      const line = buffer.getLine(i);
      if (line) {
        const lineText = line.translateToString(true);
        
        // Check if this line contains a user prompt marker
        if (lineText.includes('👤 User Input') || lineText.includes('👤 USER PROMPT')) {
          // Now check the next few lines for the actual prompt text
          for (let j = 1; j <= 5 && i + j < totalLines; j++) {
            const promptLine = buffer.getLine(i + j);
            if (promptLine) {
              const promptLineText = promptLine.translateToString(true).trim();
              if (promptLineText && promptLineText.includes(searchTextStart)) {
                foundLine = i;
                console.log('[SessionView] Found prompt marker at line:', i, 'Prompt at line:', i + j);
                break;
              }
            }
          }
          if (foundLine >= 0) break;
        }
      }
    }
    
    // If not found with markers, try direct search for the prompt text
    if (foundLine < 0) {
      for (let i = 0; i < totalLines; i++) {
        const line = buffer.getLine(i);
        if (line) {
          const lineText = line.translateToString(true);
          if (lineText.includes(searchTextStart)) {
            // Check if this is likely a prompt by looking at previous lines
            let isPrompt = false;
            for (let j = Math.max(0, i - 3); j < i; j++) {
              const prevLine = buffer.getLine(j);
              if (prevLine) {
                const prevLineText = prevLine.translateToString(true);
                if (prevLineText.includes('👤 User Input') || prevLineText.includes('👤 USER PROMPT')) {
                  isPrompt = true;
                  foundLine = j; // Use the marker line, not the prompt line
                  break;
                }
              }
            }
            if (isPrompt) {
              console.log('[SessionView] Found prompt text at line:', i, 'Marker at:', foundLine);
              break;
            }
          }
        }
      }
    }
    
    if (foundLine >= 0) {
      // Scroll to the found line, with a small offset to show context
      const scrollToLine = Math.max(0, foundLine - 2);
      console.log('[SessionView] Scrolling to line:', scrollToLine);
      terminalInstance.current.scrollToLine(scrollToLine);
    } else {
      console.warn('[SessionView] Could not find prompt in terminal buffer:', searchTerm);
      // Fallback to using output_line if available
      if (marker.output_line !== undefined && marker.output_line !== null) {
        terminalInstance.current.scrollToLine(marker.output_line);
      }
    }
  };
  
  // Listen for navigate to prompt events from PromptHistory
  useEffect(() => {
    const handlePromptNavigation = (event: CustomEvent) => {
      const { sessionId, promptMarker } = event.detail;
      
      // Only handle if this is the current session
      if (activeSession?.id === sessionId && promptMarker && terminalInstance.current) {
        // Switch to output view if not already there
        if (viewMode !== 'output') {
          setViewMode('output');
        }
        
        // Navigate to the prompt after a short delay to ensure terminal is ready
        setTimeout(() => {
          handleNavigateToPrompt(promptMarker);
        }, 100);
      }
    };
    
    window.addEventListener('navigateToPrompt', handlePromptNavigation as EventListener);
    
    return () => {
      window.removeEventListener('navigateToPrompt', handlePromptNavigation as EventListener);
    };
  }, [activeSession?.id, viewMode, handleNavigateToPrompt]);
  
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
      const response = await API.sessions.continue(activeSession.id, input);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to continue conversation');
      }
      
      setInput('');
      
      // Force reload output content after a short delay to ensure the session has started
      setTimeout(() => {
        if (activeSession) {
          loadOutputContent(activeSession.id);
        }
      }, 500);
    } catch (error) {
      console.error('Error continuing conversation:', error);
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

  const handleRebaseMainIntoWorktree = async () => {
    setIsMerging(true);
    setMergeError(null);
    
    try {
      const response = await API.sessions.rebaseMainIntoWorktree(activeSession.id);
      
      if (!response.success) {
        // Check if we have detailed git error information
        if ((response as any).gitError) {
          const gitError = (response as any).gitError;
          setGitErrorDetails({
            title: 'Rebase Failed',
            message: response.error || 'Failed to rebase main into worktree',
            command: gitError.command,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || 'Failed to rebase main into worktree');
        }
        return;
      }
      
      setMergeError(null);
      // Refresh git data after successful rebase
      const changesResponse = await API.sessions.hasChangesToRebase(activeSession.id);
      if (changesResponse.success) {
        setHasChangesToRebase(changesResponse.data);
      }
    } catch (error) {
      console.error('Error rebasing main into worktree:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to rebase main into worktree');
    } finally {
      setIsMerging(false);
    }
  };

  const handleSquashAndRebaseToMain = async () => {
    // Show commit message dialog for squash operation
    const defaultCommitMessage = await generateDefaultCommitMessage();
    setCommitMessage(defaultCommitMessage);
    setDialogType('squash');
    setShowCommitMessageDialog(true);
  };

  const performSquashWithCommitMessage = async (message: string) => {
    setIsMerging(true);
    setMergeError(null);
    setShowCommitMessageDialog(false);
    
    try {
      const response = await API.sessions.squashAndRebaseToMain(activeSession.id, message);
      
      if (!response.success) {
        // Check if we have detailed git error information
        if ((response as any).gitError) {
          const gitError = (response as any).gitError;
          setGitErrorDetails({
            title: 'Squash and Rebase Failed',
            message: response.error || 'Failed to squash and rebase to main',
            commands: gitError.commands,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory,
            projectPath: gitError.projectPath
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || 'Failed to squash and rebase to main');
        }
        return;
      }
      
      setMergeError(null);
      // Refresh git data after successful squash
      const changesResponse = await API.sessions.hasChangesToRebase(activeSession.id);
      if (changesResponse.success) {
        setHasChangesToRebase(changesResponse.data);
      }
    } catch (error) {
      console.error('Error squashing and rebasing to main:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to squash and rebase to main');
    } finally {
      setIsMerging(false);
    }
  };

  const generateDefaultCommitMessage = async () => {
    try {
      const promptsResponse = await API.sessions.getPrompts(activeSession.id);
      if (promptsResponse.success && promptsResponse.data?.length > 0) {
        // Get all prompts and join them with empty lines
        const prompts = promptsResponse.data.map((prompt: any) => prompt.prompt_text || prompt.content).filter(Boolean);
        return prompts.join('\n\n');
      }
    } catch (error) {
      console.error('Error generating default commit message:', error);
    }
    
    // Fallback to a simple message with main branch name
    const mainBranch = gitCommands?.mainBranch || 'main';
    return dialogType === 'squash' 
      ? `Squashed commits from ${gitCommands?.currentBranch || 'feature branch'}`
      : `Rebase from ${mainBranch}`;
  };

  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  };
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 flex-shrink-0">
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
                <div className="group relative">
                  <button
                    onClick={handleRebaseMainIntoWorktree}
                    disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hasChangesToRebase}
                    className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                      isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hasChangesToRebase
                        ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" />
                    </svg>
                    <span className="text-sm font-medium">{isMerging ? 'Rebasing...' : `Rebase from ${gitCommands?.mainBranch || 'main'}`}</span>
                  </button>
                  {/* Enhanced Tooltip */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 max-w-md w-80">
                    <div className="font-semibold mb-1">Rebase from {gitCommands?.mainBranch || 'main'}</div>
                    {!hasChangesToRebase ? (
                      <div className="text-gray-300">No changes to rebase</div>
                    ) : (
                      <div className="space-y-1">
                        <div className="text-gray-300">Command to run:</div>
                        <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded whitespace-nowrap">
                          git rebase {gitCommands?.mainBranch || 'main'}
                        </div>
                        <div className="text-xs text-gray-300 mt-1">
                          Replays your commits on top of {gitCommands?.mainBranch || 'main'}
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
                  </div>
                </div>
                
                <div className="group relative">
                  <button
                    onClick={handleSquashAndRebaseToMain}
                    disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                    className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                      isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'
                        ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-green-300 text-green-600 hover:bg-green-50 hover:border-green-400 hover:shadow-sm'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
                    </svg>
                    <span className="text-sm font-medium">{isMerging ? 'Squashing...' : `Rebase to ${gitCommands?.mainBranch || 'main'}`}</span>
                  </button>
                  {/* Enhanced Tooltip */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 max-w-lg w-96">
                    <div className="font-semibold mb-1">Rebase to {gitCommands?.mainBranch || 'main'}</div>
                    <div className="space-y-1">
                      <div className="text-gray-300">Commands to run:</div>
                      <div className="space-y-1">
                        <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded">
                          git merge-base {gitCommands?.mainBranch || 'main'} HEAD
                        </div>
                        <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded">
                          git reset --soft &lt;base-commit&gt;
                        </div>
                        <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded">
                          git commit -m "Your message"
                        </div>
                        <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded">
                          git checkout {gitCommands?.mainBranch || 'main'}
                        </div>
                        <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded">
                          git rebase {gitCommands?.currentBranch || 'feature-branch'}
                        </div>
                      </div>
                      <div className="text-xs text-gray-300 mt-1">
                        Squashes all commits into one, then rebases onto {gitCommands?.mainBranch || 'main'}
                      </div>
                    </div>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
                  </div>
                </div>
              </div>
            </div>
            {mergeError && (
              <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-md">
                <p className="text-sm text-red-700">{mergeError}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex bg-white rounded-lg border border-gray-300 overflow-hidden flex-shrink-0">
            <button
              onClick={() => {
                setViewMode('output');
                setUnreadActivity(prev => ({ ...prev, output: false }));
              }}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 relative ${
                viewMode === 'output' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Output
              {unreadActivity.output && viewMode !== 'output' && (
                <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
              )}
            </button>
            <button
              onClick={() => {
                setViewMode('messages');
                setUnreadActivity(prev => ({ ...prev, messages: false }));
              }}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 relative ${
                viewMode === 'messages' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Messages ({activeSession.jsonMessages?.length || 0})
              {unreadActivity.messages && viewMode !== 'messages' && (
                <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
              )}
            </button>
            <button
              onClick={() => {
                setViewMode('changes');
                setUnreadActivity(prev => ({ ...prev, changes: false }));
              }}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 relative ${
                viewMode === 'changes' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Changes
              {unreadActivity.changes && viewMode !== 'changes' && (
                <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
              )}
            </button>
            <button
              onClick={() => {
                setViewMode('terminal');
                setUnreadActivity(prev => ({ ...prev, terminal: false }));
              }}
              className={`px-3 py-1 text-sm whitespace-nowrap flex-shrink-0 inline-flex items-center relative ${
                viewMode === 'terminal' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Terminal {activeSession.isRunning && (
                <span className="ml-1 inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              )}
              {unreadActivity.terminal && viewMode !== 'terminal' && (
                <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full"></span>
              )}
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
                  <div className="text-xs text-gray-400 font-mono">
                    {activeSession.status === 'initializing' ? '⚡' : formatElapsedTime(elapsedTime)}
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
            {viewMode === 'changes' && (
              <CombinedDiffView 
                sessionId={activeSession.id} 
                selectedExecutions={[]} 
                isGitOperationRunning={isMerging}
              />
            )}
          </div>
          <div className={`h-full ${viewMode === 'terminal' ? 'block' : 'hidden'} bg-gray-900`}>
            <div ref={scriptTerminalRef} className="h-full" />
          </div>
        </div>
        {viewMode === 'output' && (
          <PromptNavigation 
            sessionId={activeSession.id} 
            onNavigateToPrompt={handleNavigateToPrompt}
          />
        )}
      </div>
      
      <div className="border-t border-gray-300 p-4 bg-white flex-shrink-0">
        <div className="flex space-x-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Send on Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (activeSession.status === 'waiting') {
                  handleSendInput();
                } else {
                  handleContinueConversation();
                }
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white resize-none overflow-y-auto"
            placeholder={
              activeSession.status === 'waiting' 
                ? "Enter your response... (⌘↵ to send)" 
                : "Continue conversation with a new message... (⌘↵ to send)"
            }
            style={{ minHeight: '42px', maxHeight: '200px' }}
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

      {/* Commit Message Dialog */}
      {showCommitMessageDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {dialogType === 'squash' 
                  ? `Squash and Rebase to ${gitCommands?.mainBranch || 'Main'}`
                  : `Rebase from ${gitCommands?.mainBranch || 'Main'}`
                }
              </h2>
              <button
                onClick={() => setShowCommitMessageDialog(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Commit Message
                  </label>
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder={dialogType === 'squash' 
                      ? "Enter commit message for the squashed commit..."
                      : "Enter commit message for the rebase..."
                    }
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {dialogType === 'squash'
                      ? `This message will be used for the single squashed commit combining all your changes.`
                      : `This message will be used when rebasing changes from ${gitCommands?.mainBranch || 'main'}.`
                    }
                  </p>
                </div>

                {(dialogType === 'squash' ? gitCommands?.squashCommands : gitCommands?.rebaseCommands) && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Git commands to be executed:</h4>
                    <div className="space-y-1">
                      {(dialogType === 'squash' ? gitCommands?.squashCommands : gitCommands?.rebaseCommands)?.map((cmd, idx) => (
                        <div key={idx} className="font-mono text-xs bg-gray-800 text-white px-3 py-2 rounded">
                          {cmd}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowCommitMessageDialog(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => performSquashWithCommitMessage(commitMessage)}
                disabled={!commitMessage.trim() || isMerging}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                {isMerging ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{dialogType === 'squash' ? 'Squashing...' : 'Rebasing...'}</span>
                  </>
                ) : (
                  <span>{dialogType === 'squash' ? 'Squash & Rebase' : 'Rebase'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Git Error Dialog */}
      {showGitErrorDialog && gitErrorDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-red-50">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-semibold text-red-900">{gitErrorDetails.title}</h2>
              </div>
              <button
                onClick={() => setShowGitErrorDialog(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Error Message */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Error Message</h3>
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-800 text-sm">{gitErrorDetails.message}</p>
                  </div>
                </div>

                {/* Working Directory */}
                {gitErrorDetails.workingDirectory && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Working Directory</h3>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                      <p className="text-gray-800 text-sm font-mono">{gitErrorDetails.workingDirectory}</p>
                    </div>
                  </div>
                )}

                {/* Project Path */}
                {gitErrorDetails.projectPath && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Project Path</h3>
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                      <p className="text-gray-800 text-sm font-mono">{gitErrorDetails.projectPath}</p>
                    </div>
                  </div>
                )}

                {/* Git Commands */}
                {(gitErrorDetails.command || gitErrorDetails.commands) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                      {gitErrorDetails.commands ? 'Git Commands Executed' : 'Git Command'}
                    </h3>
                    <div className="space-y-2">
                      {gitErrorDetails.command && (
                        <div className="bg-gray-900 text-gray-100 rounded-md p-3 font-mono text-sm">
                          {gitErrorDetails.command}
                        </div>
                      )}
                      {gitErrorDetails.commands && gitErrorDetails.commands.map((cmd, idx) => (
                        <div key={idx} className="bg-gray-900 text-gray-100 rounded-md p-3 font-mono text-sm">
                          {cmd}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Git Output */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Git Output</h3>
                  <div className="bg-gray-900 text-gray-100 rounded-md p-4 max-h-80 overflow-y-auto">
                    <pre className="text-sm whitespace-pre-wrap font-mono">
                      {gitErrorDetails.output || 'No output available'}
                    </pre>
                  </div>
                </div>

                {/* Helpful Information */}
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-blue-900 mb-1">Troubleshooting Tips</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Check if you have uncommitted changes that need to be resolved</li>
                        <li>• Verify that the main branch exists and is up to date</li>
                        <li>• Look for merge conflicts in the git output above</li>
                        <li>• Consider manually running the git commands in your terminal for more control</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  if (gitErrorDetails.output) {
                    navigator.clipboard.writeText(gitErrorDetails.output);
                  }
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Output</span>
              </button>
              <button
                onClick={() => setShowGitErrorDialog(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
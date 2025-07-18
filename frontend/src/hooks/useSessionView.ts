import { useState, useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useTheme } from '../contexts/ThemeContext';
import { API } from '../utils/api';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Session, GitCommands, GitErrorDetails } from '../types/session';
import { createVisibilityAwareInterval } from '../utils/performanceUtils';

export type ViewMode = 'output' | 'messages' | 'changes' | 'terminal' | 'editor';

export const useSessionView = (
  activeSession: Session | undefined,
  terminalRef: React.RefObject<HTMLDivElement | null>,
  scriptTerminalRef: React.RefObject<HTMLDivElement | null>
) => {
  const { theme } = useTheme();
  const activeSessionId = activeSession?.id;

  // Terminal instances
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const scriptTerminalInstance = useRef<Terminal | null>(null);
  const scriptFitAddon = useRef<FitAddon | null>(null);

  // States
  const [viewMode, setViewMode] = useState<ViewMode>('output');
  const [unreadActivity, setUnreadActivity] = useState({
    output: false,
    messages: false,
    changes: false,
    terminal: false,
    editor: false,
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const [formattedOutput, setFormattedOutput] = useState<string>('');
  const [currentSessionIdForOutput, setCurrentSessionIdForOutput] = useState<string | null>(null);
  const [isPathCollapsed, setIsPathCollapsed] = useState(true);
  const [input, setInput] = useState('');
  const [ultrathink, setUltrathink] = useState(false);
  const [isLoadingOutput, setIsLoadingOutput] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [outputLoadState, setOutputLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [gitCommands, setGitCommands] = useState<GitCommands | null>(null);
  const [hasChangesToRebase, setHasChangesToRebase] = useState<boolean>(false);
  const [showCommitMessageDialog, setShowCommitMessageDialog] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [dialogType, setDialogType] = useState<'rebase' | 'squash'>('rebase');
  const [showGitErrorDialog, setShowGitErrorDialog] = useState(false);
  const [gitErrorDetails, setGitErrorDetails] = useState<GitErrorDetails | null>(null);
  const [showStravuSearch, setShowStravuSearch] = useState(false);
  const [isStravuConnected, setIsStravuConnected] = useState(false);
  const [shouldSquash, setShouldSquash] = useState(true);
  const [isWaitingForFirstOutput, setIsWaitingForFirstOutput] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const [, forceUpdate] = useState({});
  const [shouldReloadOutput, setShouldReloadOutput] = useState(false);

  // Refs
  const previousSessionIdRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const loadingSessionIdRef = useRef<string | null>(null); // Track which session is loading
  const previousMessageCountRef = useRef(0);
  const lastProcessedOutputLength = useRef(0);
  const lastProcessedScriptOutputLength = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousStatusRef = useRef<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const isContinuingConversationRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const outputLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debug function to check state health
  const debugState = useCallback(() => {
    console.log('[DEBUG STATE]', {
      loadingRef: loadingRef.current,
      outputLoadState,
      activeSessionId,
      currentSessionIdForOutput,
      formattedOutputLength: formattedOutput.length,
      lastProcessedOutputLength: lastProcessedOutputLength.current,
      terminalExists: !!terminalInstance.current,
      viewMode,
      abortController: !!abortControllerRef.current,
      pendingTimeout: !!outputLoadTimeoutRef.current
    });
  }, [outputLoadState, activeSessionId, currentSessionIdForOutput, formattedOutput.length, viewMode]);
  
  // Force reset stuck state
  const forceResetLoadingState = useCallback(() => {
    console.log('[forceResetLoadingState] Forcing reset of all loading states');
    loadingRef.current = false;
    loadingSessionIdRef.current = null;
    setIsLoadingOutput(false);
    setOutputLoadState('idle');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (outputLoadTimeoutRef.current) {
      clearTimeout(outputLoadTimeoutRef.current);
      outputLoadTimeoutRef.current = null;
    }
  }, []);


  const loadOutputContent = useCallback(async (sessionId: string, retryCount = 0) => {
    console.log(`[loadOutputContent] Called for session ${sessionId}, retry: ${retryCount}, loadingRef: ${loadingRef.current}`);
    
    // Cancel any existing load request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clear any pending timeout
    if (outputLoadTimeoutRef.current) {
      clearTimeout(outputLoadTimeoutRef.current);
      outputLoadTimeoutRef.current = null;
    }
    
    // Check if already loading this session
    if (loadingRef.current && loadingSessionIdRef.current === sessionId) {
      console.log(`[loadOutputContent] Already loading session ${sessionId}, skipping`);
      return;
    }
    
    // If loading a different session, abort the old one
    if (loadingRef.current && loadingSessionIdRef.current !== sessionId) {
      console.log(`[loadOutputContent] Currently loading session ${loadingSessionIdRef.current}, will switch to ${sessionId}`);
      loadingRef.current = false;
      loadingSessionIdRef.current = null;
    }
    
    // Check if session is still active
    const currentActiveSession = useSessionStore.getState().getActiveSession();
    if (!currentActiveSession || currentActiveSession.id !== sessionId) {
      console.log(`[loadOutputContent] Session ${sessionId} not active, skipping`);
      return;
    }

    // Set loading state - CRITICAL: Must be reset in all code paths
    loadingRef.current = true;
    loadingSessionIdRef.current = sessionId;
    setIsLoadingOutput(true);
    setOutputLoadState('loading');
    setLoadError(null);
    
    // Show loading message in terminal if this is the first load
    if (terminalInstance.current && retryCount === 0 && lastProcessedOutputLength.current === 0) {
      terminalInstance.current.writeln('\r\n⏳ Loading session output...\r\n');
    }
    
    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    try {
      const response = await API.sessions.getOutput(sessionId);
      if (!response.success) {
        // Check if the session was archived (404 error)
        if (response.error && response.error.includes('not found')) {
          console.log(`[loadOutputContent] Session ${sessionId} not found (possibly archived), aborting`);
          // CRITICAL: Reset loading state before returning
          loadingRef.current = false;
          loadingSessionIdRef.current = null;
          setIsLoadingOutput(false);
          setOutputLoadState('idle');
          // Clear any loading message
          if (terminalInstance.current && lastProcessedOutputLength.current === 0) {
            terminalInstance.current.clear();
            terminalInstance.current.writeln('\r\n⚠️ Session has been archived\r\n');
          }
          return;
        }
        throw new Error(response.error || 'Failed to load output');
      }
      
      const outputs = response.data || [];
      console.log(`[loadOutputContent] Received ${outputs.length} outputs for session ${sessionId}`);
      
      // Check if still the active session after async operation
      const stillActiveSession = useSessionStore.getState().getActiveSession();
      if (!stillActiveSession || stillActiveSession.id !== sessionId) {
        console.log(`[loadOutputContent] Session ${sessionId} no longer active, aborting`);
        // CRITICAL: Reset loading state before returning
        loadingRef.current = false;
        loadingSessionIdRef.current = null;
        setIsLoadingOutput(false);
        setOutputLoadState('idle');
        return;
      }
      
      // Clear loading message if we showed one
      if (terminalInstance.current && retryCount === 0 && lastProcessedOutputLength.current === 0) {
        terminalInstance.current.clear();
      }
      
      // Set outputs
      console.log(`[loadOutputContent] Setting outputs in store for session ${sessionId}, count: ${outputs.length}`);
      useSessionStore.getState().setSessionOutputs(sessionId, outputs);
      
      // Verify the outputs were set
      const verifySession = useSessionStore.getState().getActiveSession();
      console.log(`[loadOutputContent] After setSessionOutputs - activeSession output: ${verifySession?.output?.length}, jsonMessages: ${verifySession?.jsonMessages?.length}`);
      
      setOutputLoadState('loaded');
      
      if (isWaitingForFirstOutput && outputs.length > 0) {
        setIsWaitingForFirstOutput(false);
      }
      
      // Reset continuing conversation flag after successfully loading output
      if (isContinuingConversationRef.current) {
        console.log(`[loadOutputContent] Resetting continuing conversation flag after output load`);
        isContinuingConversationRef.current = false;
      }
      
      setLoadError(null);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`[loadOutputContent] Request aborted for session ${sessionId}`);
        // CRITICAL: Reset loading state before returning
        loadingRef.current = false;
        loadingSessionIdRef.current = null;
        setIsLoadingOutput(false);
        setOutputLoadState('idle');
        return;
      }
      
      console.error(`[loadOutputContent] Error loading output for session ${sessionId}:`, error);
      setOutputLoadState('error');
      
      // Retry logic for new sessions only
      const isNewSession = activeSession?.status === 'initializing';
      const maxRetries = isNewSession ? 3 : 0;
      
      if (retryCount < maxRetries) {
        const delay = 1000 * (retryCount + 1);
        console.log(`[loadOutputContent] Retrying in ${delay}ms for session ${sessionId}`);
        // Reset loading state before retry
        loadingRef.current = false;
        loadingSessionIdRef.current = null;
        setIsLoadingOutput(false);
        outputLoadTimeoutRef.current = setTimeout(() => {
          const currentActiveSession = useSessionStore.getState().getActiveSession();
          if (currentActiveSession && currentActiveSession.id === sessionId) {
            loadOutputContent(sessionId, retryCount + 1);
          }
        }, delay);
      } else {
        setLoadError(error instanceof Error ? error.message : 'Failed to load output content');
        if (terminalInstance.current && lastProcessedOutputLength.current === 0) {
          terminalInstance.current.writeln(`\r\n❌ Error loading output: ${error.message || 'Unknown error'}\r\n`);
        }
      }
    } finally {
      // Always reset loading state
      loadingRef.current = false;
      loadingSessionIdRef.current = null;
      setIsLoadingOutput(false);
    }
  }, [activeSession?.status, isWaitingForFirstOutput]);

  useEffect(() => {
    if (!activeSessionId) return;
    const unsubscribe = useSessionStore.subscribe((state) => {
      const updatedSession = state.activeMainRepoSession?.id === activeSessionId
        ? state.activeMainRepoSession
        : state.sessions.find(s => s.id === activeSessionId);
      
      if (updatedSession && updatedSession.status !== activeSession?.status) {
        if (activeSession?.status === 'initializing' && updatedSession.status === 'running') {
          // Only clear terminal and reload for new sessions, not when continuing conversations
          const hasExistingOutput = activeSession.output && activeSession.output.length > 0;
          if (!hasExistingOutput && !isContinuingConversationRef.current) {
            terminalInstance.current?.clear();
            setShouldReloadOutput(true);
          }
        }
        forceUpdate({});
      }
    });
    const handleStatusChange = (event: CustomEvent) => {
      if (event.detail.sessionId === activeSessionId) forceUpdate({});
    };
    window.addEventListener('session-status-changed', handleStatusChange as EventListener);
    return () => {
      unsubscribe();
      window.removeEventListener('session-status-changed', handleStatusChange as EventListener);
    };
  }, [activeSessionId, activeSession?.status]);

  useEffect(() => {
    if (!activeSession) {
      setScriptOutput([]);
      return;
    }
    const unsubscribe = useSessionStore.subscribe((state) => {
      const sessionScriptOutput = state.scriptOutput[activeSession.id] || [];
      setScriptOutput(sessionScriptOutput);
      if (viewMode !== 'terminal' && sessionScriptOutput.length > 0) {
        setUnreadActivity(prev => ({ ...prev, terminal: true }));
      }
    });
    setScriptOutput(useSessionStore.getState().scriptOutput[activeSession.id] || []);
    return unsubscribe;
  }, [activeSession?.id, viewMode]);

  useEffect(() => {
    const currentSessionId = activeSession?.id || null;
    if (currentSessionId === previousSessionIdRef.current) return;

    console.log(`[useSessionView] Session changed from ${previousSessionIdRef.current} to ${currentSessionId}`);
    previousSessionIdRef.current = currentSessionId;
    
    // Force reset any stuck loading state when switching sessions
    forceResetLoadingState();
    
    // Reset view mode to output when switching sessions
    setViewMode('output');
    
    // Reset unread activity indicators
    setUnreadActivity({
      output: false,
      messages: false,
      changes: false,
      terminal: false,
      editor: false,
    });
    
    // Clear terminal immediately when session changes
    if (terminalInstance.current) {
      console.log(`[useSessionView] Clearing terminal for session switch`);
      terminalInstance.current.clear();
    }
    setFormattedOutput('');
    lastProcessedOutputLength.current = 0;

    if (!activeSession) {
      console.log(`[useSessionView] No active session, returning`);
      setCurrentSessionIdForOutput(null);
      // Clear any error states when no session is active
      setLoadError(null);
      setOutputLoadState('idle');
      return;
    }

    console.log(`[useSessionView] Setting up for session ${activeSession.id}, status: ${activeSession.status}`);
    setCurrentSessionIdForOutput(activeSession.id);
    
    if (scriptTerminalInstance.current) {
      scriptTerminalInstance.current.reset();
    }
    
    // Reset output tracking
    lastProcessedOutputLength.current = 0;
    lastProcessedScriptOutputLength.current = 0;

    const hasOutput = activeSession.output && activeSession.output.length > 0;
    const hasMessages = activeSession.jsonMessages && activeSession.jsonMessages.length > 0;
    const isNewSession = activeSession.status === 'initializing' || (activeSession.status === 'running' && !hasOutput && !hasMessages);
    
    console.log(`[useSessionView] Session ${activeSession.id} - hasOutput: ${hasOutput}, hasMessages: ${hasMessages}, isNewSession: ${isNewSession}`);
    
    if (isNewSession) {
      setIsWaitingForFirstOutput(true);
      setStartTime(Date.now());
    } else {
      setIsWaitingForFirstOutput(false);
    }
  }, [activeSession?.id, forceResetLoadingState]);

  const messageCount = activeSession?.jsonMessages?.length || 0;
  const outputCount = activeSession?.output?.length || 0;

  useEffect(() => {
    if (!activeSession) return;
    
    // Make sure we're tracking the right session for output
    if (currentSessionIdForOutput !== activeSession.id) {
      console.log(`[useSessionView] Session ID mismatch in format effect - current: ${currentSessionIdForOutput}, active: ${activeSession.id}`);
      // If the session ID doesn't match, update it
      if (activeSession.id) {
        setCurrentSessionIdForOutput(activeSession.id);
      }
      return;
    }
    
    if (messageCount === 0 && outputCount === 0) {
      console.log(`[useSessionView] No messages or output to format for session ${activeSession.id}`);
      return;
    }

    if (isWaitingForFirstOutput && (messageCount > 0 || outputCount > 0)) {
      setIsWaitingForFirstOutput(false);
    }

    const formatOutput = () => {
      const currentActiveSession = useSessionStore.getState().getActiveSession();
      if (!currentActiveSession || currentActiveSession.id !== activeSession.id) {
        console.log(`[formatOutput] Session changed during formatting, aborting`);
        return;
      }
      
      // The output array should already contain formatted strings from the IPC handler
      const outputArray = currentActiveSession.output || [];
      console.log(`[formatOutput] Session ${activeSession.id} has ${outputArray.length} output items`);
      
      if (outputArray.length > 0) {
        console.log(`[formatOutput] First output item preview: ${outputArray[0].substring(0, 200)}`);
      }
      
      const formatted = outputArray.join('');
      
      // Double-check we're still on the same session before updating
      const finalActiveSession = useSessionStore.getState().getActiveSession();
      if (finalActiveSession && finalActiveSession.id === activeSession.id && currentSessionIdForOutput === activeSession.id) {
        console.log(`[formatOutput] Setting formatted output for session ${activeSession.id}, length: ${formatted.length}, first 100 chars: ${formatted.substring(0, 100)}`);
        setFormattedOutput(formatted);
      } else {
        console.log(`[formatOutput] Session mismatch during final check - finalActiveSession.id: ${finalActiveSession?.id}, activeSession.id: ${activeSession.id}, currentSessionIdForOutput: ${currentSessionIdForOutput}`);
      }
    };
    
    // Use requestAnimationFrame to ensure state is settled
    requestAnimationFrame(() => {
      formatOutput();
    });
  }, [activeSession?.id, messageCount, outputCount, currentSessionIdForOutput, isWaitingForFirstOutput]);
  
  // Consolidated effect for loading output
  useEffect(() => {
    console.log(`[Output Load Effect] Checking - activeSession: ${activeSession?.id}, currentSessionIdForOutput: ${currentSessionIdForOutput}, outputLoadState: ${outputLoadState}, loadingRef: ${loadingRef.current}, loadingSessionId: ${loadingSessionIdRef.current}`);
    
    if (!activeSession || !currentSessionIdForOutput || currentSessionIdForOutput !== activeSession.id) {
      return;
    }
    
    // Skip initial load if continuing conversation, but allow explicit reloads
    if (isContinuingConversationRef.current && outputLoadState === 'idle' && !shouldReloadOutput) {
      console.log(`[Output Load Effect] Skipping initial load - continuing conversation`);
      return;
    }
    
    const hasOutput = (activeSession.output?.length || 0) > 0;
    const hasMessages = (activeSession.jsonMessages?.length || 0) > 0;
    
    console.log(`[Output Load Effect] Session ${activeSession.id} - hasOutput: ${hasOutput}, hasMessages: ${hasMessages}, status: ${activeSession.status}`);
    
    // Check for stuck loading state and force reset if needed
    if (loadingRef.current && outputLoadState === 'idle') {
      console.warn(`[Output Load Effect] Detected stuck loading state, forcing reset`);
      forceResetLoadingState();
    }
    
    // Determine if we need to load output
    let shouldLoad = false;
    let loadDelay = 0;
    
    if (outputLoadState === 'idle') {
      // Always load when idle - let the backend be the source of truth
      shouldLoad = true;
      loadDelay = activeSession.status === 'initializing' ? 500 : 200;
    } else if (shouldReloadOutput) {
      // Explicit reload requested
      shouldLoad = true;
      loadDelay = 0;
      setShouldReloadOutput(false);
    } else if (outputLoadState === 'error' && !loadingRef.current) {
      // Retry after error if not currently loading
      console.log(`[Output Load Effect] Previous load errored, retrying`);
      shouldLoad = true;
      loadDelay = 1000;
    }
    
    if (shouldLoad && !loadingRef.current) {
      console.log(`[Output Load Effect] Scheduling load for session ${activeSession.id} in ${loadDelay}ms`);
      if (loadDelay > 0) {
        outputLoadTimeoutRef.current = setTimeout(() => {
          if (!loadingRef.current) {
            loadOutputContent(activeSession.id);
          }
        }, loadDelay);
      } else {
        loadOutputContent(activeSession.id);
      }
    } else if (shouldLoad && loadingRef.current) {
      console.log(`[Output Load Effect] Want to load but already loading, will retry later`);
    }
  }, [
    activeSession?.id,
    activeSession?.status,
    activeSession?.output?.length,
    activeSession?.jsonMessages?.length,
    currentSessionIdForOutput,
    outputLoadState,
    shouldReloadOutput,
    loadOutputContent,
    forceResetLoadingState
  ]);
  
  // Listen for output available events
  useEffect(() => {
    const handleOutputAvailable = (event: CustomEvent) => {
      const { sessionId } = event.detail;
      
      // Check if this is for the active session
      if (activeSession?.id === sessionId) {
        // Trigger reload if we're loaded or if we're continuing a conversation
        if (outputLoadState === 'loaded' || isContinuingConversationRef.current) {
          console.log(`[Output Available] New output for active session ${sessionId}, requesting reload (state: ${outputLoadState}, continuing: ${isContinuingConversationRef.current})`);
          setShouldReloadOutput(true);
        }
      }
    };
    
    window.addEventListener('session-output-available', handleOutputAvailable as EventListener);
    return () => window.removeEventListener('session-output-available', handleOutputAvailable as EventListener);
  }, [activeSession?.id, outputLoadState]);

  const initTerminal = useCallback((termRef: React.RefObject<HTMLDivElement | null>, instanceRef: React.MutableRefObject<Terminal | null>, fitAddonRef: React.MutableRefObject<FitAddon | null>, isScript: boolean) => {
    console.log(`[initTerminal] Called - termRef.current: ${!!termRef.current}, instanceRef.current: ${!!instanceRef.current}, isScript: ${isScript}`);
    
    if (!termRef.current) {
      console.log(`[initTerminal] No terminal ref element, cannot initialize`);
      return;
    }
    
    if (instanceRef.current) {
      console.log(`[initTerminal] Terminal instance already exists, skipping`);
      return;
    }

    const term = new Terminal({
        cursorBlink: !isScript,
        convertEol: true,
        rows: 30,
        cols: 80,
        scrollback: isScript ? 2000 : 5000, // Further reduced for better performance
        fastScrollModifier: 'ctrl',
        fastScrollSensitivity: 5,
        scrollSensitivity: 1,
        theme: theme === 'light' ? lightTheme : (isScript ? scriptDarkTheme : darkTheme)
    });

    const addon = new FitAddon();
    term.loadAddon(addon);
    term.open(termRef.current);
    setTimeout(() => addon.fit(), 100);

    instanceRef.current = term;
    fitAddonRef.current = addon;
    
    console.log(`[initTerminal] Terminal initialized successfully`);

    if (isScript) {
        // Clear any existing content
        term.clear();
        
        // Add keyboard handling for direct terminal input - pass everything through
        term.onData((data) => {
          // Pass all input directly to the PTY without buffering
          if (activeSession && !activeSession.archived) {
            API.sessions.sendTerminalInput(activeSession.id, data).catch(error => {
              console.error('Failed to send terminal input:', error);
            });
          }
        });
        
        // Send an initial empty input to ensure the PTY connection is established
        // and any buffered output is sent to the terminal
        if (activeSession && !activeSession.archived) {
          setTimeout(() => {
            API.sessions.sendTerminalInput(activeSession.id, '').catch(error => {
              console.error('Failed to send initial terminal input:', error);
            });
          }, 100);
        }
    }
  }, [theme, activeSession]);

  useEffect(() => {
    console.log(`[useSessionView] Terminal initialization effect - viewMode: ${viewMode}, terminalRef.current: ${!!terminalRef.current}`);
    if (viewMode === 'output' && terminalRef.current) {
      initTerminal(terminalRef, terminalInstance, fitAddon, false);
      
      // After terminal is initialized, trigger a check for loading output
      if (activeSession && !terminalInstance.current) {
        // Check less frequently and with a maximum number of attempts
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds maximum wait
        const checkInterval = setInterval(() => {
          attempts++;
          if (terminalInstance.current) {
            console.log(`[useSessionView] Terminal initialized, checking if output needs to be loaded`);
            clearInterval(checkInterval);
            // Force a re-evaluation of whether to load output
            if (activeSession.status !== 'initializing') {
              loadOutputContent(activeSession.id);
            }
          } else if (attempts >= maxAttempts) {
            console.log(`[useSessionView] Terminal initialization timed out, loading output anyway`);
            clearInterval(checkInterval);
            // Try to load output even without terminal
            if (activeSession.status !== 'initializing') {
              loadOutputContent(activeSession.id);
            }
          }
        }, 100);
      }
    }
  }, [viewMode, terminalRef, initTerminal, activeSession, loadOutputContent]);  
  // Pre-initialize script terminal when session becomes active
  useEffect(() => {
    if (activeSession && scriptTerminalRef.current && !scriptTerminalInstance.current) {
      console.log('[Terminal] Pre-initializing script terminal for session', activeSession.id);
      initTerminal(scriptTerminalRef, scriptTerminalInstance, scriptFitAddon, true);
      
      // Also pre-create the backend PTY session
      API.sessions.preCreateTerminal(activeSession.id).then(response => {
        if (response.success) {
          console.log('[Terminal] Backend PTY pre-created for session', activeSession.id);
        }
      }).catch(error => {
        console.error('[Terminal] Failed to pre-create backend PTY:', error);
      });
    }
  }, [activeSession?.id, scriptTerminalRef, initTerminal]);

  useEffect(() => {
    if (viewMode === 'terminal') {
      initTerminal(scriptTerminalRef, scriptTerminalInstance, scriptFitAddon, true);
      
      // After initializing the terminal, immediately write any existing output
      if (activeSession) {
        // Use setTimeout to ensure terminal is fully initialized
        setTimeout(() => {
          const currentScriptOutput = useSessionStore.getState().scriptOutput[activeSession.id] || [];
          if (scriptTerminalInstance.current && currentScriptOutput.length > 0 && lastProcessedScriptOutputLength.current === 0) {
            const existingOutput = currentScriptOutput.join('');
            console.log('[Terminal] Writing existing output to newly initialized terminal', existingOutput.length, 'chars');
            scriptTerminalInstance.current.write(existingOutput);
            lastProcessedScriptOutputLength.current = existingOutput.length;
          }
          
          // Always send an empty input to trigger the PTY to show prompt
          if (!activeSession.archived) {
            console.log('[Terminal] Sending empty input to trigger PTY prompt');
            API.sessions.sendTerminalInput(activeSession.id, '').catch(error => {
              console.error('Failed to send terminal trigger input:', error);
            });
          }
        }, 100);
      }
    }
  }, [viewMode, scriptTerminalRef, initTerminal, activeSession]);
  


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
    // Use visibility-aware interval for Stravu connection checking
    const cleanup = createVisibilityAwareInterval(
      checkStravuConnection,
      30000, // 30 seconds when visible
      120000 // 2 minutes when not visible
    );
    return cleanup;
  }, [activeSessionId]);

  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;
    scriptTerminalInstance.current.reset();
    lastProcessedScriptOutputLength.current = 0;
  }, [activeSessionId]);

  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;
    const existingOutput = scriptOutput.join('');
    if (existingOutput && lastProcessedScriptOutputLength.current === 0) {
      scriptTerminalInstance.current.write(existingOutput);
      lastProcessedScriptOutputLength.current = existingOutput.length;
    }
  }, [activeSessionId, scriptOutput]);
  
  useEffect(() => {
    if (!scriptTerminalInstance.current || viewMode !== 'terminal' || !activeSession) return;
    const currentScriptOutput = useSessionStore.getState().scriptOutput[activeSession.id] || [];
    if (lastProcessedScriptOutputLength.current === 0 && currentScriptOutput.length > 0) {
      const existingOutput = currentScriptOutput.join('');
      scriptTerminalInstance.current.write(existingOutput);
      lastProcessedScriptOutputLength.current = existingOutput.length;
    }
  }, [viewMode, activeSessionId]);

  useEffect(() => {
    console.log(`[Terminal Write Effect] Called, formatted output length: ${formattedOutput.length}, session: ${currentSessionIdForOutput}, lastProcessed: ${lastProcessedOutputLength.current}, viewMode: ${viewMode}`);
    
    // Skip if not in output view mode
    if (viewMode !== 'output') {
      console.log(`[Terminal Write Effect] Not in output view mode, skipping`);
      return;
    }
    
    if (!terminalInstance.current) {
      console.log(`[Terminal Write Effect] No terminal instance yet`);
      // If we have formatted output but no terminal, retry after a delay
      if (formattedOutput && formattedOutput.length > 0 && terminalRef.current) {
        console.log(`[Terminal Write Effect] Have output but no terminal, attempting init`);
        initTerminal(terminalRef, terminalInstance, fitAddon, false);
        // Give terminal time to initialize then write
        setTimeout(() => {
          if (terminalInstance.current && formattedOutput.length > 0 && lastProcessedOutputLength.current === 0) {
            console.log(`[Terminal Write Effect] Writing buffered output after init`);
            terminalInstance.current.write(formattedOutput);
            lastProcessedOutputLength.current = formattedOutput.length;
            // Only auto-scroll if user is already at the bottom
            const buffer = terminalInstance.current.buffer.active;
            const isAtBottom = buffer.viewportY >= buffer.length - terminalInstance.current.rows;
            
            if (isAtBottom) {
              terminalInstance.current.scrollToBottom();
            }
          }
        }, 100);
      }
      return;
    }
    
    if (!formattedOutput && formattedOutput !== '') {
      console.log(`[Terminal Write Effect] No formatted output`);
      return;
    }
    
    const currentActiveSession = useSessionStore.getState().getActiveSession();
    if (!currentActiveSession || currentSessionIdForOutput !== currentActiveSession.id) {
      console.log(`[Terminal Write Effect] Session mismatch: ${currentSessionIdForOutput} !== ${currentActiveSession?.id}`);
      return;
    }

    // Write to terminal
    if (lastProcessedOutputLength.current === 0) {
      // Clear terminal and write all content for new session
      console.log(`[Terminal Write Effect] New session output detected, clearing terminal and writing all content, length: ${formattedOutput.length}`);
      terminalInstance.current.clear();
      terminalInstance.current.write(formattedOutput);
      lastProcessedOutputLength.current = formattedOutput.length;
    } else if (formattedOutput.length > lastProcessedOutputLength.current) {
      // Write only new content for existing session
      const newContent = formattedOutput.substring(lastProcessedOutputLength.current);
      console.log(`[Terminal Write Effect] Writing new content to terminal, length: ${newContent.length}`);
      terminalInstance.current.write(newContent);
      lastProcessedOutputLength.current = formattedOutput.length;
    } else if (formattedOutput.length < lastProcessedOutputLength.current) {
      // This shouldn't happen, but log it if it does
      console.warn(`[Terminal Write Effect] Formatted output shrank from ${lastProcessedOutputLength.current} to ${formattedOutput.length}`);
    }
    
    if (formattedOutput.length > 0) {
      // Only auto-scroll if user is already at the bottom
      const buffer = terminalInstance.current.buffer.active;
      const isAtBottom = buffer.viewportY >= buffer.length - terminalInstance.current.rows;
      
      if (isAtBottom) {
        terminalInstance.current.scrollToBottom();
      }
    }
  }, [formattedOutput, currentSessionIdForOutput, initTerminal, terminalRef, viewMode]);

  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;
    const fullScriptOutput = scriptOutput.join('');
    if (fullScriptOutput.length < lastProcessedScriptOutputLength.current || fullScriptOutput.length === 0) {
      scriptTerminalInstance.current.reset();
      lastProcessedScriptOutputLength.current = 0;
    }
    if (fullScriptOutput.length > lastProcessedScriptOutputLength.current) {
      const newOutput = fullScriptOutput.substring(lastProcessedScriptOutputLength.current);
      scriptTerminalInstance.current.write(newOutput);
      lastProcessedScriptOutputLength.current = fullScriptOutput.length;
      // Only auto-scroll if user is already at the bottom
      const buffer = scriptTerminalInstance.current.buffer.active;
      const isAtBottom = buffer.viewportY >= buffer.length - scriptTerminalInstance.current.rows;
      
      if (isAtBottom) {
        scriptTerminalInstance.current.scrollToBottom();
      }
    }
  }, [scriptOutput, activeSessionId]);

  useEffect(() => {
    // Listen for session deletion events
    const handleSessionDeleted = (event: CustomEvent) => {
      // The event detail contains just { id } from the backend
      if (event.detail?.id === activeSessionId) {
        console.log(`[useSessionView] Active session ${activeSessionId} was deleted/archived`);
        // Force reset loading states
        forceResetLoadingState();
        // Clear terminal
        if (terminalInstance.current) {
          terminalInstance.current.clear();
          terminalInstance.current.writeln('\r\n⚠️ Session has been archived\r\n');
        }
      }
    };

    window.addEventListener('session-deleted', handleSessionDeleted as EventListener);

    return () => {
      window.removeEventListener('session-deleted', handleSessionDeleted as EventListener);
      // Cancel any pending operations
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (outputLoadTimeoutRef.current) {
        clearTimeout(outputLoadTimeoutRef.current);
      }
      terminalInstance.current?.dispose();
      terminalInstance.current = null;
      scriptTerminalInstance.current?.dispose();
      scriptTerminalInstance.current = null;
    };
  }, [activeSessionId, forceResetLoadingState]);

  useEffect(() => {
    const handleResize = () => {
      fitAddon.current?.fit();
      scriptFitAddon.current?.fit();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (viewMode === 'output') fitAddon.current?.fit();
      else if (viewMode === 'terminal') scriptFitAddon.current?.fit();
    }, 100);
    return () => clearTimeout(timer);
  }, [viewMode]);

  useEffect(() => {
    if (!terminalRef.current) return;
    const observer = new ResizeObserver(() => {
      if (viewMode === 'output') fitAddon.current?.fit();
    });
    observer.observe(terminalRef.current);
    return () => observer.disconnect();
  }, [terminalRef, viewMode]);

  useEffect(() => {
    if (terminalInstance.current) terminalInstance.current.options.theme = theme === 'light' ? lightTheme : darkTheme;
    if (scriptTerminalInstance.current) scriptTerminalInstance.current.options.theme = theme === 'light' ? lightTheme : scriptDarkTheme;
  }, [theme]);

  useEffect(() => {
    if (!scriptTerminalRef.current) return;
    let resizeTimer: NodeJS.Timeout;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(async () => {
        if (viewMode === 'terminal' && scriptFitAddon.current && scriptTerminalInstance.current) {
          scriptFitAddon.current.fit();
          const { cols, rows } = scriptTerminalInstance.current;
          if (activeSession) await API.sessions.resizeTerminal(activeSession.id, cols, rows);
        }
      }, 100);
    });
    observer.observe(scriptTerminalRef.current);
    return () => observer.disconnect();
  }, [scriptTerminalRef, viewMode, activeSession]);

  useEffect(() => {
    if (!activeSession) return;
    const currentMessageCount = activeSession.jsonMessages?.length || 0;
    if (currentMessageCount > previousMessageCountRef.current && viewMode !== 'messages') {
      setUnreadActivity(prev => ({ ...prev, messages: true }));
    }
    previousMessageCountRef.current = currentMessageCount;
  }, [activeSession?.jsonMessages?.length, viewMode]);

  useEffect(() => {
    if (!activeSession) return;
    if (['running', 'initializing'].includes(activeSession.status)) {
      const sessionStartTime = activeSession.runStartedAt ? new Date(activeSession.runStartedAt).getTime() : Date.now();
      if (!startTime || startTime !== sessionStartTime) setStartTime(sessionStartTime);
      
      setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000));
      // Use visibility-aware interval that slows down when tab is not visible
      const cleanup = createVisibilityAwareInterval(
        () => setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000)),
        5000, // 5 seconds when visible
        30000 // 30 seconds when not visible
      );
      return cleanup;
    } else {
      setStartTime(null);
      setElapsedTime(0);
    }
  }, [activeSession?.status, activeSession?.runStartedAt, activeSessionId]);

  useEffect(() => {
    setUnreadActivity({ output: false, messages: false, changes: false, terminal: false, editor: false });
  }, [activeSessionId]);


  useEffect(() => {
    if (!activeSession) {
      setGitCommands(null);
      setHasChangesToRebase(false);
      return;
    }
    const loadGitData = async () => {
      try {
        const [commandsResponse, changesResponse] = await Promise.all([
          API.sessions.getGitCommands(activeSession.id),
          API.sessions.hasChangesToRebase(activeSession.id)
        ]);
        if (commandsResponse.success) setGitCommands(commandsResponse.data);
        if (changesResponse.success) setHasChangesToRebase(changesResponse.data);
      } catch (error) { console.error('Error loading git data:', error); }
    };
    loadGitData();
  }, [activeSessionId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const { scrollHeight } = textareaRef.current;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 42), 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (!activeSession) return;
    const { status } = activeSession;
    const prevStatus = previousStatusRef.current;
    
    if (prevStatus === 'initializing' && status === 'running') {
      // Only clear terminal for new sessions, not when continuing conversations
      const hasExistingOutput = activeSession.output && activeSession.output.length > 0;
      if (!hasExistingOutput && !isContinuingConversationRef.current) {
        terminalInstance.current?.clear();
      }
      // Reset the flag after status changes to running
      if (isContinuingConversationRef.current) {
        isContinuingConversationRef.current = false;
      }
    }
    
    // Trigger reload when status changes indicate output might be available
    if (prevStatus && prevStatus !== status) {
      if (['stopped', 'waiting'].includes(prevStatus) && status === 'initializing') {
        setShouldReloadOutput(true);
      } else if (prevStatus === 'initializing' && status === 'running') {
        setShouldReloadOutput(true);
      }
    }
    
    previousStatusRef.current = status;
  }, [activeSession?.status, activeSessionId]);
  
  const handleNavigateToPrompt = useCallback((marker: any) => {
    if (!terminalInstance.current) return;
    if (viewMode !== 'output') {
      setViewMode('output');
      setTimeout(() => navigateToPromptInTerminal(marker), 200);
    } else {
      navigateToPromptInTerminal(marker);
    }
  }, [viewMode]);

  const navigateToPromptInTerminal = (marker: any) => {
    if (!terminalInstance.current || !activeSession) return;
    const { prompt_text, output_line } = marker;
    if (!prompt_text) return;

    const buffer = terminalInstance.current.buffer.active;
    const searchTextStart = prompt_text.substring(0, 50).trim();
    let foundLine = -1;

    for (let i = 0; i < buffer.length; i++) {
      const lineText = buffer.getLine(i)?.translateToString(true) || '';
      if (lineText.includes('👤 User Input') || lineText.includes('👤 USER PROMPT')) {
        for (let j = 1; j <= 5 && i + j < buffer.length; j++) {
          const promptLineText = buffer.getLine(i + j)?.translateToString(true).trim();
          if (promptLineText?.includes(searchTextStart)) {
            foundLine = i;
            break;
          }
        }
        if (foundLine >= 0) break;
      }
    }
    
    if (foundLine < 0) {
        for (let i = 0; i < buffer.length; i++) {
            if(buffer.getLine(i)?.translateToString(true).includes(searchTextStart)) {
                foundLine = i;
                break;
            }
        }
    }

    if (foundLine >= 0) {
      terminalInstance.current.scrollToLine(Math.max(0, foundLine - 2));
    } else if (output_line !== undefined && output_line !== null) {
      terminalInstance.current.scrollToLine(output_line);
    }
  };
  
  useEffect(() => {
    const handlePromptNavigation = (event: CustomEvent) => {
      const { sessionId, promptMarker } = event.detail;
      if (activeSession?.id === sessionId && promptMarker) {
          handleNavigateToPrompt(promptMarker);
      }
    };
    window.addEventListener('navigateToPrompt', handlePromptNavigation as EventListener);
    return () => window.removeEventListener('navigateToPrompt', handlePromptNavigation as EventListener);
  }, [activeSession?.id, handleNavigateToPrompt]);
  
  // Add debug keyboard shortcut (Cmd/Ctrl + Shift + D)
  useEffect(() => {
    const handleDebugKeyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        console.log('=== DEBUG STATE DUMP ===');
        debugState();
        console.log('=== END DEBUG STATE ===');
      }
      // Force reset with Cmd/Ctrl + Shift + R
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        console.log('=== FORCE RESET LOADING STATE ===');
        forceResetLoadingState();
        setShouldReloadOutput(true);
      }
    };
    window.addEventListener('keydown', handleDebugKeyboard);
    return () => window.removeEventListener('keydown', handleDebugKeyboard);
  }, [debugState, forceResetLoadingState]);

  const handleSendInput = async (attachedImages?: any[]) => {
    if (!input.trim() || !activeSession) return;
    
    let finalInput = ultrathink ? `${input}\nultrathink` : input;
    
    // If there are attached images, save them and append paths to input
    if (attachedImages && attachedImages.length > 0) {
      try {
        // Save images via IPC
        const imagePaths = await window.electronAPI.sessions.saveImages(
          activeSession.id,
          attachedImages.map(img => ({
            name: img.name,
            dataUrl: img.dataUrl,
            type: img.type,
          }))
        );
        
        // Append image paths to the prompt
        const imagePathsText = imagePaths.map(path => `Image: ${path}`).join('\n');
        finalInput = `${finalInput}\n\n${imagePathsText}`;
      } catch (error) {
        console.error('Failed to save images:', error);
        // Continue without images on error
      }
    }
    
    const response = await API.sessions.sendInput(activeSession.id, `${finalInput}\n`);
    if (response.success) {
      setInput('');
      setUltrathink(false);
    }
  };

  const handleContinueConversation = async (attachedImages?: any[], model?: string) => {
    if (!input.trim() || !activeSession) return;
    
    // Mark that we're continuing a conversation to prevent output reload
    isContinuingConversationRef.current = true;
    
    let finalInput = ultrathink ? `${input}\nultrathink` : input;
    
    // If there are attached images, save them and append paths to input
    if (attachedImages && attachedImages.length > 0) {
      try {
        // Save images via IPC
        const imagePaths = await window.electronAPI.sessions.saveImages(
          activeSession.id,
          attachedImages.map(img => ({
            name: img.name,
            dataUrl: img.dataUrl,
            type: img.type,
          }))
        );
        
        // Append image paths to the prompt
        const imagePathsText = imagePaths.map(path => `Image: ${path}`).join('\n');
        finalInput = `${finalInput}\n\n${imagePathsText}`;
      } catch (error) {
        console.error('Failed to save images:', error);
        // Continue without images on error
      }
    }
    
    const response = await API.sessions.continue(activeSession.id, finalInput, model);
    if (response.success) {
      setInput('');
      setUltrathink(false);
      // Output will be loaded automatically when session status changes to 'initializing'
      // No need to manually reload here as it can cause timing issues
    }
  };

  const handleTerminalCommand = async () => {
    if (!input.trim() || !activeSession) return;
    const response = await API.sessions.runTerminalCommand(activeSession.id, input);
    if (response.success) setInput('');
  };

  const handleStopSession = async () => {
    if (activeSession) await API.sessions.stop(activeSession.id);
  };
  
  const handleGitPull = async () => {
    if (!activeSession) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      const response = await API.sessions.gitPull(activeSession.id);
      if (!response.success) {
        if (response.error?.includes('conflict') || response.error?.includes('merge')) {
          setGitErrorDetails({
            title: 'Pull Failed - Merge Conflicts',
            message: 'There are merge conflicts that need to be resolved manually.',
            command: 'git pull',
            output: response.details || response.error || 'No output available',
            workingDirectory: activeSession.worktreePath,
          });
          setShowGitErrorDialog(true);
          setMergeError('Merge conflicts detected. You\'ll need to resolve them manually or ask Claude to help.');
        } else {
          setMergeError(response.error || 'Failed to pull from remote');
        }
      } else if (viewMode === 'changes') {
        window.location.reload();
      }
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to pull from remote');
    } finally {
      setIsMerging(false);
    }
  };

  const handleGitPush = async () => {
    if (!activeSession) return;
    setIsMerging(true);
    setMergeError(null);
    try {
        const response = await API.sessions.gitPush(activeSession.id);
        if(!response.success) setMergeError(response.error || 'Failed to push to remote');
    } catch (error) {
        setMergeError(error instanceof Error ? error.message : 'Failed to push to remote');
    } finally {
        setIsMerging(false);
    }
  };

  const handleToggleAutoCommit = async () => {
    if (!activeSession) return;
    try {
      const response = await API.sessions.toggleAutoCommit(activeSession.id);
      if (!response.success) {
        console.error('Failed to toggle auto-commit:', response.error);
      }
    } catch (error) {
      console.error('Error toggling auto-commit:', error);
    }
  };
  
  const handleRebaseMainIntoWorktree = async () => {
    if (!activeSession) return;
    setIsMerging(true);
    setMergeError(null);
    try {
      const response = await API.sessions.rebaseMainIntoWorktree(activeSession.id);
      if (!response.success) {
        if ((response as any).gitError) {
          const gitError = (response as any).gitError;
          setGitErrorDetails({
            title: 'Rebase Failed',
            message: response.error || 'Failed to rebase main into worktree',
            command: gitError.command,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory,
            isRebaseConflict: gitError.output?.toLowerCase().includes('conflict') || false,
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || 'Failed to rebase main into worktree');
        }
      } else {
        const changesResponse = await API.sessions.hasChangesToRebase(activeSession.id);
        if (changesResponse.success) setHasChangesToRebase(changesResponse.data);
      }
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to rebase main into worktree');
    } finally {
      setIsMerging(false);
    }
  };

  const handleAbortRebaseAndUseClaude = async () => {
    if (!activeSession) return;
    setShowGitErrorDialog(false);
    setIsLoadingOutput(true);
    try {
      const response = await API.sessions.abortRebaseAndUseClaude(activeSession.id);
      if (response.success) {
        setMergeError(null);
        setGitErrorDetails(null);
      } else {
        setMergeError(response.error || 'Failed to abort rebase and use Claude Code');
      }
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Failed to abort rebase and use Claude Code');
    } finally {
      setIsLoadingOutput(false);
    }
  };
  
  const generateDefaultCommitMessage = async () => {
    if (!activeSession) return '';
    try {
      const promptsResponse = await API.sessions.getPrompts(activeSession.id);
      if (promptsResponse.success && promptsResponse.data?.length > 0) {
        return promptsResponse.data.map((p: any) => p.prompt_text || p.content).filter(Boolean).join('\n\n');
      }
    } catch (error) {
      console.error('Error generating default commit message:', error);
    }
    const mainBranch = gitCommands?.mainBranch || 'main';
    return dialogType === 'squash'
      ? `Squashed commits from ${gitCommands?.currentBranch || 'feature branch'}`
      : `Rebase from ${mainBranch}`;
  };

  const handleSquashAndRebaseToMain = async () => {
    const defaultMessage = await generateDefaultCommitMessage();
    setCommitMessage(defaultMessage);
    setDialogType('squash');
    setShouldSquash(true);
    setShowCommitMessageDialog(true);
  };
  
  const performSquashWithCommitMessage = async (message: string) => {
    if (!activeSession) return;
    setIsMerging(true);
    setMergeError(null);
    setShowCommitMessageDialog(false);
    try {
      const response = shouldSquash
        ? await API.sessions.squashAndRebaseToMain(activeSession.id, message)
        : await API.sessions.rebaseToMain(activeSession.id);

      if (!response.success) {
        if ((response as any).gitError) {
          const gitError = (response as any).gitError;
          setGitErrorDetails({
            title: shouldSquash ? 'Squash and Rebase Failed' : 'Rebase Failed',
            message: response.error || `Failed to ${shouldSquash ? 'squash and ' : ''}rebase to main`,
            commands: gitError.commands,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory,
            projectPath: gitError.projectPath,
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || `Failed to ${shouldSquash ? 'squash and ' : ''}rebase to main`);
        }
      } else {
        const changesResponse = await API.sessions.hasChangesToRebase(activeSession.id);
        if (changesResponse.success) setHasChangesToRebase(changesResponse.data);
      }
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : `Failed to ${shouldSquash ? 'squash and ' : ''}rebase to main`);
    } finally {
      setIsMerging(false);
    }
  };

  const handleOpenIDE = async () => {
    if(activeSession) await API.sessions.openIDE(activeSession.id);
  };
  
  const handleStravuFileSelect = (file: any, content: string) => {
    const formattedContent = `\n\n## File: ${file.name}\n\`\`\`${file.type}\n${content}\n\`\`\`\n\n`;
    setInput(prev => prev + formattedContent);
  };

  const formatElapsedTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartEditName = () => {
    if (!activeSession) return;
    setEditName(activeSession.name);
    setIsEditingName(true);
  };

  const handleSaveEditName = async () => {
    if (!activeSession || editName.trim() === '' || editName === activeSession.name) {
      setIsEditingName(false);
      return;
    }
    try {
      await API.sessions.rename(activeSession.id, editName.trim());
      setIsEditingName(false);
    } catch (error) {
      alert('Failed to rename session');
      setEditName(activeSession.name);
      setIsEditingName(false);
    }
  };

  const handleCancelEditName = () => {
    setIsEditingName(false);
    setEditName('');
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEditName();
    } else if (e.key === 'Escape') {
      handleCancelEditName();
    }
  };

  const formatGitOutput = (output: string): string => {
    if (!output) return '';
    return output
      .replace(/error:/gi, '\x1b[31mERROR:\x1b[0m')
      .replace(/fatal:/gi, '\x1b[31mFATAL:\x1b[0m')
      .replace(/warning:/gi, '\x1b[33mWARNING:\x1b[0m')
      .replace(/hint:/gi, '\x1b[36mHINT:\x1b[0m')
      .replace(/CONFLICT \(.*?\):/g, '\x1b[31mCONFLICT\x1b[0m ($1):')
      .replace(/Auto-merging (.*)/g, '\x1b[33mAuto-merging\x1b[0m $1')
      .replace(/Merge conflict in (.*)/g, '\x1b[31mMerge conflict in\x1b[0m $1');
  };

  const getGitErrorTips = (details: GitErrorDetails): string[] => {
    const tips: string[] = [];
    const output = details.output?.toLowerCase() || '';
    const message = details.message?.toLowerCase() || '';
    
    if (output.includes('conflict') || message.includes('conflict')) {
      tips.push('• You have merge conflicts that need to be resolved manually');
      tips.push('• Use "git status" to see conflicted files');
      tips.push('• Edit the conflicted files to resolve conflicts, then stage and commit');
      tips.push('• After resolving, run "git rebase --continue" or "git rebase --abort"');
    } else if (output.includes('uncommitted changes') || output.includes('unstaged changes')) {
      tips.push('• You have uncommitted changes that prevent the operation');
      tips.push('• Either commit your changes first or stash them with "git stash"');
      tips.push('• After the operation, you can apply stashed changes with "git stash pop"');
    } else {
      tips.push('• Check if you have uncommitted changes that need to be resolved');
      tips.push('• Verify that the main branch exists and is up to date');
    }
    return tips;
  };

  const handleClearTerminal = useCallback(() => {
    if (scriptTerminalInstance.current) {
      scriptTerminalInstance.current.clear();
      
      // Also clear the stored script output for this session
      if (activeSession) {
        useSessionStore.getState().clearScriptOutput(activeSession.id);
        lastProcessedScriptOutputLength.current = 0;
      }
    }
  }, [activeSession]);
  
  return {
    theme,
    viewMode,
    setViewMode,
    unreadActivity,
    setUnreadActivity,
    isEditingName,
    editName,
    setEditName,
    isPathCollapsed,
    setIsPathCollapsed,
    input,
    setInput,
    ultrathink,
    setUltrathink,
    isLoadingOutput,
    outputLoadState,
    isMerging,
    mergeError,
    loadError,
    gitCommands,
    hasChangesToRebase,
    showCommitMessageDialog,
    setShowCommitMessageDialog,
    commitMessage,
    setCommitMessage,
    dialogType,
    showGitErrorDialog,
    setShowGitErrorDialog,
    gitErrorDetails,
    showStravuSearch,
    setShowStravuSearch,
    isStravuConnected,
    shouldSquash,
    setShouldSquash,
    isWaitingForFirstOutput,
    elapsedTime,
    textareaRef,
    handleSendInput,
    handleContinueConversation,
    handleTerminalCommand,
    handleStopSession,
    handleGitPull,
    handleGitPush,
    handleToggleAutoCommit,
    handleRebaseMainIntoWorktree,
    handleAbortRebaseAndUseClaude,
    handleSquashAndRebaseToMain,
    performSquashWithCommitMessage,
    handleOpenIDE,
    handleStravuFileSelect,
    formatElapsedTime,
    handleStartEditName,
    handleSaveEditName,
    handleCancelEditName,
    handleNameKeyDown,
    loadOutputContent,
    formatGitOutput,
    getGitErrorTips,
    handleNavigateToPrompt,
    debugState,
    forceResetLoadingState,
    handleClearTerminal,
  };
};

const lightTheme = {
  background: '#f9fafb',
  foreground: '#1f2937',
  cursor: '#1f2937',
  black: '#1f2937',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#f3f4f6',
  brightBlack: '#6b7280',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff'
};

const darkTheme = {
  background: '#000000',
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
};

const scriptDarkTheme = {
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
};
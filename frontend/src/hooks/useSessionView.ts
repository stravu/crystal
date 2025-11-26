import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useTheme } from '../contexts/ThemeContext';
import { useErrorStore } from '../stores/errorStore';
import { API, GitErrorResponse } from '../utils/api';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Session, GitCommands, GitErrorDetails, AttachedImage, AttachedText } from '../types/session';
import { getTerminalTheme, getScriptTerminalTheme } from '../utils/terminalTheme';
import { createVisibilityAwareInterval } from '../utils/performanceUtils';

interface PromptMarker {
  id: number;
  session_id?: string;
  panel_id?: string;
  prompt_text: string;
  output_index: number;
  output_line?: number;
  timestamp: string;
  completion_timestamp?: string;
}


export const useSessionView = (
  activeSession: Session | undefined,
  terminalRef: React.RefObject<HTMLDivElement | null> | undefined
) => {
  const { theme } = useTheme();
  const activeSessionId = activeSession?.id;

  // Terminal instances
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const scriptTerminalInstance = useRef<Terminal | null>(null);
  const scriptFitAddon = useRef<FitAddon | null>(null);

  // States
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
  const [isMergingAndArchiving, setIsMergingAndArchiving] = useState(false);
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
  const [isOpeningIDE, setIsOpeningIDE] = useState(false);
  const [contextCompacted, setContextCompacted] = useState(false);
  const [compactedContext, setCompactedContext] = useState<string | null>(null);
  const [hasConversationHistory, setHasConversationHistory] = useState(false);

  // Folder archive dialog state
  const [showFolderArchiveDialog, setShowFolderArchiveDialog] = useState(false);
  const [folderArchiveSessionId, setFolderArchiveSessionId] = useState<string | null>(null);
  const [folderArchiveFolderId, setFolderArchiveFolderId] = useState<string | null>(null);
  const [folderSessionCount, setFolderSessionCount] = useState(0);

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
    // Debug state tracking removed - development debugging only
  }, [outputLoadState, activeSessionId, currentSessionIdForOutput, formattedOutput.length]);
  
  // Force reset stuck state
  const forceResetLoadingState = useCallback(() => {
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
      return;
    }
    
    // If loading a different session, abort the old one
    if (loadingRef.current && loadingSessionIdRef.current !== sessionId) {
      loadingRef.current = false;
      loadingSessionIdRef.current = null;
    }
    
    // Check if session is still active
    const currentActiveSession = useSessionStore.getState().getActiveSession();
    if (!currentActiveSession || currentActiveSession.id !== sessionId) {
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
      
      // Check if still the active session after async operation
      const stillActiveSession = useSessionStore.getState().getActiveSession();
      if (!stillActiveSession || stillActiveSession.id !== sessionId) {
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
      useSessionStore.getState().setSessionOutputs(sessionId, outputs);
      
      // Outputs have been set
      
      setOutputLoadState('loaded');
      
      if (isWaitingForFirstOutput && outputs.length > 0) {
        setIsWaitingForFirstOutput(false);
      }
      
      // Reset continuing conversation flag after successfully loading output
      if (isContinuingConversationRef.current) {
        isContinuingConversationRef.current = false;
      }
      
      setLoadError(null);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
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
          terminalInstance.current.writeln(`\r\n❌ Error loading output: ${error instanceof Error ? error.message : 'Unknown error'}\r\n`);
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
    // Performance optimization: Check session status only, not entire state
    let previousStatus = activeSession?.status;
    const unsubscribe = useSessionStore.subscribe((state) => {
      const updatedSession = state.activeMainRepoSession?.id === activeSessionId
        ? state.activeMainRepoSession
        : state.sessions.find(s => s.id === activeSessionId);
      
      // Only trigger update if status actually changed
      if (updatedSession && updatedSession.status !== previousStatus) {
        previousStatus = updatedSession.status;
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
    // Performance optimization: Track previous terminal output to avoid unnecessary updates
    let previousOutput = useSessionStore.getState().terminalOutput[activeSession.id];
    const unsubscribe = useSessionStore.subscribe((state) => {
      const sessionTerminalOutput = state.terminalOutput[activeSession.id] || [];
      // Only update if output actually changed
      if (sessionTerminalOutput !== previousOutput) {
        previousOutput = sessionTerminalOutput;
        setScriptOutput(sessionTerminalOutput);
        // Terminal is now independent - no automatic unread indicators
        // Users explicitly interact with the terminal, so they know when there's output
      }
    });
    setScriptOutput(useSessionStore.getState().terminalOutput[activeSession.id] || []);
    return unsubscribe;
  }, [activeSession?.id]);

  useEffect(() => {
    const currentSessionId = activeSession?.id || null;
    if (currentSessionId === previousSessionIdRef.current) return;

    previousSessionIdRef.current = currentSessionId;
    
    // Force reset any stuck loading state when switching sessions
    forceResetLoadingState();
    
    // View mode and activity tracking removed - handled by panels
    
    // Reset context compaction state when switching sessions
    setContextCompacted(false);
    setCompactedContext(null);
    
    // Clear terminal immediately when session changes
    if (terminalInstance.current) {
      terminalInstance.current.clear();
    }
    setFormattedOutput('');
    lastProcessedOutputLength.current = 0;

    if (!activeSession) {
      setCurrentSessionIdForOutput(null);
      // Clear any error states when no session is active
      setLoadError(null);
      setOutputLoadState('idle');
      return;
    }

    setCurrentSessionIdForOutput(activeSession.id);
    
    // Check if session has conversation history
    const checkConversationHistory = async () => {
      try {
        const response = await API.sessions.getConversationMessages(activeSession.id);
        if (response.success && response.data) {
          setHasConversationHistory(response.data.length > 0);
        }
      } catch (error) {
        console.error('Failed to check conversation history:', error);
        setHasConversationHistory(false);
      }
    };
    checkConversationHistory();
    
    // Don't reset the terminal when switching sessions - preserve the state
    // if (scriptTerminalInstance.current) {
    //   scriptTerminalInstance.current.reset();
    // }
    
    // Reset output tracking
    lastProcessedOutputLength.current = 0;
    lastProcessedScriptOutputLength.current = 0;

    const hasOutput = activeSession.output && activeSession.output.length > 0;
    const hasMessages = activeSession.jsonMessages && activeSession.jsonMessages.length > 0;
    const isNewSession = activeSession.status === 'initializing' || (activeSession.status === 'running' && !hasOutput && !hasMessages);
    
    
    if (isNewSession) {
      setIsWaitingForFirstOutput(true);
      setStartTime(Date.now());
    } else {
      setIsWaitingForFirstOutput(false);
    }
  }, [activeSession?.id, forceResetLoadingState]);

  const messageCount = activeSession?.jsonMessages?.length || 0;
  const outputCount = activeSession?.output?.length || 0;

  // Performance optimization: Use useMemo to cache the expensive join operation
  const formattedOutputMemo = useMemo(() => {
    if (!activeSession || currentSessionIdForOutput !== activeSession.id) {
      return '';
    }
    
    const outputArray = activeSession.output || [];
    if (outputArray.length === 0) {
      return '';
    }
    
    // CRITICAL PERFORMANCE FIX: Even more aggressive limiting to prevent 2800ms+ frames
    // Reduced from 500 to 150 to avoid V8 string concatenation bailouts
    const MAX_OUTPUT_TO_PROCESS = 150;
    
    // Early exit for extremely large outputs that would cause UI blocking
    if (outputArray.length > 5000) {
      console.warn(`[Performance] Output array too large (${outputArray.length} items), showing recent ${MAX_OUTPUT_TO_PROCESS} items only`);
    }
    
    const outputToProcess = outputArray.length > MAX_OUTPUT_TO_PROCESS 
      ? outputArray.slice(-MAX_OUTPUT_TO_PROCESS)
      : outputArray;
    
    // PERFORMANCE: Optimized string building to prevent V8 bailouts
    if (outputToProcess.length > 50) {
      // Use a more efficient approach - build directly without intermediate arrays
      let result = '';
      const batchSize = 25; // Smaller batches for better V8 performance
      
      for (let i = 0; i < outputToProcess.length; i += batchSize) {
        const endIndex = Math.min(i + batchSize, outputToProcess.length);
        let batchResult = '';
        
        // Build each batch without creating intermediate arrays
        for (let j = i; j < endIndex; j++) {
          batchResult += outputToProcess[j];
        }
        result += batchResult;
      }
      
      return result;
    } else {
      // For small arrays, direct join is still efficient
      return outputToProcess.join('');
    }
  }, [activeSession?.id, currentSessionIdForOutput, outputCount]);
  
  useEffect(() => {
    if (!activeSession) return;
    
    // Make sure we're tracking the right session for output
    if (currentSessionIdForOutput !== activeSession.id) {
      // If the session ID doesn't match, update it
      if (activeSession.id) {
        setCurrentSessionIdForOutput(activeSession.id);
      }
      return;
    }
    
    if (messageCount === 0 && outputCount === 0) {
      return;
    }

    if (isWaitingForFirstOutput && (messageCount > 0 || outputCount > 0)) {
      setIsWaitingForFirstOutput(false);
    }

    // PERFORMANCE FIX: Even more aggressive debouncing for large outputs to prevent frame drops
    let delay = 50; // Default delay
    if (outputCount > 1000) {
      delay = 500; // Much longer delay for very large outputs
    } else if (outputCount > 500) {
      delay = 300; // Longer delay for large outputs
    } else if (outputCount > 100) {
      delay = 150; // Moderate delay for medium outputs
    }
    
    const timeoutId = setTimeout(() => {
      setFormattedOutput(formattedOutputMemo);
    }, delay);
    
    return () => clearTimeout(timeoutId);
  }, [activeSession?.id, messageCount, outputCount, currentSessionIdForOutput, isWaitingForFirstOutput, formattedOutputMemo]);
  
  // Consolidated effect for loading output
  useEffect(() => {
    if (!activeSession || !currentSessionIdForOutput || currentSessionIdForOutput !== activeSession.id) {
      return;
    }
    
    // Skip initial load if continuing conversation, but allow explicit reloads
    if (isContinuingConversationRef.current && outputLoadState === 'idle' && !shouldReloadOutput) {
      return;
    }
    
    // Check if session has output data
    
    
    // Check for stuck loading state and force reset if needed
    if (loadingRef.current && outputLoadState === 'idle') {
      // Stuck loading state detected - debug logging removed
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
      shouldLoad = true;
      loadDelay = 1000;
    }
    
    if (shouldLoad && !loadingRef.current) {
      if (loadDelay > 0) {
        outputLoadTimeoutRef.current = setTimeout(() => {
          if (!loadingRef.current) {
            loadOutputContent(activeSession.id);
          }
        }, loadDelay);
      } else {
        loadOutputContent(activeSession.id);
      }
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
  
  // Listen for output available events with aggressive throttling for performance
  useEffect(() => {
    let reloadDebounceTimer: NodeJS.Timeout | null = null;
    let lastReloadTime = 0;
    // PERFORMANCE: Adaptive reload interval based on output size
    const getMinReloadInterval = () => {
      const outputSize = activeSession?.output?.length || 0;
      if (outputSize > 2000) return 3000; // 3 seconds for very large outputs
      if (outputSize > 1000) return 2000; // 2 seconds for large outputs  
      if (outputSize > 500) return 1500;  // 1.5 seconds for medium outputs
      return 1000; // 1 second for small outputs
    };
    const MIN_RELOAD_INTERVAL = getMinReloadInterval();
    
    const handleOutputAvailable = (event: CustomEvent) => {
      const { sessionId } = event.detail;
      
      // Check if this is for the active session
      if (activeSession?.id === sessionId) {
        // Trigger reload if we're loaded or if we're continuing a conversation
        if (outputLoadState === 'loaded' || isContinuingConversationRef.current) {
          const now = Date.now();
          const timeSinceLastReload = now - lastReloadTime;
          
          // PERFORMANCE FIX: Throttle reloads to prevent CPU overload
          if (timeSinceLastReload < MIN_RELOAD_INTERVAL) {
            // Schedule for later if too soon
            if (reloadDebounceTimer) {
              clearTimeout(reloadDebounceTimer);
            }
            reloadDebounceTimer = setTimeout(() => {
              setShouldReloadOutput(true);
              lastReloadTime = Date.now();
              reloadDebounceTimer = null;
            }, MIN_RELOAD_INTERVAL - timeSinceLastReload);
          } else {
            // Can reload immediately
            setShouldReloadOutput(true);
            lastReloadTime = now;
          }
        }
      }
    };
    
    window.addEventListener('session-output-available', handleOutputAvailable as EventListener);
    return () => {
      window.removeEventListener('session-output-available', handleOutputAvailable as EventListener);
      if (reloadDebounceTimer) {
        clearTimeout(reloadDebounceTimer);
      }
    };
  }, [activeSession?.id, outputLoadState]);

  // Terminal initialization removed - now handled by panels
  /* const initTerminal = useCallback((termRef: React.RefObject<HTMLDivElement | null> | undefined, instanceRef: React.MutableRefObject<Terminal | null>, fitAddonRef: React.MutableRefObject<FitAddon | null>, isScript: boolean) => {
    console.log(`[initTerminal] Called - termRef.current: ${!!termRef?.current}, instanceRef.current: ${!!instanceRef.current}, isScript: ${isScript}`);
    
    if (!termRef?.current) {
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
        scrollback: 10000, // Further reduced to prevent memory issues
        fastScrollModifier: 'ctrl',
        fastScrollSensitivity: 5,
        scrollSensitivity: 1,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: isScript ? getScriptTerminalTheme() : getTerminalTheme(),
        allowTransparency: false
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
  }, [theme, activeSession]); */

  // Terminal output view has been removed - no terminal initialization needed  
  // Terminal is now created on-demand when user clicks the terminal tab
  // No pre-initialization to avoid unnecessary terminal output and activity indicators

  


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
    // Don't reset terminal on session change - this causes the terminal to clear
    // scriptTerminalInstance.current.reset();
    // Instead, just reset the tracking counter
    lastProcessedScriptOutputLength.current = 0;
  }, [activeSessionId]);

  // Performance: Memoize terminal output join operation
  const fullScriptOutputMemo = useMemo(() => {
    if (!scriptOutput || scriptOutput.length === 0) return '';
    
    // CRITICAL PERFORMANCE FIX: Even more aggressive limit for terminal output
    const MAX_TERMINAL_OUTPUT = 100; // Further reduced from 300 to prevent blocking
    
    // Early warning for very large terminal outputs
    if (scriptOutput.length > 2000) {
      console.warn(`[Performance] Script output too large (${scriptOutput.length} items), showing recent ${MAX_TERMINAL_OUTPUT} items only`);
    }
    
    const outputToProcess = scriptOutput.length > MAX_TERMINAL_OUTPUT
      ? scriptOutput.slice(-MAX_TERMINAL_OUTPUT)
      : scriptOutput;
    
    // PERFORMANCE: Direct string building without intermediate arrays
    if (outputToProcess.length > 25) {
      let result = '';
      const batchSize = 15; // Very small batches for terminal output
      
      for (let i = 0; i < outputToProcess.length; i += batchSize) {
        const endIndex = Math.min(i + batchSize, outputToProcess.length);
        let batchResult = '';
        
        // Build each batch directly
        for (let j = i; j < endIndex; j++) {
          batchResult += outputToProcess[j];
        }
        result += batchResult;
      }
      
      return result;
    } else {
      return outputToProcess.join('');
    }
  }, [scriptOutput]);
  
  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;
    const existingOutput = fullScriptOutputMemo;
    if (existingOutput && lastProcessedScriptOutputLength.current === 0) {
      scriptTerminalInstance.current.write(existingOutput);
      lastProcessedScriptOutputLength.current = existingOutput.length;
    }
  }, [activeSessionId, fullScriptOutputMemo, activeSession]);
  
  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;
    const currentTerminalOutput = useSessionStore.getState().terminalOutput[activeSession.id] || [];
    if (lastProcessedScriptOutputLength.current === 0 && currentTerminalOutput.length > 0) {
      const existingOutput = currentTerminalOutput.join('');
      scriptTerminalInstance.current.write(existingOutput);
      lastProcessedScriptOutputLength.current = existingOutput.length;
    }
  }, [activeSessionId]);

  // Terminal writing useEffect - disabled since output view was removed
  /* useEffect(() => {
    // Output view removed - skip terminal writing entirely
    if (!activeSession || !terminalInstance.current) return;
    console.log(`[Terminal Write Effect] Called, formatted output length: ${formattedOutput.length}, session: ${currentSessionIdForOutput}, lastProcessed: ${lastProcessedOutputLength.current}`);
    
    // Skip if not in output view mode
    // Output view removed - skip terminal writing
    return;
    
    if (!terminalInstance.current) {
      console.log(`[Terminal Write Effect] No terminal instance yet`);
      // If we have formatted output but no terminal, retry after a delay
      if (formattedOutput && formattedOutput.length > 0 && terminalRef?.current) {
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
        return;
    }
    
    const currentActiveSession = useSessionStore.getState().getActiveSession();
    if (!currentActiveSession || currentSessionIdForOutput !== currentActiveSession.id) {
        return;
    }

    // Write to terminal
    if (lastProcessedOutputLength.current === 0) {
      // Clear terminal and write all content for new session
        terminalInstance.current.clear();
      terminalInstance.current.write(formattedOutput);
      lastProcessedOutputLength.current = formattedOutput.length;
    } else if (formattedOutput.length > lastProcessedOutputLength.current) {
      // Write only new content for existing session
      const newContent = formattedOutput.substring(lastProcessedOutputLength.current);
        terminalInstance.current.write(newContent);
      lastProcessedOutputLength.current = formattedOutput.length;
    } else if (formattedOutput.length < lastProcessedOutputLength.current) {
      // This shouldn't happen, debug logging removed
    }
    
    if (formattedOutput.length > 0) {
      // Only auto-scroll if user is already at the bottom
      const buffer = terminalInstance.current.buffer.active;
      const isAtBottom = buffer.viewportY >= buffer.length - terminalInstance.current.rows;
      
      if (isAtBottom) {
        terminalInstance.current.scrollToBottom();
      }
    }
  }, [formattedOutput, currentSessionIdForOutput, initTerminal, terminalRef]); */

  useEffect(() => {
    if (!scriptTerminalInstance.current || !activeSession) return;
    const fullScriptOutput = fullScriptOutputMemo;
    
    // Handle case where output was cleared (e.g., user clicked clear button)
    if (fullScriptOutput.length === 0 && lastProcessedScriptOutputLength.current > 0) {
      // Only reset if the output was explicitly cleared to 0
      scriptTerminalInstance.current.reset();
      lastProcessedScriptOutputLength.current = 0;
    } else if (fullScriptOutput.length < lastProcessedScriptOutputLength.current) {
      // Output got shorter but not cleared - this might be a sync issue
      // Don't reset, just update the tracking
      lastProcessedScriptOutputLength.current = fullScriptOutput.length;
    } else if (fullScriptOutput.length > lastProcessedScriptOutputLength.current) {
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
  }, [fullScriptOutputMemo, activeSessionId, activeSession]);

  useEffect(() => {
    // Listen for session deletion events
    const handleSessionDeleted = (event: CustomEvent) => {
      // The event detail contains just { id } from the backend
      if (event.detail?.id === activeSessionId) {
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

  // Handle switch to View Diff tab event
  useEffect(() => {
    const handleSwitchToViewDiff = (event: CustomEvent) => {
      const { sessionId } = event.detail;
      if (sessionId && activeSession?.id === sessionId) {
        // Panels handle their own switching now
      }
    };

    window.addEventListener('switch-to-view-diff', handleSwitchToViewDiff as EventListener);
    return () => {
      window.removeEventListener('switch-to-view-diff', handleSwitchToViewDiff as EventListener);
    };
  }, [activeSession?.id]);

  // Handle select session and switch to View Diff tab event
  useEffect(() => {
    const handleSelectAndViewDiff = async (event: CustomEvent) => {
      const { sessionId } = event.detail;
      
      // First, select the session if it's not already active
      if (sessionId && activeSession?.id !== sessionId) {
        await useSessionStore.getState().setActiveSession(sessionId);
      }
      
      // Panels handle their own switching now
      // setTimeout(() => {
      //   setViewMode('changes');
      // }, 100);
    };

    const wrappedHandler = (event: Event) => handleSelectAndViewDiff(event as CustomEvent);
    window.addEventListener('select-session-and-view-diff', wrappedHandler);
    return () => {
      window.removeEventListener('select-session-and-view-diff', wrappedHandler);
    };
  }, [activeSession?.id]);

  // Terminal fitAddon effect removed - terminals are now handled in panels

  useEffect(() => {
    if (!terminalRef?.current) return;
    const observer = new ResizeObserver(() => {
      // Output view removed
    });
    observer.observe(terminalRef.current);
    return () => observer.disconnect();
  }, [terminalRef]);

  // Terminal output view has been removed - no resize needed

  useEffect(() => {
    // Add a small delay to ensure CSS has propagated
    const timer = setTimeout(() => {
      
      if (terminalInstance.current) {
        const newTheme = getTerminalTheme();
        terminalInstance.current.options.theme = newTheme;
        // Force refresh to apply new colors
        terminalInstance.current.refresh(0, terminalInstance.current.rows - 1);
      }
      if (scriptTerminalInstance.current) {
        const newScriptTheme = getScriptTerminalTheme();
        scriptTerminalInstance.current.options.theme = newScriptTheme;
        // Force refresh to apply new colors
        scriptTerminalInstance.current.refresh(0, scriptTerminalInstance.current.rows - 1);
      }
    }, 50); // Small delay to ensure CSS updates have propagated
    
    return () => clearTimeout(timer);
  }, [theme]);

  // Script terminal resize observer removed - terminals are now handled in panels

  useEffect(() => {
    if (!activeSession) return;
    const currentMessageCount = activeSession.jsonMessages?.length || 0;
    if (currentMessageCount > previousMessageCountRef.current) {
      // Activity tracking removed - now handled by panels
    }
    previousMessageCountRef.current = currentMessageCount;
  }, [activeSession?.jsonMessages?.length]);

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
    // Activity tracking removed - handled by panels
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
  
  const handleNavigateToPrompt = useCallback((marker: PromptMarker) => {
    if (!terminalInstance.current) return;
    // Output view removed - always navigate directly
    navigateToPromptInTerminal(marker);
  }, []);

  const navigateToPromptInTerminal = (marker: PromptMarker) => {
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
        debugState();
      }
      // Force reset with Cmd/Ctrl + Shift + R
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        forceResetLoadingState();
        setShouldReloadOutput(true);
      }
    };
    window.addEventListener('keydown', handleDebugKeyboard);
    return () => window.removeEventListener('keydown', handleDebugKeyboard);
  }, [debugState, forceResetLoadingState]);

  const handleSendInput = async (attachedImages?: AttachedImage[], attachedTexts?: AttachedText[]) => {
    if (!input.trim() || !activeSession) {
      return;
    }
    
    let finalInput = ultrathink ? `${input}\nultrathink` : input;
    
    // Check if we have compacted context to inject
    if (contextCompacted && compactedContext) {
      finalInput = `<session_context>\n${compactedContext}\n</session_context>\n\n${finalInput}`;
      
      // Clear the compacted context after using it
      setContextCompacted(false);
      setCompactedContext(null);
    }
    
    // Collect all attachments (text and images)
    const attachmentPaths = [];
    
    // If there are attached texts, save them and collect paths
    if (attachedTexts && attachedTexts.length > 0) {
      try {
        for (const text of attachedTexts) {
          // Save text to file via IPC
          const textFilePath = await window.electronAPI.sessions.saveLargeText(
            activeSession.id,
            text.content
          );
          
          attachmentPaths.push(textFilePath);
        }
      } catch (error) {
        console.error('Failed to save attached text to file:', error);
        // Continue without text files on error
      }
    }
    
    // If there are attached images, save them and collect paths
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
        
        attachmentPaths.push(...imagePaths);
      } catch (error) {
        console.error('Failed to save images:', error);
        // Continue without images on error
      }
    }
    
    // If we have any attachments, wrap them in <attachments> tags
    if (attachmentPaths.length > 0) {
      const attachmentsMessage = `\n\n<attachments>\nPlease look at these files which may provide additional instructions or context:\n${attachmentPaths.join('\n')}\n</attachments>`;
      finalInput = `${finalInput}${attachmentsMessage}`;
    }
    
    const response = await API.sessions.sendInput(activeSession.id, `${finalInput}\n`);
    if (response.success) {
      setInput('');
      setUltrathink(false);
    }
  };

  const handleContinueConversation = async (
    attachedImages?: AttachedImage[],
    attachedTexts?: AttachedText[],
    modelOverride?: string
  ) => {
    if (!input.trim() || !activeSession) return;
    
    // Mark that we're continuing a conversation to prevent output reload
    isContinuingConversationRef.current = true;
    
    let finalInput = ultrathink ? `${input}\nultrathink` : input;
    
    // Check if we have compacted context to inject
    if (contextCompacted && compactedContext) {
      finalInput = `<session_context>\n${compactedContext}\n</session_context>\n\n${finalInput}`;
      
      // Clear the compacted context after using it
      setContextCompacted(false);
      setCompactedContext(null);
    }
    
    // Collect all attachments (text and images)
    const attachmentPaths = [];
    
    // If there are attached texts, save them and collect paths
    if (attachedTexts && attachedTexts.length > 0) {
      try {
        for (const text of attachedTexts) {
          // Save text to file via IPC
          const textFilePath = await window.electronAPI.sessions.saveLargeText(
            activeSession.id,
            text.content
          );
          
          attachmentPaths.push(textFilePath);
        }
      } catch (error) {
        console.error('Failed to save attached text to file:', error);
        // Continue without text files on error
      }
    }
    
    // If there are attached images, save them and collect paths
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
        
        attachmentPaths.push(...imagePaths);
      } catch (error) {
        console.error('Failed to save images:', error);
        // Continue without images on error
      }
    }
    
    // If we have any attachments, wrap them in <attachments> tags
    if (attachmentPaths.length > 0) {
      const attachmentsMessage = `\n\n<attachments>\nPlease look at these files which may provide additional instructions or context:\n${attachmentPaths.join('\n')}\n</attachments>`;
      finalInput = `${finalInput}${attachmentsMessage}`;
    }
    
    const response = await API.sessions.continue(activeSession.id, finalInput, modelOverride);
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
      // Removed viewMode check - panels handle their own refresh
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
      const response: GitErrorResponse = await API.sessions.rebaseMainIntoWorktree(activeSession.id);
      
      if (!response.success) {
        if (response.gitError) {
          const gitError = response.gitError;
          setGitErrorDetails({
            title: gitError.hasConflicts ? 'Rebase Conflicts Detected' : 'Rebase Failed',
            message: response.error || 'Failed to rebase main into worktree',
            command: gitError.command,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory,
            isRebaseConflict: gitError.output?.toLowerCase().includes('conflict') || gitError.hasConflicts || false,
            hasConflicts: gitError.hasConflicts,
            conflictingFiles: gitError.conflictingFiles,
            conflictingCommits: gitError.conflictingCommits,
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || 'Failed to rebase main into worktree');
        }
      } else {
        // Run this in the background and don't let it block the finally block
        API.sessions.hasChangesToRebase(activeSession.id).then(changesResponse => {
          if (changesResponse.success) setHasChangesToRebase(changesResponse.data);
        }).catch(error => {
          console.error(`[handleRebaseMainIntoWorktree] hasChangesToRebase failed`, error);
        });
      }
    } catch (error) {
      console.error(`[handleRebaseMainIntoWorktree] Error in try block`, error);
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
        return promptsResponse.data.map((p: PromptMarker) => p.prompt_text).filter(Boolean).join('\n\n');
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
    if (!activeSession) return;

    // Check if worktree needs to be rebased onto main first
    try {
      const changesResponse = await API.sessions.hasChangesToRebase(activeSession.id);
      if (changesResponse.success && changesResponse.data === true) {
        // Show warning that rebase is needed first
        setGitErrorDetails({
          title: 'Rebase Required',
          message: `Your worktree has changes from ${gitCommands?.mainBranch || 'main'} that need to be rebased first.\n\nYou must rebase your worktree before merging to prevent conflicts.`,
          output: `Your worktree branch is behind ${gitCommands?.mainBranch || 'main'}.\n\nClick "Rebase from ${gitCommands?.mainBranch || 'Main'}" first to update your worktree, then try merging again.`,
          workingDirectory: activeSession.worktreePath,
        });
        setShowGitErrorDialog(true);
        return;
      }
    } catch (error) {
      console.error('Error checking if rebase needed:', error);
      // Continue with merge dialog on error - let the merge fail with proper error handling
    }

    const defaultMessage = await generateDefaultCommitMessage();
    setCommitMessage(defaultMessage);
    setDialogType('squash');
    setShouldSquash(true); // Default to squashing for cleaner merge
    setShowCommitMessageDialog(true);
  };

  const performSquashWithCommitMessage = async (message: string) => {
    if (!activeSession) return;
    setIsMerging(true);
    setMergeError(null);
    setShowCommitMessageDialog(false);
    try {
      const response: GitErrorResponse = shouldSquash
        ? await API.sessions.squashAndRebaseToMain(activeSession.id, message)
        : await API.sessions.rebaseToMain(activeSession.id);

      if (!response.success) {
        if (response.gitError) {
          const gitError = response.gitError;
          setGitErrorDetails({
            title: 'Merge Failed',
            message: response.error || `Failed to merge to main`,
            commands: gitError.commands,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory,
            projectPath: gitError.projectPath,
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || `Failed to merge to main`);
        }
      } else {
        // Run this in the background and don't let it block the finally block
        API.sessions.hasChangesToRebase(activeSession.id).then(changesResponse => {
          if (changesResponse.success) setHasChangesToRebase(changesResponse.data);
        }).catch(error => {
          console.error(`[performSquashWithCommitMessage] hasChangesToRebase failed`, error);
        });
      }
    } catch (error) {
      console.error(`[performSquashWithCommitMessage] Error in try block`, error);
      setMergeError(error instanceof Error ? error.message : `Failed to merge to main`);
    } finally {
      setIsMerging(false);
    }
  };

  const performSquashWithCommitMessageAndArchive = async (message: string) => {
    if (!activeSession) return;
    setIsMergingAndArchiving(true);
    setMergeError(null);
    setShowCommitMessageDialog(false);
    try {
      const response: GitErrorResponse = shouldSquash
        ? await API.sessions.squashAndRebaseToMain(activeSession.id, message)
        : await API.sessions.rebaseToMain(activeSession.id);

      if (!response.success) {
        if (response.gitError) {
          const gitError = response.gitError;
          setGitErrorDetails({
            title: 'Merge Failed',
            message: response.error || `Failed to merge to main`,
            commands: gitError.commands,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory,
            projectPath: gitError.projectPath,
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || `Failed to merge to main`);
        }
        return;
      }

      // Merge succeeded - check if session is in a folder with other sessions
      const sessionId = activeSession.id;
      const folderId = activeSession.folderId;

      if (folderId) {
        // Check how many sessions are in this folder
        const allSessions = useSessionStore.getState().sessions;
        const sessionsInFolder = allSessions.filter(s => s.folderId === folderId && !s.archived);

        if (sessionsInFolder.length > 1) {
          // There are other sessions in the folder - show dialog
          setFolderArchiveSessionId(sessionId);
          setFolderArchiveFolderId(folderId);
          setFolderSessionCount(sessionsInFolder.length);
          setShowFolderArchiveDialog(true);
          return; // Don't archive yet - wait for user decision
        }
      }

      // No folder or only one session in folder - archive just this session
      await archiveSingleSession(sessionId);
    } catch (error) {
      console.error(`[performSquashWithCommitMessageAndArchive] Error in try block`, error);
      setMergeError(error instanceof Error ? error.message : `Failed to merge to main`);
    } finally {
      setIsMergingAndArchiving(false);
    }
  };

  const archiveSingleSession = async (sessionId: string) => {
    useSessionStore.getState().addDeletingSessionId(sessionId);
    try {
      const archiveResponse = await API.sessions.delete(sessionId);
      if (!archiveResponse.success) {
        console.error('[archiveSingleSession] Archive failed:', archiveResponse.error);
        setMergeError(`Merge succeeded but archive failed: ${archiveResponse.error}`);
      }
      await useSessionStore.getState().setActiveSession(null);
    } catch (archiveError) {
      console.error('[archiveSingleSession] Archive error:', archiveError);
      setMergeError(`Merge succeeded but archive failed: ${archiveError instanceof Error ? archiveError.message : 'Unknown error'}`);
    }
  };

  const handleArchiveSessionOnly = async () => {
    setShowFolderArchiveDialog(false);
    if (folderArchiveSessionId) {
      await archiveSingleSession(folderArchiveSessionId);
    }
    setFolderArchiveSessionId(null);
    setFolderArchiveFolderId(null);
    setFolderSessionCount(0);
    setIsMergingAndArchiving(false);
  };

  const handleArchiveEntireFolder = async () => {
    setShowFolderArchiveDialog(false);
    if (folderArchiveFolderId) {
      const allSessions = useSessionStore.getState().sessions;
      const sessionsInFolder = allSessions.filter(s => s.folderId === folderArchiveFolderId && !s.archived);

      // Add all sessions to deleting state
      for (const session of sessionsInFolder) {
        useSessionStore.getState().addDeletingSessionId(session.id);
      }

      // Archive all sessions in the folder
      for (const session of sessionsInFolder) {
        try {
          const archiveResponse = await API.sessions.delete(session.id);
          if (!archiveResponse.success) {
            console.error(`[handleArchiveEntireFolder] Archive failed for session ${session.id}:`, archiveResponse.error);
          }
        } catch (archiveError) {
          console.error(`[handleArchiveEntireFolder] Archive error for session ${session.id}:`, archiveError);
        }
      }

      // Delete the folder after archiving all sessions
      try {
        await API.folders.delete(folderArchiveFolderId);
      } catch (folderError) {
        console.error('[handleArchiveEntireFolder] Folder delete error:', folderError);
      }

      await useSessionStore.getState().setActiveSession(null);
    }
    setFolderArchiveSessionId(null);
    setFolderArchiveFolderId(null);
    setFolderSessionCount(0);
    setIsMergingAndArchiving(false);
  };

  const handleCancelFolderArchive = () => {
    setShowFolderArchiveDialog(false);
    setFolderArchiveSessionId(null);
    setFolderArchiveFolderId(null);
    setFolderSessionCount(0);
    setIsMergingAndArchiving(false);
  };

  const handleOpenIDE = async () => {
    if (!activeSession) return;
    
    setIsOpeningIDE(true);
    
    try {
      const response = await API.sessions.openIDE(activeSession.id);
      if (!response.success) {
        // Import and use the error store
        const { showError } = useErrorStore.getState();
        showError({
          title: 'Failed to open IDE',
          error: response.error || 'Unknown error occurred',
        });
      }
    } catch (error) {
      const { showError } = useErrorStore.getState();
      showError({
        title: 'Failed to open IDE',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsOpeningIDE(false);
    }
  };
  
  const handleStravuFileSelect = (notebook: { id: string; title: string; excerpt?: string }, content: string) => {
    const formattedContent = `\n\n## Notebook: ${notebook.title}\n\`\`\`\n${content}\n\`\`\`\n\n`;
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
    
    // Check if conflicts were detected before rebase (new pre-check)
    if (details.hasConflicts) {
      tips.push('• Conflicts were detected before starting the rebase');
      tips.push('• Click "Use Claude Code to Resolve" to let Claude handle the conflicts');
      tips.push('• Alternatively, you can manually resolve conflicts by:');
      tips.push('  1. Running the rebase manually: git rebase <branch>');
      tips.push('  2. Fixing conflicts in the listed files');
      tips.push('  3. Running: git add <fixed-files> && git rebase --continue');
      if (details.conflictingFiles && details.conflictingFiles.length > 0) {
        tips.push(`• ${details.conflictingFiles.length} file(s) have conflicts that need resolution`);
      }
    } else if (output.includes('conflict') || message.includes('conflict')) {
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
        useSessionStore.getState().clearTerminalOutput(activeSession.id);
        lastProcessedScriptOutputLength.current = 0;
      }
    }
  }, [activeSession]);
  
  const handleCompactContext = async () => {
    if (!activeSession) return;
    
    try {
      console.log('[Context Compaction] Starting compaction for session:', activeSession.id);
      
      // Generate the compacted context
      const response = await API.sessions.generateCompactedContext(activeSession.id);
      
      if (response.success && response.data) {
        const summary = response.data.summary;
        setCompactedContext(summary);
        setContextCompacted(true);
        
        // Add the summary to the terminal output immediately
        if (terminalInstance.current) {
          terminalInstance.current.write('\r\n');
          terminalInstance.current.write('\x1b[1;33m══════════════════════════════════════════════════════════════════\x1b[0m\r\n');
          terminalInstance.current.write('\x1b[1;33m                     CONTEXT COMPACTED\x1b[0m\r\n');
          terminalInstance.current.write('\x1b[1;33m══════════════════════════════════════════════════════════════════\x1b[0m\r\n\r\n');
          terminalInstance.current.write('\x1b[90mThe following context summary has been generated and will be\x1b[0m\r\n');
          terminalInstance.current.write('\x1b[90mautomatically included with your next prompt:\x1b[0m\r\n\r\n');
          
          // Write the summary with proper formatting
          const lines = summary.split('\n');
          lines.forEach((line: string) => {
            terminalInstance.current?.write(line + '\r\n');
          });
          
          terminalInstance.current.write('\r\n\x1b[1;33m══════════════════════════════════════════════════════════════════\x1b[0m\r\n');
          terminalInstance.current.write('\x1b[1;32m✓ Context compacted successfully!\x1b[0m\r\n');
          terminalInstance.current.write('\x1b[1;36mJust type your next message - the context above will be automatically included.\x1b[0m\r\n');
          terminalInstance.current.write('\x1b[1;33m══════════════════════════════════════════════════════════════════\x1b[0m\r\n\r\n');
          
          // Scroll to bottom to show the summary
          terminalInstance.current.scrollToBottom();
        }
        
        console.log('[Context Compaction] Context successfully compacted and displayed');
      } else {
        console.error('[Context Compaction] Failed to compact context:', response.error);
        if (terminalInstance.current) {
          terminalInstance.current.write('\r\n\x1b[1;31m✗ Failed to compact context: ' + (response.error || 'Unknown error') + '\x1b[0m\r\n');
        }
      }
    } catch (error) {
      console.error('[Context Compaction] Error during compaction:', error);
      if (terminalInstance.current) {
        terminalInstance.current.write('\r\n\x1b[1;31m✗ Error during context compaction\x1b[0m\r\n');
      }
    }
  };
  
  return {
    theme,
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
    isMergingAndArchiving,
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
    performSquashWithCommitMessageAndArchive,
    handleOpenIDE,
    isOpeningIDE,
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
    handleCompactContext,
    contextCompacted,
    hasConversationHistory,
    compactedContext,
    // Folder archive dialog
    showFolderArchiveDialog,
    folderSessionCount,
    handleArchiveSessionOnly,
    handleArchiveEntireFolder,
    handleCancelFolderArchive,
  };
};

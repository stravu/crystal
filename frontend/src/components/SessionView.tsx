import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { JsonMessageView } from './JsonMessageView';
import { StatusIndicator } from './StatusIndicator';
import { PromptNavigation } from './PromptNavigation';
import { EmptyState } from './EmptyState';
import CombinedDiffView from './CombinedDiffView';
import { StravuFileSearch } from './StravuFileSearch';
import { useTheme } from '../contexts/ThemeContext';
import { API } from '../utils/api';
import { Inbox } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

export function SessionView() {
  const activeSession = useSessionStore((state) => state.getActiveSession());
  const { theme } = useTheme();
  
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
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  
  // Instead of subscribing to script output, we'll get it when needed
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const [formattedOutput, setFormattedOutput] = useState<string>('');
  const [currentSessionIdForOutput, setCurrentSessionIdForOutput] = useState<string | null>(null);
  const [isPathCollapsed, setIsPathCollapsed] = useState(true);
  const loadingRef = useRef(false);
  
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
      // Clear terminal immediately
      if (terminalInstance.current) {
        terminalInstance.current.clear();
      }
      return;
    }
    
    const sessionId = activeSession.id; // Capture the session ID
    
    // Clear terminal but don't clear formatted output yet - let it update naturally
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
    
    // For new sessions, mark as waiting for first output
    if (activeSession && activeSession.status === 'running' && (!activeSession.output || activeSession.output.length === 0)) {
      setIsWaitingForFirstOutput(true);
      setStartTime(Date.now());
    }
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
      
      console.log(`[formatOutput] Called for session ${sessionId}, active session: ${currentActiveSession?.id}`);
      
      // Only format if we're still on the same session that triggered this effect
      if (!currentActiveSession || currentActiveSession.id !== sessionId) {
        console.log(`[formatOutput] Session mismatch, skipping`);
        return;
      }
      
      // Clear formatted output if we're switching to a different session
      if (currentSessionIdForOutput && currentSessionIdForOutput !== sessionId) {
        console.log(`[formatOutput] Switching from session ${currentSessionIdForOutput} to ${sessionId}, clearing output`);
        setFormattedOutput('');
        setCurrentSessionIdForOutput(sessionId);
        return;
      }
      
      // Just concatenate stdout outputs - JSON messages are already formatted
      let formatted = '';
      
      if (currentActiveSession.output && currentActiveSession.output.length > 0) {
        formatted = currentActiveSession.output.join('');
      }
      
      console.log(`[formatOutput] Formatting output for session ${sessionId}, output array length: ${currentActiveSession.output?.length}, formatted length: ${formatted.length}`);
      
      // Only set the formatted output if we're still on the same session
      const finalActiveSession = useSessionStore.getState().getActiveSession();
      if (finalActiveSession && finalActiveSession.id === sessionId) {
        setFormattedOutput(formatted);
        setCurrentSessionIdForOutput(sessionId);
        console.log(`[formatOutput] Set formatted output, length: ${formatted.length}`);
      }
    };
    
    formatOutput();
  }, [activeSession?.id, messageCount, outputCount, isWaitingForFirstOutput, activeSession?.status]);
  
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
    isRebaseConflict?: boolean;
  } | null>(null);
  const [showStravuSearch, setShowStravuSearch] = useState(false);
  const [isStravuConnected, setIsStravuConnected] = useState(false);
  const [shouldSquash, setShouldSquash] = useState(true);
  const lastProcessedOutputLength = useRef(0);
  const lastProcessedScriptOutputLength = useRef(0);
  
  // Helper function to format git output for better readability
  const formatGitOutput = (output: string): string => {
    if (!output) return '';
    
    // Highlight common git error patterns
    return output
      .replace(/error:/gi, '\x1b[31mERROR:\x1b[0m')
      .replace(/fatal:/gi, '\x1b[31mFATAL:\x1b[0m')
      .replace(/warning:/gi, '\x1b[33mWARNING:\x1b[0m')
      .replace(/hint:/gi, '\x1b[36mHINT:\x1b[0m')
      .replace(/CONFLICT \(.*?\):/g, '\x1b[31mCONFLICT\x1b[0m ($1):')
      .replace(/Auto-merging (.*)/g, '\x1b[33mAuto-merging\x1b[0m $1')
      .replace(/Merge conflict in (.*)/g, '\x1b[31mMerge conflict in\x1b[0m $1');
  };
  
  // Helper function to get contextual troubleshooting tips based on error
  const getGitErrorTips = (errorDetails: any): string[] => {
    const tips: string[] = [];
    const output = errorDetails.output?.toLowerCase() || '';
    const message = errorDetails.message?.toLowerCase() || '';
    
    // Check for specific error patterns and provide relevant tips
    if (output.includes('conflict') || message.includes('conflict')) {
      tips.push('• You have merge conflicts that need to be resolved manually');
      tips.push('• Use "git status" to see conflicted files');
      tips.push('• Edit the conflicted files to resolve conflicts, then stage and commit');
      tips.push('• After resolving, run "git rebase --continue" or "git rebase --abort"');
    } else if (output.includes('uncommitted changes') || output.includes('unstaged changes')) {
      tips.push('• You have uncommitted changes that prevent the operation');
      tips.push('• Either commit your changes first or stash them with "git stash"');
      tips.push('• After the operation, you can apply stashed changes with "git stash pop"');
    } else if (output.includes('cannot rebase') || output.includes('no commits')) {
      tips.push('• There may be no commits to rebase or the branches are already in sync');
      tips.push('• Check your branch history with "git log --oneline"');
      tips.push('• Verify you\'re on the correct branch with "git branch"');
    } else if (output.includes('pathspec') || output.includes('did not match')) {
      tips.push('• The specified branch or path was not found');
      tips.push('• Check available branches with "git branch -a"');
      tips.push('• Ensure the main branch name is correct in project settings');
    } else {
      // Generic tips
      tips.push('• Check if you have uncommitted changes that need to be resolved');
      tips.push('• Verify that the main branch exists and is up to date');
      tips.push('• Look for specific error messages in the git output above');
      tips.push('• Consider manually running the git commands in your terminal for more control');
    }
    
    return tips;
  };
  
  const loadOutputContent = async (sessionId: string, retryCount = 0) => {
    console.log(`[loadOutputContent] Called for session ${sessionId}`);
    if (!terminalInstance.current) {
      console.log(`[loadOutputContent] No terminal instance, returning`);
      return;
    }
    
    // Prevent concurrent loads
    if (loadingRef.current) {
      console.log(`[loadOutputContent] Already loading, skipping`);
      return;
    }
    
    loadingRef.current = true;
    setIsLoadingOutput(true);
    setLoadError(null);
    
    try {
      const response = await API.sessions.getOutput(sessionId);
      if (!response.success) {
        throw new Error(response.error || 'Failed to load output');
      }
      
      const outputs = response.data;
      
      // Check if we're still on the same session before adding outputs
      const currentActiveSession = useSessionStore.getState().getActiveSession();
      if (!currentActiveSession || currentActiveSession.id !== sessionId) {
        console.log(`[loadOutputContent] Session changed, aborting`);
        return;
      }
      
      console.log(`[loadOutputContent] Database returned ${outputs.length} outputs`);
      
      // Small delay to ensure UI is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Double-check we're still on the same session
      const stillActiveSession = useSessionStore.getState().getActiveSession();
      if (!stillActiveSession || stillActiveSession.id !== sessionId) {
        console.log(`[loadOutputContent] Session changed during delay, aborting`);
        return;
      }
      
      console.log(`[loadOutputContent] Setting ${outputs.length} outputs from database`);
      
      // Clear existing output first to prevent mixing
      useSessionStore.getState().clearSessionOutput(sessionId);
      
      // Use setSessionOutputs for atomic update
      useSessionStore.getState().setSessionOutputs(sessionId, outputs);
      
      // Get the updated session to verify data was added
      const updatedSession = useSessionStore.getState().getActiveSession();
      if (updatedSession) {
        console.log(`[loadOutputContent] After setting - output count: ${updatedSession.output?.length}, json count: ${updatedSession.jsonMessages?.length}`);
      }
      
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
      loadingRef.current = false;
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
        theme: theme === 'light' ? {
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
        } : {
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
        }
      });
      
      fitAddon.current = new FitAddon();
      terminalInstance.current.loadAddon(fitAddon.current);
      terminalInstance.current.open(terminalRef.current);
      // Delay initial fit to ensure container is properly sized
      setTimeout(() => {
        if (fitAddon.current && terminalRef.current && terminalRef.current.offsetWidth > 0) {
          fitAddon.current.fit();
        }
      }, 100);
    }

    // Reset terminal when switching sessions (preserves scrollback capability)
    terminalInstance.current.reset();
    lastProcessedOutputLength.current = 0;
    
    // Clear formatted output when switching sessions
    setFormattedOutput('');
    setCurrentSessionIdForOutput(null);

    // Use requestAnimationFrame to ensure terminal is ready
    requestAnimationFrame(() => {
      // For newly created sessions (status: initializing), add a delay before loading output
      // This gives Claude Code time to start producing output
      if (activeSession.status === 'initializing') {
        // Show a message while Claude Code is starting up
        if (terminalInstance.current) {
          terminalInstance.current.writeln('\r\n🚀 Starting Claude Code session...\r\n');
        }
        
        // Mark that we're waiting for first output
        setIsWaitingForFirstOutput(true);
        
        // Load output after a longer delay for new sessions
        setTimeout(() => {
          loadOutputContent(activeSession.id);
        }, 500);
      } else {
        // For existing sessions, load output after terminal is ready
        setTimeout(() => {
          loadOutputContent(activeSession.id);
        }, 100);
      }
    });
    
  }, [activeSession?.id]);

  // Check Stravu connection status
  useEffect(() => {
    const checkStravuConnection = async () => {
      try {
        const response = await API.stravu.getConnectionStatus();
        if (response.success) {
          setIsStravuConnected(response.data.status === 'connected');
        }
      } catch (err) {
        console.error('Failed to check Stravu connection:', err);
        setIsStravuConnected(false);
      }
    };

    // Check on mount and when active session changes
    checkStravuConnection();

    // Check periodically (every 30 seconds)
    const interval = setInterval(checkStravuConnection, 30000);

    return () => clearInterval(interval);
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
        theme: theme === 'light' ? {
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
        } : {
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
        if (scriptFitAddon.current && scriptTerminalRef.current && scriptTerminalRef.current.offsetWidth > 0) {
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
    console.log(`[Terminal Write Effect] Called, formatted output length: ${formattedOutput.length}, session: ${currentSessionIdForOutput}`);
    
    if (!terminalInstance.current) {
      console.log(`[Terminal Write Effect] No terminal instance`);
      return;
    }

    // Get the current active session directly from the store to ensure freshness
    const currentActiveSession = useSessionStore.getState().getActiveSession();
    if (!currentActiveSession) {
      console.log(`[Terminal Write Effect] No active session`);
      return;
    }

    // If we have no formatted output, don't write anything
    if (!formattedOutput) {
      console.log(`[Terminal Write Effect] No formatted output`);
      return;
    }

    // Critical check: Only write if the formatted output belongs to the current session
    if (currentSessionIdForOutput !== currentActiveSession.id) {
      console.log(`[Terminal Write Effect] Session mismatch: ${currentSessionIdForOutput} !== ${currentActiveSession.id}`);
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
      // Debounce resize events to prevent excessive calls
      let resizeTimer: NodeJS.Timeout;
      resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (fitAddon.current && terminalInstance.current && viewMode === 'output') {
            fitAddon.current.fit();
          }
        }, 100);
      });
      resizeObserver.observe(terminalRef.current);
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [terminalRef.current, viewMode]); // Only recreate when refs change, not viewMode

  // Update terminal themes when theme changes
  useEffect(() => {
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

    if (terminalInstance.current) {
      terminalInstance.current.options.theme = theme === 'light' ? lightTheme : darkTheme;
    }
    
    if (scriptTerminalInstance.current) {
      scriptTerminalInstance.current.options.theme = theme === 'light' ? lightTheme : scriptDarkTheme;
    }
  }, [theme]);

  // Use ResizeObserver for script terminal
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    
    if (scriptTerminalRef.current) {
      // Debounce resize events to prevent excessive calls
      let resizeTimer: NodeJS.Timeout;
      resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(async () => {
          if (scriptFitAddon.current && scriptTerminalInstance.current && viewMode === 'terminal') {
            scriptFitAddon.current.fit();
            // Notify backend about terminal resize
            const { cols, rows } = scriptTerminalInstance.current;
            if (activeSession) {
              await API.sessions.resizeTerminal(activeSession.id, cols, rows);
            }
          }
        }, 100);
      });
      resizeObserver.observe(scriptTerminalRef.current);
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [scriptTerminalRef.current, viewMode]); // Only recreate when refs change, not viewMode
  
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
      // Use the actual run start time if available, otherwise use current time
      const sessionStartTime = activeSession.runStartedAt ? new Date(activeSession.runStartedAt).getTime() : Date.now();
      
      // Start the timer
      if (!startTime || startTime !== sessionStartTime) {
        setStartTime(sessionStartTime);
      }
      
      // Update elapsed time every 5 seconds instead of every second to reduce CPU usage
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - sessionStartTime) / 1000));
      }, 5000);
      
      return () => clearInterval(interval);
    } else {
      // Reset timer when session stops
      setStartTime(null);
      setElapsedTime(0);
    }
  }, [activeSession?.status, activeSession?.runStartedAt]);
  
  // Remove polling - we're using real-time updates now
  // useEffect(() => {
  //   if (!activeSession || (activeSession.status !== 'running' && activeSession.status !== 'waiting')) {
  //     return;
  //   }
  //   
  //   // Reload output content every 500ms during active sessions
  //   const interval = setInterval(() => {
  //     loadOutputContent(activeSession.id, 0, true);
  //   }, 500);
  //   
  //   return () => clearInterval(interval);
  // }, [activeSession?.id, activeSession?.status]);
  
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
      <div className="flex-1 flex items-center justify-center text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
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

  const handleTerminalCommand = async () => {
    if (!input.trim()) return;
    
    try {
      const response = await API.sessions.runTerminalCommand(activeSession.id, input);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to run terminal command');
      }
      
      setInput('');
    } catch (error) {
      console.error('Error running terminal command:', error);
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

  const handleGitPull = async () => {
    setIsMerging(true);
    setMergeError(null);

    try {
      const response = await API.sessions.gitPull(activeSession.id);

      if (!response.success) {
        // Check if it's a merge conflict
        if (response.error?.includes('conflict') || response.error?.includes('merge')) {
          setGitErrorDetails({
            title: 'Pull Failed - Merge Conflicts',
            message: 'There are merge conflicts that need to be resolved manually.',
            command: 'git pull',
            output: response.details || response.error || 'No output available',
            workingDirectory: activeSession.worktreePath
          });
          setShowGitErrorDialog(true);

          // Also show a helpful message
          setMergeError('Merge conflicts detected. You\'ll need to resolve them manually or ask Claude to help.');
        } else {
          setMergeError(response.error || 'Failed to pull from remote');
        }
        return;
      }

      setMergeError(null);
      // Refresh the view to show any new commits
      if (viewMode === 'changes') {
        // Trigger a refresh of the changes view
        window.location.reload();
      }
    } catch (error) {
      console.error('Error pulling from remote:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to pull from remote');
    } finally {
      setIsMerging(false);
    }
  };

  const handleGitPush = async () => {
    setIsMerging(true);
    setMergeError(null);

    try {
      const response = await API.sessions.gitPush(activeSession.id);

      if (!response.success) {
        setMergeError(response.error || 'Failed to push to remote');
        return;
      }

      setMergeError(null);
    } catch (error) {
      console.error('Error pushing to remote:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to push to remote');
    } finally {
      setIsMerging(false);
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
            workingDirectory: gitError.workingDirectory,
            isRebaseConflict: gitError.output?.toLowerCase().includes('conflict') || false
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

  const handleAbortRebaseAndUseClaude = async () => {
    setShowGitErrorDialog(false);
    setIsLoadingOutput(true);
    
    try {
      // The backend will get the main branch name from the project settings
      const response = await API.sessions.abortRebaseAndUseClaude(activeSession.id);
      
      if (!response.success) {
        setMergeError(response.error || 'Failed to abort rebase and use Claude Code');
        return;
      }
      
      // The prompt has been sent to Claude Code, clear any error states
      setMergeError(null);
      setGitErrorDetails(null);
    } catch (error) {
      console.error('Error aborting rebase and using Claude:', error);
      setMergeError(error instanceof Error ? error.message : 'Failed to abort rebase and use Claude Code');
    } finally {
      setIsLoadingOutput(false);
    }
  };

  const handleSquashAndRebaseToMain = async () => {
    // Show commit message dialog for squash operation
    const defaultCommitMessage = await generateDefaultCommitMessage();
    setCommitMessage(defaultCommitMessage);
    setDialogType('squash');
    setShouldSquash(true); // Reset to default
    setShowCommitMessageDialog(true);
  };


  const performSquashWithCommitMessage = async (message: string) => {
    setIsMerging(true);
    setMergeError(null);
    setShowCommitMessageDialog(false);
    
    try {
      let response;
      if (shouldSquash) {
        response = await API.sessions.squashAndRebaseToMain(activeSession.id, message);
      } else {
        response = await API.sessions.rebaseToMain(activeSession.id);
      }
      
      if (!response.success) {
        // Check if we have detailed git error information
        if ((response as any).gitError) {
          const gitError = (response as any).gitError;
          setGitErrorDetails({
            title: shouldSquash ? 'Squash and Rebase Failed' : 'Rebase Failed',
            message: response.error || `Failed to ${shouldSquash ? 'squash and ' : ''}rebase to main`,
            commands: gitError.commands,
            output: gitError.output || 'No output available',
            workingDirectory: gitError.workingDirectory,
            projectPath: gitError.projectPath
          });
          setShowGitErrorDialog(true);
        } else {
          setMergeError(response.error || `Failed to ${shouldSquash ? 'squash and ' : ''}rebase to main`);
        }
        return;
      }
      
      setMergeError(null);
      // Refresh git data after successful operation
      const changesResponse = await API.sessions.hasChangesToRebase(activeSession.id);
      if (changesResponse.success) {
        setHasChangesToRebase(changesResponse.data);
      }
    } catch (error) {
      console.error(`Error ${shouldSquash ? 'squashing and ' : ''}rebasing to main:`, error);
      setMergeError(error instanceof Error ? error.message : `Failed to ${shouldSquash ? 'squash and ' : ''}rebase to main`);
    } finally {
      setIsMerging(false);
    }
  };

  const handleOpenIDE = async () => {
    try {
      const response = await API.sessions.openIDE(activeSession.id);

      if (!response.success) {
        alert(response.error || 'Failed to open IDE');
      }
    } catch (error) {
      console.error('Error opening IDE:', error);
      alert('Failed to open IDE');
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

  const handleStravuFileSelect = (file: any, content: string) => {
    // Format the content as a markdown code block with file reference
    const formattedContent = `\n\n## File: ${file.name}\n\`\`\`${file.type}\n${content}\n\`\`\`\n\n`;
    
    // Append to current input
    setInput(prevInput => prevInput + formattedContent);
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
      const response = await API.sessions.rename(activeSession.id, editName.trim());
      if (!response.success) {
        throw new Error(response.error || 'Failed to rename session');
      }
      setIsEditingName(false);
    } catch (error) {
      console.error('Error renaming session:', error);
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
  
  if (!activeSession) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
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
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 relative">
            {isEditingName ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleSaveEditName}
                className="font-bold text-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 rounded border border-gray-400 dark:border-gray-600 focus:border-blue-500 focus:outline-none w-full"
                autoFocus
              />
            ) : (
              <h2 
                className="font-bold text-xl text-gray-900 dark:text-gray-100 truncate cursor-pointer hover:text-gray-700 dark:hover:text-gray-600"
                onDoubleClick={handleStartEditName}
                title="Double-click to rename"
              >
                {activeSession.name}
              </h2>
            )}
            <div className="flex items-center space-x-1 mt-1">
              <button
                onClick={() => setIsPathCollapsed(!isPathCollapsed)}
                className="flex items-center space-x-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
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
                <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  .../{activeSession.worktreePath.split('/').slice(-2).join('/')}
                </span>
              ) : (
                <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">{activeSession.worktreePath}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatusIndicator session={activeSession} size="medium" showText showProgress />
              <div className="flex flex-wrap items-center gap-2 relative z-20">
                {activeSession.isMainRepo ? (
                  <>
                    {/* Pull button for main repo sessions */}
                    <div className="group relative">
                      <button
                        onClick={handleGitPull}
                        disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                        className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                          isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'
                            ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 border-blue-600 text-blue-400 hover:bg-blue-900/20 hover:border-blue-500 hover:shadow-sm'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" />
                        </svg>
                        <span className="text-sm font-medium">{isMerging ? 'Pulling...' : 'Pull'}</span>
                      </button>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 max-w-md w-80">
                        <div className="font-semibold mb-1">Pull from Remote</div>
                        <div className="space-y-1">
                          <div className="text-gray-300">Command to run:</div>
                          <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded whitespace-nowrap">
                            git pull
                          </div>
                          <div className="text-xs text-gray-300 mt-1">
                            Fetches and merges changes from the remote repository
                          </div>
                          <div className="text-xs text-yellow-400 mt-2">
                            ⚠️ If merge conflicts occur, you'll need to resolve them manually or ask Claude for help
                          </div>
                        </div>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
                      </div>
                    </div>

                    {/* Push button for main repo sessions */}
                    <div className="group relative">
                      <button
                        onClick={handleGitPush}
                        disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'}
                        className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                          isMerging || activeSession.status === 'running' || activeSession.status === 'initializing'
                            ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-700 border-green-600 text-green-400 hover:bg-green-900/20 hover:border-green-500 hover:shadow-sm'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
                        </svg>
                        <span className="text-sm font-medium">{isMerging ? 'Pushing...' : 'Push'}</span>
                      </button>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 max-w-md w-80">
                        <div className="font-semibold mb-1">Push to Remote</div>
                        <div className="space-y-1">
                          <div className="text-gray-300">Command to run:</div>
                          <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded whitespace-nowrap">
                            git push
                          </div>
                          <div className="text-xs text-gray-300 mt-1">
                            Pushes local commits to the remote repository
                          </div>
                        </div>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Rebase buttons for worktree sessions */}
                    <div className="group relative">
                      <button
                        onClick={handleRebaseMainIntoWorktree}
                        disabled={isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hasChangesToRebase}
                        className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                          isMerging || activeSession.status === 'running' || activeSession.status === 'initializing' || !hasChangesToRebase
                            ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 cursor-not-allowed'
                            : 'bg-white dark:bg-gray-700 border-blue-500 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-600 dark:hover:border-blue-500 hover:shadow-sm'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 17l-4 4m0 0l-4-4m4 4V3" />
                        </svg>
                        <span className="text-sm font-medium">{isMerging ? 'Rebasing...' : `Rebase from local ${gitCommands?.mainBranch || 'main'}`}</span>
                      </button>
                      {/* Enhanced Tooltip */}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 max-w-md w-80">
                        <div className="font-semibold mb-1">Rebase from local {gitCommands?.mainBranch || 'main'}</div>
                        {!hasChangesToRebase ? (
                          <div className="text-gray-300">No changes to rebase</div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-gray-300">Command to run:</div>
                            <div className="font-mono text-xs bg-gray-800 px-2 py-1 rounded whitespace-nowrap">
                              git rebase {gitCommands?.mainBranch || 'main'}
                            </div>
                            <div className="text-xs text-gray-300 mt-1">
                              Replays your commits on top of local {gitCommands?.mainBranch || 'main'} branch
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
                            ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 cursor-not-allowed'
                            : 'bg-white dark:bg-gray-700 border-green-500 dark:border-green-600 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-600 dark:hover:border-green-500 hover:shadow-sm'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7l4-4m0 0l4 4m-4-4v18" />
                        </svg>
                        <span className="text-sm font-medium">{isMerging ? 'Squashing...' : `Rebase to ${gitCommands?.mainBranch || 'main'}`}</span>
                      </button>
                      {/* Enhanced Tooltip */}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 max-w-lg w-96">
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

                <div className="group relative">
                  <button
                    onClick={handleOpenIDE}
                    disabled={activeSession.status === 'initializing'}
                    className={`px-3 py-1.5 rounded-full border transition-all flex items-center space-x-2 ${
                      activeSession.status === 'initializing'
                        ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500 cursor-not-allowed'
                        : 'bg-white dark:bg-gray-700 border-purple-500 dark:border-purple-600 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-600 dark:hover:border-purple-500 hover:shadow-sm'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <span className="text-sm font-medium">Open IDE</span>
                  </button>
                  {/* Tooltip */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 w-48">
                    <div className="font-semibold mb-1">Open in IDE</div>
                    <div className="text-gray-300">
                      Opens the worktree directory in your configured IDE
                    </div>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
                  </div>
                </div>
                  </>
                )}
              </div>
            </div>
            {mergeError && (
              <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded-md">
                <p className="text-sm text-red-400">{mergeError}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 relative z-50 mt-6">
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0">
            <button
              onClick={() => {
                setViewMode('output');
                setUnreadActivity(prev => ({ ...prev, output: false }));
              }}
              className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 relative block ${
                viewMode === 'output' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
              className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 relative block ${
                viewMode === 'messages' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
              className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 relative block ${
                viewMode === 'changes' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
              className={`px-3 py-3 text-sm whitespace-nowrap flex-shrink-0 inline-flex items-center relative ${
                viewMode === 'terminal' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
            <div className="absolute top-4 left-4 text-gray-600 dark:text-gray-400 z-10">Loading output...</div>
          )}
          <div className={`bg-gray-50 dark:bg-black h-full ${viewMode === 'output' ? 'block' : 'hidden'} relative`}>
            <div ref={terminalRef} className="h-full" />
            {/* Error state with reload button */}
            {loadError && viewMode === 'output' && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
                  <svg className="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-700 dark:text-gray-300 mb-2">Failed to load output content</p>
                  <p className="text-gray-600 dark:text-gray-500 text-sm mb-4">{loadError}</p>
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
              <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2">
                <div className="flex items-center space-x-3 text-gray-700 dark:text-gray-300">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-typing-dot" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                  <span className="text-sm font-medium">
                    {activeSession.status === 'initializing' ? 'Starting Claude Code...' : 'Claude is working...'}
                  </span>
                  <div className="flex-1 ml-4">
                    <div className="h-1 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400 to-transparent w-1/3 animate-slide-progress"></div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 font-mono">
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
                isMainRepo={activeSession.isMainRepo}
              />
            )}
          </div>
          <div className={`h-full ${viewMode === 'terminal' ? 'block' : 'hidden'} bg-gray-50 dark:bg-black`}>
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
      
      <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 flex-shrink-0">
        {viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting' && (
          <div className="mb-2 flex items-center text-sm text-gray-600 dark:text-gray-400">
            <svg className="w-4 h-4 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Terminal mode: Commands will execute in the worktree directory
          </div>
        )}
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Always use Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to send
                // Use Shift+Enter for new lines
                const shouldSend = e.key === 'Enter' && (e.metaKey || e.ctrlKey);
                
                if (shouldSend) {
                  e.preventDefault();
                  
                  // In terminal view, check if we should run a terminal command
                  const isTerminalView = viewMode === 'terminal';
                  if (isTerminalView && !activeSession.isRunning && activeSession.status !== 'waiting') {
                    handleTerminalCommand();
                  } else if (activeSession.status === 'waiting') {
                    handleSendInput();
                  } else {
                    handleContinueConversation();
                  }
                }
              }}
              className="w-full px-3 py-2 pr-10 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto"
              placeholder={
                viewMode === 'terminal'
                  ? activeSession.isRunning
                    ? "Script is running... (stop it to run commands)"
                    : activeSession.status === 'waiting'
                      ? "Enter your response... (⌘↵ to send)"
                      : "Enter terminal command... (⌘↵ to send)"
                  : activeSession.status === 'waiting' 
                    ? "Enter your response... (⌘↵ to send)" 
                    : "Continue conversation with a new message... (⌘↵ to send)"
              }
              style={{ minHeight: '42px', maxHeight: '200px' }}
            />
            {isStravuConnected && (
              <button
                onClick={() => setShowStravuSearch(true)}
                className="absolute right-2 top-2 p-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 focus:outline-none focus:text-blue-600 transition-colors"
                title="Search Stravu files"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => {
              if (viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting') {
                handleTerminalCommand();
              } else if (activeSession.status === 'waiting') {
                handleSendInput();
              } else {
                handleContinueConversation();
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {viewMode === 'terminal' && !activeSession.isRunning && activeSession.status !== 'waiting'
              ? 'Run'
              : activeSession.status === 'waiting' 
                ? 'Send' 
                : 'Continue'}
          </button>
        </div>
        {activeSession.status !== 'waiting' && !(viewMode === 'terminal' && !activeSession.isRunning) && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            This will interrupt the current session if running and restart with conversation history.
          </p>
        )}
      </div>

      {/* Commit Message Dialog */}
      {showCommitMessageDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {dialogType === 'squash' 
                  ? `Squash and Rebase to ${gitCommands?.mainBranch || 'Main'}`
                  : `Rebase from ${gitCommands?.mainBranch || 'Main'}`
                }
              </h2>
              <button
                onClick={() => setShowCommitMessageDialog(false)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {/* Squash checkbox - only show for squash dialog */}
                {dialogType === 'squash' && (
                  <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <input
                      type="checkbox"
                      id="shouldSquash"
                      checked={shouldSquash}
                      onChange={(e) => setShouldSquash(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                    />
                    <label htmlFor="shouldSquash" className="flex-1 cursor-pointer">
                      <div className="font-medium text-gray-900 dark:text-gray-100">Squash commits</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        {shouldSquash 
                          ? "Combine all commits into a single commit" 
                          : "Keep all commits and preserve history"}
                      </div>
                    </label>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Commit Message
                  </label>
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    rows={8}
                    disabled={dialogType === 'squash' && !shouldSquash}
                    className={`w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 ${
                      dialogType === 'squash' && !shouldSquash ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500' : ''
                    }`}
                    placeholder={dialogType === 'squash' 
                      ? (shouldSquash ? "Enter commit message for the squashed commit..." : "Commit message not needed when preserving commits")
                      : "Enter commit message for the rebase..."
                    }
                  />
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {dialogType === 'squash'
                      ? (shouldSquash 
                          ? `This message will be used for the single squashed commit combining all your changes.`
                          : `Original commit messages will be preserved.`)
                      : `This message will be used when rebasing changes from ${gitCommands?.mainBranch || 'main'}.`
                    }
                  </p>
                </div>

                {dialogType === 'squash' && (
                  <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Git commands to be executed:</h4>
                    <div className="space-y-1">
                      {shouldSquash ? (
                        gitCommands?.squashCommands?.map((cmd, idx) => (
                          <div key={idx} className="font-mono text-xs bg-gray-700 dark:bg-gray-800 text-white px-3 py-2 rounded">
                            {cmd}
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="font-mono text-xs bg-gray-700 dark:bg-gray-800 text-white px-3 py-2 rounded">
                            git checkout {gitCommands?.mainBranch || 'main'}
                          </div>
                          <div className="font-mono text-xs bg-gray-700 dark:bg-gray-800 text-white px-3 py-2 rounded">
                            git rebase {gitCommands?.currentBranch || 'feature-branch'}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowCommitMessageDialog(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => performSquashWithCommitMessage(commitMessage)}
                disabled={(shouldSquash && !commitMessage.trim()) || isMerging}
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
                  <span>{dialogType === 'squash' ? (shouldSquash ? 'Squash & Rebase' : 'Rebase (Keep Commits)') : 'Rebase'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Git Error Dialog */}
      {showGitErrorDialog && gitErrorDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">{gitErrorDetails.title}</h2>
              </div>
              <button
                onClick={() => setShowGitErrorDialog(false)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
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
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Error Message</h3>
                  <div className="bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md p-3">
                    <p className="text-red-600 dark:text-red-400 text-sm">{gitErrorDetails.message}</p>
                  </div>
                </div>

                {/* Git Output - Moved to be more prominent */}
                <div className="border-2 border-red-300 dark:border-red-800 rounded-lg p-4 bg-red-100 dark:bg-red-900/20">
                  <h3 className="text-base font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Git Output
                  </h3>
                  <div className="bg-gray-900 text-gray-100 rounded-md p-4 max-h-96 overflow-y-auto shadow-inner">
                    <pre className="text-sm whitespace-pre-wrap font-mono" dangerouslySetInnerHTML={{ 
                      __html: formatGitOutput(gitErrorDetails.output || 'No output available')
                    }} />
                  </div>
                </div>

                {/* Working Directory */}
                {gitErrorDetails.workingDirectory && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Working Directory</h3>
                    <div className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-3">
                      <p className="text-gray-800 dark:text-gray-200 text-sm font-mono">{gitErrorDetails.workingDirectory}</p>
                    </div>
                  </div>
                )}

                {/* Project Path */}
                {gitErrorDetails.projectPath && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Path</h3>
                    <div className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-3">
                      <p className="text-gray-800 dark:text-gray-200 text-sm font-mono">{gitErrorDetails.projectPath}</p>
                    </div>
                  </div>
                )}

                {/* Git Commands */}
                {(gitErrorDetails.command || gitErrorDetails.commands) && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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

                {/* Helpful Information */}
                <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-800 rounded-md p-4">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">Troubleshooting Tips</h4>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        {getGitErrorTips(gitErrorDetails).map((tip, idx) => (
                          <li key={idx}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                {gitErrorDetails.isRebaseConflict && (
                  <button
                    onClick={handleAbortRebaseAndUseClaude}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Use Claude Code to Resolve</span>
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    if (gitErrorDetails.output) {
                      navigator.clipboard.writeText(gitErrorDetails.output);
                    }
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center space-x-2"
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
        </div>
      )}

      {/* Stravu File Search Dialog */}
      <StravuFileSearch
        isOpen={showStravuSearch}
        onClose={() => setShowStravuSearch(false)}
        onFileSelect={handleStravuFileSelect}
      />
    </div>
  );
}
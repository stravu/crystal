import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  CliPanel, 
  CliViewMode, 
  CliPanelSettings, 
  CliInputOptions, 
  CliOutput, 
  CliProcessStatus,
  CliPanelEvent
} from '../../../shared/types/cliPanels';
import { Session } from '../types/session';

/**
 * Configuration for the CLI panel hook
 */
export interface UseCliPanelConfig {
  /** Whether to automatically load outputs when panel becomes active */
  autoLoadOutputs?: boolean;
  
  /** Whether to automatically scroll to bottom on new output */
  autoScroll?: boolean;
  
  /** Maximum number of outputs to keep in memory */
  maxOutputs?: number;
  
  /** Debounce delay for settings updates (ms) */
  settingsDebounceDelay?: number;
}

/**
 * Return type for the CLI panel hook
 */
export interface UseCliPanelResult {
  // State
  panel: CliPanel | null;
  activeSession: Session | null;
  outputs: CliOutput[];
  viewMode: CliViewMode;
  settings: CliPanelSettings;
  processStatus: CliProcessStatus;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setViewMode: (mode: CliViewMode) => void;
  updateSettings: (settings: Partial<CliPanelSettings>) => void;
  sendInput: (input: string, options?: Partial<CliInputOptions>) => Promise<void>;
  startProcess: (initialPrompt?: string) => Promise<void>;
  stopProcess: () => Promise<void>;
  restartProcess: () => Promise<void>;
  clearOutput: () => void;
  exportConversation: () => Promise<void>;
  loadMoreOutputs: () => Promise<void>;
  
  // Event handlers
  onPanelEvent: (handler: (event: CliPanelEvent) => void) => () => void;
}

/**
 * Generic hook for managing CLI panel state and interactions
 * This hook is tool-agnostic and can be used with any CLI tool
 */
export function useCliPanel(
  panelId: string,
  isActive: boolean,
  config: UseCliPanelConfig = {}
): UseCliPanelResult {
  const {
    autoLoadOutputs = true,
    maxOutputs = 1000,
    settingsDebounceDelay = 500
  } = config;

  // Core state
  const [panel, setPanel] = useState<CliPanel | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [outputs, setOutputs] = useState<CliOutput[]>([]);
  const [viewMode, setViewMode] = useState<CliViewMode>('output');
  const [settings, setSettings] = useState<CliPanelSettings>({
    showToolCalls: true,
    compactMode: false,
    fontSize: 14,
    theme: 'dark'
  });
  const [processStatus, setProcessStatus] = useState<CliProcessStatus>('stopped');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for managing updates
  const outputsRef = useRef<CliOutput[]>([]);
  const eventHandlersRef = useRef<Set<(event: CliPanelEvent) => void>>(new Set());
  const settingsTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  /**
   * Load settings from localStorage
   */
  useEffect(() => {
    const savedSettings = localStorage.getItem(`cliPanelSettings_${panelId}`);
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (err) {
        console.error('Failed to parse saved settings:', err);
      }
    }
  }, [panelId]);

  /**
   * Save settings to localStorage (debounced)
   */
  useEffect(() => {
    if (settingsTimerRef.current) {
      clearTimeout(settingsTimerRef.current);
    }

    settingsTimerRef.current = setTimeout(() => {
      localStorage.setItem(`cliPanelSettings_${panelId}`, JSON.stringify(settings));
    }, settingsDebounceDelay);

    return () => {
      if (settingsTimerRef.current) {
        clearTimeout(settingsTimerRef.current);
      }
    };
  }, [settings, panelId, settingsDebounceDelay]);

  /**
   * Update settings
   */
  const updateSettings = useCallback((newSettings: Partial<CliPanelSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  /**
   * Send input to the CLI process
   */
  const sendInput = useCallback(async (input: string) => {
    if (!panel) {
      setError('Panel not initialized');
      return;
    }


    try {
      setError(null);
      // TODO: Implement proper API when available
      // For now, this is a placeholder for future implementation
      
      // Add user input to outputs
      const userOutput: CliOutput = {
        type: 'user',
        content: input,
        timestamp: new Date().toISOString()
      };
      
      setOutputs(prev => [...prev.slice(-maxOutputs + 1), userOutput]);
      
      // Update process status
      setProcessStatus('processing');
    } catch (err) {
      console.error('Failed to send input:', err);
      setError(err instanceof Error ? err.message : 'Failed to send input');
      setProcessStatus('error');
    }
  }, [panel, panelId, maxOutputs]);

  /**
   * Start the CLI process
   */
  const startProcess = useCallback(async () => {
    if (!panel) {
      setError('Panel not initialized');
      return;
    }

    try {
      setError(null);
      setProcessStatus('initializing');
      
      // TODO: Implement proper API when available
      
      // Simulate process start
      setTimeout(() => {
        setProcessStatus('processing');
      }, 500);
    } catch (err) {
      console.error('Failed to start process:', err);
      setError(err instanceof Error ? err.message : 'Failed to start process');
      setProcessStatus('error');
    }
  }, [panel, panelId]);

  /**
   * Stop the CLI process
   */
  const stopProcess = useCallback(async () => {
    if (!panel) return;

    try {
      setError(null);
      // TODO: Implement proper API when available
      
      setProcessStatus('stopped');
    } catch (err) {
      console.error('Failed to stop process:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop process');
    }
  }, [panel, panelId]);

  /**
   * Restart the CLI process
   */
  const restartProcess = useCallback(async () => {
    if (!panel) return;

    try {
      setError(null);
      await stopProcess();
      await startProcess();
    } catch (err) {
      console.error('Failed to restart process:', err);
      setError(err instanceof Error ? err.message : 'Failed to restart process');
    }
  }, [panel, stopProcess, startProcess]);

  /**
   * Clear output history
   */
  const clearOutput = useCallback(() => {
    setOutputs([]);
    outputsRef.current = [];
  }, []);

  /**
   * Export conversation history
   */
  const exportConversation = useCallback(async () => {
    if (!panel) return;

    try {
      // TODO: Implement proper API when available
      
      // For now, create a simple text export
      const exportText = outputs.map(o => {
        const prefix = o.type === 'user' ? '> ' : '';
        return `${prefix}${o.content}`;
      }).join('\n\n');
      
      // Create and download file
      const blob = new Blob([exportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cli-conversation-${panelId}-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to export conversation');
    }
  }, [panel, panelId, outputs]);

  /**
   * Load more outputs (for pagination)
   */
  const loadMoreOutputs = useCallback(async () => {
    // TODO: Implement pagination when API is available
  }, [panelId]);

  /**
   * Register event handler
   */
  const onPanelEvent = useCallback((handler: (event: CliPanelEvent) => void) => {
    eventHandlersRef.current.add(handler);
    
    return () => {
      eventHandlersRef.current.delete(handler);
    };
  }, []);

  /**
   * Emit event to all handlers
   */
  const emitEvent = useCallback((event: CliPanelEvent) => {
    eventHandlersRef.current.forEach(handler => {
      try {
        handler(event);
      } catch (err) {
        console.error('Error in panel event handler:', err);
      }
    });
  }, []);

  /**
   * Continue conversation in the CLI panel
   */
  // Continue conversation is not currently used
  // const continueConversation = useCallback(async (prompt: string) => {
  //   ...
  // }, [panel, panelId, sendInput]);

  /**
   * Initialize panel data
   */
  useEffect(() => {
    const loadPanel = async () => {
      try {
        setIsLoading(true);
        // TODO: Implement proper panels API when available
        // For now, create a mock panel
        const mockPanel: CliPanel = {
          id: panelId,
          sessionId: 'mock-session',
          type: 'claude',
          cliToolId: 'claude',
          title: 'CLI Panel',
          state: {
            isActive: true,
            hasBeenViewed: true
          },
          metadata: {
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
            position: 0
          }
        };
        
        setPanel(mockPanel);
        
        // Create mock session
        const mockSession: Session = {
          id: 'mock-session',
          name: 'Mock Session',
          status: 'waiting',
          prompt: '',
          worktreePath: '/mock/path',
          createdAt: new Date().toISOString(),
          output: [],
          jsonMessages: []
        };
        
        setActiveSession(mockSession);
      } catch (err) {
        console.error('Failed to load CLI panel:', err);
        setError(err instanceof Error ? err.message : 'Failed to load panel');
      } finally {
        setIsLoading(false);
      }
    };

    if (panelId) {
      loadPanel();
    }
  }, [panelId]);

  /**
   * Load output history when panel becomes active
   */
  useEffect(() => {
    const loadOutputs = async () => {
      if (!panel || !isActive || !autoLoadOutputs) return;

      try {
        // TODO: Implement proper API when available
        
        // For now, use empty outputs
        const mockOutputs: CliOutput[] = [];
        setOutputs(mockOutputs);
        outputsRef.current = mockOutputs;
      } catch (err) {
        console.error('Failed to load outputs:', err);
      }
    };

    loadOutputs();
  }, [panel, isActive, autoLoadOutputs, panelId]);

  /**
   * Set up output event listener
   */
  useEffect(() => {
    // TODO: Set up proper event listener when API is available
    // This will be implemented once the panels API is ready
    /*
    if (!panel || !window.electron) return;

    const handlePanelOutput = (_event: Electron.IpcRendererEvent, data: { panelId: string; sessionId: string; type: string; data: unknown; timestamp: Date; content?: string; metadata?: unknown }) => {
      if (data.panelId !== panelId) return;

      const newOutput: CliOutput = {
        type: data.type || 'assistant',
        content: data.content || data.data,
        timestamp: data.timestamp || new Date().toISOString(),
        metadata: data.metadata
      };

      setOutputs(prev => {
        const updated = [...prev, newOutput].slice(-maxOutputs);
        outputsRef.current = updated;
        return updated;
      });

      // Update status based on output
      if (data.type === 'error') {
        setProcessStatus('error');
      } else if (data.type === 'complete') {
        setProcessStatus('stopped');
      }

      // Emit event
      emitEvent({
        type: 'output:received',
        panelId,
        cliToolId: 'claude',
        data: newOutput,
        timestamp: new Date().toISOString()
      });
    };

    const cleanup = window.electron?.claudePanel?.onOutput(handlePanelOutput);
    
    return () => {
      cleanup?.();
    };
    */
  }, [panel, panelId, maxOutputs, emitEvent]);

  return {
    // State
    panel,
    activeSession,
    outputs,
    viewMode,
    settings,
    processStatus,
    isLoading,
    error,
    
    // Actions
    setViewMode,
    updateSettings,
    sendInput,
    startProcess,
    stopProcess,
    restartProcess,
    clearOutput,
    exportConversation,
    loadMoreOutputs,
    
    // Event handlers
    onPanelEvent
  };
}
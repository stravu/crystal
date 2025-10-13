import React, { useRef, useEffect, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useSession } from '../../contexts/SessionContext';
import { useTheme } from '../../contexts/ThemeContext';
import { TerminalPanelProps } from '../../types/panelComponents';
import { renderLog, devLog } from '../../utils/console';
import { getTerminalTheme } from '../../utils/terminalTheme';
import '@xterm/xterm/css/xterm.css';

// Type for terminal state restoration
interface TerminalRestoreState {
  scrollbackBuffer: string | string[];
  cursorX?: number;
  cursorY?: number;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = React.memo(({ panel, isActive }) => {
  renderLog('[TerminalPanel] Component rendering, panel:', panel.id, 'isActive:', isActive);
  
  // All hooks must be called at the top level, before any conditional returns
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  
  // Get session data from context using the safe hook
  const sessionContext = useSession();
  const sessionId = sessionContext?.sessionId;
  const workingDirectory = sessionContext?.workingDirectory;
  const { theme } = useTheme();
  
  if (sessionContext) {
    devLog.debug('[TerminalPanel] Session context:', sessionContext);
  } else {
    devLog.error('[TerminalPanel] No session context available');
  }

  // Initialize terminal only once when component first mounts
  // Keep it alive even when switching sessions
  useEffect(() => {
    devLog.debug('[TerminalPanel] Initialization useEffect running, terminalRef:', terminalRef.current);

    if (!terminalRef.current) {
      devLog.debug('[TerminalPanel] Missing terminal ref, skipping initialization');
      return;
    }

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let disposed = false;

    const initializeTerminal = async () => {
      try {
        devLog.debug('[TerminalPanel] Starting initialization for panel:', panel.id);

        // Check if already initialized on backend
        const initialized = await window.electronAPI.invoke('panels:checkInitialized', panel.id);
        console.log('[TerminalPanel] Panel already initialized?', initialized);

        // Store terminal state for THIS panel only (not in global variable)
        let terminalStateForThisPanel: TerminalRestoreState | null = null;

        if (!initialized) {
          // Initialize backend PTY process
          console.log('[TerminalPanel] Initializing backend PTY process...');
          // Use workingDirectory and sessionId if available, but don't require them
          await window.electronAPI.invoke('panels:initialize', panel.id, {
            cwd: workingDirectory || process.cwd(),
            sessionId: sessionId || panel.sessionId
          });
          console.log('[TerminalPanel] Backend PTY process initialized');
        } else {
          // Terminal is already initialized, get its state to restore scrollback
          console.log('[TerminalPanel] Restoring terminal state from backend...');
          const terminalState = await window.electronAPI.invoke('terminal:getState', panel.id);
          if (terminalState && terminalState.scrollbackBuffer) {
            // We'll restore this to the terminal after it's created
            console.log('[TerminalPanel] Found scrollback buffer with', terminalState.scrollbackBuffer.length, 'lines');
            // Store for restoration after terminal is created - LOCAL to this initialization
            terminalStateForThisPanel = terminalState;
          }
        }

        // FIX: Check if component was unmounted during async operation
        if (disposed) return;

        // Create XTerm instance
        console.log('[TerminalPanel] Creating XTerm instance...');
        terminal = new Terminal({
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: getTerminalTheme(),
          scrollback: 50000
        });
        console.log('[TerminalPanel] XTerm instance created:', !!terminal);

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        console.log('[TerminalPanel] FitAddon loaded');

        // FIX: Additional check before DOM manipulation
        if (terminalRef.current && !disposed) {
          console.log('[TerminalPanel] Opening terminal in DOM element:', terminalRef.current);
          terminal.open(terminalRef.current);
          console.log('[TerminalPanel] Terminal opened in DOM');
          fitAddon.fit();
          console.log('[TerminalPanel] FitAddon fitted');
          terminal.options.theme = getTerminalTheme();

          xtermRef.current = terminal;
          fitAddonRef.current = fitAddon;

          // Restore scrollback if we have saved state FOR THIS PANEL
          if (terminalStateForThisPanel && terminalStateForThisPanel.scrollbackBuffer) {
            // Handle both string and array formats
            let restoredContent: string;
            if (typeof terminalStateForThisPanel.scrollbackBuffer === 'string') {
              restoredContent = terminalStateForThisPanel.scrollbackBuffer;
              console.log('[TerminalPanel] Restoring', restoredContent.length, 'chars of scrollback');
            } else if (Array.isArray(terminalStateForThisPanel.scrollbackBuffer)) {
              restoredContent = terminalStateForThisPanel.scrollbackBuffer.join('\n');
              console.log('[TerminalPanel] Restoring', terminalStateForThisPanel.scrollbackBuffer.length, 'lines of scrollback');
            } else {
              restoredContent = '';
            }

            if (restoredContent) {
              terminal.write(restoredContent);
            }
          }

          setIsInitialized(true);
          console.log('[TerminalPanel] Terminal initialization complete, isInitialized set to true');

          // Set up IPC communication for terminal I/O
          const outputHandler = (data: { panelId?: string; sessionId?: string; output?: string } | unknown) => {
            // Check if this is panel terminal output (has panelId) vs session terminal output (has sessionId)
            if (data && typeof data === 'object' && 'panelId' in data && data.panelId && 'output' in data) {
              const typedData = data as { panelId: string; output: string };
              console.log('[TerminalPanel] Received panel output for:', typedData.panelId, 'Current panel:', panel.id);
              if (typedData.panelId === panel.id && terminal && !disposed) {
                console.log('[TerminalPanel] Writing to terminal:', typedData.output.substring(0, 50) + '...');
                terminal.write(typedData.output);
              }
            }
            // Ignore session terminal output (has sessionId instead of panelId)
          };

          const unsubscribeOutput = window.electronAPI.events.onTerminalOutput(outputHandler);
          console.log('[TerminalPanel] Subscribed to terminal output events for panel:', panel.id);

          // Handle terminal input
          const inputDisposable = terminal.onData((data) => {
            window.electronAPI.invoke('terminal:input', panel.id, data);
          });

          // Handle resize
          const resizeObserver = new ResizeObserver(() => {
            if (fitAddon && !disposed) {
              fitAddon.fit();
              const dimensions = fitAddon.proposeDimensions();
              if (dimensions) {
                window.electronAPI.invoke('terminal:resize', panel.id, dimensions.cols, dimensions.rows);
              }
            }
          });
          
          resizeObserver.observe(terminalRef.current);

          // FIX: Return comprehensive cleanup function
          return () => {
            disposed = true;
            resizeObserver.disconnect();
            unsubscribeOutput(); // Use the unsubscribe function
            inputDisposable.dispose();
          };
        }
      } catch (error) {
        console.error('Failed to initialize terminal:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    const cleanupPromise = initializeTerminal();

    // Only dispose when component is actually unmounting (panel deleted)
    // Not when just switching tabs
    return () => {
      disposed = true;
      
      // Clean up async initialization
      cleanupPromise.then(cleanupFn => cleanupFn?.());
      
      // Dispose XTerm instance only on final unmount
      if (xtermRef.current) {
        try {
          console.log('[TerminalPanel] Disposing terminal for panel:', panel.id);
          xtermRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing terminal:', e);
        }
        xtermRef.current = null;
      }
      
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing fit addon:', e);
        }
        fitAddonRef.current = null;
      }
      
      setIsInitialized(false);
    };
  }, [panel.id]); // Only depend on panel.id to prevent re-initialization on session switch

  // Handle visibility changes (resize when becoming visible)
  useEffect(() => {
    if (isActive && fitAddonRef.current && xtermRef.current) {
      console.log('[TerminalPanel] Panel became active, fitting terminal');
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          const dimensions = fitAddonRef.current.proposeDimensions();
          if (dimensions) {
            window.electronAPI.invoke('terminal:resize', panel.id, dimensions.cols, dimensions.rows);
          }
        }
      }, 50);
    }
  }, [isActive, panel.id]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }
    const newTheme = getTerminalTheme();
    xtermRef.current.options.theme = newTheme;
    const rows = xtermRef.current.rows;
    if (rows > 0) {
      xtermRef.current.refresh(0, rows - 1);
    }
  }, [theme]);

  // Handle missing session context (show after all hooks have been called)
  if (!sessionContext) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Session context not available
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Terminal initialization failed: {initError}
      </div>
    );
  }

  // Always render the terminal div to keep XTerm instance alive
  return (
    <div className="h-full w-full relative">
      <div ref={terminalRef} className="h-full w-full" />
      {!isInitialized && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-primary bg-opacity-80">
          <div className="text-text-secondary">Initializing terminal...</div>
        </div>
      )}
    </div>
  );
});

TerminalPanel.displayName = 'TerminalPanel';

export default TerminalPanel;

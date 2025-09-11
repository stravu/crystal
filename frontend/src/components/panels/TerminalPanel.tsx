import React, { useRef, useEffect, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useRequiredSession } from '../../contexts/SessionContext';
import { TerminalPanelProps } from '../../types/panelComponents';
import '@xterm/xterm/css/xterm.css';

export const TerminalPanel: React.FC<TerminalPanelProps> = ({ panel, isActive }) => {
  console.log('[TerminalPanel] Component rendering, panel:', panel.id, 'isActive:', isActive);
  
  // FIX: Get session data only from context, not props
  let sessionContext;
  try {
    sessionContext = useRequiredSession();
    console.log('[TerminalPanel] Session context:', sessionContext);
  } catch (error) {
    console.error('[TerminalPanel] Failed to get session context:', error);
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        Session context error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }
  
  const { sessionId, workingDirectory } = sessionContext;
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Initialize terminal only once when component first mounts
  // Keep it alive even when switching tabs
  useEffect(() => {
    console.log('[TerminalPanel] Initialization useEffect running, terminalRef:', terminalRef.current);
    
    if (!terminalRef.current) {
      console.log('[TerminalPanel] No terminal ref, skipping initialization');
      return;
    }

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let disposed = false;

    const initializeTerminal = async () => {
      try {
        console.log('[TerminalPanel] Starting initialization for panel:', panel.id);
        
        // Check if already initialized on backend
        const initialized = await window.electronAPI.invoke('panels:checkInitialized', panel.id);
        console.log('[TerminalPanel] Panel already initialized?', initialized);
        
        if (!initialized) {
          // Initialize backend PTY process
          console.log('[TerminalPanel] Initializing backend PTY process...');
          await window.electronAPI.invoke('panels:initialize', panel.id, {
            cwd: workingDirectory,
            sessionId
          });
          console.log('[TerminalPanel] Backend PTY process initialized');
        }

        // FIX: Check if component was unmounted during async operation
        if (disposed) return;

        // Create XTerm instance
        console.log('[TerminalPanel] Creating XTerm instance...');
        terminal = new Terminal({
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4'
          },
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
          
          xtermRef.current = terminal;
          fitAddonRef.current = fitAddon;
          setIsInitialized(true);
          console.log('[TerminalPanel] Terminal initialization complete, isInitialized set to true');

          // Set up IPC communication for terminal I/O
          const outputHandler = (data: any) => {
            // Check if this is panel terminal output (has panelId) vs session terminal output (has sessionId)
            if ('panelId' in data && data.panelId && 'output' in data) {
              console.log('[TerminalPanel] Received panel output for:', data.panelId, 'Current panel:', panel.id);
              if (data.panelId === panel.id && terminal && !disposed) {
                console.log('[TerminalPanel] Writing to terminal:', data.output.substring(0, 50) + '...');
                terminal.write(data.output);
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
  }, [panel.id]); // Only depend on panel.id, not isActive

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
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75">
          <div className="text-gray-400">Initializing terminal...</div>
        </div>
      )}
    </div>
  );
};

export default TerminalPanel;
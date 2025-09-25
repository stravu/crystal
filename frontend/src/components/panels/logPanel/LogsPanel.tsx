import React, { useEffect, useState } from 'react';
import { LogsView } from './LogsView';
import { LogsPanelState, ToolPanel } from '../../../../../shared/types/panels';
import { Square } from 'lucide-react';

interface LogsPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}

const LogsPanel: React.FC<LogsPanelProps> = ({ panel, isActive }) => {
  // const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const logsState = panel.state?.customState as LogsPanelState;
  
  // Listen for output events
  useEffect(() => {
    // TODO: Implement event listeners for logs panel output
    // const handleOutput = (_: Electron.IpcRendererEvent, data: { panelId: string; content: string; type: string }) => {
    //   if (data.panelId === panel.id) {
    //     setOutput(prev => [...prev, data.content]);
    //   }
    // };
    
    // const handleProcessEnd = (_: Electron.IpcRendererEvent, data: { panelId: string; exitCode: number | null }) => {
    //   if (data.panelId === panel.id) {
    //     setIsRunning(false);
    //   }
    // };
    
    // const handleProcessStart = (_: Electron.IpcRendererEvent, data: { panelId: string }) => {
    //   if (data.panelId === panel.id) {
    //     setIsRunning(true);
    //     setOutput([]); // Clear output when starting new process
    //   }
    // };
    
    // // Subscribe to events
    // window.electronAPI?.events?.onLogsOutput?.(handleOutput);
    // window.electronAPI?.events?.onProcessEnded?.(handleProcessEnd);
    // window.electronAPI?.events?.onProcessStarted?.(handleProcessStart);
    
    // Cleanup
    return () => {
      // Note: We can't properly unsubscribe without the unsubscribe functions
      // This would need to be improved in the actual implementation
    };
  }, [panel.id]);
  
  // Set running state from panel state
  useEffect(() => {
    setIsRunning(logsState?.isRunning || false);
  }, [logsState?.isRunning]);
  
  const handleStop = async () => {
    try {
      await window.electronAPI.logs.stopScript(panel.id);
    } catch (error) {
      console.error('Failed to stop script:', error);
    }
  };
  
  // For now, we'll use the existing LogsView component
  // In a full implementation, we might create a more specialized view
  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header with run status */}
      {logsState && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border-primary">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-text-secondary">Running: {logsState.command}</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-gray-500 rounded-full" />
                <span className="text-sm text-text-secondary">
                  {logsState.exitCode !== undefined 
                    ? `Exited with code ${logsState.exitCode}`
                    : 'Ready'}
                </span>
              </>
            )}
          </div>
          
          {isRunning && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          )}
        </div>
      )}
      
      {/* Use the existing LogsView for now */}
      {/* In a full refactor, we'd adapt LogsView to work with panel state */}
      <div className="flex-1 overflow-hidden">
        <LogsView 
          sessionId={panel.sessionId} 
          isVisible={isActive}
        />
      </div>
    </div>
  );
};

export default LogsPanel;
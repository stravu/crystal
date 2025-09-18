import React, { useEffect, useState } from 'react';
import { RefreshCw, Terminal, Clock, Hash, Cpu, Network, AlertCircle, CheckCircle, FileJson, Command } from 'lucide-react';

interface CodexDebugStateViewProps {
  sessionId: string;
  panelId: string;
}

interface CodexDebugState {
  // Process information
  pid?: number;
  isConnected: boolean;
  
  // Session information
  sessionId: string;
  panelId: string;
  worktreePath?: string;
  
  // Interactive mode information (new)
  codexSessionId?: string;  // Codex's internal session ID for resume
  executionMode: 'interactive' | 'unknown';
  
  // Message statistics (simplified for interactive mode)
  totalMessagesReceived: number;
  
  // Process state
  processState: 'not_started' | 'initializing' | 'running' | 'stopped' | 'error';
  lastError?: string;
  
  // Model information
  model?: string;
  modelProvider?: string;
}

export const CodexDebugStateView: React.FC<CodexDebugStateViewProps> = ({ sessionId, panelId }) => {
  const [debugState, setDebugState] = useState<CodexDebugState | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());

  const loadDebugState = async () => {
    try {
      setLoading(true);
      
      // Get debug state from backend using proper electron IPC
      const state = await window.electron?.invoke('codexPanel:getDebugState', { panelId });
      
      if (state) {
        // Transform the backend state to our frontend format
        setDebugState({
          ...state,
          executionMode: 'interactive', // We're always in interactive mode now
          codexSessionId: state.codexSessionId || undefined
        });
      } else {
        // No state returned, set default
        setDebugState({
          isConnected: false,
          sessionId,
          panelId,
          processState: 'not_started',
          totalMessagesReceived: 0,
          executionMode: 'interactive'
        });
      }
      setLastRefreshTime(new Date());
    } catch (error) {
      console.error('[CodexDebugStateView] Failed to load debug state:', error);
      setDebugState({
        isConnected: false,
        sessionId,
        panelId,
        processState: 'error',
        lastError: String(error),
        totalMessagesReceived: 0,
        executionMode: 'interactive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load initial state
    loadDebugState();
  }, [sessionId, panelId]);


  const getStatusIcon = (state: string) => {
    switch (state) {
      case 'running':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      case 'stopped':
        return <Terminal className="w-5 h-5 text-gray-400" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-400" />;
    }
  };

  if (!debugState && !loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <h3 className="text-lg font-medium text-text-primary mb-2">No Debug State Available</h3>
          <button
            onClick={loadDebugState}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Load Debug State
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-text-primary">Codex Process Debug State</h3>
          <div className="flex items-center gap-4">
            <span className="text-xs text-text-secondary">
              Last refresh: {lastRefreshTime.toLocaleTimeString()}
            </span>
            <button
              onClick={loadDebugState}
              disabled={loading}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                loading 
                  ? 'bg-surface-secondary text-text-secondary cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">Refresh</span>
            </button>
          </div>
        </div>

        {debugState && (
          <div className="space-y-6">
            {/* Process Information */}
            <div className="bg-surface-secondary rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Process Information
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-secondary">Process ID (PID):</span>
                  <div className="text-text-primary font-mono mt-1">
                    {debugState.pid || 'Not started'}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Process State:</span>
                  <div className="text-text-primary font-medium mt-1 flex items-center gap-2">
                    {getStatusIcon(debugState.processState)}
                    <span className="capitalize">{debugState.processState}</span>
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Connection Status:</span>
                  <div className="text-text-primary font-medium mt-1 flex items-center gap-2">
                    <Network className={`w-4 h-4 ${debugState.isConnected ? 'text-green-400' : 'text-red-400'}`} />
                    {debugState.isConnected ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Execution Mode:</span>
                  <div className="text-text-primary font-medium mt-1 flex items-center gap-2">
                    <Command className="w-4 h-4 text-blue-400" />
                    Interactive (--json)
                  </div>
                </div>
              </div>
            </div>

            {/* Session Information */}
            <div className="bg-surface-secondary rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Session Information
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-secondary">Crystal Session ID:</span>
                  <div className="text-text-primary font-mono mt-1 text-xs break-all">
                    {debugState.sessionId}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Panel ID:</span>
                  <div className="text-text-primary font-mono mt-1 text-xs break-all">
                    {debugState.panelId}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-text-secondary">Codex Session ID (for resume):</span>
                  <div className="text-text-primary font-mono mt-1 text-xs break-all">
                    {debugState.codexSessionId ? (
                      <>
                        {debugState.codexSessionId}
                        <span className="text-green-400 ml-2 text-xs">✓ Can resume</span>
                      </>
                    ) : (
                      <span className="text-yellow-400">Not yet captured - will be set after first response</span>
                    )}
                  </div>
                </div>
                {debugState.worktreePath && (
                  <div className="col-span-2">
                    <span className="text-text-secondary">Worktree Path:</span>
                    <div className="text-text-primary font-mono mt-1 text-xs break-all">
                      {debugState.worktreePath}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Interactive Mode Information */}
            <div className="bg-surface-secondary rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <FileJson className="w-4 h-4" />
                Interactive Mode Status
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-secondary">Command Mode:</span>
                  <div className="text-text-primary font-medium mt-1">
                    codex exec --json
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Resume Support:</span>
                  <div className="text-text-primary font-medium mt-1">
                    {debugState.codexSessionId ? '✅ Available' : '⚠️ Not available (no session ID)'}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Input Method:</span>
                  <div className="text-text-primary mt-1">
                    PTY stdin (direct)
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Output Format:</span>
                  <div className="text-text-primary mt-1">
                    JSON Lines (JSONL)
                  </div>
                </div>
              </div>
              {debugState.codexSessionId && (
                <div className="mt-4 p-3 bg-green-900/20 border border-green-600/30 rounded-md">
                  <div className="text-xs text-green-400 font-medium mb-1">Resume Command:</div>
                  <code className="text-xs text-green-300 font-mono">
                    codex exec resume {debugState.codexSessionId} --json
                  </code>
                </div>
              )}
            </div>

            {/* Message Statistics (Simplified) */}
            <div className="bg-surface-secondary rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Communication Statistics
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-secondary">JSON Messages Received:</span>
                  <div className="text-text-primary font-semibold text-lg mt-1">
                    {debugState.totalMessagesReceived}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Communication Type:</span>
                  <div className="text-text-primary font-medium mt-1">
                    Bidirectional PTY
                  </div>
                </div>
              </div>
            </div>

            {/* Model Information */}
            {(debugState.model || debugState.modelProvider) && (
              <div className="bg-surface-secondary rounded-lg p-4">
                <h4 className="text-sm font-medium text-text-primary mb-3">Model Configuration</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-text-secondary">Model:</span>
                    <div className="text-text-primary font-medium mt-1">
                      {debugState.model || 'Auto (GPT-5)'}
                    </div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Provider:</span>
                    <div className="text-text-primary font-medium mt-1">
                      {debugState.modelProvider || 'OpenAI'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Information */}
            {debugState.lastError && (
              <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
                <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Last Error
                </h4>
                <div className="text-sm text-red-300 font-mono">
                  {debugState.lastError}
                </div>
              </div>
            )}

            {/* Tips for Interactive Mode */}
            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-400 mb-2">Interactive Mode Tips</h4>
              <ul className="text-sm text-blue-300 space-y-1">
                <li>• Input is sent directly through PTY stdin</li>
                <li>• Use Ctrl+C (sent as \x03) to interrupt execution</li>
                <li>• Session IDs are captured from JSON output for resume capability</li>
                <li>• All output is streamed as JSON Lines (one JSON object per line)</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
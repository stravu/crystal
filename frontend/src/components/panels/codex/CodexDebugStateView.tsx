import React, { useEffect, useState } from 'react';
import { RefreshCw, Terminal, Clock, Hash, Cpu, Network, AlertCircle, CheckCircle } from 'lucide-react';

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
  
  // Timing information
  startTime?: string;
  lastMessageTime?: string;
  timeSinceLastMessage?: number;
  
  // Message statistics
  totalMessagesReceived: number;
  totalMessagesSent: number;
  messageBufferSize: number;
  
  // Process state
  processState: 'not_started' | 'initializing' | 'running' | 'stopped' | 'error';
  lastError?: string;
  
  // Protocol information
  protocolHandshakeComplete: boolean;
  pendingPrompt?: string;
  
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
      
      // Get debug state from backend
      const state = await (window as any).api.invoke('codexPanel:getDebugState', { panelId });
      
      setDebugState(state);
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
        totalMessagesSent: 0,
        messageBufferSize: 0,
        protocolHandshakeComplete: false
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load initial state
    loadDebugState();
  }, [sessionId, panelId]);

  const formatTimeDifference = (ms?: number): string => {
    if (ms === undefined || ms === null) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ago`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s ago`;
    } else {
      return `${seconds}s ago`;
    }
  };

  const formatTimestamp = (timestamp?: string): string => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
  };

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
                  <span className="text-text-secondary">Protocol Handshake:</span>
                  <div className="text-text-primary font-medium mt-1">
                    {debugState.protocolHandshakeComplete ? '✅ Complete' : '⏳ Pending'}
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
                  <div className="text-text-primary font-mono mt-1 break-all">
                    {debugState.sessionId}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Panel ID:</span>
                  <div className="text-text-primary font-mono mt-1 break-all">
                    {debugState.panelId}
                  </div>
                </div>
                {debugState.worktreePath && (
                  <div className="col-span-2">
                    <span className="text-text-secondary">Worktree Path:</span>
                    <div className="text-text-primary font-mono mt-1 break-all">
                      {debugState.worktreePath}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timing Information */}
            <div className="bg-surface-secondary rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Timing Information
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-text-secondary">Start Time:</span>
                  <div className="text-text-primary mt-1">
                    {formatTimestamp(debugState.startTime)}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Last Message Time:</span>
                  <div className="text-text-primary mt-1">
                    {formatTimestamp(debugState.lastMessageTime)}
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-text-secondary">Time Since Last Message:</span>
                  <div className="text-text-primary font-medium mt-1">
                    {formatTimeDifference(debugState.timeSinceLastMessage)}
                  </div>
                </div>
              </div>
            </div>

            {/* Message Statistics */}
            <div className="bg-surface-secondary rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                Message Statistics
              </h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-text-secondary">Messages Received:</span>
                  <div className="text-text-primary font-semibold text-lg mt-1">
                    {debugState.totalMessagesReceived}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Messages Sent:</span>
                  <div className="text-text-primary font-semibold text-lg mt-1">
                    {debugState.totalMessagesSent}
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary">Buffer Size:</span>
                  <div className="text-text-primary font-semibold text-lg mt-1">
                    {debugState.messageBufferSize} bytes
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
                      {debugState.model || 'Default'}
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

            {/* Pending Prompt */}
            {debugState.pendingPrompt && (
              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
                <h4 className="text-sm font-medium text-yellow-400 mb-2">Pending Prompt</h4>
                <div className="text-sm text-yellow-300 font-mono whitespace-pre-wrap">
                  {debugState.pendingPrompt}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
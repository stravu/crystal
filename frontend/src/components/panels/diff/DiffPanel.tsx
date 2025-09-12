import React, { useEffect, useState, useCallback, useRef } from 'react';
import CombinedDiffView from './CombinedDiffView';
import type { ToolPanel, DiffPanelState } from '../../../../../shared/types/panels';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface DiffPanelProps {
  panel: ToolPanel;
  isActive: boolean;
  sessionId: string;
  isMainRepo?: boolean;
}

export const DiffPanel: React.FC<DiffPanelProps> = ({ 
  panel, 
  isActive,
  sessionId,
  isMainRepo = false
}) => {
  const [isStale, setIsStale] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const diffState = panel.state?.customState as DiffPanelState | undefined;
  const lastRefreshRef = useRef<number>(Date.now());
  
  // Listen for file change events from other panels
  useEffect(() => {
    const handlePanelEvent = (event: CustomEvent) => {
      const { type, source } = event.detail;
      
      // Mark as stale when files change from other panels
      if (type === 'files:changed' || type === 'terminal:command_executed') {
        if (source.sessionId === sessionId && source.panelId !== panel.id) {
          setIsStale(true);
        }
      }
    };
    
    window.addEventListener('panel:event', handlePanelEvent as EventListener);
    
    return () => {
      window.removeEventListener('panel:event', handlePanelEvent as EventListener);
    };
  }, [panel.id, sessionId]);
  
  // Auto-refresh when becoming active and stale
  useEffect(() => {
    if (isActive && isStale) {
      // Mark as not stale immediately to avoid double refreshes
      setIsStale(false);
      setIsRefreshing(true);
      
      // Add a small delay to ensure any pending file operations are complete
      const timer = setTimeout(() => {
        lastRefreshRef.current = Date.now();
        setIsRefreshing(false);
        
        // Update panel state
        window.electron?.invoke('panels:update', panel.id, {
          state: {
            ...panel.state,
            customState: {
              ...diffState,
              lastRefresh: new Date().toISOString(),
              isDiffStale: false
            }
          }
        });
        
        // Emit refresh event
        window.dispatchEvent(new CustomEvent('panel:event', {
          detail: {
            type: 'diff:refreshed',
            source: {
              panelId: panel.id,
              panelType: 'diff',
              sessionId
            },
            timestamp: new Date().toISOString()
          }
        }));
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isActive, isStale, panel.id, sessionId, panel.state, diffState]);
  
  const handleManualRefresh = useCallback(() => {
    setIsStale(false);
    setIsRefreshing(true);
    
    setTimeout(() => {
      lastRefreshRef.current = Date.now();
      setIsRefreshing(false);
      
      // Update panel state
      window.electron?.invoke('panels:update', panel.id, {
        state: {
          ...panel.state,
          customState: {
            ...diffState,
            lastRefresh: new Date().toISOString(),
            isDiffStale: false
          }
        }
      });
    }, 500);
  }, [panel.id, panel.state, diffState]);
  
  return (
    <div className="diff-panel h-full flex flex-col bg-gray-800">
      {/* Stale indicator bar */}
      {isStale && !isActive && (
        <div className="bg-yellow-900/50 border-b border-yellow-700 px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Files changed - switch to diff panel to refresh</span>
          </div>
        </div>
      )}
      
      {/* Refresh indicator */}
      {isRefreshing && (
        <div className="bg-blue-900/50 border-b border-blue-700 px-3 py-2 flex items-center gap-2 text-blue-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Refreshing diff...</span>
        </div>
      )}
      
      {/* Main diff view */}
      <div className="flex-1 overflow-hidden">
        <CombinedDiffView 
          sessionId={sessionId}
          selectedExecutions={[]}
          isGitOperationRunning={false}
          isMainRepo={isMainRepo}
          isVisible={isActive}
        />
      </div>
      
      {/* Manual refresh button (always visible) */}
      <div className="border-t border-gray-700 px-3 py-2">
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-gray-300"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Diff</span>
        </button>
      </div>
    </div>
  );
};

export default DiffPanel;
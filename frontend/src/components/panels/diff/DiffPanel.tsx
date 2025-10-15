import React, { useEffect, useState, useRef } from 'react';
import CombinedDiffView from './CombinedDiffView';
import type { ToolPanel, DiffPanelState } from '../../../../../shared/types/panels';
import { AlertCircle } from 'lucide-react';

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
  const [refreshKey, setRefreshKey] = useState(0);
  const diffState = panel.state?.customState as DiffPanelState | undefined;
  const lastRefreshRef = useRef<number>(Date.now());
  
  // Listen for file change events from other panels
  useEffect(() => {
    const handlePanelEvent = (event: CustomEvent) => {
      const { type, source, data } = event.detail || {};
      
      // Mark as stale when files change from other panels
      if (type === 'files:changed' || type === 'terminal:command_executed') {
        if (source.sessionId === sessionId && source.panelId !== panel.id) {
          setIsStale(true);
        }
      } else if (type === 'git:operation_completed') {
        // Refresh diff when git operations complete for this session (e.g., merge to main)
        if (source?.sessionId === sessionId) {
          // Optionally check for operation types that affect diffs
          const op = data?.operation as string | undefined;
          if (!op || op === 'merge_to_main' || op === 'squash_and_merge') {
            setIsStale(true);
          }
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
      // Force re-mount of CombinedDiffView to reload git data
      setRefreshKey(prev => prev + 1);
      
      // Add a small delay to ensure any pending file operations are complete
      const timer = setTimeout(() => {
        lastRefreshRef.current = Date.now();
        
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
  
  // Manual refresh button removed (redundant with header refresh in CombinedDiffView)
  
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
      
      {/* Main diff view */}
      <div className="flex-1 overflow-hidden">
        <CombinedDiffView 
          key={refreshKey}
          sessionId={sessionId}
          selectedExecutions={[]}
          isGitOperationRunning={false}
          isMainRepo={isMainRepo}
          isVisible={isActive}
        />
      </div>
      
      {/* Bottom manual refresh removed; header refresh in CombinedDiffView remains */}
    </div>
  );
};

export default DiffPanel;

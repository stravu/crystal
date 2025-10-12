import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from '../../../utils/formatters';
import { formatDuration, getTimeDifference, isValidTimestamp, parseTimestamp } from '../../../utils/timestampUtils';
import { API } from '../../../utils/api';
import { PromptDetailModal } from '../../PromptDetailModal';
// import type { Session } from '../../../types/session';

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

interface PromptNavigationProps {
  panelId: string;
  onNavigateToPrompt: (marker: PromptMarker, index: number) => void;
}

export function PromptNavigation({ panelId, onNavigateToPrompt }: PromptNavigationProps) {
  const [prompts, setPrompts] = useState<PromptMarker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [modalPrompt, setModalPrompt] = useState<{ prompt: PromptMarker; index: number } | null>(null);
  // const [activeSession, setActiveSession] = useState<Session | undefined>(undefined);

  const calculateDuration = (currentPrompt: PromptMarker, currentIndex: number): string => {
    try {
      const isLast = currentIndex === prompts.length - 1;
      
      // Validate the current prompt's timestamp
      if (!isValidTimestamp(currentPrompt.timestamp)) {
        console.warn('Invalid timestamp for prompt:', currentPrompt.timestamp);
        return '';
      }
      
      // If we have a completion_timestamp (assistant response time), use it
      if (currentPrompt.completion_timestamp && isValidTimestamp(currentPrompt.completion_timestamp)) {
        const durationMs = getTimeDifference(currentPrompt.timestamp, currentPrompt.completion_timestamp);
        
        if (durationMs >= 0) {
          return formatDuration(durationMs);
        }
      }
      
      // For the last prompt without completion, show elapsed time
      if (isLast && !currentPrompt.completion_timestamp) {
        const startTime = parseTimestamp(currentPrompt.timestamp);
        const now = new Date();
        const durationMs = now.getTime() - startTime.getTime();
        
        if (durationMs >= 0) {
          // Show it's still waiting for response
          return formatDuration(durationMs) + ' (waiting)';
        }
      }
      
      // If completed but no duration available
      if (currentPrompt.completion_timestamp) {
        return 'completed';
      }
      
      return '';
      
    } catch (error) {
      console.error('Error calculating duration:', error);
      return '';
    }
  };

  const fetchPrompts = useCallback(async () => {
    if (!panelId) return;
    
    setIsLoading(true);
    try {
      const response = await API.panels.getPrompts(panelId);
      if (response.success) {
        setPrompts(response.data);
      }
    } catch (error) {
      console.error('Error fetching prompt markers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [panelId]);

  useEffect(() => {
    if (!panelId) return;
    fetchPrompts();
  }, [panelId, fetchPrompts]);
  
  // Listen for new prompts being added
  useEffect(() => {
    if (!panelId) return;
    
    const unsubscribe = window.electronAPI?.events?.onPanelPromptAdded?.((data: { panelId: string; content: string }) => {
      if (data.panelId === panelId) {
        // Refresh the prompts list when a new prompt is added to this panel
        fetchPrompts();
      }
    });
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [panelId, fetchPrompts]);
  
  // Listen for assistant responses to stop duration timers
  useEffect(() => {
    if (!panelId) return;
    
    const unsubscribe = window.electronAPI?.events?.onPanelResponseAdded?.((data: { panelId: string; content: string }) => {
      console.log('[PromptNavigation] Received panel:response-added event for panel:', data.panelId, 'current panel:', panelId);
      if (data.panelId === panelId) {
        console.log('[PromptNavigation] Refreshing prompts after assistant response');
        // Refresh the prompts list when an assistant response is added
        // This will update completion_timestamps and stop the duration from incrementing
        fetchPrompts();
      }
    });
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [panelId, fetchPrompts]);

  // Use requestAnimationFrame for smooth UI updates for ongoing durations
  useEffect(() => {
    // Only run the animation if there's a prompt without a completion timestamp
    const hasOngoingPrompt = prompts.length > 0 && 
      prompts[prompts.length - 1] && 
      !prompts[prompts.length - 1].completion_timestamp;
    
    if (!hasOngoingPrompt) {
      return; // No need to animate if there's no ongoing prompt
    }

    let animationId: number;
    let lastUpdate = 0;
    const UPDATE_INTERVAL = 5000; // Update every 5 seconds instead of every second

    const updateOngoingDuration = (timestamp: number) => {
      if (timestamp - lastUpdate >= UPDATE_INTERVAL) {
        setPrompts(prev => [...prev]); // Force re-render for duration updates
        lastUpdate = timestamp;
      }
      animationId = requestAnimationFrame(updateOngoingDuration);
    };

    animationId = requestAnimationFrame(updateOngoingDuration);
    return () => cancelAnimationFrame(animationId);
  }, [prompts]);

  const handlePromptClick = (marker: PromptMarker, index: number) => {
    setSelectedPromptId(marker.id);
    onNavigateToPrompt(marker, index);
  };

  const handlePromptDoubleClick = (marker: PromptMarker, index: number) => {
    setModalPrompt({ prompt: marker, index });
  };

  if (isLoading && prompts.length === 0) {
    return (
      <div className="w-64 bg-surface-secondary border-l border-border-primary p-4">
        <h3 className="font-semibold text-text-primary mb-4">Prompt History</h3>
        <div className="text-text-tertiary text-sm">Loading prompts...</div>
      </div>
    );
  }

  return (
    <>
      <div className="w-64 bg-surface-secondary border-l border-border-primary flex flex-col h-full">
        <div className="p-4 border-b border-border-primary">
          <h3 className="font-semibold text-text-primary">Prompt History</h3>
          <p className="text-xs text-text-tertiary mt-1">Click to navigate • Double-click for details</p>
        </div>
      
      <div className="flex-1 overflow-y-auto">
        {prompts.length === 0 ? (
          <div className="p-4 text-text-tertiary text-sm">
            No prompts yet. Start by entering a prompt below.
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {prompts.map((marker, index) => (
              <button
                key={marker.id}
                onClick={() => handlePromptClick(marker, index)}
                onDoubleClick={() => handlePromptDoubleClick(marker, index)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedPromptId === marker.id
                    ? 'bg-interactive/20 border-interactive border'
                    : 'hover:bg-bg-hover border border-transparent'
                }`}
              >
                <div className="flex items-start space-x-2">
                  <span className="text-interactive font-mono text-sm mt-0.5">
                    #{index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary line-clamp-2">
                      {marker.prompt_text}
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-text-tertiary mt-1">
                      <span>{formatDistanceToNow(parseTimestamp(marker.timestamp))} ago</span>
                      {calculateDuration(marker, index) && (
                        <>
                          <span className="text-text-tertiary">•</span>
                          <span className="font-medium text-text-secondary">
                            {calculateDuration(marker, index)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
    
    {modalPrompt && (
      <PromptDetailModal
        prompt={modalPrompt.prompt}
        promptIndex={modalPrompt.index}
        onClose={() => setModalPrompt(null)}
      />
    )}
    </>
  );
}

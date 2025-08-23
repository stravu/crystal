import { useEffect, useState } from 'react';
import { formatDistanceToNow } from '../utils/formatters';
import { formatDuration, getTimeDifference, isValidTimestamp, parseTimestamp } from '../utils/timestampUtils';
import { API } from '../utils/api';
import { PromptDetailModal } from './PromptDetailModal';
import type { Session } from '../types/session';

interface PromptMarker {
  id: number;
  session_id: string;
  prompt_text: string;
  output_index: number;
  output_line?: number;
  timestamp: string;
  completion_timestamp?: string;
}

interface PromptNavigationProps {
  sessionId: string;
  onNavigateToPrompt: (marker: PromptMarker) => void;
}

export function PromptNavigation({ sessionId, onNavigateToPrompt }: PromptNavigationProps) {
  const [prompts, setPrompts] = useState<PromptMarker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [modalPrompt, setModalPrompt] = useState<{ prompt: PromptMarker; index: number } | null>(null);
  const [activeSession, setActiveSession] = useState<Session | undefined>(undefined);

  // Fetch session data when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    
    const fetchSession = async () => {
      try {
        const response = await window.electronAPI.invoke('sessions:get', sessionId);
        if (response.success && response.session) {
          setActiveSession(response.session);
        }
      } catch (error) {
        console.error('Error fetching session:', error);
      }
    };
    
    fetchSession();
    
    // Listen for session updates
    const unsubscribe = window.electronAPI?.events?.onSessionUpdated?.((updatedSession: Session) => {
      if (updatedSession.id === sessionId) {
        setActiveSession(updatedSession);
      }
    });
    
    return () => {
      unsubscribe?.();
    };
  }, [sessionId]);

  const calculateDuration = (currentPrompt: PromptMarker, currentIndex: number): string => {
    try {
      const isLast = currentIndex === prompts.length - 1;
      
      console.log('calculateDuration for prompt:', {
        index: currentIndex,
        isLast,
        prompt_id: currentPrompt.id,
        raw_timestamp: currentPrompt.timestamp,
        completion_timestamp: currentPrompt.completion_timestamp,
        session_status: activeSession?.status,
        prompt_text_preview: currentPrompt.prompt_text.substring(0, 30) + '...'
      });
      
      // Validate the current prompt's timestamp
      if (!isValidTimestamp(currentPrompt.timestamp)) {
        console.warn('Invalid timestamp for prompt:', currentPrompt.timestamp);
        return 'Unknown duration';
      }
      
      // If we have a completion_timestamp, use it to calculate the actual execution duration
      if (currentPrompt.completion_timestamp && isValidTimestamp(currentPrompt.completion_timestamp)) {
        const durationMs = getTimeDifference(currentPrompt.timestamp, currentPrompt.completion_timestamp);
        
        console.log('Using completion timestamp:', {
          start: currentPrompt.timestamp,
          end: currentPrompt.completion_timestamp,
          duration_ms: durationMs
        });
        
        // Check for negative duration
        if (durationMs < 0) {
          console.warn('Negative duration detected with completion timestamp');
          return 'Invalid duration';
        }
        
        return formatDuration(durationMs);
      }
      
      // If no completion timestamp, check if prompt is still running
      if (isLast && activeSession && (activeSession.status === 'running' || activeSession.status === 'waiting')) {
        // For ongoing prompts, calculate duration from the UTC timestamp to current UTC time
        const startTime = parseTimestamp(currentPrompt.timestamp);
        const now = new Date();
        const durationMs = now.getTime() - startTime.getTime();
        
        console.log('Calculating ongoing duration:', {
          raw_timestamp: currentPrompt.timestamp,
          parsed_start: startTime.toISOString(),
          now_utc: now.toISOString(),
          duration_ms: durationMs
        });
        
        // Check for negative duration
        if (durationMs < 0) {
          console.error('NEGATIVE DURATION DETECTED:', {
            raw_timestamp: currentPrompt.timestamp,
            parsed_as_utc: startTime.toISOString(),
            current_time_utc: now.toISOString(),
            difference_ms: durationMs,
            difference_hours: durationMs / (1000 * 60 * 60)
          });
          // Instead of showing negative, show the absolute value with a warning
          return `${formatDuration(Math.abs(durationMs))} (!)`;
        }
        
        return formatDuration(durationMs) + ' (ongoing)';
      }
      
      // For prompts without completion_timestamp that are not actively running
      // Try to estimate using the next prompt's timestamp
      if (!isLast && currentIndex < prompts.length - 1) {
        const nextPrompt = prompts[currentIndex + 1];
        if (nextPrompt && isValidTimestamp(nextPrompt.timestamp)) {
          const durationMs = getTimeDifference(currentPrompt.timestamp, nextPrompt.timestamp);
          
          console.log('Estimating duration from next prompt:', {
            current_timestamp: currentPrompt.timestamp,
            next_timestamp: nextPrompt.timestamp,
            duration_ms: durationMs
          });
          
          if (durationMs >= 0) {
            return formatDuration(durationMs);
          }
        }
      }
      
      // Fallback for completed prompts without any way to calculate duration
      return 'Completed';
      
    } catch (error) {
      console.error('Error calculating duration:', error);
      return 'Unknown duration';
    }
  };

  useEffect(() => {
    if (!sessionId) return;

    const fetchPrompts = async () => {
      setIsLoading(true);
      try {
        const response = await API.sessions.getPrompts(sessionId);
        if (response.success) {
          // Log the timestamps to debug format issues
          console.log('Fetched prompts with timestamps:', response.data.map((p: PromptMarker) => ({
            id: p.id,
            raw_timestamp: p.timestamp,
            parsed_timestamp: parseTimestamp(p.timestamp).toISOString(),
            completion_timestamp: p.completion_timestamp,
            parsed_completion: p.completion_timestamp ? parseTimestamp(p.completion_timestamp).toISOString() : null,
            prompt_text: p.prompt_text.substring(0, 50) + '...'
          })));
          setPrompts(response.data);
        }
      } catch (error) {
        console.error('Error fetching prompt markers:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
    
    // Only refresh prompts when session status changes, not on a timer
    // This reduces unnecessary API calls from every 5 seconds to only when needed
  }, [sessionId, activeSession?.status]);

  // Use requestAnimationFrame for smooth UI updates instead of setInterval
  useEffect(() => {
    if (!activeSession || (activeSession.status !== 'running' && activeSession.status !== 'waiting')) {
      return;
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
  }, [activeSession?.status]);

  const handlePromptClick = (marker: PromptMarker) => {
    setSelectedPromptId(marker.id);
    onNavigateToPrompt(marker);
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
                onClick={() => handlePromptClick(marker)}
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
                      <span className="text-text-tertiary">•</span>
                      <span className="font-medium text-text-secondary">
                        {calculateDuration(marker, index)}
                      </span>
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
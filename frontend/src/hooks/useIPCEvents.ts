import { useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useErrorStore } from '../stores/errorStore';
import { API } from '../utils/api';
import type { Session, SessionOutput, GitStatus } from '../types/session';

// Throttle utility function
function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;
  const pendingCalls = new Map<string, Parameters<T>>();

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    // Store the latest args for this session
    const key = args[0]?.sessionId || args[0]?.id || 'default';
    pendingCalls.set(key, args);

    if (timeSinceLastCall >= delay) {
      // Execute immediately
      lastCall = now;
      pendingCalls.forEach((pendingArgs) => {
        func(...pendingArgs);
      });
      pendingCalls.clear();
    } else {
      // Schedule execution
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        pendingCalls.forEach((pendingArgs) => {
          func(...pendingArgs);
        });
        pendingCalls.clear();
        timeoutId = null;
      }, delay - timeSinceLastCall);
    }
  };
}

export function useIPCEvents() {
  const { setSessions, loadSessions, addSession, updateSession, deleteSession } = useSessionStore();
  const { showError } = useErrorStore();
  
  // Create throttled handlers for git status events
  const throttledGitStatusLoading = useRef(
    throttle((data: { sessionId: string }) => {
      useSessionStore.getState().setGitStatusLoading(data.sessionId, true);
    }, 100)
  ).current;
  
  const throttledGitStatusUpdated = useRef(
    throttle((data: { sessionId: string; gitStatus: GitStatus }) => {
      // Only log significant status changes in production
      if (data.gitStatus.state !== 'clean' || process.env.NODE_ENV === 'development') {
        console.log(`[useIPCEvents] Git status: ${data.sessionId.substring(0, 8)} → ${data.gitStatus.state}`);
      }
      useSessionStore.getState().updateSessionGitStatus(data.sessionId, data.gitStatus);
    }, 100)
  ).current;
  
  useEffect(() => {
    // Check if we're in Electron environment
    if (!window.electronAPI) {
      console.warn('Electron API not available, events will not work');
      return;
    }

    // Set up IPC event listeners
    const unsubscribeFunctions: (() => void)[] = [];

    // Listen for session events
    const unsubscribeSessionCreated = window.electronAPI.events.onSessionCreated((session: Session) => {
      console.log('[useIPCEvents] Session created:', session.id);
      addSession({...session, output: session.output || [], jsonMessages: session.jsonMessages || []});
      // Set git status as loading for new sessions
      useSessionStore.getState().setGitStatusLoading(session.id, true);
    });
    unsubscribeFunctions.push(unsubscribeSessionCreated);

    const unsubscribeSessionUpdated = window.electronAPI.events.onSessionUpdated((session: Session) => {
      console.log('[useIPCEvents] Session updated event received:', {
        id: session.id,
        model: session.model,
        status: session.status
      });
      
      // Ensure we have valid session data
      if (!session || !session.id) {
        console.error('[useIPCEvents] Invalid session data received:', session);
        return;
      }
      
      // Update the session with initialized arrays
      const sessionWithArrays = {
        ...session,
        output: session.output || [],
        jsonMessages: session.jsonMessages || []
      };
      
      updateSession(sessionWithArrays);
      
      // Force a re-render if this is the active session and status changed to stopped
      const state = useSessionStore.getState();
      if (state.activeSessionId === session.id && 
          (session.status === 'stopped' || session.status === 'completed_unviewed' || session.status === 'error')) {
        // Emit a custom event to trigger UI updates
        window.dispatchEvent(new CustomEvent('session-status-changed', { 
          detail: { sessionId: session.id, status: session.status } 
        }));
      }
    });
    unsubscribeFunctions.push(unsubscribeSessionUpdated);

    const unsubscribeSessionDeleted = window.electronAPI.events.onSessionDeleted((sessionData: any) => {
      console.log('[useIPCEvents] Session deleted:', sessionData);
      // The backend sends just { id } for deleted sessions
      const sessionId = sessionData.id || sessionData;
      
      // Dispatch a custom event for other components to listen to
      window.dispatchEvent(new CustomEvent('session-deleted', {
        detail: { id: sessionId }
      }));
      
      // Create a minimal session object for deletion
      deleteSession({ id: sessionId } as Session);
    });
    unsubscribeFunctions.push(unsubscribeSessionDeleted);

    const unsubscribeSessionsLoaded = window.electronAPI.events.onSessionsLoaded((sessions: Session[]) => {
      // Group logging for session loading
      const withStatus = sessions.filter(s => s.gitStatus).length;
      const withoutStatus = sessions.filter(s => !s.gitStatus).length;
      if (withoutStatus > 0) {
        console.log(`[useIPCEvents] Sessions: ${sessions.length} total (${withStatus} with status, ${withoutStatus} pending)`);
      } else {
        console.log(`[useIPCEvents] Sessions: ${sessions.length} loaded`);
      }
      
      const sessionsWithJsonMessages = sessions.map(session => ({
        ...session,
        jsonMessages: session.jsonMessages || []
      }));
      loadSessions(sessionsWithJsonMessages);
      // Set git status as loading for sessions without git status
      sessions.forEach(session => {
        if (!session.gitStatus && !session.archived) {
          useSessionStore.getState().setGitStatusLoading(session.id, true);
        }
      });
    });
    unsubscribeFunctions.push(unsubscribeSessionsLoaded);

    const unsubscribeSessionOutput = window.electronAPI.events.onSessionOutput((output: SessionOutput) => {
      console.log(`[useIPCEvents] Received session output for ${output.sessionId}, type: ${output.type}`);
      
      // Don't add output to session store anymore - we'll reload from database
      // This prevents duplicate outputs from being displayed
      // addSessionOutput(output);
      
      // Just emit custom event to notify that new output is available
      // The view will reload all output from the database
      window.dispatchEvent(new CustomEvent('session-output-available', {
        detail: { sessionId: output.sessionId }
      }));
    });
    unsubscribeFunctions.push(unsubscribeSessionOutput);

    const unsubscribeScriptOutput = window.electronAPI.events.onScriptOutput((output: { sessionId: string; type: 'stdout' | 'stderr'; data: string }) => {
      console.log(`[useIPCEvents] Received script output for ${output.sessionId}`);
      // Store script output in session store for display
      useSessionStore.getState().addScriptOutput(output);
    });
    unsubscribeFunctions.push(unsubscribeScriptOutput);
    
    const unsubscribeOutputAvailable = window.electronAPI.events.onSessionOutputAvailable((info: { sessionId: string }) => {
      console.log(`[useIPCEvents] Output available notification for session ${info.sessionId}`);
      
      // Emit custom event to notify that output is available
      window.dispatchEvent(new CustomEvent('session-output-available', {
        detail: { sessionId: info.sessionId }
      }));
    });
    unsubscribeFunctions.push(unsubscribeOutputAvailable);
    
    // Listen for zombie process detection
    const unsubscribeZombieProcesses = window.electronAPI.events.onZombieProcessesDetected((data: { sessionId?: string | null; pids?: number[]; message: string }) => {
      console.error('[useIPCEvents] Zombie processes detected:', data);
      
      // Show error to user
      const errorMessage = data.message || 'Some child processes could not be terminated. Please check your system process list.';
      const details = data.pids && data.pids.length > 0 
        ? `Unable to terminate process IDs: ${data.pids.join(', ')}\n\nYou may need to manually kill these processes.`
        : undefined;
      
      showError({
        title: 'Zombie Processes Detected',
        error: errorMessage,
        details
      });
      
      // Also log PIDs if available
      if (data.pids && data.pids.length > 0) {
        console.error(`Zombie process PIDs: ${data.pids.join(', ')}`);
      }
    });
    unsubscribeFunctions.push(unsubscribeZombieProcesses);

    // Listen for git status updates (throttled)
    const unsubscribeGitStatusUpdated = window.electronAPI.events.onGitStatusUpdated(throttledGitStatusUpdated);
    unsubscribeFunctions.push(unsubscribeGitStatusUpdated);

    // Listen for git status loading events (throttled)
    const unsubscribeGitStatusLoading = window.electronAPI.events.onGitStatusLoading?.(throttledGitStatusLoading);
    if (unsubscribeGitStatusLoading) {
      unsubscribeFunctions.push(unsubscribeGitStatusLoading);
    }
    
    // Listen for batch git status events
    const unsubscribeGitStatusLoadingBatch = window.electronAPI.events.onGitStatusLoadingBatch?.((sessionIds: string[]) => {
      const updates = sessionIds.map(sessionId => ({ sessionId, loading: true }));
      useSessionStore.getState().setGitStatusLoadingBatch(updates);
    });
    if (unsubscribeGitStatusLoadingBatch) {
      unsubscribeFunctions.push(unsubscribeGitStatusLoadingBatch);
    }
    
    const unsubscribeGitStatusUpdatedBatch = window.electronAPI.events.onGitStatusUpdatedBatch?.((updates: Array<{ sessionId: string; status: GitStatus }>) => {
      console.log(`[useIPCEvents] Git status batch update: ${updates.length} sessions`);
      useSessionStore.getState().updateSessionGitStatusBatch(updates);
    });
    if (unsubscribeGitStatusUpdatedBatch) {
      unsubscribeFunctions.push(unsubscribeGitStatusUpdatedBatch);
    }

    // Load initial sessions
    API.sessions.getAll()
      .then(response => {
        if (response.success && response.data) {
          const sessionsWithJsonMessages = response.data.map((session: Session) => ({
            ...session,
            jsonMessages: session.jsonMessages || []
          }));
          loadSessions(sessionsWithJsonMessages);
        }
      })
      .catch(error => {
        console.error('Failed to load initial sessions:', error);
      });

    return () => {
      // Clean up all event listeners
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [setSessions, loadSessions, addSession, updateSession, deleteSession, showError]);
  
  // Return a mock socket object for compatibility
  return {
    connected: true,
    disconnect: () => {},
  };
}
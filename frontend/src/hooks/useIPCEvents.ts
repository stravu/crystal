import { useEffect } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useErrorStore } from '../stores/errorStore';
import { API } from '../utils/api';
import type { Session, SessionOutput, GitStatus } from '../types/session';

export function useIPCEvents() {
  const { setSessions, loadSessions, addSession, updateSession, deleteSession } = useSessionStore();
  const { showError } = useErrorStore();
  
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
      console.log('[useIPCEvents] Sessions loaded:', sessions.length);
      const sessionsWithJsonMessages = sessions.map(session => ({
        ...session,
        jsonMessages: session.jsonMessages || []
      }));
      loadSessions(sessionsWithJsonMessages);
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

    // Listen for git status updates
    const unsubscribeGitStatusUpdated = window.electronAPI.events.onGitStatusUpdated((data: { sessionId: string; gitStatus: GitStatus }) => {
      console.log('[useIPCEvents] Git status updated:', data.sessionId);
      useSessionStore.getState().updateSessionGitStatus(data.sessionId, data.gitStatus);
    });
    unsubscribeFunctions.push(unsubscribeGitStatusUpdated);

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
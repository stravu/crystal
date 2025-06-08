import { useEffect } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { API } from '../utils/api';
import type { Session, SessionOutput } from '../types/session';

export function useSocket() {
  const { setSessions, loadSessions, addSession, updateSession, deleteSession, addSessionOutput } = useSessionStore();
  
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
      addSession({...session, jsonMessages: session.jsonMessages || []});
    });
    unsubscribeFunctions.push(unsubscribeSessionCreated);

    const unsubscribeSessionUpdated = window.electronAPI.events.onSessionUpdated((session: Session) => {
      updateSession({...session, jsonMessages: session.jsonMessages || []});
    });
    unsubscribeFunctions.push(unsubscribeSessionUpdated);

    const unsubscribeSessionDeleted = window.electronAPI.events.onSessionDeleted((session: Session) => {
      deleteSession(session);
    });
    unsubscribeFunctions.push(unsubscribeSessionDeleted);

    const unsubscribeSessionsLoaded = window.electronAPI.events.onSessionsLoaded((sessions: Session[]) => {
      const sessionsWithJsonMessages = sessions.map(session => ({
        ...session,
        jsonMessages: session.jsonMessages || []
      }));
      loadSessions(sessionsWithJsonMessages);
    });
    unsubscribeFunctions.push(unsubscribeSessionsLoaded);

    const unsubscribeSessionOutput = window.electronAPI.events.onSessionOutput((output: SessionOutput) => {
      console.log('Received session output:', output);
      addSessionOutput(output);
    });
    unsubscribeFunctions.push(unsubscribeSessionOutput);

    const unsubscribeScriptOutput = window.electronAPI.events.onScriptOutput((output: { sessionId: string; type: 'stdout' | 'stderr'; data: string }) => {
      console.log('Received script output for session', output.sessionId, ':', output.data.substring(0, 100));
      // Store script output in session store for display
      useSessionStore.getState().addScriptOutput(output);
    });
    unsubscribeFunctions.push(unsubscribeScriptOutput);

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

    console.log('Connected to Electron IPC events');

    return () => {
      // Clean up all event listeners
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
      console.log('Disconnected from Electron IPC events');
    };
  }, [setSessions, loadSessions, addSession, updateSession, deleteSession, addSessionOutput]);
  
  // Return a mock socket object for compatibility
  return {
    connected: true,
    disconnect: () => {},
  };
}
import { create } from 'zustand';
import type { Session, SessionOutput } from '../types/session';

interface CreateSessionRequest {
  prompt: string;
  worktreeTemplate: string;
  count: number;
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  isLoaded: boolean;
  
  setSessions: (sessions: Session[]) => void;
  loadSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (session: Session) => void;
  deleteSession: (session: Session) => void;
  setActiveSession: (sessionId: string | null) => void;
  addSessionOutput: (output: SessionOutput) => void;
  setSessionOutput: (sessionId: string, output: string) => void;
  createSession: (request: CreateSessionRequest) => Promise<void>;
  
  getActiveSession: () => Session | undefined;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoaded: false,
  
  setSessions: (sessions) => set({ sessions }),
  
  loadSessions: (sessions) => set({ sessions, isLoaded: true }),
  
  addSession: (session) => set((state) => ({
    sessions: [session, ...state.sessions],  // Add new sessions at the top
    activeSessionId: session.id  // Automatically set as active
  })),
  
  updateSession: (updatedSession) => set((state) => ({
    sessions: state.sessions.map(session => 
      session.id === updatedSession.id 
        ? { ...updatedSession, output: session.output } // Preserve existing output
        : session
    )
  })),
  
  deleteSession: (deletedSession) => set((state) => ({
    sessions: state.sessions.filter(session => session.id !== deletedSession.id),
    activeSessionId: state.activeSessionId === deletedSession.id ? null : state.activeSessionId
  })),
  
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
  
  addSessionOutput: (output) => set((state) => ({
    sessions: state.sessions.map(session => 
      session.id === output.sessionId
        ? output.type === 'json'
          ? { ...session, jsonMessages: [...(session.jsonMessages || []), {...output.data, timestamp: output.timestamp}] }
          : { ...session, output: [...session.output, output.data] }
        : session
    )
  })),
  
  setSessionOutput: (sessionId, output) => set((state) => ({
    sessions: state.sessions.map(session => 
      session.id === sessionId
        ? { ...session, output: [output] }
        : session
    )
  })),
  
  createSession: async (request) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      // Sessions will be added via WebSocket, no need to manually add here
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },
  
  getActiveSession: () => {
    const state = get();
    return state.sessions.find(session => session.id === state.activeSessionId);
  }
}));
import { create } from 'zustand';
import type { Session, SessionOutput } from '../types/session';

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
  
  getActiveSession: () => Session | undefined;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoaded: false,
  
  setSessions: (sessions) => set({ sessions }),
  
  loadSessions: (sessions) => set({ sessions, isLoaded: true }),
  
  addSession: (session) => set((state) => ({
    sessions: [...state.sessions, session]
  })),
  
  updateSession: (updatedSession) => set((state) => ({
    sessions: state.sessions.map(session => 
      session.id === updatedSession.id ? updatedSession : session
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
        ? { ...session, output: [...session.output, output.data] }
        : session
    )
  })),
  
  getActiveSession: () => {
    const state = get();
    return state.sessions.find(session => session.id === state.activeSessionId);
  }
}));
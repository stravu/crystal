import { create } from 'zustand';
import type { Session, SessionOutput } from '../types/session';
import { API } from '../utils/api';

interface CreateSessionRequest {
  prompt: string;
  worktreeTemplate: string;
  count: number;
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  isLoaded: boolean;
  scriptOutput: Record<string, string[]>; // sessionId -> script output lines
  
  setSessions: (sessions: Session[]) => void;
  loadSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (session: Session) => void;
  deleteSession: (session: Session) => void;
  setActiveSession: (sessionId: string | null) => void;
  addSessionOutput: (output: SessionOutput) => void;
  setSessionOutput: (sessionId: string, output: string) => void;
  addScriptOutput: (output: { sessionId: string; type: 'stdout' | 'stderr'; data: string }) => void;
  clearScriptOutput: (sessionId: string) => void;
  getScriptOutput: (sessionId: string) => string[];
  createSession: (request: CreateSessionRequest) => Promise<void>;
  markSessionAsViewed: (sessionId: string) => Promise<void>;
  
  getActiveSession: () => Session | undefined;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoaded: false,
  scriptOutput: {},
  
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
  
  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
    // Mark session as viewed when it becomes active
    if (sessionId) {
      get().markSessionAsViewed(sessionId);
    }
  },
  
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
      const response = await API.sessions.create(request);

      if (!response.success) {
        throw new Error(response.error || 'Failed to create session');
      }

      // Sessions will be added via IPC events, no need to manually add here
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  },
  
  addScriptOutput: (output) => {
    console.log('Adding script output to store for session', output.sessionId, ':', output.data.substring(0, 100));
    return set((state) => ({
      scriptOutput: {
        ...state.scriptOutput,
        [output.sessionId]: [
          ...(state.scriptOutput[output.sessionId] || []),
          output.data
        ]
      }
    }));
  },

  clearScriptOutput: (sessionId: string) => set((state) => ({
    scriptOutput: {
      ...state.scriptOutput,
      [sessionId]: []
    }
  })),

  getScriptOutput: (sessionId) => {
    const state = get();
    return state.scriptOutput[sessionId] || [];
  },
  
  getActiveSession: () => {
    const state = get();
    return state.sessions.find(session => session.id === state.activeSessionId);
  },

  markSessionAsViewed: async (sessionId) => {
    try {
      const response = await API.sessions.markViewed(sessionId);

      if (!response.success) {
        throw new Error(response.error || 'Failed to mark session as viewed');
      }

      // Session will be updated via IPC events, no need to manually update here
    } catch (error) {
      console.error('Error marking session as viewed:', error);
    }
  }
}));
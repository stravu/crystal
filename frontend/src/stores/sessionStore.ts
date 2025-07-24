import { create } from 'zustand';
import type { Session, SessionOutput, GitStatus } from '../types/session';
import { API } from '../utils/api';

interface CreateSessionRequest {
  prompt: string;
  worktreeTemplate: string;
  count: number;
}

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  activeMainRepoSession: Session | null; // Special storage for main repo session
  isLoaded: boolean;
  scriptOutput: Record<string, string[]>; // sessionId -> script output lines
  deletingSessionIds: Set<string>; // Track sessions currently being deleted
  gitStatusLoading: Set<string>; // Track sessions currently loading git status
  
  // Batching for git status updates
  gitStatusBatchTimer: NodeJS.Timeout | null;
  pendingGitStatusLoading: Map<string, boolean>; // sessionId -> loading state
  pendingGitStatusUpdates: Map<string, GitStatus>; // sessionId -> GitStatus
  
  setSessions: (sessions: Session[]) => void;
  loadSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (session: Session) => void;
  deleteSession: (session: Session) => void;
  setActiveSession: (sessionId: string | null) => Promise<void>;
  addSessionOutput: (output: SessionOutput) => void;
  setSessionOutput: (sessionId: string, output: string) => void;
  setSessionOutputs: (sessionId: string, outputs: SessionOutput[]) => void;
  clearSessionOutput: (sessionId: string) => void;
  addScriptOutput: (output: { sessionId: string; type: 'stdout' | 'stderr'; data: string }) => void;
  clearScriptOutput: (sessionId: string) => void;
  getScriptOutput: (sessionId: string) => string[];
  createSession: (request: CreateSessionRequest) => Promise<void>;
  markSessionAsViewed: (sessionId: string) => Promise<void>;
  
  setDeletingSessionIds: (ids: string[]) => void;
  addDeletingSessionId: (id: string) => void;
  removeDeletingSessionId: (id: string) => void;
  clearDeletingSessionIds: () => void;
  
  getActiveSession: () => Session | undefined;
  updateSessionGitStatus: (sessionId: string, gitStatus: GitStatus) => void;
  setGitStatusLoading: (sessionId: string, loading: boolean) => void;
  isGitStatusLoading: (sessionId: string) => boolean;
  
  // Batch update methods
  setGitStatusLoadingBatch: (updates: Array<{ sessionId: string; loading: boolean }>) => void;
  updateSessionGitStatusBatch: (updates: Array<{ sessionId: string; status: GitStatus }>) => void;
  processPendingGitStatusUpdates: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeMainRepoSession: null,
  isLoaded: false,
  scriptOutput: {},
  deletingSessionIds: new Set(),
  gitStatusLoading: new Set(),
  
  // Batching state
  gitStatusBatchTimer: null,
  pendingGitStatusLoading: new Map(),
  pendingGitStatusUpdates: new Map(),
  
  setSessions: (sessions) => set({ sessions }),
  
  loadSessions: (sessions) => set({ sessions, isLoaded: true }),
  
  addSession: (session) => set((state) => {
    console.log(`[SessionStore] Adding new session ${session.id} and setting as active`);
    
    // Initialize arrays if they don't exist
    const sessionWithArrays = {
      ...session,
      output: session.output || [],
      jsonMessages: session.jsonMessages || []
    };
    
    return {
      sessions: [sessionWithArrays, ...state.sessions],  // Add new sessions at the top
      activeSessionId: session.id  // Automatically set as active
    };
  }),
  
  updateSession: (updatedSession) => set((state) => {
    console.log(`[SessionStore] updateSession called for ${updatedSession.id}`, {
      model: updatedSession.model,
      status: updatedSession.status,
      fullUpdate: updatedSession
    });
    
    // If this is the active main repo session, update it
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === updatedSession.id) {
      const newActiveSession = {
        ...state.activeMainRepoSession,
        ...updatedSession,
        output: state.activeMainRepoSession.output,
        jsonMessages: state.activeMainRepoSession.jsonMessages
      };
      console.log(`[SessionStore] Updated active main repo session ${updatedSession.id} model:`, newActiveSession.model);
      return {
        ...state,
        activeMainRepoSession: newActiveSession
      };
    }
    
    // Otherwise update in regular sessions
    const newSessions = state.sessions.map(session => {
      if (session.id === updatedSession.id) {
        const updatedSessionWithOutput = {
          ...session,
          ...updatedSession,
          output: session.output,
          jsonMessages: session.jsonMessages
        };
        console.log(`[SessionStore] Updated session ${updatedSession.id} model: ${session.model} -> ${updatedSessionWithOutput.model}`);
        return updatedSessionWithOutput;
      }
      return session;
    });
    
    return {
      ...state,
      sessions: newSessions
    };
  }),
  
  deleteSession: (deletedSession) => set((state) => {
    // Clear the active main repo session if it's being deleted
    const newActiveMainRepoSession = state.activeMainRepoSession?.id === deletedSession.id 
      ? null 
      : state.activeMainRepoSession;
    
    return {
      sessions: state.sessions.filter(session => session.id !== deletedSession.id),
      activeSessionId: state.activeSessionId === deletedSession.id ? null : state.activeSessionId,
      activeMainRepoSession: newActiveMainRepoSession
    };
  }),
  
  setActiveSession: async (sessionId) => {
    console.log('[SessionStore] setActiveSession called with:', sessionId);
    
    if (!sessionId) {
      set({ activeSessionId: null, activeMainRepoSession: null });
      return;
    }
    
    // First check if the session is already in our local store
    const state = get();
    const existingSession = state.sessions.find(s => s.id === sessionId);
    
    if (existingSession) {
      console.log('[SessionStore] Session found in local store:', existingSession.id, existingSession.name);
      
      if (existingSession.isMainRepo) {
        // Store main repo session separately with initialized arrays
        console.log('[SessionStore] Setting existing main repo session as active');
        set({ 
          activeSessionId: sessionId, 
          activeMainRepoSession: {
            ...existingSession,
            output: existingSession.output || [],
            jsonMessages: existingSession.jsonMessages || []
          }
        });
      } else {
        // Regular session - just set the ID
        console.log('[SessionStore] Setting existing regular session as active');
        set({ activeSessionId: sessionId, activeMainRepoSession: null });
      }
      
      // Only mark session as viewed if it wasn't already active
      // This prevents the blue dot from disappearing when the session completes while you're viewing it
      const wasAlreadyActive = state.activeSessionId === sessionId;
      if (!wasAlreadyActive) {
        get().markSessionAsViewed(sessionId);
      }
      return;
    }
    
    // If not in local store, fetch from backend (this might be a stale UI)
    try {
      console.log('[SessionStore] Session not in local store, fetching from backend');
      const response = await API.sessions.get(sessionId);
      console.log('[SessionStore] Session fetch response:', response);
      
      if (response.success && response.data) {
        const session = response.data;
        console.log('[SessionStore] Session data from backend:', session);
        
        // Add the session to local store if not already there
        const currentSessions = get().sessions;
        const sessionExists = currentSessions.find(s => s.id === sessionId);
        if (!sessionExists) {
          console.log('[SessionStore] Adding fetched session to local store');
          set(state => ({
            sessions: [...state.sessions, {
              ...session,
              output: session.output || [],
              jsonMessages: session.jsonMessages || []
            }]
          }));
        }
        
        if (session.isMainRepo) {
          // Store main repo session separately with initialized arrays
          console.log('[SessionStore] Setting fetched main repo session as active');
          set({ 
            activeSessionId: sessionId, 
            activeMainRepoSession: {
              ...session,
              output: session.output || [],
              jsonMessages: session.jsonMessages || []
            }
          });
        } else {
          // Regular session
          console.log('[SessionStore] Setting fetched regular session as active');
          set({ activeSessionId: sessionId, activeMainRepoSession: null });
        }
        // Only mark session as viewed if it wasn't already active
        const currentState = get();
        const wasAlreadyActive = currentState.activeSessionId === sessionId;
        if (!wasAlreadyActive) {
          get().markSessionAsViewed(sessionId);
        }
      } else {
        console.error('[SessionStore] Failed to fetch session:', sessionId, response);
      }
    } catch (error) {
      console.error('[SessionStore] Error setting active session:', error);
      set({ activeSessionId: sessionId, activeMainRepoSession: null });
    }
  },
  
  addSessionOutput: (output) => set((state) => {
    console.log(`[SessionStore] Adding output for session ${output.sessionId}, type: ${output.type}`);
    
    // Find session in sessions array
    const sessionIndex = state.sessions.findIndex(s => s.id === output.sessionId);
    if (sessionIndex === -1) {
      console.warn(`[SessionStore] Session ${output.sessionId} not found in store, cannot add output`);
      return state;
    }
    
    // Update sessions array
    const sessions = [...state.sessions];
    const session = sessions[sessionIndex];
    
    if (output.type === 'json') {
      // Update jsonMessages array
      const newJsonMessages = [...(session.jsonMessages || [])];
      newJsonMessages.push({...output.data, timestamp: output.timestamp});
      sessions[sessionIndex] = { ...session, jsonMessages: newJsonMessages };
    } else {
      // Add stdout/stderr to output array
      const newOutput = [...(session.output || [])];
      newOutput.push(output.data);
      sessions[sessionIndex] = { ...session, output: newOutput };
    }
    
    // Also update activeMainRepoSession if it matches
    let updatedActiveMainRepoSession = state.activeMainRepoSession;
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === output.sessionId) {
      if (output.type === 'json') {
        const newJsonMessages = [...(state.activeMainRepoSession.jsonMessages || [])];
        newJsonMessages.push({...output.data, timestamp: output.timestamp});
        updatedActiveMainRepoSession = { ...state.activeMainRepoSession, jsonMessages: newJsonMessages };
      } else {
        const newOutput = [...(state.activeMainRepoSession.output || [])];
        newOutput.push(output.data);
        updatedActiveMainRepoSession = { ...state.activeMainRepoSession, output: newOutput };
      }
    }
    
    return { 
      ...state,
      sessions,
      activeMainRepoSession: updatedActiveMainRepoSession
    };
  }),
  
  setSessionOutput: (sessionId, output) => set((state) => {
    // Update sessions array
    const updatedSessions = state.sessions.map(session => 
      session.id === sessionId
        ? { ...session, output: [output] }
        : session
    );
    
    // Update activeMainRepoSession if it matches
    let updatedActiveMainRepoSession = state.activeMainRepoSession;
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === sessionId) {
      updatedActiveMainRepoSession = { ...state.activeMainRepoSession, output: [output] };
    }
    
    return {
      ...state,
      sessions: updatedSessions,
      activeMainRepoSession: updatedActiveMainRepoSession
    };
  }),
  
  setSessionOutputs: (sessionId, outputs) => set((state) => {
    console.log(`[SessionStore] Setting ${outputs.length} outputs for session ${sessionId}`);
    
    // Separate outputs and JSON messages
    const stdOutputs: string[] = [];
    const jsonMessages: any[] = [];
    
    outputs.forEach(output => {
      if (output.type === 'json') {
        jsonMessages.push({ ...output.data, timestamp: output.timestamp });
      } else if (output.type === 'stdout' || output.type === 'stderr') {
        stdOutputs.push(output.data);
      }
    });
    
    console.log(`[SessionStore] Processed outputs - stdout: ${stdOutputs.length}, json: ${jsonMessages.length}`);
    
    // Always update the sessions array
    const updatedSessions = state.sessions.map(session => {
      if (session.id === sessionId) {
        console.log(`[SessionStore] Updating session ${sessionId} with outputs`);
        return { ...session, output: stdOutputs, jsonMessages };
      }
      return session;
    });
    
    // Also update activeMainRepoSession if it matches
    let updatedActiveMainRepoSession = state.activeMainRepoSession;
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === sessionId) {
      console.log(`[SessionStore] Also updating activeMainRepoSession`);
      updatedActiveMainRepoSession = { ...state.activeMainRepoSession, output: stdOutputs, jsonMessages };
    }
    
    return {
      ...state,
      sessions: updatedSessions,
      activeMainRepoSession: updatedActiveMainRepoSession
    };
  }),
  
  clearSessionOutput: (sessionId) => set((state) => {
    // Update sessions array
    const updatedSessions = state.sessions.map(session => 
      session.id === sessionId
        ? { ...session, output: [], jsonMessages: [] }
        : session
    );
    
    // Update activeMainRepoSession if it matches
    let updatedActiveMainRepoSession = state.activeMainRepoSession;
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === sessionId) {
      updatedActiveMainRepoSession = { ...state.activeMainRepoSession, output: [], jsonMessages: [] };
    }
    
    return {
      ...state,
      sessions: updatedSessions,
      activeMainRepoSession: updatedActiveMainRepoSession
    };
  }),
  
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
  
  addScriptOutput: (output) => set((state) => ({
    scriptOutput: {
      ...state.scriptOutput,
      [output.sessionId]: [
        ...(state.scriptOutput[output.sessionId] || []),
        output.data
      ]
    }
  })),

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
    console.log('[SessionStore] getActiveSession - activeSessionId:', state.activeSessionId, 'sessions count:', state.sessions.length);
    
    // If we have a main repo session, return it
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === state.activeSessionId) {
      console.log('[SessionStore] Returning activeMainRepoSession');
      return state.activeMainRepoSession;
    }
    
    // Otherwise look in regular sessions
    const found = state.sessions.find(session => session.id === state.activeSessionId);
    console.log('[SessionStore] Found session in sessions array:', found?.id, found?.name);
    return found;
  },

  updateSessionGitStatus: (sessionId, gitStatus) => {
    const state = get();
    
    // Add to pending updates
    state.pendingGitStatusUpdates.set(sessionId, gitStatus);
    
    // Clear existing timer
    if (state.gitStatusBatchTimer) {
      clearTimeout(state.gitStatusBatchTimer);
    }
    
    // Set new timer to process pending updates
    const timer = setTimeout(() => {
      get().processPendingGitStatusUpdates();
    }, 50); // 50ms batch window
    
    set({ gitStatusBatchTimer: timer });
  },
  
  setGitStatusLoading: (sessionId, loading) => {
    const state = get();
    
    // Add to pending updates
    state.pendingGitStatusLoading.set(sessionId, loading);
    
    // Clear existing timer
    if (state.gitStatusBatchTimer) {
      clearTimeout(state.gitStatusBatchTimer);
    }
    
    // Set new timer to process pending updates
    const timer = setTimeout(() => {
      get().processPendingGitStatusUpdates();
    }, 50); // 50ms batch window
    
    set({ gitStatusBatchTimer: timer });
  },
  
  isGitStatusLoading: (sessionId) => {
    return get().gitStatusLoading.has(sessionId);
  },

  setDeletingSessionIds: (ids) => set({ deletingSessionIds: new Set(ids) }),
  
  addDeletingSessionId: (id) => set((state) => {
    const newSet = new Set(state.deletingSessionIds);
    newSet.add(id);
    return { deletingSessionIds: newSet };
  }),
  
  removeDeletingSessionId: (id) => set((state) => {
    const newSet = new Set(state.deletingSessionIds);
    newSet.delete(id);
    return { deletingSessionIds: newSet };
  }),
  
  clearDeletingSessionIds: () => set({ deletingSessionIds: new Set() }),

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
  },
  
  // Batch update methods
  setGitStatusLoadingBatch: (updates) => {
    set((state) => {
      const newLoadingSet = new Set(state.gitStatusLoading);
      
      updates.forEach(({ sessionId, loading }) => {
        if (loading) {
          newLoadingSet.add(sessionId);
        } else {
          newLoadingSet.delete(sessionId);
        }
      });
      
      return { gitStatusLoading: newLoadingSet };
    });
  },
  
  updateSessionGitStatusBatch: (updates) => {
    set((state) => {
      // Build maps for efficient lookup
      const statusUpdates = new Map(updates.map(u => [u.sessionId, u.status]));
      
      // Remove updated sessions from loading set
      const newLoadingSet = new Set(state.gitStatusLoading);
      updates.forEach(({ sessionId }) => {
        newLoadingSet.delete(sessionId);
      });
      
      // Update sessions in one pass
      const sessions = state.sessions.map(session => {
        const newStatus = statusUpdates.get(session.id);
        return newStatus ? { ...session, gitStatus: newStatus } : session;
      });
      
      // Update main repo session if needed
      let activeMainRepoSession = state.activeMainRepoSession;
      if (activeMainRepoSession) {
        const mainRepoUpdate = statusUpdates.get(activeMainRepoSession.id);
        if (mainRepoUpdate) {
          activeMainRepoSession = { ...activeMainRepoSession, gitStatus: mainRepoUpdate };
        }
      }
      
      return { sessions, activeMainRepoSession, gitStatusLoading: newLoadingSet };
    });
  },
  
  processPendingGitStatusUpdates: () => {
    const state = get();
    
    // Clear timer
    if (state.gitStatusBatchTimer) {
      clearTimeout(state.gitStatusBatchTimer);
      set({ gitStatusBatchTimer: null });
    }
    
    // Process loading state updates
    if (state.pendingGitStatusLoading.size > 0) {
      const loadingUpdates = Array.from(state.pendingGitStatusLoading.entries()).map(
        ([sessionId, loading]) => ({ sessionId, loading })
      );
      get().setGitStatusLoadingBatch(loadingUpdates);
      state.pendingGitStatusLoading.clear();
    }
    
    // Process status updates
    if (state.pendingGitStatusUpdates.size > 0) {
      const statusUpdates = Array.from(state.pendingGitStatusUpdates.entries()).map(
        ([sessionId, status]) => ({ sessionId, status })
      );
      get().updateSessionGitStatusBatch(statusUpdates);
      state.pendingGitStatusUpdates.clear();
    }
  }
}));
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
  terminalOutput: Record<string, string[]>; // sessionId -> terminal output lines
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
  addTerminalOutput: (output: { sessionId: string; type: 'stdout' | 'stderr'; data: string }) => void;
  clearTerminalOutput: (sessionId: string) => void;
  getTerminalOutput: (sessionId: string) => string[];
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
  
  // Performance cleanup methods
  cleanupInactiveSessions: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeMainRepoSession: null,
  isLoaded: false,
  terminalOutput: {},
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
    // Performance: Only clone array if session exists
    let newSessions = state.sessions;
    for (let i = 0; i < state.sessions.length; i++) {
      if (state.sessions[i].id === updatedSession.id) {
        newSessions = state.sessions.slice();
        const updatedSessionWithOutput = {
          ...state.sessions[i],
          ...updatedSession,
          output: state.sessions[i].output,
          jsonMessages: state.sessions[i].jsonMessages
        };
        console.log(`[SessionStore] Updated session ${updatedSession.id} model: ${state.sessions[i].model} -> ${updatedSessionWithOutput.model}`);
        newSessions[i] = updatedSessionWithOutput;
        break;
      }
    }
    
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
    
    // Clean up terminal output for deleted session to free memory
    const newTerminalOutput = { ...state.terminalOutput };
    delete newTerminalOutput[deletedSession.id];
    
    return {
      sessions: state.sessions.filter(session => session.id !== deletedSession.id),
      activeSessionId: state.activeSessionId === deletedSession.id ? null : state.activeSessionId,
      activeMainRepoSession: newActiveMainRepoSession,
      terminalOutput: newTerminalOutput
    };
  }),
  
  setActiveSession: async (sessionId) => {
    console.log('[SessionStore] setActiveSession called with:', sessionId);
    
    if (!sessionId) {
      set({ activeSessionId: null, activeMainRepoSession: null });
      return;
    }
    
    // Emit session-switched event for cleanup
    if (get().activeSessionId !== sessionId) {
      window.dispatchEvent(new CustomEvent('session-switched', { detail: { sessionId } }));
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
    
    // Performance: Only clone sessions array once
    const sessions = state.sessions.slice();
    const session = sessions[sessionIndex];
    
    // CRITICAL PERFORMANCE FIX: Much stricter limits to prevent V8 array iteration issues
    const MAX_OUTPUTS = 300; // Drastically reduced from 1000
    const MAX_MESSAGES = 100; // Drastically reduced from 500
    
    if (output.type === 'json') {
      // Update jsonMessages array with limit
      const currentMessages = session.jsonMessages || [];
      const newMessage = {...output.data, timestamp: output.timestamp};
      const newJsonMessages = currentMessages.length >= MAX_MESSAGES
        ? [...currentMessages.slice(1), newMessage] // Remove oldest when at limit
        : [...currentMessages, newMessage];
      sessions[sessionIndex] = { ...session, jsonMessages: newJsonMessages };
    } else {
      // Add stdout/stderr to output array with limit
      const currentOutput = session.output || [];
      const newOutput = currentOutput.length >= MAX_OUTPUTS
        ? [...currentOutput.slice(1), output.data] // Remove oldest when at limit
        : [...currentOutput, output.data];
      sessions[sessionIndex] = { ...session, output: newOutput };
    }
    
    // Also update activeMainRepoSession if it matches
    let updatedActiveMainRepoSession = state.activeMainRepoSession;
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === output.sessionId) {
      if (output.type === 'json') {
        const currentMessages = state.activeMainRepoSession.jsonMessages || [];
        const newMessage = {...output.data, timestamp: output.timestamp};
        const newJsonMessages = currentMessages.length >= MAX_MESSAGES
          ? [...currentMessages.slice(1), newMessage]
          : [...currentMessages, newMessage];
        updatedActiveMainRepoSession = { ...state.activeMainRepoSession, jsonMessages: newJsonMessages };
      } else {
        const currentOutput = state.activeMainRepoSession.output || [];
        const newOutput = currentOutput.length >= MAX_OUTPUTS
          ? [...currentOutput.slice(1), output.data]
          : [...currentOutput, output.data];
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
    // Performance: Only clone array if session exists
    let updatedSessions = state.sessions;
    for (let i = 0; i < state.sessions.length; i++) {
      if (state.sessions[i].id === sessionId) {
        updatedSessions = state.sessions.slice();
        updatedSessions[i] = { ...state.sessions[i], output: [output] };
        break;
      }
    }
    
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
    
    // PERFORMANCE: Process arrays in chunks to avoid V8 optimization bailouts
    const stdOutputs: string[] = [];
    const jsonMessages: any[] = [];
    
    // Process in smaller batches to avoid long-running loops that trigger V8 deoptimization
    const BATCH_SIZE = 100;
    for (let batch = 0; batch < outputs.length; batch += BATCH_SIZE) {
      const batchEnd = Math.min(batch + BATCH_SIZE, outputs.length);
      
      for (let i = batch; i < batchEnd; i++) {
        const output = outputs[i];
        if (output.type === 'json') {
          jsonMessages.push({ ...output.data, timestamp: output.timestamp });
        } else if (output.type === 'stdout' || output.type === 'stderr') {
          stdOutputs.push(output.data);
        }
      }
      
      // Allow event loop to breathe between batches for very large arrays
      if (batchEnd < outputs.length && outputs.length > 500) {
        // This is a synchronous operation, so we can't truly yield,
        // but we can at least break up the work
        if (stdOutputs.length > 300 || jsonMessages.length > 100) {
          // Stop early if we already have enough data
          console.warn(`[SessionStore] Stopping early at ${batchEnd} of ${outputs.length} outputs due to limits`);
          break;
        }
      }
    }
    
    // CRITICAL PERFORMANCE FIX: Even more aggressive limits to prevent V8 optimization failures
    // V8 was getting stuck in recursive array iterations with large arrays
    const MAX_STORED_OUTPUTS = 300; // Further reduced to prevent CPU spikes
    const MAX_STORED_MESSAGES = 100; // Further reduced to prevent memory pressure
    
    const trimmedOutputs = stdOutputs.length > MAX_STORED_OUTPUTS 
      ? stdOutputs.slice(-MAX_STORED_OUTPUTS) 
      : stdOutputs;
    
    const trimmedMessages = jsonMessages.length > MAX_STORED_MESSAGES
      ? jsonMessages.slice(-MAX_STORED_MESSAGES)
      : jsonMessages;
    
    if (stdOutputs.length > MAX_STORED_OUTPUTS) {
      console.warn(`[SessionStore] Trimmed outputs from ${stdOutputs.length} to ${MAX_STORED_OUTPUTS} for performance`);
    }
    
    // Performance optimization: Only create new array if session is found
    let updatedSessions = state.sessions;
    let sessionFound = false;
    
    // Use a for loop for better performance with large arrays
    for (let i = 0; i < state.sessions.length; i++) {
      if (state.sessions[i].id === sessionId) {
        const newSession = { ...state.sessions[i], output: trimmedOutputs, jsonMessages: trimmedMessages };
        // Only create new array when we actually find the session to update
        if (!sessionFound) {
          updatedSessions = state.sessions.slice(); // Shallow copy is more efficient than spread
          sessionFound = true;
        }
        updatedSessions[i] = newSession;
        break;
      }
    }
    
    // Also update activeMainRepoSession if it matches
    let updatedActiveMainRepoSession = state.activeMainRepoSession;
    if (state.activeMainRepoSession && state.activeMainRepoSession.id === sessionId) {
      console.log(`[SessionStore] Also updating activeMainRepoSession`);
      updatedActiveMainRepoSession = { ...state.activeMainRepoSession, output: trimmedOutputs, jsonMessages: trimmedMessages };
    }
    
    return {
      ...state,
      sessions: updatedSessions,
      activeMainRepoSession: updatedActiveMainRepoSession
    };
  }),
  
  clearSessionOutput: (sessionId) => set((state) => {
    // Performance: Only clone array if session exists
    let updatedSessions = state.sessions;
    for (let i = 0; i < state.sessions.length; i++) {
      if (state.sessions[i].id === sessionId) {
        updatedSessions = state.sessions.slice();
        updatedSessions[i] = { ...state.sessions[i], output: [], jsonMessages: [] };
        break;
      }
    }
    
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
  
  addTerminalOutput: (output) => set((state) => {
    // Performance optimization: Much stricter limit to prevent memory issues
    const MAX_TERMINAL_LINES = 1000; // Drastically reduced from 5000
    
    const existingOutput = state.terminalOutput[output.sessionId] || [];
    
    // If already at max, remove oldest before adding new
    let updatedOutput: string[];
    if (existingOutput.length >= MAX_TERMINAL_LINES) {
      // Shift array instead of creating new one for better performance
      updatedOutput = existingOutput.slice(-(MAX_TERMINAL_LINES - 1));
      updatedOutput.push(output.data);
    } else {
      updatedOutput = [...existingOutput, output.data];
    }
    
    return {
      terminalOutput: {
        ...state.terminalOutput,
        [output.sessionId]: updatedOutput
      }
    };
  }),

  clearTerminalOutput: (sessionId: string) => set((state) => ({
    terminalOutput: {
      ...state.terminalOutput,
      [sessionId]: []
    }
  })),

  getTerminalOutput: (sessionId) => {
    const state = get();
    return state.terminalOutput[sessionId] || [];
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
      
      // Performance: Only clone sessions array if updates affect sessions
      let sessions = state.sessions;
      let sessionsModified = false;
      
      for (let i = 0; i < state.sessions.length; i++) {
        const newStatus = statusUpdates.get(state.sessions[i].id);
        if (newStatus) {
          if (!sessionsModified) {
            sessions = state.sessions.slice();
            sessionsModified = true;
          }
          sessions[i] = { ...state.sessions[i], gitStatus: newStatus };
        }
      }
      
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
  },
  
  cleanupInactiveSessions: () => set((state) => {
    // Performance: Clear output data for inactive sessions to free memory
    const activeId = state.activeSessionId;
    const MAX_INACTIVE_OUTPUTS = 50; // Even less for inactive sessions
    
    // Create new sessions array with trimmed outputs for inactive sessions
    const cleanedSessions = state.sessions.map(session => {
      if (session.id === activeId) {
        // Don't touch active session
        return session;
      }
      
      // For inactive sessions, aggressively trim outputs
      if (session.output && session.output.length > MAX_INACTIVE_OUTPUTS) {
        return {
          ...session,
          output: session.output.slice(-MAX_INACTIVE_OUTPUTS),
          jsonMessages: session.jsonMessages ? session.jsonMessages.slice(-25) : []
        };
      }
      
      return session;
    });
    
    // Also cleanup terminal outputs for inactive sessions
    const cleanedTerminalOutput: Record<string, string[]> = {};
    Object.keys(state.terminalOutput).forEach(sessionId => {
      if (sessionId === activeId) {
        // Keep active session's terminal output
        cleanedTerminalOutput[sessionId] = state.terminalOutput[sessionId];
      } else if (state.terminalOutput[sessionId].length > 50) {
        // Trim inactive session's terminal output more aggressively
        cleanedTerminalOutput[sessionId] = state.terminalOutput[sessionId].slice(-50);
      } else {
        cleanedTerminalOutput[sessionId] = state.terminalOutput[sessionId];
      }
    });
    
    console.log('[SessionStore] Cleaned up inactive session data');
    
    return {
      sessions: cleanedSessions,
      terminalOutput: cleanedTerminalOutput
    };
  })
}));
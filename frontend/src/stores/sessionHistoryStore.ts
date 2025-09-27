import { create } from 'zustand';

interface SessionHistoryEntry {
  sessionId: string;
  panelId: string;
  timestamp: number;
}

interface SessionHistoryStore {
  history: SessionHistoryEntry[];
  currentIndex: number;
  maxHistorySize: number;
  
  // Add a new entry to history
  addToHistory: (sessionId: string, panelId: string) => void;
  
  // Navigate backwards in history
  navigateBack: () => SessionHistoryEntry | null;
  
  // Navigate forward in history
  navigateForward: () => SessionHistoryEntry | null;
  
  // Get the current entry
  getCurrentEntry: () => SessionHistoryEntry | null;
  
  // Clear history
  clearHistory: () => void;
}

export const useSessionHistoryStore = create<SessionHistoryStore>((set, get) => ({
  history: [],
  currentIndex: -1,
  maxHistorySize: 50,
  
  addToHistory: (sessionId: string, panelId: string) => {
    const state = get();
    const newEntry: SessionHistoryEntry = {
      sessionId,
      panelId,
      timestamp: Date.now()
    };
    
    // Don't add duplicate consecutive entries
    const currentEntry = state.history[state.currentIndex];
    if (currentEntry?.sessionId === sessionId && currentEntry?.panelId === panelId) {
      return;
    }
    
    // If we're not at the end of history, truncate forward history
    const newHistory = state.currentIndex < state.history.length - 1
      ? [...state.history.slice(0, state.currentIndex + 1), newEntry]
      : [...state.history, newEntry];
    
    // Limit history size
    const trimmedHistory = newHistory.slice(-state.maxHistorySize);
    
    set({
      history: trimmedHistory,
      currentIndex: trimmedHistory.length - 1
    });
  },
  
  navigateBack: () => {
    const state = get();
    if (state.currentIndex > 0) {
      const newIndex = state.currentIndex - 1;
      set({ currentIndex: newIndex });
      return state.history[newIndex];
    }
    return null;
  },
  
  navigateForward: () => {
    const state = get();
    if (state.currentIndex < state.history.length - 1) {
      const newIndex = state.currentIndex + 1;
      set({ currentIndex: newIndex });
      return state.history[newIndex];
    }
    return null;
  },
  
  getCurrentEntry: () => {
    const state = get();
    return state.history[state.currentIndex] || null;
  },
  
  clearHistory: () => {
    set({
      history: [],
      currentIndex: -1
    });
  }
}));
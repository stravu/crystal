import { create } from 'zustand';

interface ErrorInfo {
  title?: string;
  error: string;
  details?: string;
  command?: string;
}

interface ErrorStore {
  currentError: ErrorInfo | null;
  showError: (error: ErrorInfo) => void;
  clearError: () => void;
}

export const useErrorStore = create<ErrorStore>((set) => ({
  currentError: null,
  
  showError: (error) => {
    console.error('[ErrorStore] Showing error:', error);
    set({ currentError: error });
  },
  
  clearError: () => {
    set({ currentError: null });
  },
}));
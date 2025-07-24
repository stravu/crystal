import { create } from 'zustand';

interface NavigationStore {
  currentView: 'sessions' | 'project';
  navigateToSessions: () => void;
  navigateToProject: () => void;
}

export const useNavigationStore = create<NavigationStore>((set) => ({
  currentView: 'sessions',
  navigateToSessions: () => set({ currentView: 'sessions' }),
  navigateToProject: () => set({ currentView: 'project' }),
}));
import { create } from 'zustand';

interface NavigationState {
  activeView: 'sessions' | 'dashboard';
  activeProjectId: number | null;
  
  // Actions
  setActiveView: (view: 'sessions' | 'dashboard') => void;
  setActiveProjectId: (projectId: number | null) => void;
  navigateToProjectDashboard: (projectId: number) => void;
  navigateToSessions: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: 'sessions',
  activeProjectId: null,
  
  setActiveView: (view) => set({ activeView: view }),
  
  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
  
  navigateToProjectDashboard: (projectId) => set({ 
    activeView: 'dashboard', 
    activeProjectId: projectId 
  }),
  
  navigateToSessions: () => set({ 
    activeView: 'sessions',
    activeProjectId: null 
  }),
}));
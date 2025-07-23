import { create } from 'zustand';

interface NavigationState {
  activeView: 'sessions' | 'project';
  activeProjectId: number | null;
  
  // Actions
  setActiveView: (view: 'sessions' | 'project') => void;
  setActiveProjectId: (projectId: number | null) => void;
  navigateToProject: (projectId: number) => void;
  navigateToSessions: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeView: 'sessions',
  activeProjectId: null,
  
  setActiveView: (view) => set({ activeView: view }),
  
  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),
  
  navigateToProject: (projectId) => set({ 
    activeView: 'project', 
    activeProjectId: projectId 
  }),
  
  navigateToSessions: () => set({ 
    activeView: 'sessions',
    activeProjectId: null 
  }),
}));
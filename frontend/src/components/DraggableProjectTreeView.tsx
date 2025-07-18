import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder as FolderIcon, FolderOpen, Plus, Settings, GripVertical, Archive } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useErrorStore } from '../stores/errorStore';
import { SessionListItem } from './SessionListItem';
import { CreateSessionDialog } from './CreateSessionDialog';
import { MainBranchWarningDialog } from './MainBranchWarningDialog';
import ProjectSettings from './ProjectSettings';
import { EmptyState } from './EmptyState';
import { LoadingSpinner } from './LoadingSpinner';
import { API } from '../utils/api';
import { debounce } from '../utils/debounce';
import type { Session } from '../types/session';
import type { Project } from '../types/project';
import type { Folder } from '../types/folder';

interface ProjectWithSessions extends Project {
  sessions: Session[];
  folders: Folder[];
}

interface DragState {
  type: 'project' | 'session' | 'folder' | null;
  projectId: number | null;
  sessionId: string | null;
  folderId: string | null;
  overType: 'project' | 'session' | 'folder' | null;
  overProjectId: number | null;
  overSessionId: string | null;
  overFolderId: string | null;
}

export function DraggableProjectTreeView() {
  const [projectsWithSessions, setProjectsWithSessions] = useState<ProjectWithSessions[]>([]);
  const [archivedProjectsWithSessions, setArchivedProjectsWithSessions] = useState<ProjectWithSessions[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedArchivedProjects, setExpandedArchivedProjects] = useState<Set<number>>(new Set());
  const [showArchivedSessions, setShowArchivedSessions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingArchived, setIsLoadingArchived] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedProjectForCreate, setSelectedProjectForCreate] = useState<Project | null>(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<Project | null>(null);
  const [showAddProjectDialog, setShowAddProjectDialog] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', path: '', buildScript: '', runScript: '' });
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const [showMainBranchWarning, setShowMainBranchWarning] = useState(false);
  const [pendingMainBranchProject, setPendingMainBranchProject] = useState<Project | null>(null);
  const [detectedMainBranch, setDetectedMainBranch] = useState<string>('main');
  const [detectedBranchForNewProject, setDetectedBranchForNewProject] = useState<string | null>(null);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [selectedProjectForFolder, setSelectedProjectForFolder] = useState<Project | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const { showError } = useErrorStore();
  
  // Drag state
  const [dragState, setDragState] = useState<DragState>({
    type: null,
    projectId: null,
    sessionId: null,
    folderId: null,
    overType: null,
    overProjectId: null,
    overSessionId: null,
    overFolderId: null
  });
  const dragCounter = useRef(0);

  // Create debounced save function
  const saveUIState = useCallback(
    debounce(async (projectIds: number[], folderIds: string[]) => {
      try {
        await window.electronAPI?.uiState?.saveExpanded(projectIds, folderIds);
      } catch (error) {
        console.error('[DraggableProjectTreeView] Failed to save UI state:', error);
      }
    }, 500),
    []
  );

  // Save UI state whenever expanded state changes
  useEffect(() => {
    const projectIds = Array.from(expandedProjects);
    const folderIds = Array.from(expandedFolders);
    saveUIState(projectIds, folderIds);
  }, [expandedProjects, expandedFolders, saveUIState]);

  const handleFolderCreated = (folder: Folder) => {
    // Add the folder to the appropriate project
    setProjectsWithSessions(prevProjects => {
      
      const updatedProjects = prevProjects.map(project => {
        if (project.id === folder.projectId) {
          const updatedProject = {
            ...project,
            folders: [...(project.folders || []), folder]
          };
          return updatedProject;
        }
        return project;
      });
      
      return updatedProjects;
    });
    
    // Auto-expand the folder when it's created
    setExpandedFolders(prev => {
      const newSet = new Set([...prev, folder.id]);
      return newSet;
    });
    
    // Also auto-expand the project that contains the new folder
    if (folder.projectId) {
      setExpandedProjects(prev => {
        const newSet = new Set([...prev, folder.projectId]);
        return newSet;
      });
    }
  };

  useEffect(() => {
    loadProjectsWithSessions();
    
    // Set up event listeners for session updates with targeted updates
    const handleSessionCreated = (newSession: Session) => {
      
      if (!newSession.projectId) {
        console.warn('[DraggableProjectTreeView] Session created without projectId, reloading all');
        loadProjectsWithSessions();
        return;
      }
      
      // Check if this session belongs to a folder that might not exist yet
      if (newSession.folderId) {
        const project = projectsWithSessions.find(p => p.id === newSession.projectId);
        const folderExists = project?.folders?.some(f => f.id === newSession.folderId);
        
        if (!folderExists) {
          // Reload to get the folder that might have been created
          loadProjectsWithSessions();
          return;
        }
      }
      
      // Add the new session to the appropriate project without reloading everything
      setProjectsWithSessions(prevProjects => {
        const updatedProjects = prevProjects.map(project => {
          if (project.id === newSession.projectId) {
            // Add the new session to this project
            const updatedProject = {
              ...project,
              sessions: [...project.sessions, newSession]
            };
            return updatedProject;
          }
          return project;
        });
        
        // If no project was found, log a warning
        if (!updatedProjects.some(p => p.id === newSession.projectId)) {
          console.warn('[DraggableProjectTreeView] No matching project found for session projectId:', newSession.projectId);
        }
        
        return updatedProjects;
      });
      
      // Auto-expand the project that contains the new session
      if (newSession.projectId) {
        setExpandedProjects(prev => new Set([...prev, newSession.projectId!]));
      }
      
      // If the session has a folderId, auto-expand that folder too
      if (newSession.folderId) {
        setExpandedFolders(prev => new Set([...prev, newSession.folderId!]));
      }
    };
    
    const handleSessionUpdated = (updatedSession: Session) => {
      
      // Update only the specific session that changed
      setProjectsWithSessions(prevProjects => 
        prevProjects.map(project => {
          // Find the project that contains this session
          const sessionIndex = project.sessions.findIndex(s => s.id === updatedSession.id);
          if (sessionIndex !== -1) {
            // Update the session in this project by merging the updates
            const updatedSessions = [...project.sessions];
            // Merge the updated fields with the existing session to preserve all data
            updatedSessions[sessionIndex] = {
              ...updatedSessions[sessionIndex],
              ...updatedSession
            };
            return {
              ...project,
              sessions: updatedSessions
            };
          }
          return project;
        })
      );
    };
    
    const handleSessionDeleted = (deletedSession: Session) => {
      // Remove the deleted session from the appropriate project without reloading everything
      setProjectsWithSessions(prevProjects => 
        prevProjects.map(project => {
          const sessionIndex = project.sessions.findIndex(s => s.id === deletedSession.id);
          if (sessionIndex !== -1) {
            // Remove the session from this project
            const updatedSessions = project.sessions.filter(s => s.id !== deletedSession.id);
            return {
              ...project,
              sessions: updatedSessions
            };
          }
          return project;
        })
      );
    };
    
    // Listen for IPC events
    if (window.electronAPI?.events) {
      const unsubscribeCreated = window.electronAPI.events.onSessionCreated(handleSessionCreated);
      const unsubscribeUpdated = window.electronAPI.events.onSessionUpdated(handleSessionUpdated);
      const unsubscribeDeleted = window.electronAPI.events.onSessionDeleted(handleSessionDeleted);
      const unsubscribeFolderCreated = window.electronAPI.events.onFolderCreated(handleFolderCreated);
      
      // Listen for project updates
      const unsubscribeProjectUpdated = window.electronAPI.events.onProjectUpdated((updatedProject: Project) => {
        
        // Update the project in our state
        setProjectsWithSessions(prevProjects => 
          prevProjects.map(project => {
            if (project.id === updatedProject.id) {
              // Merge the updated project data while preserving sessions and folders
              return {
                ...project,
                ...updatedProject,
                sessions: project.sessions,
                folders: project.folders
              };
            }
            return project;
          })
        );
      });
      
      return () => {
        unsubscribeCreated();
        unsubscribeUpdated();
        unsubscribeDeleted();
        unsubscribeFolderCreated();
        unsubscribeProjectUpdated();
      };
    }
  }, []);

  const loadProjectsWithSessions = async () => {
    try {
      setIsLoading(true);
      const response = await API.sessions.getAllWithProjects();
      if (response.success && response.data) {
        
        setProjectsWithSessions(response.data);
        
        // Try to load saved UI state
        let savedState = null;
        try {
          const stateResponse = await window.electronAPI?.uiState?.getExpanded();
          if (stateResponse?.success && stateResponse.data) {
            savedState = stateResponse.data;
          }
        } catch (error) {
          console.error('[DraggableProjectTreeView] Failed to load saved UI state:', error);
        }
        
        if (savedState && savedState.expandedProjects && savedState.expandedFolders) {
          // Use saved state
          setExpandedProjects(new Set(savedState.expandedProjects));
          setExpandedFolders(new Set(savedState.expandedFolders));
        } else {
          // Fall back to auto-expand logic
          const projectsToExpand = new Set<number>();
          const foldersToExpand = new Set<string>();
          
          response.data.forEach((project: ProjectWithSessions) => {
            if (project.sessions.length > 0) {
              projectsToExpand.add(project.id);
            }
            
            // Auto-expand folders that contain sessions
            if (project.folders && project.folders.length > 0) {
              project.folders.forEach(folder => {
                const folderHasSessions = project.sessions.some(s => s.folderId === folder.id);
                if (folderHasSessions) {
                  foldersToExpand.add(folder.id);
                }
              });
            }
          });
          
          // Also expand the project containing the active session
          if (activeSessionId) {
            response.data.forEach((project: ProjectWithSessions) => {
              if (project.sessions.some(s => s.id === activeSessionId)) {
                projectsToExpand.add(project.id);
              }
            });
          }
          
          setExpandedProjects(projectsToExpand);
          setExpandedFolders(foldersToExpand);
        }
      }
    } catch (error) {
      console.error('Failed to load projects with sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadArchivedSessions = async () => {
    try {
      setIsLoadingArchived(true);
      const response = await API.sessions.getArchivedWithProjects();
      if (response.success && response.data) {
        setArchivedProjectsWithSessions(response.data);
      }
    } catch (error) {
      console.error('Failed to load archived sessions:', error);
      showError({
        title: 'Failed to load archived sessions',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsLoadingArchived(false);
    }
  };

  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const toggleArchivedProject = (projectId: number) => {
    setExpandedArchivedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const toggleArchivedSessions = useCallback(
    debounce(() => {
      setShowArchivedSessions(prev => {
        const newShowArchived = !prev;
        
        // Load archived sessions when first expanding
        if (newShowArchived && archivedProjectsWithSessions.length === 0 && !isLoadingArchived) {
          loadArchivedSessions();
        }
        
        return newShowArchived;
      });
    }, 300),
    [archivedProjectsWithSessions.length, isLoadingArchived]
  );


  const handleDeleteFolder = async (folder: Folder, projectId: number) => {
    // Check if folder has sessions
    const project = projectsWithSessions.find(p => p.id === projectId);
    if (!project) return;
    
    const folderSessions = project.sessions.filter(s => s.folderId === folder.id);
    
    // Show confirmation dialog
    const message = folderSessions.length > 0
      ? `Delete folder "${folder.name}" and permanently delete ${folderSessions.length} session${folderSessions.length > 1 ? 's' : ''} inside it? This action cannot be undone.`
      : `Delete empty folder "${folder.name}"?`;
    
    const confirmed = window.confirm(message);
    
    if (confirmed) {
      try {
        // First, delete all sessions in the folder
        if (folderSessions.length > 0) {
          console.log(`Deleting ${folderSessions.length} sessions in folder "${folder.name}"`);
          
          // Mark all sessions as deleting to prevent individual delete operations
          const sessionIds = folderSessions.map(s => s.id);
          useSessionStore.getState().setDeletingSessionIds(sessionIds);
          
          // Delete each session
          for (const session of folderSessions) {
            try {
              const sessionResponse = await API.sessions.delete(session.id);
              if (!sessionResponse.success) {
                throw new Error(`Failed to delete session "${session.name}": ${sessionResponse.error}`);
              }
              console.log(`Deleted session: ${session.name}`);
            } catch (error: any) {
              console.error(`Error deleting session ${session.name}:`, error);
              showError({
                title: `Failed to delete session "${session.name}"`,
                error: error.message || 'Unknown error occurred'
              });
              // Clear deleting state and stop the operation if a session fails to delete
              useSessionStore.getState().clearDeletingSessionIds();
              return;
            }
          }
          
          // Update local state to remove deleted sessions
          setProjectsWithSessions(prev => prev.map(p => {
            if (p.id === projectId) {
              const updatedSessions = p.sessions.filter(s => !folderSessions.some(fs => fs.id === s.id));
              return { ...p, sessions: updatedSessions };
            }
            return p;
          }));
          
          // Clear active session if it was one of the deleted sessions
          const activeSessionId = useSessionStore.getState().activeSessionId;
          if (activeSessionId && folderSessions.some(s => s.id === activeSessionId)) {
            useSessionStore.getState().setActiveSession(null);
          }
        }
        
        // Then delete the folder
        console.log(`Deleting folder: ${folder.name}`);
        const response = await API.folders.delete(folder.id);
        if (response.success) {
          // Update local state to remove the folder
          setProjectsWithSessions(prev => prev.map(p => {
            if (p.id === projectId) {
              const updatedFolders = p.folders?.filter(f => f.id !== folder.id) || [];
              return { ...p, folders: updatedFolders };
            }
            return p;
          }));
          
          // Remove from expanded folders set
          setExpandedFolders(prev => {
            const newSet = new Set(prev);
            newSet.delete(folder.id);
            return newSet;
          });
          
          console.log(`Successfully deleted folder "${folder.name}" and ${folderSessions.length} sessions`);
          
          // Clear deleting state after successful deletion
          useSessionStore.getState().clearDeletingSessionIds();
        } else {
          showError({
            title: 'Failed to delete folder',
            error: response.error || 'Unknown error occurred'
          });
        }
      } catch (error: any) {
        console.error('Failed to delete folder:', error);
        showError({
          title: 'Failed to delete folder',
          error: error.message || 'Unknown error occurred'
        });
        // Clear deleting state in case of error
        useSessionStore.getState().clearDeletingSessionIds();
      }
    }
  };

  const handleProjectClick = async (project: Project) => {
    // Check if we should show the warning
    const warningKey = `mainBranchWarning_${project.id}`;
    const hasShownWarning = localStorage.getItem(warningKey);
    
    if (!hasShownWarning) {
      // Fetch the current branch before showing warning
      try {
        const response = await window.electronAPI.git.detectBranch(project.path);
        if (response.success && response.data) {
          setDetectedMainBranch(response.data);
        } else {
          setDetectedMainBranch('main');
        }
      } catch (error) {
        console.error('Failed to detect branch:', error);
        setDetectedMainBranch('main');
      }
      
      // Show warning dialog
      setPendingMainBranchProject(project);
      setShowMainBranchWarning(true);
    } else {
      // Proceed directly
      await openMainRepoSession(project);
    }
  };
  
  const openMainRepoSession = async (project: Project) => {
    try {
      // Get or create the main repo session
      const response = await API.sessions.getOrCreateMainRepoSession(project.id);
      
      if (response.success && response.data) {
        // Navigate to the main repo session
        const session = response.data;
        useSessionStore.getState().setActiveSession(session.id);
        
        // Don't expand the project - main repo sessions are accessed via folder click only
      } else {
        showError({
          title: 'Failed to open main repository session',
          error: response.error || 'Unknown error occurred'
        });
      }
    } catch (error: any) {
      console.error('Error handling project click:', error);
      showError({
        title: 'Failed to open main repository session',
        error: error.message || 'Unknown error occurred'
      });
    }
  };

  const handleCreateSession = (project: Project) => {
    // Just show the dialog for any project
    setSelectedProjectForCreate(project);
    setShowCreateDialog(true);
  };

  const detectCurrentBranch = async (path: string) => {
    if (!path) return;
    
    try {
      const response = await API.projects.detectBranch(path);
      if (response.success && response.data) {
        setDetectedBranchForNewProject(response.data);
      }
    } catch (error) {
      console.log('Could not detect branch');
      setDetectedBranchForNewProject(null);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name || !newProject.path) return;

    try {
      const response = await API.projects.create(newProject);

      if (!response.success) {
        showError({
          title: 'Failed to Create Project',
          error: response.error || 'An error occurred while creating the project.',
          details: response.details,
          command: response.command
        });
        return;
      }

      setShowAddProjectDialog(false);
      setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
      
      // Add the new project to the list without reloading everything
      const newProjectWithSessions = { ...response.data, sessions: [], folders: [] };
      setProjectsWithSessions(prev => [...prev, newProjectWithSessions]);
    } catch (error: any) {
      console.error('Failed to create project:', error);
      showError({
        title: 'Failed to Create Project',
        error: error.message || 'An error occurred while creating the project.',
        details: error.stack || error.toString()
      });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName || !selectedProjectForFolder) return;

    try {
      const response = await API.folders.create(newFolderName, selectedProjectForFolder.id);

      if (response.success && response.data) {
        // Update the project with the new folder
        setProjectsWithSessions(prev => prev.map(project => {
          if (project.id === selectedProjectForFolder.id) {
            const updatedProject = {
              ...project,
              folders: [...(project.folders || []), response.data]
            };
            return updatedProject;
          }
          return project;
        }));

        // Close dialog and reset
        setShowCreateFolderDialog(false);
        setNewFolderName('');
        setSelectedProjectForFolder(null);
      } else {
        showError({
          title: 'Failed to Create Folder',
          error: response.error || 'Unknown error occurred'
        });
      }
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      showError({
        title: 'Failed to Create Folder',
        error: error.message || 'Unknown error occurred'
      });
    }
  };

  // Drag and drop handlers
  const handleProjectDragStart = (e: React.DragEvent, project: Project) => {
    e.stopPropagation();
    setDragState({
      type: 'project',
      projectId: project.id,
      sessionId: null,
      folderId: null,
      overType: null,
      overProjectId: null,
      overSessionId: null,
      overFolderId: null
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'project', id: project.id }));
  };

  const handleSessionDragStart = (e: React.DragEvent, session: Session, projectId: number) => {
    e.stopPropagation();
    setDragState({
      type: 'session',
      projectId: projectId,
      sessionId: session.id,
      folderId: null,
      overType: null,
      overProjectId: null,
      overSessionId: null,
      overFolderId: null
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'session', id: session.id, projectId }));
  };

  const handleFolderDragStart = (e: React.DragEvent, folder: Folder, projectId: number) => {
    e.stopPropagation();
    setDragState({
      type: 'folder',
      projectId: projectId,
      sessionId: null,
      folderId: folder.id,
      overType: null,
      overProjectId: null,
      overSessionId: null,
      overFolderId: null
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'folder', id: folder.id, projectId }));
  };

  const handleDragEnd = () => {
    setDragState({
      type: null,
      projectId: null,
      sessionId: null,
      folderId: null,
      overType: null,
      overProjectId: null,
      overSessionId: null,
      overFolderId: null
    });
    dragCounter.current = 0;
  };

  const handleProjectDragOver = (e: React.DragEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragState.type === 'project' && dragState.projectId !== project.id) {
      setDragState(prev => ({
        ...prev,
        overType: 'project',
        overProjectId: project.id,
        overSessionId: null,
        overFolderId: null
      }));
    } else if (dragState.type === 'session') {
      // Allow sessions to be dropped on projects (to move out of folders)
      setDragState(prev => ({
        ...prev,
        overType: 'project',
        overProjectId: project.id,
        overSessionId: null,
        overFolderId: null
      }));
    } else if (dragState.type === 'folder' && dragState.projectId === project.id) {
      // Allow folders to be reordered within the same project
      setDragState(prev => ({
        ...prev,
        overType: 'project',
        overProjectId: project.id,
        overSessionId: null,
        overFolderId: null
      }));
    }
  };

  const handleSessionDragOver = (e: React.DragEvent, session: Session, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow session reordering within the same project
    if (dragState.type === 'session' && 
        dragState.projectId === projectId && 
        dragState.sessionId !== session.id) {
      setDragState(prev => ({
        ...prev,
        overType: 'session',
        overProjectId: projectId,
        overSessionId: session.id
      }));
    }
  };

  const handleProjectDrop = async (e: React.DragEvent, targetProject: Project) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragState.type === 'project' && dragState.projectId && dragState.projectId !== targetProject.id) {
      // Reorder projects
      const sourceIndex = projectsWithSessions.findIndex(p => p.id === dragState.projectId);
      const targetIndex = projectsWithSessions.findIndex(p => p.id === targetProject.id);
      
      if (sourceIndex !== -1 && targetIndex !== -1) {
        const newProjects = [...projectsWithSessions];
        const [removed] = newProjects.splice(sourceIndex, 1);
        newProjects.splice(targetIndex, 0, removed);
        
        // Update display order for all projects
        const projectOrders = newProjects.map((project, index) => ({
          id: project.id,
          displayOrder: index
        }));
        
        try {
          const response = await API.projects.reorder(projectOrders);
          if (response.success) {
            setProjectsWithSessions(newProjects);
          } else {
            showError({
              title: 'Failed to reorder projects',
              error: response.error || 'Unknown error occurred'
            });
          }
        } catch (error: any) {
          console.error('Failed to reorder projects:', error);
          showError({
            title: 'Failed to reorder projects',
            error: error.message || 'Unknown error occurred'
          });
        }
      }
    } else if (dragState.type === 'session' && dragState.sessionId) {
      // Handle session drop on project (move out of folder)
      await handleProjectDropForSession(e, targetProject);
      return;
    }
    
    handleDragEnd();
  };

  const handleSessionDrop = async (e: React.DragEvent, targetSession: Session, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragState.type === 'session' && 
        dragState.sessionId && 
        dragState.projectId === projectId && 
        dragState.sessionId !== targetSession.id) {
      // Reorder sessions within the same project
      const project = projectsWithSessions.find(p => p.id === projectId);
      if (!project) return;
      
      const sourceIndex = project.sessions.findIndex(s => s.id === dragState.sessionId);
      const targetIndex = project.sessions.findIndex(s => s.id === targetSession.id);
      
      if (sourceIndex !== -1 && targetIndex !== -1) {
        const newSessions = [...project.sessions];
        const [removed] = newSessions.splice(sourceIndex, 1);
        newSessions.splice(targetIndex, 0, removed);
        
        // Update display order for all sessions in this project
        const sessionOrders = newSessions.map((session, index) => ({
          id: session.id,
          displayOrder: index
        }));
        
        try {
          const response = await API.sessions.reorder(sessionOrders);
          if (response.success) {
            // Update local state
            const newProjects = projectsWithSessions.map(p => 
              p.id === projectId ? { ...p, sessions: newSessions } : p
            );
            setProjectsWithSessions(newProjects);
          } else {
            showError({
              title: 'Failed to reorder sessions',
              error: response.error || 'Unknown error occurred'
            });
          }
        } catch (error: any) {
          console.error('Failed to reorder sessions:', error);
          showError({
            title: 'Failed to reorder sessions',
            error: error.message || 'Unknown error occurred'
          });
        }
      }
    }
    
    handleDragEnd();
  };

  const handleFolderDragOver = (e: React.DragEvent, folder: Folder, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Allow sessions to be dropped into folders
    if (dragState.type === 'session') {
      setDragState(prev => ({
        ...prev,
        overType: 'folder',
        overProjectId: projectId,
        overFolderId: folder.id,
        overSessionId: null
      }));
    } else if (dragState.type === 'folder' && dragState.folderId !== folder.id) {
      // Allow folders to be reordered (but not nested)
      setDragState(prev => ({
        ...prev,
        overType: 'folder',
        overProjectId: projectId,
        overFolderId: folder.id,
        overSessionId: null
      }));
    }
  };

  const handleFolderDrop = async (e: React.DragEvent, folder: Folder, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragState.type === 'session' && dragState.sessionId) {
      // Move session into folder
      try {
        const response = await API.folders.moveSession(dragState.sessionId, folder.id);
        if (response.success) {
          // Update local state
          setProjectsWithSessions(prev => prev.map(project => {
            if (project.id === projectId) {
              const updatedSessions = project.sessions.map(session => 
                session.id === dragState.sessionId 
                  ? { ...session, folderId: folder.id }
                  : session
              );
              return { ...project, sessions: updatedSessions };
            }
            return project;
          }));
          
          // Auto-expand the folder to show the moved session
          setExpandedFolders(prev => new Set([...prev, folder.id]));
        } else {
          showError({
            title: 'Failed to move session',
            error: response.error || 'Unknown error occurred'
          });
        }
      } catch (error: any) {
        console.error('Failed to move session:', error);
        showError({
          title: 'Failed to move session',
          error: error.message || 'Unknown error occurred'
        });
      }
    } else if (dragState.type === 'folder' && dragState.folderId && dragState.folderId !== folder.id) {
      // Reorder folders
      try {
        const project = projectsWithSessions.find(p => p.id === projectId);
        if (project && project.folders) {
          const draggedFolder = project.folders.find(f => f.id === dragState.folderId);
          if (draggedFolder) {
            // Calculate new order
            const folders = [...project.folders].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
            const dragIndex = folders.findIndex(f => f.id === dragState.folderId);
            const dropIndex = folders.findIndex(f => f.id === folder.id);
            
            if (dragIndex !== -1 && dropIndex !== -1) {
              // Remove dragged folder and insert at new position
              const [removed] = folders.splice(dragIndex, 1);
              folders.splice(dropIndex, 0, removed);
              
              // Update display orders
              const folderIds = folders.map(f => f.id);
              const response = await API.folders.reorder(projectId, folderIds);
              
              if (response.success) {
                // Update local state
                setProjectsWithSessions(prev => prev.map(p => {
                  if (p.id === projectId) {
                    const updatedFolders = folders.map((f, index) => ({
                      ...f,
                      displayOrder: index
                    }));
                    return { ...p, folders: updatedFolders };
                  }
                  return p;
                }));
              } else {
                showError({
                  title: 'Failed to reorder folders',
                  error: response.error || 'Unknown error occurred'
                });
              }
            }
          }
        }
      } catch (error: any) {
        console.error('Failed to reorder folders:', error);
        showError({
          title: 'Failed to reorder folders',
          error: error.message || 'Unknown error occurred'
        });
      }
    }
    
    handleDragEnd();
  };

  const handleProjectDropForSession = async (e: React.DragEvent, _targetProject: Project) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragState.type === 'session' && dragState.sessionId) {
      // Move session out of folder (set folderId to null)
      try {
        const response = await API.folders.moveSession(dragState.sessionId, null);
        if (response.success) {
          // Update local state
          setProjectsWithSessions(prev => prev.map(project => {
            const sessionIndex = project.sessions.findIndex(s => s.id === dragState.sessionId);
            if (sessionIndex !== -1) {
              const updatedSessions = [...project.sessions];
              updatedSessions[sessionIndex] = { ...updatedSessions[sessionIndex], folderId: undefined };
              return { ...project, sessions: updatedSessions };
            }
            return project;
          }));
        } else {
          showError({
            title: 'Failed to move session',
            error: response.error || 'Unknown error occurred'
          });
        }
      } catch (error: any) {
        console.error('Failed to move session:', error);
        showError({
          title: 'Failed to move session',
          error: error.message || 'Unknown error occurred'
        });
      }
    }
    
    handleDragEnd();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragState(prev => ({
        ...prev,
        overType: null,
        overProjectId: null,
        overSessionId: null,
        overFolderId: null
      }));
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner text="Loading projects..." size="small" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1 px-2 pb-2">
        {projectsWithSessions.length === 0 ? (
          <EmptyState
            icon={FolderIcon}
            title="No Projects Yet"
            description="Add your first project to start managing Claude Code sessions."
            action={{
              label: 'Add Project',
              onClick: () => setShowAddProjectDialog(true)
            }}
            className="py-8"
          />
        ) : (
          <>
            {projectsWithSessions.map((project) => {
          const isExpanded = expandedProjects.has(project.id);
          const sessionCount = project.sessions.length;
          const isDraggingOver = dragState.overType === 'project' && dragState.overProjectId === project.id;
          
          return (
            <div key={project.id}>
              <div 
                className={`group flex items-center space-x-1 px-2 py-1.5 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  isDraggingOver ? 'bg-blue-100 dark:bg-blue-900' : ''
                }`}
                draggable
                onDragStart={(e) => handleProjectDragStart(e, project)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleProjectDragOver(e, project)}
                onDrop={(e) => handleProjectDrop(e, project)}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
              >
                <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-move">
                  <GripVertical className="w-3 h-3 text-gray-400" />
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProject(project.id);
                  }}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  disabled={sessionCount === 0}
                >
                  {sessionCount > 0 ? (
                    isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                    )
                  ) : (
                    <div className="w-3 h-3" />
                  )}
                </button>
                
                <div 
                  className="flex items-center space-x-2 flex-1 min-w-0"
                  onClick={() => handleProjectClick(project)}
                >
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  ) : (
                    <FolderIcon className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate text-left">
                    {project.name}
                  </span>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateSession(project);
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors opacity-100"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Session</span>
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProjectForSettings(project);
                    setShowProjectSettings(true);
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Project settings"
                >
                  <Settings className="w-3 h-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200" />
                </button>
              </div>
              
              {isExpanded && (sessionCount > 0 || (project.folders && project.folders.length > 0)) && (
                <div className="mt-1 space-y-1">
                  {/* Render folders */}
                  {project.folders && project.folders
                    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                    .map((folder) => {
                      const isExpanded = expandedFolders.has(folder.id);
                      const folderSessions = project.sessions.filter(s => s.folderId === folder.id);
                      const isDraggingOverFolder = dragState.overType === 'folder' && 
                                                   dragState.overFolderId === folder.id;
                      
                      return (
                        <div key={folder.id} className="ml-4">
                          <div 
                            className={`group/folder flex items-center space-x-1 px-2 py-1 rounded cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                              isDraggingOverFolder ? 'bg-blue-100 dark:bg-blue-900' : ''
                            }`}
                            draggable
                            onDragStart={(e) => handleFolderDragStart(e, folder, project.id)}
                            onDragOver={(e) => handleFolderDragOver(e, folder, project.id)}
                            onDrop={(e) => handleFolderDrop(e, folder, project.id)}
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                          >
                            <div className="opacity-0 group-hover/folder:opacity-100 transition-opacity cursor-move">
                              <GripVertical className="w-3 h-3 text-gray-400" />
                            </div>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFolder(folder.id);
                              }}
                              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                              disabled={folderSessions.length === 0}
                            >
                              {folderSessions.length > 0 ? (
                                isExpanded ? (
                                  <ChevronDown className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                                )
                              ) : (
                                <div className="w-3 h-3" />
                              )}
                            </button>
                            
                            <div className="flex items-center space-x-2 flex-1 min-w-0">
                              {isExpanded ? (
                                <FolderOpen className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                              ) : (
                                <FolderIcon className="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
                              )}
                              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                                {folder.name}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-500">
                                ({folderSessions.length})
                              </span>
                            </div>
                            
                            {/* Delete folder button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFolder(folder, project.id);
                              }}
                              className="opacity-0 group-hover/folder:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 dark:hover:bg-red-600/20"
                              title="Delete folder"
                            >
                              <span className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">🗑️</span>
                            </button>
                          </div>
                          
                          {isExpanded && folderSessions.length > 0 && (
                            <div className="ml-4 mt-1 space-y-1">
                              {folderSessions
                                .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                                .map((session) => {
                                  const isDraggingOverSession = dragState.overType === 'session' && 
                                                               dragState.overSessionId === session.id &&
                                                               dragState.overProjectId === project.id;
                                  
                                  return (
                                    <div
                                      key={session.id}
                                      className={`group flex items-center ${
                                        isDraggingOverSession ? 'bg-blue-100 dark:bg-blue-900 rounded' : ''
                                      }`}
                                      draggable
                                      onDragStart={(e) => handleSessionDragStart(e, session, project.id)}
                                      onDragEnd={handleDragEnd}
                                      onDragOver={(e) => handleSessionDragOver(e, session, project.id)}
                                      onDrop={(e) => handleSessionDrop(e, session, project.id)}
                                      onDragEnter={handleDragEnter}
                                      onDragLeave={handleDragLeave}
                                    >
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-move pl-1">
                                        <GripVertical className="w-3 h-3 text-gray-400" />
                                      </div>
                                      <SessionListItem 
                                        key={session.id} 
                                        session={session}
                                        isNested
                                      />
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  
                  {/* Render sessions without folders */}
                  <div className="ml-4">
                    {project.sessions
                      .filter(s => !s.folderId)
                      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                      .map((session) => {
                        const isDraggingOverSession = dragState.overType === 'session' && 
                                                     dragState.overSessionId === session.id &&
                                                     dragState.overProjectId === project.id;
                        
                        return (
                          <div
                            key={session.id}
                            className={`group flex items-center ${
                              isDraggingOverSession ? 'bg-blue-100 dark:bg-blue-900 rounded' : ''
                            }`}
                            draggable
                            onDragStart={(e) => handleSessionDragStart(e, session, project.id)}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => handleSessionDragOver(e, session, project.id)}
                            onDrop={(e) => handleSessionDrop(e, session, project.id)}
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                          >
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-move pl-1">
                              <GripVertical className="w-3 h-3 text-gray-400" />
                            </div>
                            <SessionListItem 
                              key={session.id} 
                              session={session}
                              isNested
                            />
                          </div>
                        );
                      })}
                  </div>
                  
                  {/* Add folder button */}
                  <div className="ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectForFolder(project);
                        setShowCreateFolderDialog(true);
                        setNewFolderName('');
                      }}
                      className="w-full px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Folder</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        
            <button
              onClick={() => setShowAddProjectDialog(true)}
              className="w-full mt-2 px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </>
        )}
        
        {/* Archived Sessions Section */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={toggleArchivedSessions}
            className="w-full flex items-center space-x-2 px-2 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            {showArchivedSessions ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <Archive className="w-4 h-4" />
            <span>Archived Sessions</span>
          </button>
          
          {showArchivedSessions && (
            <div className="mt-2 space-y-1">
              {isLoadingArchived ? (
                <div className="flex items-center justify-center py-4">
                  <LoadingSpinner text="Loading archived sessions..." size="small" />
                </div>
              ) : archivedProjectsWithSessions.length === 0 ? (
                <div className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No archived sessions
                </div>
              ) : (
                archivedProjectsWithSessions.map((project) => {
                  const isExpanded = expandedArchivedProjects.has(project.id);
                  const sessionCount = project.sessions.length;
                  
                  return (
                    <div key={`archived-${project.id}`} className="ml-2">
                      <div className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleArchivedProject(project.id);
                          }}
                          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                          )}
                        </button>
                        
                        <FolderIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400 flex-1 text-left">
                          {project.name} ({sessionCount})
                        </span>
                      </div>
                      
                      {isExpanded && (
                        <div className="ml-6 mt-1 space-y-1">
                          {project.sessions.map((session) => (
                            <div
                              key={session.id}
                              className="cursor-pointer"
                              onClick={() => useSessionStore.getState().setActiveSession(session.id)}
                            >
                              <SessionListItem 
                                session={session}
                                isNested
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateDialog && (
        <CreateSessionDialog
          isOpen={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            setSelectedProjectForCreate(null);
          }}
          projectName={selectedProjectForCreate?.name}
          projectId={selectedProjectForCreate?.id}
        />
      )}
      
      {selectedProjectForSettings && (
        <ProjectSettings
          project={selectedProjectForSettings}
          isOpen={showProjectSettings}
          onClose={() => {
            setShowProjectSettings(false);
            setSelectedProjectForSettings(null);
          }}
          onUpdate={() => {
            // Project updates don't affect sessions, so we can just refresh projects
            // This is still a refresh but limited to project data only
            loadProjectsWithSessions();
          }}
          onDelete={() => {
            // Remove the deleted project from the list without reloading
            if (selectedProjectForSettings) {
              setProjectsWithSessions(prev => 
                prev.filter(p => p.id !== selectedProjectForSettings.id)
              );
            }
          }}
        />
      )}
      
      {/* Add Project Dialog */}
      {showAddProjectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200 mb-4">Add New Project</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="My Project"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Repository Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProject.path}
                    onChange={(e) => {
                      setNewProject({ ...newProject, path: e.target.value });
                      detectCurrentBranch(e.target.value);
                    }}
                    className="flex-1 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                    placeholder="/path/to/repository"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await API.dialog.openDirectory({
                        title: 'Select Repository Directory',
                        buttonLabel: 'Select',
                      });
                      if (result.success && result.data) {
                        setNewProject({ ...newProject, path: result.data });
                        detectCurrentBranch(result.data);
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Current Branch <span className="text-gray-500">(Auto-detected)</span>
                </label>
                <div className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200">
                  {detectedBranchForNewProject || (newProject.path ? 'Detecting...' : 'Select a repository path first')}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  The main branch is automatically detected from the repository. This will be used for git operations.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Build Script <span className="text-gray-500 dark:text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newProject.buildScript}
                  onChange={(e) => setNewProject({ ...newProject, buildScript: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="e.g., pnpm build or npm run build"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This script will run automatically before each Claude Code session starts.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Run Script <span className="text-gray-500 dark:text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newProject.runScript}
                  onChange={(e) => setNewProject({ ...newProject, runScript: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="e.g., pnpm dev or npm start"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This script can be run manually from the Terminal view during sessions.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddProjectDialog(false);
                  setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProject.name || !newProject.path}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Project
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Branch Warning Dialog */}
      {pendingMainBranchProject && (
        <MainBranchWarningDialog
          isOpen={showMainBranchWarning}
          onClose={() => {
            setShowMainBranchWarning(false);
            setPendingMainBranchProject(null);
          }}
          onContinue={() => {
            setShowMainBranchWarning(false);
            if (pendingMainBranchProject) {
              openMainRepoSession(pendingMainBranchProject);
            }
            setPendingMainBranchProject(null);
          }}
          projectName={pendingMainBranchProject.name}
          projectId={pendingMainBranchProject.id}
          mainBranch={detectedMainBranch}
        />
      )}
      
      {/* Create Folder Dialog */}
      {showCreateFolderDialog && selectedProjectForFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-96 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200 mb-4">
              Create Folder in {selectedProjectForFolder.name}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="My Folder"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFolderName.trim()) {
                      handleCreateFolder();
                    }
                  }}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateFolderDialog(false);
                  setNewFolderName('');
                  setSelectedProjectForFolder(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
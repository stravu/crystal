import { useState, useEffect, memo, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Settings } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';
import { useErrorStore } from '../stores/errorStore';
import { SessionListItem } from './SessionListItem';
import { CreateSessionDialog } from './CreateSessionDialog';
import { MainBranchWarningDialog } from './MainBranchWarningDialog';
import ProjectSettings from './ProjectSettings';
import { EmptyState } from './EmptyState';
import { LoadingSpinner } from './LoadingSpinner';
import { API } from '../utils/api';
import type { Session } from '../types/session';
import type { Project } from '../types/project';

interface ProjectWithSessions extends Project {
  sessions: Session[];
}

// Memoized project item component
const ProjectItem = memo(function ProjectItem({
  project,
  isExpanded,
  onToggle,
  onCreateSession,
  onSettings,
  children
}: {
  project: ProjectWithSessions;
  isExpanded: boolean;
  onToggle: () => void;
  onCreateSession: () => void;
  onSettings: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md group">
        <button
          onClick={onToggle}
          className="flex items-center space-x-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors flex-1 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          ) : (
            <Folder className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          )}
          <span className="text-sm font-medium ml-1">{project.name}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
            ({project.sessions.length} session{project.sessions.length !== 1 ? 's' : ''})
          </span>
        </button>
        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={onCreateSession}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            title="Create new session"
          >
            <Plus className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={onSettings}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            title="Project settings"
          >
            <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="ml-6 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
});

export function ProjectTreeView() {
  const [projectsWithSessions, setProjectsWithSessions] = useState<ProjectWithSessions[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const storesSessions = useSessionStore(state => state.sessions);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedProjectForCreate, setSelectedProjectForCreate] = useState<Project | null>(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<Project | null>(null);
  const [showAddProjectDialog, setShowAddProjectDialog] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', path: '', buildScript: '', runScript: '' });
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);
  const activeSessionId = useSessionStore((state) => state.activeSessionId);
  const [showMainBranchWarning, setShowMainBranchWarning] = useState(false);
  const [pendingMainBranchProject, setPendingMainBranchProject] = useState<Project | null>(null);
  const [detectedBranchForNewProject, setDetectedBranchForNewProject] = useState<string | null>(null);
  const { showError } = useErrorStore();

  useEffect(() => {
    loadProjectsWithSessions();
    
    // Set up event listeners for session updates
    const handleSessionCreated = (newSession: Session) => {
      console.log('[ProjectTreeView] Session created:', newSession.id, 'projectId:', newSession.projectId);
      
      // Add the new session to the appropriate project without reloading everything
      setProjectsWithSessions(prevProjects => {
        const updatedProjects = prevProjects.map(project => {
          if (project.id === newSession.projectId) {
            console.log('[ProjectTreeView] Adding session to project:', project.id, project.name);
            // Add the new session to this project
            return {
              ...project,
              sessions: [...project.sessions, newSession]
            };
          }
          return project;
        });
        
        // If no project was found, log a warning
        if (!updatedProjects.some(p => p.id === newSession.projectId)) {
          console.warn('[ProjectTreeView] No matching project found for session projectId:', newSession.projectId);
          console.log('[ProjectTreeView] Available projects:', prevProjects.map(p => ({ id: p.id, name: p.name })));
        }
        
        return updatedProjects;
      });
      
      // Auto-expand the project that contains the new session
      if (newSession.projectId) {
        setExpandedProjects(prev => new Set([...prev, newSession.projectId!]));
      }
    };
    
    const handleSessionUpdated = (updatedSession: Session) => {
      // Only reload if the create dialog is not open
      // This prevents the dialog from losing state during session updates
      if (!showCreateDialog) {
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
      } else {
        // Mark that we have pending updates to load after dialog closes
        setHasPendingUpdates(true);
      }
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
      
      return () => {
        unsubscribeCreated();
        unsubscribeUpdated();
        unsubscribeDeleted();
      };
    }
  }, [showCreateDialog]);

  // Count of sessions currently loading git status
  const gitStatusLoadingCount = useSessionStore((state) => state.gitStatusLoading.size);
  
  // Performance safeguard: skip non-essential updates during heavy git loading
  const skipNonEssentialUpdates = gitStatusLoadingCount > 5;
  
  // Sync sessions from store with local project state (throttled during heavy loading)
  useEffect(() => {
    // Skip sync during heavy git status loading to prevent UI freezing
    if (skipNonEssentialUpdates) {
      return;
    }
    
    if (storesSessions.length > 0 && projectsWithSessions.length > 0) {
      setProjectsWithSessions(prevProjects => {
        let hasAnyChanges = false;
        const updatedProjects = prevProjects.map(project => {
          // Find all sessions for this project from the store
          const projectSessions = storesSessions.filter(s => s.projectId === project.id);
          
          // Only update if there are differences in essential properties
          const hasChanges = projectSessions.length !== project.sessions.length ||
            projectSessions.some(storeSession => {
              const localSession = project.sessions.find(s => s.id === storeSession.id);
              return !localSession || 
                     localSession.status !== storeSession.status ||
                     localSession.name !== storeSession.name ||
                     localSession.archived !== storeSession.archived;
            });
          
          if (hasChanges) {
            hasAnyChanges = true;
            return {
              ...project,
              sessions: projectSessions
            };
          }
          
          return project;
        });
        
        // Only update state if there were actual changes
        return hasAnyChanges ? updatedProjects : prevProjects;
      });
    }
  }, [storesSessions, skipNonEssentialUpdates]);

  const loadProjectsWithSessions = async () => {
    try {
      setIsLoading(true);
      const response = await API.sessions.getAllWithProjects();
      if (response.success && response.data) {
        setProjectsWithSessions(response.data);
        
        // Auto-expand projects that have sessions
        const projectsToExpand = new Set<number>();
        response.data.forEach((project: ProjectWithSessions) => {
          if (project.sessions.length > 0) {
            projectsToExpand.add(project.id);
          }
        });
        setExpandedProjects(projectsToExpand);
        
        // Also expand the project containing the active session
        if (activeSessionId) {
          response.data.forEach((project: ProjectWithSessions) => {
            if (project.sessions.some(s => s.id === activeSessionId)) {
              projectsToExpand.add(project.id);
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load projects with sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProject = useCallback((projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  }, []);

  // TODO: Implement project click handler for main repo sessions
  // This function would handle clicking on project folders to open main repo sessions
  // Currently commented out as it's not used in the simplified ProjectTreeView
  
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

  const handleCreateSession = useCallback((project: Project) => {
    // Just show the dialog for any project
    setSelectedProjectForCreate(project);
    setShowCreateDialog(true);
  }, []);

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
      
      // Just reload the projects list
      loadProjectsWithSessions();
    } catch (error: any) {
      console.error('Failed to create project:', error);
      showError({
        title: 'Failed to Create Project',
        error: error.message || 'An error occurred while creating the project.',
        details: error.stack || error.toString()
      });
    }
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
            icon={Folder}
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
            {projectsWithSessions.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isExpanded={expandedProjects.has(project.id)}
                onToggle={() => toggleProject(project.id)}
                onCreateSession={() => handleCreateSession(project)}
                onSettings={() => {
                  setSelectedProjectForSettings(project);
                  setShowProjectSettings(true);
                }}
              >
                {project.sessions.map((session) => (
                  <SessionListItem 
                    key={session.id} 
                    session={session}
                    isNested
                  />
                ))}
              </ProjectItem>
            ))}
        
            <button
              onClick={() => setShowAddProjectDialog(true)}
              className="w-full mt-2 px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </>
        )}
      </div>

      {showCreateDialog && (
        <CreateSessionDialog
          isOpen={showCreateDialog}
          onClose={() => {
            setShowCreateDialog(false);
            setSelectedProjectForCreate(null);
            // Reload projects with sessions after closing dialog
            // if there were any pending updates while dialog was open
            if (hasPendingUpdates) {
              loadProjectsWithSessions();
              setHasPendingUpdates(false);
            }
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
            loadProjectsWithSessions();
          }}
          onDelete={() => {
            loadProjectsWithSessions();
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
          mainBranch="main"
        />
      )}
    </>
  );
}
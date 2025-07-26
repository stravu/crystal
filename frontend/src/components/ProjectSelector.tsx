import { useState, useEffect } from 'react';
import { ChevronDown, Plus, Check, Settings } from 'lucide-react';
import { API } from '../utils/api';
import type { Project } from '../types/project';
import ProjectSettings from './ProjectSettings';
import { useErrorStore } from '../stores/errorStore';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button, IconButton } from './ui/Button';
import { EnhancedInput } from './ui/EnhancedInput';
import { FieldWithTooltip } from './ui/FieldWithTooltip';
import { Card } from './ui/Card';
import { Folder, GitBranch, Hammer, Play } from 'lucide-react';

interface ProjectSelectorProps {
  onProjectChange?: (project: Project) => void;
}

export default function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', path: '', buildScript: '', runScript: '' });
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [detectedBranch, setDetectedBranch] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const { showError } = useErrorStore();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await API.projects.getAll();
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch projects');
      }
      const data = response.data;
      setProjects(data);
      
      // Find and set the active project
      const active = data.find((p: Project) => p.active);
      if (active) {
        setActiveProject(active);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  const handleSelectProject = async (project: Project) => {
    try {
      const response = await API.projects.activate(project.id.toString());
      
      if (response.success) {
        setActiveProject(project);
        setIsOpen(false);
        onProjectChange?.(project);
        
        // Update projects list to reflect new active state
        setProjects(projects.map(p => ({
          ...p,
          active: p.id === project.id
        })));
      } else {
        throw new Error(response.error || 'Failed to activate project');
      }
    } catch (error) {
      console.error('Failed to activate project:', error);
    }
  };

  const detectCurrentBranch = async (path: string) => {
    if (!path) return;
    
    try {
      const response = await API.projects.detectBranch(path);
      if (response.success && response.data) {
        setDetectedBranch(response.data);
      }
    } catch (error) {
      console.log('Could not detect branch');
      setDetectedBranch(null);
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

      // Get the created project from the response
      const createdProject = response.data;
      
      setShowAddDialog(false);
      setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
      setDetectedBranch(null);
      
      // Auto-open the newly created project
      if (createdProject) {
        await handleSelectProject(createdProject);
      } else {
        fetchProjects();
      }
    } catch (error: any) {
      console.error('Failed to create project:', error);
      showError({
        title: 'Failed to Create Project',
        error: error.message || 'An error occurred while creating the project.',
        details: error.stack || error.toString()
      });
    }
  };

  const handleSettingsClick = (project: Project) => {
    setSettingsProject(project);
    setShowSettings(true);
    setIsOpen(false);
  };

  const handleProjectUpdated = () => {
    // Since ProjectSettings already updated the project on the backend,
    // we need to refresh to get the updated data
    fetchProjects();
  };

  const handleProjectDeleted = () => {
    // Remove the deleted project from the list without refetching
    setProjects(prev => prev.filter(p => p.id !== settingsProject?.id));
    
    if (settingsProject?.id === activeProject?.id) {
      // If the deleted project was active, clear it
      setActiveProject(null);
    }
  };

  return (
    <>
      <div className="relative">
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => setIsOpen(!isOpen)}
            variant="secondary"
            size="md"
            className="flex-1 justify-between"
          >
            <span>
              {activeProject ? activeProject.name : 'Select Project'}
            </span>
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
          {activeProject && (
            <IconButton
              onClick={() => handleSettingsClick(activeProject)}
              aria-label="Project Settings"
              size="md"
              icon={<Settings className="w-4 h-4" />}
            />
          )}
        </div>

        {isOpen && (
          <Card 
            variant="elevated" 
            className="absolute top-full left-0 mt-1 w-64 z-50"
            padding="none"
          >
            <div className="p-1">
              {projects.map(project => (
                <div
                  key={project.id}
                  className="flex items-center hover:bg-bg-hover rounded-md group"
                >
                  <button
                    onClick={() => handleSelectProject(project)}
                    className="flex-1 text-left px-3 py-2 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary">{project.name}</div>
                      <div className="text-xs text-text-tertiary truncate">{project.path}</div>
                    </div>
                    {project.active && (
                      <Check className="w-4 h-4 text-status-success ml-2 flex-shrink-0" />
                    )}
                  </button>
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSettingsClick(project);
                    }}
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Project Settings"
                    icon={<Settings className="w-4 h-4" />}
                  />
                </div>
              ))}
              
              <div className="border-t border-border-primary mt-2 pt-2">
                <Button
                  onClick={() => {
                    setIsOpen(false);
                    setShowAddDialog(true);
                  }}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Project
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Add Project Dialog */}
      <Modal 
        isOpen={showAddDialog} 
        onClose={() => {
          setShowAddDialog(false);
          setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
          setDetectedBranch(null);
          setShowValidationErrors(false);
        }}
        size="lg"
      >
        <ModalHeader title="Add New Project" icon={<Plus className="w-5 h-5" />} />
        <ModalBody>
            <div className="space-y-8">
              {/* Project Info Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 pb-2 border-b border-border-primary">
                  <Folder className="w-5 h-5 text-interactive" />
                  <h3 className="text-heading-3 font-semibold text-text-primary">Project Information</h3>
                </div>
                
                <FieldWithTooltip
                  label="Project Name"
                  tooltip="A descriptive name for your project that will appear in the project selector."
                  required
                >
                  <EnhancedInput
                    type="text"
                    value={newProject.name}
                    onChange={(e) => {
                      setNewProject({ ...newProject, name: e.target.value });
                      if (showValidationErrors) setShowValidationErrors(false);
                    }}
                    placeholder="Enter project name"
                    size="lg"
                    fullWidth
                    required
                    showRequiredIndicator={showValidationErrors}
                  />
                </FieldWithTooltip>

                <FieldWithTooltip
                  label="Repository Path"
                  tooltip="Path to your git repository. This is where Crystal will create worktrees for parallel development."
                  required
                >
                  <div className="space-y-3">
                    <EnhancedInput
                      type="text"
                      value={newProject.path}
                      onChange={(e) => {
                        setNewProject({ ...newProject, path: e.target.value });
                        detectCurrentBranch(e.target.value);
                        if (showValidationErrors) setShowValidationErrors(false);
                      }}
                      placeholder="/path/to/your/repository"
                      size="lg"
                      fullWidth
                      required
                      showRequiredIndicator={showValidationErrors}
                    />
                    <div className="flex justify-end">
                      <Button
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
                        variant="secondary"
                        size="sm"
                      >
                        Browse
                      </Button>
                    </div>
                  </div>
                </FieldWithTooltip>
              </div>

              {/* Git Info Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 pb-2 border-b border-border-primary">
                  <GitBranch className="w-5 h-5 text-interactive" />
                  <h3 className="text-heading-3 font-semibold text-text-primary">Git Information</h3>
                </div>
                
                <FieldWithTooltip
                  label="Main Branch"
                  tooltip="The main branch of your repository. Crystal will automatically detect this from your git configuration."
                >
                  <Card variant="bordered" padding="md" className="text-text-secondary bg-surface-secondary">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4" />
                      <span className="font-mono">
                        {detectedBranch || (newProject.path ? 'Detecting...' : 'Select a repository path first')}
                      </span>
                    </div>
                  </Card>
                </FieldWithTooltip>
              </div>

              {/* Optional Scripts Section */}
              <div className="space-y-6">
                <div className="flex items-center gap-2 pb-2 border-b border-border-primary">
                  <Play className="w-5 h-5 text-interactive" />
                  <h3 className="text-heading-3 font-semibold text-text-primary">Optional Scripts</h3>
                </div>
                
                <FieldWithTooltip
                  label="Build Script"
                  tooltip="Command to build your project. This runs automatically before each Claude Code session starts."
                >
                  <EnhancedInput
                    type="text"
                    value={newProject.buildScript}
                    onChange={(e) => setNewProject({ ...newProject, buildScript: e.target.value })}
                    placeholder="pnpm build"
                    size="lg"
                    fullWidth
                    icon={<Hammer className="w-4 h-4" />}
                  />
                </FieldWithTooltip>

                <FieldWithTooltip
                  label="Run Script"
                  tooltip="Command to start your development server. You can run this manually from the Terminal view during sessions."
                >
                  <EnhancedInput
                    type="text"
                    value={newProject.runScript}
                    onChange={(e) => setNewProject({ ...newProject, runScript: e.target.value })}
                    placeholder="pnpm dev"
                    size="lg"
                    fullWidth
                    icon={<Play className="w-4 h-4" />}
                  />
                </FieldWithTooltip>
              </div>
            </div>

        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => {
              setShowAddDialog(false);
              setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
              setDetectedBranch(null);
              setShowValidationErrors(false);
            }}
            variant="ghost"
            size="md"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!newProject.name || !newProject.path) {
                setShowValidationErrors(true);
                return;
              }
              handleCreateProject();
            }}
            disabled={!newProject.name || !newProject.path}
            variant="primary"
            size="md"
            className={(!newProject.name || !newProject.path) ? 'border-status-error border-2' : ''}
          >
            Create Project
          </Button>
        </ModalFooter>
      </Modal>

      {/* Project Settings Dialog */}
      {settingsProject && (
        <ProjectSettings
          project={settingsProject}
          isOpen={showSettings}
          onClose={() => {
            setShowSettings(false);
            setSettingsProject(null);
          }}
          onUpdate={handleProjectUpdated}
          onDelete={handleProjectDeleted}
        />
      )}
    </>
  );
}
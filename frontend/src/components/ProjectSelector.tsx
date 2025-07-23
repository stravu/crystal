import { useState, useEffect } from 'react';
import { ChevronDown, Plus, Check, Settings } from 'lucide-react';
import { API } from '../utils/api';
import type { Project } from '../types/project';
import ProjectSettings from './ProjectSettings';
import { useErrorStore } from '../stores/errorStore';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button, IconButton } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';

interface ProjectSelectorProps {
  onProjectChange?: (project: Project) => void;
}

export default function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', path: '', buildScript: '', runScript: '' });
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
        }}
        size="md"
      >
        <ModalHeader>Add New Project</ModalHeader>
        <ModalBody>
            
            <div className="space-y-4">
              <Input
                label="Project Name"
                type="text"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                placeholder="My Project"
                fullWidth
              />

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Repository Path
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={newProject.path}
                    onChange={(e) => {
                      setNewProject({ ...newProject, path: e.target.value });
                      detectCurrentBranch(e.target.value);
                    }}
                    placeholder="/path/to/repository"
                    className="flex-1"
                  />
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
                    size="md"
                  >
                    Browse
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Current Branch <span className="text-text-tertiary">(Auto-detected)</span>
                </label>
                <Card variant="bordered" padding="sm" className="text-text-secondary">
                  {detectedBranch || (newProject.path ? 'Detecting...' : 'Select a repository path first')}
                </Card>
                <p className="text-xs text-text-tertiary mt-1">
                  The main branch is automatically detected from the repository. This will be used for git operations.
                </p>
              </div>

              <Input
                label="Build Script"
                type="text"
                value={newProject.buildScript}
                onChange={(e) => setNewProject({ ...newProject, buildScript: e.target.value })}
                placeholder="e.g., pnpm build or npm run build"
                helperText="This script will run automatically before each Claude Code session starts."
                fullWidth
              />

              <Input
                label="Run Script"
                type="text"
                value={newProject.runScript}
                onChange={(e) => setNewProject({ ...newProject, runScript: e.target.value })}
                placeholder="e.g., pnpm dev or npm start"
                helperText="This script can be run manually from the Terminal view during sessions."
                fullWidth
              />
            </div>

        </ModalBody>
        <ModalFooter className="flex justify-end gap-3">
          <Button
            onClick={() => {
              setShowAddDialog(false);
              setNewProject({ name: '', path: '', buildScript: '', runScript: '' });
              setDetectedBranch(null);
            }}
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateProject}
            disabled={!newProject.name || !newProject.path}
          >
            Add Project
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
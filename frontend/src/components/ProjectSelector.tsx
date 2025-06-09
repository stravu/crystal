import { useState, useEffect } from 'react';
import { ChevronDown, Plus, Check, Settings } from 'lucide-react';
import { API } from '../utils/api';
import type { Project } from '../types/project';
import ProjectSettings from './ProjectSettings';

interface ProjectSelectorProps {
  onProjectChange?: (project: Project) => void;
}

export default function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', path: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

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

  const handleCreateProject = async () => {
    if (!newProject.name || !newProject.path) return;

    try {
      const response = await API.projects.create(newProject);

      if (response.success) {
        setShowAddDialog(false);
        setNewProject({ name: '', path: '' });
        fetchProjects();
      } else {
        throw new Error(response.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleSettingsClick = (project: Project) => {
    setSettingsProject(project);
    setShowSettings(true);
    setIsOpen(false);
  };

  const handleProjectDeleted = () => {
    fetchProjects();
    if (settingsProject?.id === activeProject?.id) {
      // If the deleted project was active, clear it
      setActiveProject(null);
    }
  };

  return (
    <>
      <div className="relative">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex-1 flex items-center space-x-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-sm transition-colors"
          >
            <span className="text-gray-300">
              {activeProject ? activeProject.name : 'Select Project'}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          {activeProject && (
            <button
              onClick={() => handleSettingsClick(activeProject)}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
              title="Project Settings"
            >
              <Settings className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-gray-800 rounded-md shadow-lg border border-gray-700 z-50">
            <div className="p-2">
              {projects.map(project => (
                <div
                  key={project.id}
                  className="flex items-center hover:bg-gray-700 rounded group"
                >
                  <button
                    onClick={() => handleSelectProject(project)}
                    className="flex-1 text-left px-3 py-2 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-200">{project.name}</div>
                      <div className="text-xs text-gray-500 truncate">{project.path}</div>
                    </div>
                    {project.active && (
                      <Check className="w-4 h-4 text-green-500 ml-2 flex-shrink-0" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSettingsClick(project);
                    }}
                    className="p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Project Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-400 hover:text-gray-200" />
                  </button>
                </div>
              ))}
              
              <div className="border-t border-gray-700 mt-2 pt-2">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setShowAddDialog(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 flex items-center space-x-2 text-sm"
                >
                  <Plus className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-300">Add Project</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Project Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Add New Project</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500"
                  placeholder="My Project"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Repository Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProject.path}
                    onChange={(e) => setNewProject({ ...newProject, path: e.target.value })}
                    className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500"
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
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowAddDialog(false);
                  setNewProject({ name: '', path: '' });
                }}
                className="px-4 py-2 text-gray-300 hover:text-gray-100 transition-colors"
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

      {/* Project Settings Dialog */}
      {settingsProject && (
        <ProjectSettings
          project={settingsProject}
          isOpen={showSettings}
          onClose={() => {
            setShowSettings(false);
            setSettingsProject(null);
          }}
          onUpdate={fetchProjects}
          onDelete={handleProjectDeleted}
        />
      )}
    </>
  );
}
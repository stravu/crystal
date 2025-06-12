import { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { API } from '../utils/api';
import type { Project } from '../types/project';

interface ProjectSettingsProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export default function ProjectSettings({ project, isOpen, onClose, onUpdate, onDelete }: ProjectSettingsProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [runScript, setRunScript] = useState('');
  const [buildScript, setBuildScript] = useState('');
  const [mainBranch, setMainBranch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && project) {
      setName(project.name);
      setPath(project.path);
      setSystemPrompt(project.system_prompt || '');
      setRunScript(project.run_script || '');
      setBuildScript(project.build_script || '');
      setMainBranch(project.main_branch || '');
      setError(null);
    }
  }, [isOpen, project]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await API.projects.update(project.id.toString(), {
        name,
        path,
        system_prompt: systemPrompt || null,
        run_script: runScript || null,
        build_script: buildScript || null,
        main_branch: mainBranch || null
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to update project');
      }

      onUpdate();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await API.projects.delete(project.id.toString());

      if (!response.success) {
        throw new Error(response.error || 'Failed to delete project');
      }

      onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-gray-200">Project Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900 bg-opacity-50 border border-red-700 rounded-md text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-200 mb-4">Basic Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
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
                          setPath(result.data);
                        }
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      Browse
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    The local path to the git repository for this project
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Main Branch
                  </label>
                  <input
                    type="text"
                    value={mainBranch}
                    onChange={(e) => setMainBranch(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500"
                    placeholder="main"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The main branch name for git operations (e.g., main, master, develop)
                  </p>
                </div>
              </div>
            </div>

            {/* Project-Specific Settings */}
            <div>
              <h3 className="text-lg font-medium text-gray-200 mb-4">Project-Specific Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Project System Prompt
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-sm"
                    placeholder="Enter project-specific instructions for Claude..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    This prompt will be appended to the global system prompt for all sessions in this project
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Build Script
                  </label>
                  <textarea
                    value={buildScript}
                    onChange={(e) => setBuildScript(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-sm"
                    placeholder="npm install&#10;npm run build"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Commands to run once when creating a new worktree (e.g., install dependencies, build assets).
                    One command per line. These run in the worktree directory before Claude starts.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Run Commands
                  </label>
                  <textarea
                    value={runScript}
                    onChange={(e) => setRunScript(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-sm"
                    placeholder="npm run dev&#10;npm test --watch"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Commands to run continuously while Claude is working (e.g., dev server, test watcher).
                    One command per line. Commands run sequentially - each must complete successfully before the next starts.
                    All commands are automatically stopped when the session ends. Output appears in the Terminal tab.
                    <br />
                    <span className="text-gray-600">Tip: To run multiple servers together, use a process manager like concurrently:</span>
                    <br />
                    <span className="font-mono text-gray-600">• npx concurrently "npm:server" "npm:client"</span>
                    <br />
                    <span className="font-mono text-gray-600">• npm run dev (if your package.json uses concurrently)</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="text-lg font-medium text-red-400 mb-4">Danger Zone</h3>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Project</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">
                    Are you sure you want to delete this project? This action cannot be undone.
                  </p>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                    >
                      Yes, Delete Project
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name || !path}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
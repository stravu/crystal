import { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && project) {
      setName(project.name);
      setPath(project.path);
      setSystemPrompt(project.system_prompt || '');
      setRunScript(project.run_script || '');
      setError(null);
    }
  }, [isOpen, project]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          path,
          system_prompt: systemPrompt || null,
          run_script: runScript || null
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update project');
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
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete project');
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
                  <input
                    type="text"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500"
                    placeholder="/path/to/repository"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The local path to the git repository for this project
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
                    Run Script Commands
                  </label>
                  <textarea
                    value={runScript}
                    onChange={(e) => setRunScript(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500 font-mono text-sm"
                    placeholder="npm run dev&#10;npm test"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Commands to run in this project (one per line)
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
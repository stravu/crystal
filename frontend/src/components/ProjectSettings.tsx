import { useState, useEffect } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { API } from '../utils/api';
import type { Project } from '../types/project';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { Button } from './ui/Button';

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
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [openIdeCommand, setOpenIdeCommand] = useState('');
  const [worktreeFolder, setWorktreeFolder] = useState('');
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
      // Fetch the current branch when dialog opens
      if (project.path) {
        window.electronAPI.git.detectBranch(project.path).then((result) => {
          if (result.success && result.data) {
            setCurrentBranch(result.data);
          }
        });
      }
      setOpenIdeCommand(project.open_ide_command || '');
      setWorktreeFolder(project.worktree_folder || '');
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
        open_ide_command: openIdeCommand || null,
        worktree_folder: worktreeFolder || null
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalHeader title="Project Settings" onClose={onClose} />

      <ModalBody>
          {error && (
            <div className="mb-4 p-3 bg-status-error/10 border border-status-error/30 rounded-md text-status-error">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-text-primary mb-4">Basic Information</h3>
              <div className="space-y-4">
                <div>
                  <Input
                    label="Project Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Project"
                  />
                </div>

                <div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Repository Path
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/path/to/repository"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={async () => {
                          const result = await API.dialog.openDirectory({
                            title: 'Select Repository Directory',
                            buttonLabel: 'Select',
                          });
                          if (result.success && result.data) {
                            setPath(result.data);
                          }
                        }}
                      >
                        Browse
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      The local path to the git repository for this project
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Current Branch (Auto-detected)
                  </label>
                  <div className="w-full px-3 py-2 bg-surface-secondary border border-border-primary rounded-md text-text-primary">
                    {currentBranch || 'Detecting...'}
                  </div>
                  <p className="mt-1 text-xs text-text-tertiary">
                    This is the currently checked out branch in the project directory
                  </p>
                </div>


                <div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Worktree Folder
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={worktreeFolder}
                        onChange={(e) => setWorktreeFolder(e.target.value)}
                        placeholder="worktrees (default)"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={async () => {
                          const result = await API.dialog.openDirectory({
                            title: 'Select Worktree Directory',
                            buttonLabel: 'Select',
                          });
                          if (result.success && result.data) {
                            setWorktreeFolder(result.data);
                          }
                        }}
                      >
                        Browse
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      The folder where git worktrees will be created. Can be a relative path (e.g., "worktrees") or an absolute path.
                      Leave empty to use the default "worktrees" folder inside the project directory.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Project-Specific Settings */}
            <div>
              <h3 className="text-lg font-medium text-text-primary mb-4">Project-Specific Settings</h3>
              <div className="space-y-4">
                <div>
                  <Textarea
                    label="Project System Prompt"
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={6}
                    placeholder="Enter project-specific instructions for Claude..."
                    className="font-mono text-sm"
                    description="This prompt will be appended to the global system prompt for all sessions in this project"
                  />
                </div>

                <div>
                  <Textarea
                    label="Build Script"
                    value={buildScript}
                    onChange={(e) => setBuildScript(e.target.value)}
                    rows={3}
                    placeholder="npm install&#10;npm run build"
                    className="font-mono text-sm"
                    description="Commands to run once when creating a new worktree (e.g., install dependencies, build assets). One command per line. These run in the worktree directory before Claude starts."
                  />
                </div>

                <div>
                  <div>
                    <Textarea
                      label="Run Commands"
                      value={runScript}
                      onChange={(e) => setRunScript(e.target.value)}
                      rows={4}
                      placeholder="npm run dev&#10;npm test --watch"
                      className="font-mono text-sm"
                    />
                    <p className="mt-1 text-xs text-text-tertiary">
                      Commands to run continuously while Claude is working (e.g., dev server, test watcher).
                      One command per line. Commands run sequentially - each must complete successfully before the next starts.
                      All commands are automatically stopped when the session ends. Output appears in the Terminal tab.
                      <br />
                      <span className="text-text-secondary">Tip: To run multiple servers together, use a process manager like concurrently:</span>
                      <br />
                      <span className="font-mono text-text-secondary">• npx concurrently "npm:server" "npm:client"</span>
                      <br />
                      <span className="font-mono text-text-secondary">• npm run dev (if your package.json uses concurrently)</span>
                    </p>
                  </div>
                </div>

                <div>
                  <Input
                    label="Open IDE Command"
                    value={openIdeCommand}
                    onChange={(e) => setOpenIdeCommand(e.target.value)}
                    placeholder='code .'
                    className="font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-text-tertiary">
                    Command to open the worktree in your IDE. The command will be executed in the worktree directory.
                    <br />
                    <span className="text-text-secondary font-semibold">Common Examples:</span>
                    <br />
                    <span className="font-mono text-text-secondary">• code . </span><span className="text-text-tertiary">(VS Code)</span>
                    <br />
                    <span className="font-mono text-text-secondary">• cursor . </span><span className="text-text-tertiary">(Cursor)</span>
                    <br />
                    <span className="font-mono text-text-secondary">• subl . </span><span className="text-text-tertiary">(Sublime Text)</span>
                    <br />
                    <span className="font-mono text-text-secondary">• idea . </span><span className="text-text-tertiary">(IntelliJ IDEA)</span>
                    <br />
                    <span className="font-mono text-text-secondary">• open -a "PyCharm" . </span><span className="text-text-tertiary">(PyCharm on macOS)</span>
                    <br />
                    <br />
                    <span className="text-text-secondary font-semibold">Troubleshooting:</span>
                    <br />
                    <span className="text-text-tertiary">• If the command is not found, use the full path (e.g., </span><span className="font-mono text-text-secondary">/usr/local/bin/code .</span><span className="text-text-tertiary">)</span>
                    <br />
                    <span className="text-text-tertiary">• For VS Code and Cursor, install the shell command from the Command Palette:</span>
                    <br />
                    <span className="text-text-tertiary ml-2">→ VS Code: "Shell Command: Install 'code' command in PATH"</span>
                    <br />
                    <span className="text-text-tertiary ml-2">→ Cursor: "Shell Command: Install 'cursor' command in PATH"</span>
                    <br />
                    <span className="text-text-tertiary">• The command runs with your shell's environment, inheriting your PATH</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="border-t border-border-primary pt-6">
              <h3 className="text-lg font-medium text-status-error mb-4">Danger Zone</h3>
              {!showDeleteConfirm ? (
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Delete Project
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">
                    Are you sure you want to delete this project? This action cannot be undone.
                  </p>
                  <div className="flex space-x-3">
                    <Button
                      onClick={handleDelete}
                      variant="danger"
                    >
                      Yes, Delete Project
                    </Button>
                    <Button
                      onClick={() => setShowDeleteConfirm(false)}
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
      </ModalBody>

      <ModalFooter>
        <Button
          onClick={onClose}
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving || !name || !path}
          variant="primary"
          icon={<Save className="w-4 h-4" />}
          loading={isSaving}
          loadingText="Saving..."
        >
          Save Changes
        </Button>
      </ModalFooter>
    </Modal>
  );
}
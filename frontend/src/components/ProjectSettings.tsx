import { useState, useEffect } from 'react';
import { Save, Trash2, FolderIcon, GitBranch, Settings, Code2, BrainCircuit } from 'lucide-react';
import { API } from '../utils/api';
import type { Project } from '../types/project';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Input, Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { EnhancedInput } from './ui/EnhancedInput';
import { FieldWithTooltip } from './ui/FieldWithTooltip';
import { Card } from './ui/Card';

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
      <ModalHeader 
        title="Project Settings" 
        icon={<Settings className="w-5 h-5" />}
        onClose={onClose}
      >
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={isSaving || !name || !path}
            variant="primary"
            size="sm"
            icon={<Save className="w-4 h-4" />}
            loading={isSaving}
            loadingText="Saving..."
          >
            Save Changes
          </Button>
        </div>
      </ModalHeader>

      <ModalBody>
        {error && (
          <div className="mb-6 p-4 bg-status-error/10 border border-status-error/30 rounded-lg text-status-error">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {/* Project Overview */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-border-primary">
              <FolderIcon className="w-5 h-5 text-interactive" />
              <div>
                <h3 className="text-heading-3 font-semibold text-text-primary">Project Overview</h3>
                <p className="text-sm text-text-tertiary">Basic project information and repository details</p>
              </div>
            </div>
            
            <FieldWithTooltip
              label="Project Name"
              tooltip="Display name for this project in Crystal's interface."
            >
              <EnhancedInput
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                size="lg"
                fullWidth
              />
            </FieldWithTooltip>

            <FieldWithTooltip
              label="Repository Path"
              tooltip="Local path to the git repository where Crystal will manage worktrees."
            >
              <div className="space-y-3">
                <EnhancedInput
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/path/to/your/repository"
                  size="lg"
                  fullWidth
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
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
              </div>
            </FieldWithTooltip>

            <FieldWithTooltip
              label="Current Branch"
              tooltip="The currently checked out branch in your repository. This is auto-detected."
            >
              <Card variant="bordered" padding="md" className="bg-surface-secondary">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-text-tertiary" />
                  <span className="font-mono text-text-primary">
                    {currentBranch || 'Detecting...'}
                  </span>
                  <span className="ml-auto px-2 py-1 text-xs bg-surface-tertiary text-text-tertiary rounded">
                    Auto-detected
                  </span>
                </div>
              </Card>
            </FieldWithTooltip>
          </div>

          {/* Worktree Configuration */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-border-primary">
              <GitBranch className="w-5 h-5 text-interactive" />
              <div>
                <h3 className="text-heading-3 font-semibold text-text-primary">Worktree Configuration</h3>
                <p className="text-sm text-text-tertiary">Settings for git worktree creation and management</p>
              </div>
            </div>

            <FieldWithTooltip
              label="Worktree Folder"
              tooltip="Directory where git worktrees will be created. Can be relative to the project or an absolute path."
            >
              <div className="space-y-3">
                <EnhancedInput
                  type="text"
                  value={worktreeFolder}
                  onChange={(e) => setWorktreeFolder(e.target.value)}
                  placeholder="worktrees"
                  size="lg"
                  fullWidth
                />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs bg-surface-tertiary text-text-tertiary rounded">
                      Default: worktrees/
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
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
              </div>
            </FieldWithTooltip>
          </div>

          {/* Session Behavior */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-border-primary">
              <Code2 className="w-5 h-5 text-interactive" />
              <div>
                <h3 className="text-heading-3 font-semibold text-text-primary">Session Behavior</h3>
                <p className="text-sm text-text-tertiary">Commands and scripts that run during Claude sessions</p>
              </div>
            </div>

            <FieldWithTooltip
              label="Open IDE Command"
              tooltip="Command to open the worktree in your IDE. The command will be executed in the worktree directory."
            >
              <Input
                value={openIdeCommand}
                onChange={(e) => setOpenIdeCommand(e.target.value)}
                placeholder='code .'
                className="font-mono text-sm"
              />
              <p className="mt-1 text-xs text-text-tertiary">
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
            </FieldWithTooltip>

            <FieldWithTooltip
              label="Build Script"
              tooltip="Commands that run once when creating a new worktree. Use for setup tasks like installing dependencies."
            >
              <Card variant="bordered" padding="sm" className="bg-surface-secondary/50">
                <Textarea
                  value={buildScript}
                  onChange={(e) => setBuildScript(e.target.value)}
                  rows={4}
                  placeholder="npm install"
                  className="font-mono text-sm bg-transparent border-0 p-3 focus:ring-0 resize-none"
                  fullWidth
                />
              </Card>
            </FieldWithTooltip>

            <FieldWithTooltip
              label="Run Commands"
              tooltip="Commands that run continuously during sessions. Perfect for development servers and test watchers."
            >
              <Card variant="bordered" padding="sm" className="bg-surface-secondary/50">
                <Textarea
                  value={runScript}
                  onChange={(e) => setRunScript(e.target.value)}
                  rows={4}
                  placeholder="npm run dev"
                  className="font-mono text-sm bg-transparent border-0 p-3 focus:ring-0 resize-none"
                  fullWidth
                />
              </Card>
            </FieldWithTooltip>

          </div>

          {/* AI Prompt Customization */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-border-primary">
              <BrainCircuit className="w-5 h-5 text-interactive" />
              <div>
                <h3 className="text-heading-3 font-semibold text-text-primary">AI Prompt Customization</h3>
                <p className="text-sm text-text-tertiary">Project-specific instructions that enhance Claude's understanding</p>
              </div>
            </div>

            <FieldWithTooltip
              label="Project System Prompt"
              tooltip="Custom instructions that will be added to every Claude session for this project. Use this to provide context about your codebase, coding standards, or preferred approaches."
            >
              <Card variant="bordered" padding="sm" className="bg-surface-secondary/50">
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                  placeholder="This project uses TypeScript and follows strict ESLint rules..."
                  className="font-mono text-sm bg-transparent border-0 p-3 focus:ring-0 resize-none"
                  fullWidth
                />
              </Card>
            </FieldWithTooltip>
          </div>

          {/* Danger Zone */}
          <div className="border-t border-status-error/20 pt-6">
            <div className="flex items-center gap-2 pb-3 border-b border-status-error/20">
              <Trash2 className="w-5 h-5 text-status-error" />
              <div>
                <h3 className="text-heading-3 font-semibold text-status-error">Danger Zone</h3>
                <p className="text-sm text-text-tertiary">Irreversible actions for this project</p>
              </div>
            </div>
            
            <div className="mt-4">
              {!showDeleteConfirm ? (
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Delete Project
                </Button>
              ) : (
                <div className="space-y-4">
                  <Card variant="bordered" padding="md" className="bg-status-error/5 border-status-error/20">
                    <p className="text-sm text-text-secondary mb-3">
                      Are you sure you want to delete this project? This action cannot be undone and will remove all project data from Crystal.
                    </p>
                    <div className="flex space-x-3">
                      <Button
                        onClick={handleDelete}
                        variant="danger"
                        size="sm"
                      >
                        Yes, Delete Project
                      </Button>
                      <Button
                        onClick={() => setShowDeleteConfirm(false)}
                        variant="secondary"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button
          onClick={onClose}
          variant="ghost"
          size="md"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving || !name || !path}
          variant="primary"
          size="md"
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
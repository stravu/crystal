import React, { useState, useEffect } from 'react';
import { API } from '../utils/api';
import type { CreateSessionRequest } from '../types/session';
import { useErrorStore } from '../stores/errorStore';
import { Shield, ShieldOff, Sparkles, GitBranch, ChevronRight, ChevronDown, Zap, Brain, Target } from 'lucide-react';
import FilePathAutocomplete from './FilePathAutocomplete';
import { CommitModeSettings } from './CommitModeSettings';
import type { CommitModeSettings as CommitModeSettingsType } from '../../../shared/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Checkbox } from './ui/Input';
import { Card } from './ui/Card';

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  projectId?: number;
}

export function CreateSessionDialog({ isOpen, onClose, projectName, projectId }: CreateSessionDialogProps) {
  const [formData, setFormData] = useState<CreateSessionRequest>({
    prompt: '',
    worktreeTemplate: '',
    count: 1,
    permissionMode: 'ignore',
    model: 'claude-sonnet-4-20250514' // Default to Sonnet 4
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [branches, setBranches] = useState<Array<{ name: string; isCurrent: boolean; hasWorktree: boolean }>>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [ultrathink, setUltrathink] = useState(false);
  const [autoCommit, setAutoCommit] = useState(true); // Default to true - kept for backwards compatibility
  const [commitModeSettings, setCommitModeSettings] = useState<CommitModeSettingsType>({ 
    mode: 'checkpoint',
    checkpointPrefix: 'checkpoint: '
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { showError } = useErrorStore();
  
  // Fetch project details to get last used model
  useEffect(() => {
    if (isOpen && projectId) {
      API.projects.getAll().then(response => {
        if (response.success && response.data) {
          const project = response.data.find((p: any) => p.id === projectId);
          if (project && project.lastUsedModel) {
            setFormData(prev => ({
              ...prev,
              model: project.lastUsedModel
            }));
          }
        }
      }).catch((err: any) => {
        console.error('Failed to fetch projects:', err);
      });
    }
  }, [isOpen, projectId]);
  
  useEffect(() => {
    if (isOpen) {
      // Fetch the default permission mode and check for API key when dialog opens
      API.config.get().then(response => {
        if (response.success) {
          if (response.data?.defaultPermissionMode) {
            setFormData(prev => ({
              ...prev,
              permissionMode: response.data.defaultPermissionMode
            }));
          }
          // Check if API key exists
          setHasApiKey(!!response.data?.anthropicApiKey);
        }
      }).catch((err: any) => {
        console.error('Failed to fetch config:', err);
      });
      
      // Fetch branches if projectId is provided
      if (projectId) {
        setIsLoadingBranches(true);
        // First get the project to get its path
        API.projects.getAll().then(projectsResponse => {
          if (!projectsResponse.success || !projectsResponse.data) {
            throw new Error('Failed to fetch projects');
          }
          const project = projectsResponse.data.find((p: any) => p.id === projectId);
          if (!project) {
            throw new Error('Project not found');
          }
          
          return Promise.all([
            API.projects.listBranches(projectId.toString()),
            // Get the main branch for this project using its path
            API.projects.detectBranch(project.path)
          ]);
        }).then(([branchesResponse, mainBranchResponse]) => {
          if (branchesResponse.success && branchesResponse.data) {
            setBranches(branchesResponse.data);
            // Set the current branch as default if available
            const currentBranch = branchesResponse.data.find((b: any) => b.isCurrent);
            if (currentBranch && !formData.baseBranch) {
              setFormData(prev => ({ ...prev, baseBranch: currentBranch.name }));
            }
          }
          
          if (mainBranchResponse.success && mainBranchResponse.data) {
            // Main branch detected but not currently used in UI
          }
        }).catch((err: any) => {
          console.error('Failed to fetch branches:', err);
        }).finally(() => {
          setIsLoadingBranches(false);
        });
      }
    }
  }, [isOpen, projectId]);
  
  // Add keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      // Cmd/Ctrl + Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const form = document.getElementById('create-session-form') as HTMLFormElement;
        if (form) {
          const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
          form.dispatchEvent(submitEvent);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const validateWorktreeName = (name: string): string | null => {
    if (!name) return null; // Empty is allowed
    
    // Check for spaces
    if (name.includes(' ')) {
      return 'Session name cannot contain spaces';
    }
    
    // Check for invalid git characters
    const invalidChars = /[~^:?*\[\]\\]/;
    if (invalidChars.test(name)) {
      return 'Session name contains invalid characters (~^:?*[]\\)';
    }
    
    // Check if it starts or ends with dot
    if (name.startsWith('.') || name.endsWith('.')) {
      return 'Session name cannot start or end with a dot';
    }
    
    // Check if it starts or ends with slash
    if (name.startsWith('/') || name.endsWith('/')) {
      return 'Session name cannot start or end with a slash';
    }
    
    // Check for consecutive dots
    if (name.includes('..')) {
      return 'Session name cannot contain consecutive dots';
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if session name is required
    if (!hasApiKey && !formData.worktreeTemplate) {
      showError({
        title: 'Session Name Required',
        error: 'Please provide a session name or add an Anthropic API key in Settings to enable auto-naming.'
      });
      return;
    }
    
    // Validate worktree name
    const validationError = validateWorktreeName(formData.worktreeTemplate || '');
    if (validationError) {
      showError({
        title: 'Invalid Session Name',
        error: validationError
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Append ultrathink to prompt if checkbox is checked
      const finalPrompt = ultrathink ? formData.prompt + '\nultrathink' : formData.prompt;
      
      const response = await API.sessions.create({
        ...formData,
        prompt: finalPrompt,
        projectId,
        autoCommit, // Keep for backwards compatibility
        commitMode: commitModeSettings.mode,
        commitModeSettings: JSON.stringify(commitModeSettings)
      });
      
      if (!response.success) {
        showError({
          title: 'Failed to Create Session',
          error: response.error || 'An error occurred while creating the session.',
          details: response.details,
          command: response.command
        });
        return;
      }
      
      // Save the model as last used for this project
      if (projectId && formData.model) {
        API.projects.update(projectId.toString(), { lastUsedModel: formData.model }).catch(err => {
          console.error('Failed to save last used model:', err);
        });
      }
      
      onClose();
      // Reset form but fetch the default permission mode again
      const configResponse = await API.config.get();
      const defaultPermissionMode = configResponse.success && configResponse.data?.defaultPermissionMode 
        ? configResponse.data.defaultPermissionMode 
        : 'ignore';
      setFormData({ 
        prompt: '', 
        worktreeTemplate: '', 
        count: 1, 
        permissionMode: defaultPermissionMode as 'ignore' | 'approve', 
        model: formData.model // Keep the same model for next time
      });
      setWorktreeError(null);
      setUltrathink(false);
      setAutoCommit(true); // Reset to default
      setShowAdvanced(false); // Close advanced options
    } catch (error: any) {
      console.error('Error creating session:', error);
      showError({
        title: 'Failed to Create Session',
        error: error.message || 'An error occurred while creating the session.',
        details: error.stack || error.toString()
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={() => {
        setWorktreeError(null);
        onClose();
      }}
      size="lg"
      closeOnOverlayClick={false}
    >
      <ModalHeader>
        Create New Session{projectName && ` in ${projectName}`}
      </ModalHeader>
      
      <ModalBody className="p-0">
        <div className="flex-1 overflow-y-auto">
          <form id="create-session-form" onSubmit={handleSubmit}>
            {/* Primary Section - Always Visible */}
            <div className="p-6 space-y-5">
              {/* Prompt Field */}
              <div>
                <label htmlFor="prompt" className="block text-sm font-medium text-text-secondary mb-2">
                  What would you like to work on?
                </label>
                <FilePathAutocomplete
                  value={formData.prompt}
                  onChange={(value) => setFormData({ ...formData, prompt: value })}
                  projectId={projectId?.toString()}
                  placeholder="Describe your task... (use @ to reference files)"
                  className="w-full px-3 py-2 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary placeholder-text-tertiary"
                  isTextarea={true}
                  rows={3}
                />
              </div>
              
              {/* Model Selection - Compact */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Model
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <Card
                    variant={formData.model === 'claude-sonnet-4-20250514' ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      formData.model === 'claude-sonnet-4-20250514'
                        ? 'border-interactive bg-interactive/10'
                        : ''
                    }`}
                    onClick={() => setFormData({ ...formData, model: 'claude-sonnet-4-20250514' })}
                  >
                    <div className="flex flex-col items-center gap-1 py-2">
                      <Target className={`w-5 h-5 ${formData.model === 'claude-sonnet-4-20250514' ? 'text-interactive' : ''}`} />
                      <span className={`text-sm font-medium ${formData.model === 'claude-sonnet-4-20250514' ? 'text-interactive' : ''}`}>Sonnet 4</span>
                      <span className="text-xs opacity-75">Balanced</span>
                    </div>
                    {formData.model === 'claude-sonnet-4-20250514' && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
                    )}
                  </Card>
                  
                  <Card
                    variant={formData.model === 'claude-opus-4-20250514' ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      formData.model === 'claude-opus-4-20250514'
                        ? 'border-interactive bg-interactive/10'
                        : ''
                    }`}
                    onClick={() => setFormData({ ...formData, model: 'claude-opus-4-20250514' })}
                  >
                    <div className="flex flex-col items-center gap-1 py-2">
                      <Brain className={`w-5 h-5 ${formData.model === 'claude-opus-4-20250514' ? 'text-interactive' : ''}`} />
                      <span className={`text-sm font-medium ${formData.model === 'claude-opus-4-20250514' ? 'text-interactive' : ''}`}>Opus 4</span>
                      <span className="text-xs opacity-75">Maximum</span>
                    </div>
                    {formData.model === 'claude-opus-4-20250514' && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
                    )}
                  </Card>
                  
                  <Card
                    variant={formData.model === 'claude-3-5-haiku-20241022' ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      formData.model === 'claude-3-5-haiku-20241022'
                        ? 'border-status-success bg-status-success/10'
                        : ''
                    }`}
                    onClick={() => setFormData({ ...formData, model: 'claude-3-5-haiku-20241022' })}
                  >
                    <div className="flex flex-col items-center gap-1 py-2">
                      <Zap className={`w-5 h-5 ${formData.model === 'claude-3-5-haiku-20241022' ? 'text-status-success' : ''}`} />
                      <span className={`text-sm font-medium ${formData.model === 'claude-3-5-haiku-20241022' ? 'text-status-success' : ''}`}>Haiku 3.5</span>
                      <span className="text-xs opacity-75">Fast</span>
                    </div>
                    {formData.model === 'claude-3-5-haiku-20241022' && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-status-success rounded-full" />
                    )}
                  </Card>
                </div>
                <p className="text-xs text-text-tertiary mt-2">
                  {formData.model?.includes('opus') && 'Best for complex architecture and challenging problems'}
                  {formData.model?.includes('haiku') && 'Fast and cost-effective for simple tasks'}
                  {formData.model?.includes('sonnet') && 'Excellent balance of speed and capability for most tasks'}
                </p>
              </div>
              
              {/* Session Name */}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Session Name {hasApiKey ? '(Optional)' : '(Required)'}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="worktreeTemplate"
                    type="text"
                    value={formData.worktreeTemplate}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, worktreeTemplate: value });
                      // Real-time validation
                      const error = validateWorktreeName(value);
                      setWorktreeError(error);
                    }}
                    error={worktreeError || undefined}
                    placeholder={hasApiKey ? "Leave empty for AI-generated name" : "Enter a name for your session"}
                    disabled={isGeneratingName}
                    className="flex-1"
                  />
                  {hasApiKey && formData.prompt.trim() && (
                    <Button
                      type="button"
                      onClick={async () => {
                        setIsGeneratingName(true);
                        try {
                          const response = await API.sessions.generateName(formData.prompt);
                          if (response.success && response.data) {
                            setFormData({ ...formData, worktreeTemplate: response.data });
                            setWorktreeError(null);
                          } else {
                            showError({
                              title: 'Failed to Generate Name',
                              error: response.error || 'Could not generate session name'
                            });
                          }
                        } catch (error) {
                          showError({
                            title: 'Failed to Generate Name',
                            error: 'An error occurred while generating the name'
                          });
                        } finally {
                          setIsGeneratingName(false);
                        }
                      }}
                      variant="secondary"
                      loading={isGeneratingName}
                      disabled={!formData.prompt.trim()}
                      title="Generate name from prompt"
                      size="md"
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      {isGeneratingName ? 'Generating...' : 'Generate'}
                    </Button>
                  )}
                </div>
                {!hasApiKey && !formData.worktreeTemplate && (
                  <p className="text-xs text-status-warning mt-1">
                    Session name is required. Add an Anthropic API key in Settings to enable AI-powered auto-naming.
                  </p>
                )}
                {!worktreeError && !(!hasApiKey && !formData.worktreeTemplate) && (
                  <p className="text-xs text-text-tertiary mt-1">
                    The name for your session and worktree folder.
                  </p>
                )}
              </div>
              
              {/* Sessions Count - Always visible */}
              <div>
                <label htmlFor="count" className="block text-sm font-medium text-text-secondary mb-1">
                  Number of Sessions: {formData.count}
                </label>
                <input
                  id="count"
                  type="range"
                  min="1"
                  max="5"
                  value={formData.count}
                  onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
                  className="w-full"
                />
              </div>
            </div>
            
            {/* Advanced Options Toggle */}
            <div className="px-6 pb-4">
              <Button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                variant="ghost"
                size="sm"
                className="text-text-secondary hover:text-text-primary"
              >
                {showAdvanced ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
                More options
              </Button>
            </div>
            
            {/* Advanced Options - Collapsible */}
            {showAdvanced && (
              <div className="px-6 pb-6 space-y-4 border-t border-border-primary pt-4">
                {/* Base Branch */}
                {branches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <GitBranch className="w-4 h-4 text-text-tertiary" />
                      <label htmlFor="baseBranch" className="text-sm font-medium text-text-secondary">
                        Base Branch
                      </label>
                    </div>
                    <select
                      id="baseBranch"
                      value={formData.baseBranch || ''}
                      onChange={(e) => {
                        const selectedBranch = e.target.value;
                        setFormData({ ...formData, baseBranch: selectedBranch });
                      }}
                      className="w-full px-3 py-2 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary"
                      disabled={isLoadingBranches}
                    >
                      {branches.map((branch, index) => {
                        // Check if this is the first non-worktree branch after worktree branches
                        const isFirstNonWorktree = index > 0 && 
                          !branch.hasWorktree && 
                          branches[index - 1].hasWorktree;
                        
                        return (
                          <React.Fragment key={branch.name}>
                            {isFirstNonWorktree && (
                              <option disabled value="">
                                ──────────────
                              </option>
                            )}
                            <option value={branch.name}>
                              {branch.name} {branch.isCurrent ? '(current)' : ''}
                            </option>
                          </React.Fragment>
                        );
                      })}
                    </select>
                    <p className="text-xs text-text-tertiary mt-1">
                      Create the new session branch from this existing branch
                    </p>
                  </div>
                )}
                
                {/* Commit Mode Settings */}
                <CommitModeSettings
                  projectId={projectId}
                  mode={commitModeSettings.mode}
                  settings={commitModeSettings}
                  onChange={(mode, settings) => {
                    setCommitModeSettings(settings);
                    // Update autoCommit for backwards compatibility
                    setAutoCommit(mode !== 'disabled');
                  }}
                />
                
                {/* Checkboxes */}
                <div className="space-y-3">
                  <Checkbox
                    id="autoCommit"
                    label="Auto-commit after each prompt"
                    checked={autoCommit}
                    onChange={(e) => setAutoCommit(e.target.checked)}
                  />
                  
                  <Checkbox
                    id="ultrathink"
                    label="Enable ultrathink mode"
                    checked={ultrathink}
                    onChange={(e) => setUltrathink(e.target.checked)}
                  />
                </div>
                
                {/* Permission Mode */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Permission Mode
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="permissionMode"
                        value="ignore"
                        checked={formData.permissionMode === 'ignore' || !formData.permissionMode}
                        onChange={(e) => setFormData({ ...formData, permissionMode: e.target.value as 'ignore' | 'approve' })}
                        className="text-interactive"
                      />
                      <ShieldOff className="w-4 h-4 text-text-tertiary" />
                      <span className="text-sm text-text-secondary">Skip Permissions</span>
                      <span className="text-xs text-text-tertiary">(default)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="permissionMode"
                        value="approve"
                        checked={formData.permissionMode === 'approve'}
                        onChange={(e) => setFormData({ ...formData, permissionMode: e.target.value as 'ignore' | 'approve' })}
                        className="text-interactive"
                      />
                      <Shield className="w-4 h-4 text-status-success" />
                      <span className="text-sm text-text-secondary">Manual Approval</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </ModalBody>
      
      <ModalFooter className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          <span className="font-medium">Tip:</span> Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to create
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              setWorktreeError(null);
              onClose();
            }}
            variant="ghost"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-session-form"
            disabled={isSubmitting || !formData.prompt || !!worktreeError || (!hasApiKey && !formData.worktreeTemplate)}
            loading={isSubmitting}
            title={
              isSubmitting ? 'Creating session...' :
              !formData.prompt ? 'Please enter a prompt' :
              worktreeError ? 'Please fix the session name error' :
              (!hasApiKey && !formData.worktreeTemplate) ? 'Please enter a session name (required without API key)' :
              undefined
            }
          >
            {isSubmitting ? 'Creating...' : `Create ${(formData.count || 1) > 1 ? (formData.count || 1) + ' Sessions' : 'Session'}`}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
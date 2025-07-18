import React, { useState, useEffect } from 'react';
import { API } from '../utils/api';
import type { CreateSessionRequest } from '../types/session';
import { useErrorStore } from '../stores/errorStore';
import { Shield, ShieldOff, Sparkles, GitBranch, Cpu } from 'lucide-react';
import FilePathAutocomplete from './FilePathAutocomplete';

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
  const [autoCommit, setAutoCommit] = useState(true); // Default to true
  const { showError } = useErrorStore();
  
  useEffect(() => {
    if (isOpen) {
      // Fetch the default permission mode, default model, and check for API key when dialog opens
      API.config.get().then(response => {
        if (response.success) {
          if (response.data?.defaultPermissionMode) {
            setFormData(prev => ({
              ...prev,
              permissionMode: response.data.defaultPermissionMode
            }));
          }
          // Don't load defaultModel - always start with Sonnet 4 for new sessions
          // The model choice is remembered per session, not globally
          // Check if API key exists
          setHasApiKey(!!response.data?.anthropicApiKey);
        }
      }).catch(err => {
        console.error('Failed to fetch config:', err);
      });
      
      // Fetch branches if projectId is provided
      if (projectId) {
        setIsLoadingBranches(true);
        API.projects.listBranches(projectId.toString()).then(response => {
          if (response.success && response.data) {
            setBranches(response.data);
            // Set the current branch as default if available
            const currentBranch = response.data.find((b: any) => b.isCurrent);
            if (currentBranch && !formData.baseBranch) {
              setFormData(prev => ({ ...prev, baseBranch: currentBranch.name }));
            }
          }
        }).catch(err => {
          console.error('Failed to fetch branches:', err);
        }).finally(() => {
          setIsLoadingBranches(false);
        });
      }
    }
  }, [isOpen, projectId]);
  
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
        autoCommit
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
      
      onClose();
      // Reset form but fetch the default permission mode and model again
      const configResponse = await API.config.get();
      const defaultPermissionMode = configResponse.success && configResponse.data?.defaultPermissionMode 
        ? configResponse.data.defaultPermissionMode 
        : 'ignore';
      const defaultModel = configResponse.success && configResponse.data?.defaultModel
        ? configResponse.data.defaultModel
        : 'claude-sonnet-4-20250514';
      setFormData({ prompt: '', worktreeTemplate: '', count: 1, permissionMode: defaultPermissionMode as 'ignore' | 'approve', model: defaultModel });
      setWorktreeError(null);
      setUltrathink(false);
      setAutoCommit(true); // Reset to default
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div data-testid="create-session-dialog" className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Create New Session{projectName && ` in ${projectName}`}
          </h2>
          <button
            onClick={() => {
              setWorktreeError(null);
              onClose();
            }}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            title="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form id="create-session-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prompt
            </label>
            <FilePathAutocomplete
              value={formData.prompt}
              onChange={(value) => setFormData({ ...formData, prompt: value })}
              projectId={projectId?.toString()}
              placeholder="Enter the prompt for Claude Code... (use @ to reference files)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400"
              isTextarea={true}
              rows={4}
            />
            <div className="mt-2 space-y-3">
              <div>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={ultrathink}
                    onChange={(e) => setUltrathink(e.target.checked)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Enable ultrathink mode
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  Triggers Claude Code to use its maximum thinking token limit. Slower but better for difficult tasks.
                </p>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={autoCommit}
                    onChange={(e) => setAutoCommit(e.target.checked)}
                    className="h-4 w-4 text-green-600 rounded border-gray-300 dark:border-gray-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Enable auto-commit
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  Automatically commit changes after each prompt. Can be toggled later during the session.
                </p>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              AI Model
            </label>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-gray-400" />
              <select
                value={formData.model || 'claude-sonnet-4-20250514'}
                onChange={(e) => {
                  const newModel = e.target.value;
                  setFormData({ ...formData, model: newModel });
                  // Don't save as default - always start fresh with Sonnet 4
                }}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
              >
                <option value="claude-sonnet-4-20250514">Sonnet 4 (Balanced - Recommended)</option>
                <option value="claude-opus-4-20250514">Opus 4 (Maximum Capability)</option>
                <option value="claude-3-5-haiku-20241022">Haiku 3.5 (Fast & Lightweight)</option>
              </select>
            </div>
            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                <strong className="text-gray-700 dark:text-gray-300">Sonnet 4:</strong> Best for most coding tasks. Excellent balance of speed and capability.
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                <strong className="text-gray-700 dark:text-gray-300">Opus 4:</strong> Use for complex architecture, large refactors, and challenging problems. Slower but more thorough.
              </div>
              <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                <strong className="text-gray-700 dark:text-gray-300">Haiku 3.5:</strong> Fast and cost-effective for simple tasks and repetitive work.
              </div>
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-700">
                <span className="text-amber-700 dark:text-amber-300">⚠️ Larger models will hit limits faster</span>
              </div>
            </div>
          </div>
          
          <div>
            <label htmlFor="worktreeTemplate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Session Name {hasApiKey ? '(Optional)' : '(Required)'}
            </label>
            <div className="flex gap-2">
              <input
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
                className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 ${
                  worktreeError 
                    ? 'border-red-400 focus:ring-red-500' 
                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                }`}
                placeholder={hasApiKey ? "Leave empty for AI-generated name" : "Enter a name for your session"}
                disabled={isGeneratingName}
              />
              {hasApiKey && formData.prompt.trim() && (
                <button
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
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-gray-300 dark:border-gray-600"
                  disabled={isGeneratingName || !formData.prompt.trim()}
                  title="Generate name from prompt"
                >
                  <Sparkles className="w-4 h-4" />
                  {isGeneratingName ? 'Generating...' : 'Generate'}
                </button>
              )}
            </div>
            {worktreeError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{worktreeError}</p>
            )}
            {!hasApiKey && !formData.worktreeTemplate && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Session name is required. Add an Anthropic API key in Settings to enable AI-powered auto-naming.
              </p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {!worktreeError && !(!hasApiKey && !formData.worktreeTemplate) && 'The name that will be used to label your session and create your worktree folder.'}
            </p>
          </div>
          
          {branches.length > 0 && (
            <div>
              <label htmlFor="baseBranch" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Base Branch
              </label>
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-gray-400" />
                <select
                  id="baseBranch"
                  value={formData.baseBranch || ''}
                  onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700"
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
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Create the new session branch from this existing branch
              </p>
            </div>
          )}
          
          <div>
            <label htmlFor="count" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Number of Sessions
            </label>
            <input
              id="count"
              type="number"
              min="1"
              max="10"
              value={formData.count}
              onChange={(e) => setFormData({ ...formData, count: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Creates multiple sessions with numbered suffixes
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Permission Mode
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="permissionMode"
                  value="ignore"
                  checked={formData.permissionMode === 'ignore' || !formData.permissionMode}
                  onChange={(e) => setFormData({ ...formData, permissionMode: e.target.value as 'ignore' | 'approve' })}
                  className="text-blue-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ShieldOff className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-200">Skip Permissions</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">(recommended)</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-6 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                    Claude runs with full permissions. Ideal for trusted environments and faster workflows.
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="permissionMode"
                  value="approve"
                  checked={formData.permissionMode === 'approve'}
                  onChange={(e) => setFormData({ ...formData, permissionMode: e.target.value as 'ignore' | 'approve' })}
                  className="text-blue-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-600 dark:text-green-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-200">Manual Approval</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">(safer)</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-6 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                    Claude asks permission for file operations. Use this for sensitive projects or when learning.
                  </p>
                </div>
              </label>
            </div>
            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-600 dark:text-blue-400">
                <strong>Note:</strong> This setting only affects new sessions. You can change the default in Settings.
              </p>
            </div>
          </div>
          </form>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              setWorktreeError(null);
              onClose();
            }}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-session-form"
            disabled={isSubmitting || !formData.prompt || !!worktreeError || (!hasApiKey && !formData.worktreeTemplate)}
            className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed font-medium transition-colors shadow-sm hover:shadow"
            title={
              isSubmitting ? 'Creating session...' :
              !formData.prompt ? 'Please enter a prompt' :
              worktreeError ? 'Please fix the session name error' :
              (!hasApiKey && !formData.worktreeTemplate) ? 'Please enter a session name (required without API key)' :
              undefined
            }
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              `Create ${(formData.count || 1) > 1 ? (formData.count || 1) + ' Sessions' : 'Session'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
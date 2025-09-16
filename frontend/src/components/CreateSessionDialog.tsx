import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API } from '../utils/api';
import type { CreateSessionRequest } from '../types/session';
import { useErrorStore } from '../stores/errorStore';
import { Sparkles, GitBranch, ChevronRight, ChevronDown, Brain, X, FileText, Paperclip, Code2, Settings2 } from 'lucide-react';
import FilePathAutocomplete from './FilePathAutocomplete';
import { CommitModeSettings } from './CommitModeSettings';
import type { CommitModeSettings as CommitModeSettingsType } from '../../../shared/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { ClaudeCodeConfigComponent, type ClaudeCodeConfig } from './dialog/ClaudeCodeConfig';
import { CodexConfigComponent, type CodexConfig } from './dialog/CodexConfig';
import { DEFAULT_CODEX_MODEL } from '../../../shared/types/models';

interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
  size: number;
  type: string;
}

interface AttachedText {
  id: string;
  name: string;
  content: string;
  size: number;
}

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  projectId?: number;
}

export function CreateSessionDialog({ isOpen, onClose, projectName, projectId }: CreateSessionDialogProps) {
  const [sessionName, setSessionName] = useState<string>('');
  const [sessionCount, setSessionCount] = useState<number>(1);
  const [toolType, setToolType] = useState<'claude' | 'codex' | 'none'>('none');
  const [claudeConfig, setClaudeConfig] = useState<ClaudeCodeConfig>({
    prompt: '',
    model: 'auto',
    permissionMode: 'ignore',
    ultrathink: false
  });
  const [codexConfig, setCodexConfig] = useState<CodexConfig>({
    prompt: '',
    model: DEFAULT_CODEX_MODEL,
    modelProvider: 'openai',
    approvalPolicy: 'auto',
    sandboxMode: 'workspace-write',
    webSearch: false
  });
  const [formData, setFormData] = useState<CreateSessionRequest>({
    prompt: '',
    worktreeTemplate: '',
    count: 1,
    permissionMode: 'ignore',
    model: 'auto' // Default to auto (Claude Code's default selection)
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [branches, setBranches] = useState<Array<{ name: string; isCurrent: boolean; hasWorktree: boolean }>>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [commitModeSettings, setCommitModeSettings] = useState<CommitModeSettingsType>({ 
    mode: 'checkpoint',
    checkpointPrefix: 'checkpoint: '
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedTexts, setAttachedTexts] = useState<AttachedText[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Define all hooks before the early return
  const processFile = useCallback(async (file: File): Promise<AttachedImage | null> => {
    const generateImageId = () => `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (!file.type.startsWith('image/')) {
      console.warn('File is not an image:', file.name);
      return null;
    }

    // Limit file size to 10MB
    if (file.size > 10 * 1024 * 1024) {
      console.warn('Image file too large (max 10MB):', file.name);
      return null;
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve({
            id: generateImageId(),
            name: file.name,
            dataUrl: e.target.result as string,
            size: file.size,
            type: file.type,
          });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for text content first
    const textData = e.clipboardData.getData('text/plain');
    const LARGE_TEXT_THRESHOLD = 5000;
    
    if (textData && textData.length > LARGE_TEXT_THRESHOLD) {
      // Large text pasted - convert to attachment
      e.preventDefault();
      
      const textAttachment: AttachedText = {
        id: generateTextId(),
        name: `Pasted Text (${textData.length.toLocaleString()} chars)`,
        content: textData,
        size: textData.length,
      };
      
      // Add to the active tool's config
      if (toolType === 'claude') {
        setClaudeConfig(prev => ({
          ...prev,
          attachedTexts: [...(prev.attachedTexts || []), textAttachment]
        }));
      } else if (toolType === 'codex') {
        setCodexConfig(prev => ({
          ...prev,
          attachedTexts: [...(prev.attachedTexts || []), textAttachment]
        }));
      }
      setAttachedTexts(prev => [...prev, textAttachment]);
      console.log(`[Large Text] Automatically attached ${textData.length} characters from paste`);
      return;
    }

    // Check for images
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i]);
      }
    }

    if (imageItems.length === 0) return;

    e.preventDefault();

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) {
        const image = await processFile(file);
        if (image) {
          // Add to the active tool's config
          if (toolType === 'claude') {
            setClaudeConfig(prev => ({
              ...prev,
              attachedImages: [...(prev.attachedImages || []), image]
            }));
          } else if (toolType === 'codex') {
            setCodexConfig(prev => ({
              ...prev,
              attachedImages: [...(prev.attachedImages || []), image]
            }));
          }
          setAttachedImages(prev => [...prev, image]);
        }
      }
    }
  }, [processFile, toolType]);

  const removeImage = useCallback((id: string) => {
    // Remove from active tool's config
    if (toolType === 'claude') {
      setClaudeConfig(prev => ({
        ...prev,
        attachedImages: (prev.attachedImages || []).filter(img => img.id !== id)
      }));
    } else if (toolType === 'codex') {
      setCodexConfig(prev => ({
        ...prev,
        attachedImages: (prev.attachedImages || []).filter(img => img.id !== id)
      }));
    }
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  }, [toolType]);

  const removeText = useCallback((id: string) => {
    // Remove from active tool's config
    if (toolType === 'claude') {
      setClaudeConfig(prev => ({
        ...prev,
        attachedTexts: (prev.attachedTexts || []).filter(txt => txt.id !== id)
      }));
    } else if (toolType === 'codex') {
      setCodexConfig(prev => ({
        ...prev,
        attachedTexts: (prev.attachedTexts || []).filter(txt => txt.id !== id)
      }));
    }
    setAttachedTexts(prev => prev.filter(txt => txt.id !== id));
  }, [toolType]);
  
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

  const generateTextId = () => `txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if session name is required
    if (!hasApiKey && !sessionName) {
      showError({
        title: 'Session Name Required',
        error: 'Please provide a session name or add an Anthropic API key in Settings to enable auto-naming.'
      });
      return;
    }
    
    // Validate worktree name
    const validationError = validateWorktreeName(sessionName || '');
    if (validationError) {
      showError({
        title: 'Invalid Session Name',
        error: validationError
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Prepare the prompt and configuration based on selected tool
      let finalPrompt = '';
      let finalModel = 'auto';
      let finalPermissionMode: 'ignore' | 'approve' = 'ignore';
      
      // Get attachments from the active config
      const activeAttachedImages = toolType === 'claude' ? (claudeConfig.attachedImages || []) :
                                   toolType === 'codex' ? (codexConfig.attachedImages || []) : [];
      const activeAttachedTexts = toolType === 'claude' ? (claudeConfig.attachedTexts || []) :
                                 toolType === 'codex' ? (codexConfig.attachedTexts || []) : [];
      
      if (toolType === 'claude') {
        finalPrompt = claudeConfig.prompt || '';
        if (claudeConfig.ultrathink && finalPrompt) {
          finalPrompt += '\nultrathink';
        }
        finalModel = claudeConfig.model;
        finalPermissionMode = claudeConfig.permissionMode;
      } else if (toolType === 'codex') {
        // Use Codex config directly
        finalPrompt = codexConfig.prompt || '';
        finalModel = (codexConfig.model || DEFAULT_CODEX_MODEL) as string;
        // Keep session permission mode independent of Codex approval policy; default to ignore unless explicitly set
        finalPermissionMode = formData.permissionMode || 'ignore';
      }
      
      // Process attachments
      const attachmentPaths: string[] = [];
      
      // Save attached text files
      if (activeAttachedTexts.length > 0) {
        const tempId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        for (const text of activeAttachedTexts) {
          try {
            console.log(`[Large Text] Saving attached text (${text.size} chars) to temporary file`);
            const textFilePath = await window.electronAPI.sessions.saveLargeText(
              tempId,
              text.content
            );
            attachmentPaths.push(textFilePath);
            console.log(`[Large Text] Text saved to: ${textFilePath}`);
          } catch (error) {
            console.error('Failed to save attached text to file:', error);
          }
        }
      }
      
      // Save attached images
      if (activeAttachedImages.length > 0) {
        const tempId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        try {
          console.log(`[Image] Saving ${activeAttachedImages.length} attached image(s) to temporary files`);
          const imagePaths = await window.electronAPI.sessions.saveImages(
            tempId,
            activeAttachedImages.map(img => ({
              name: img.name,
              dataUrl: img.dataUrl,
              type: img.type,
            }))
          );
          attachmentPaths.push(...imagePaths);
          console.log(`[Image] Images saved to:`, imagePaths);
        } catch (error) {
          console.error('Failed to save attached images:', error);
        }
      }
      
      // Add attachments to prompt if any
      if (attachmentPaths.length > 0) {
        const attachmentsMessage = `\n\n<attachments>\nPlease look at these files which may provide additional instructions or context:\n${attachmentPaths.join('\n')}\n</attachments>`;
        finalPrompt = `${finalPrompt}${attachmentsMessage}`;
        console.log('[CreateSessionDialog] Final prompt with attachments:', finalPrompt);
        console.log('[CreateSessionDialog] Attachment paths:', attachmentPaths);
      }
      
      console.log('[CreateSessionDialog] Creating session with:', {
        sessionName: sessionName || '(auto-generate)',
        count: sessionCount,
        toolType,
        prompt: finalPrompt || '(no prompt)'
      });
      const response = await API.sessions.create({
        prompt: finalPrompt || undefined,
        worktreeTemplate: sessionName || undefined, // Pass undefined if empty for auto-naming
        count: sessionCount,
        model: finalModel,
        toolType,
        permissionMode: finalPermissionMode,
        projectId,
        commitMode: commitModeSettings.mode,
        commitModeSettings: JSON.stringify(commitModeSettings),
        baseBranch: formData.baseBranch
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
      if (projectId && finalModel) {
        API.projects.update(projectId.toString(), { lastUsedModel: finalModel }).catch(err => {
          console.error('Failed to save last used model:', err);
        });
      }
      
      onClose();
      // Reset form but fetch the default permission mode again
      const configResponse = await API.config.get();
      const defaultPermissionMode = configResponse.success && configResponse.data?.defaultPermissionMode 
        ? configResponse.data.defaultPermissionMode 
        : 'ignore';
      // Reset form
      setSessionName('');
      setSessionCount(1);
      setToolType('none');
      setClaudeConfig({
        prompt: '',
        model: claudeConfig.model, // Keep the same model for next time
        permissionMode: defaultPermissionMode as 'ignore' | 'approve',
        ultrathink: false
      });
      setCodexConfig({
        prompt: '',
        model: DEFAULT_CODEX_MODEL,
        modelProvider: 'openai',
        approvalPolicy: 'auto',
        sandboxMode: 'workspace-write',
        webSearch: false
      });
      setFormData({ 
        prompt: '', 
        worktreeTemplate: '', 
        count: 1, 
        permissionMode: defaultPermissionMode as 'ignore' | 'approve', 
        model: finalModel // Keep the same model for next time
      });
      setWorktreeError(null);
      setShowAdvanced(false); // Close advanced options
      setAttachedImages([]); // Clear attachments
      setAttachedTexts([]); // Clear attachments
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
            {/* Session Configuration Section */}
            <div className="p-6 border-b border-border-primary">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-4 h-4 text-interactive" />
                <h3 className="text-sm font-semibold text-text-primary">Session Configuration</h3>
              </div>
              <div className="space-y-4">
                {/* Session Name */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Session Name {hasApiKey ? '(Optional)' : '(Required)'}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="worktreeTemplate"
                      type="text"
                      value={sessionName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSessionName(value);
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
                          // Use the active tool's prompt for name generation
                          const promptForName = toolType === 'claude' ? claudeConfig.prompt : 
                                               toolType === 'codex' ? codexConfig.prompt : '';
                          const response = await API.sessions.generateName(promptForName || 'New session');
                          if (response.success && response.data) {
                            setSessionName(response.data);
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
                      disabled={toolType === 'none' || 
                               (toolType === 'claude' && !claudeConfig.prompt?.trim()) ||
                               (toolType === 'codex' && !codexConfig.prompt?.trim())}
                      title="Generate name from prompt"
                      size="md"
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      {isGeneratingName ? 'Generating...' : 'Generate'}
                    </Button>
                  )}
                </div>
                  {!hasApiKey && !sessionName && (
                  <p className="text-xs text-status-warning mt-1">
                    Session name is required. Add an Anthropic API key in Settings to enable AI-powered auto-naming.
                  </p>
                )}
                  {!worktreeError && !(!hasApiKey && !sessionName) && (
                  <p className="text-xs text-text-tertiary mt-1">
                    The name for your session and worktree folder.
                  </p>
                )}
                </div>
                
                {/* Sessions Count */}
                <div>
                  <label htmlFor="count" className="block text-sm font-medium text-text-secondary mb-1">
                    Number of Sessions: {sessionCount}
                  </label>
                  <input
                    id="count"
                    type="range"
                    min="1"
                    max="5"
                    value={sessionCount}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 1;
                      setSessionCount(count);
                      setFormData({ ...formData, count });
                    }}
                    className="w-full"
                  />
                  {sessionCount > 1 && (
                    <p className="text-xs text-text-tertiary mt-1">
                      Creating multiple sessions with numbered suffixes
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Tool Configuration Section - Optional */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="w-4 h-4 text-interactive" />
                <h3 className="text-sm font-semibold text-text-primary">Tool Configuration</h3>
                <span className="text-xs text-text-tertiary">(Optional - for launching AI tools in sessions)</span>
              </div>
              
              {/* Tool Type Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Select Tool
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <Card
                    variant={toolType === 'none' ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      toolType === 'none'
                        ? 'border-interactive bg-interactive/10'
                        : ''
                    }`}
                    onClick={() => setToolType('none')}
                  >
                    <div className="flex flex-col items-center gap-1 py-2">
                      <X className={`w-5 h-5 ${toolType === 'none' ? 'text-interactive' : 'text-text-tertiary'}`} />
                      <span className={`text-sm font-medium ${toolType === 'none' ? 'text-interactive' : ''}`}>None</span>
                      <span className="text-xs opacity-75">Empty session</span>
                    </div>
                    {toolType === 'none' && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
                    )}
                  </Card>
                  
                  <Card
                    variant={toolType === 'claude' ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      toolType === 'claude'
                        ? 'border-interactive bg-interactive/10'
                        : ''
                    }`}
                    onClick={() => setToolType('claude')}
                  >
                    <div className="flex flex-col items-center gap-1 py-2">
                      <Brain className={`w-5 h-5 ${toolType === 'claude' ? 'text-interactive' : ''}`} />
                      <span className={`text-sm font-medium ${toolType === 'claude' ? 'text-interactive' : ''}`}>Claude Code</span>
                      <span className="text-xs opacity-75">AI assistant</span>
                    </div>
                    {toolType === 'claude' && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
                    )}
                  </Card>
                  
                  <Card
                    variant={toolType === 'codex' ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      toolType === 'codex'
                        ? 'border-interactive bg-interactive/10'
                        : ''
                    }`}
                    onClick={() => setToolType('codex')}
                  >
                    <div className="flex flex-col items-center gap-1 py-2">
                      <Code2 className={`w-5 h-5 ${toolType === 'codex' ? 'text-interactive' : ''}`} />
                      <span className={`text-sm font-medium ${toolType === 'codex' ? 'text-interactive' : ''}`}>Codex</span>
                      <span className="text-xs opacity-75">Multi-model AI</span>
                    </div>
                    {toolType === 'codex' && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-interactive rounded-full" />
                    )}
                  </Card>
                </div>
              </div>
              
              {/* Tool-specific configuration */}
              {toolType === 'claude' && (
                <Card variant="bordered" className="p-4">
                  <ClaudeCodeConfigComponent
                    config={claudeConfig}
                    onChange={setClaudeConfig}
                    projectId={projectId?.toString()}
                    onPaste={handlePaste}
                  />
                  
                  {/* Attached items for Claude */}
                  {((claudeConfig.attachedImages?.length ?? 0) > 0 || (claudeConfig.attachedTexts?.length ?? 0) > 0) && (
                    <div className="mt-4 pt-4 border-t border-border-primary">
                      <p className="text-xs text-text-secondary mb-2">Attached Files:</p>
                      <div className="flex flex-wrap gap-2">
                        {claudeConfig.attachedTexts?.map(text => (
                          <div key={text.id} className="relative group">
                            <div className="h-10 px-2.5 flex items-center gap-1.5 bg-surface-secondary rounded border border-border-primary">
                              <FileText className="w-3.5 h-3.5 text-text-secondary" />
                              <span className="text-xs text-text-secondary max-w-[120px] truncate">
                                {text.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeText(text.id)}
                              className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            >
                              <X className="w-2.5 h-2.5 text-text-secondary" />
                            </button>
                          </div>
                        ))}
                        
                        {claudeConfig.attachedImages?.map(image => (
                          <div key={image.id} className="relative group">
                            <img
                              src={image.dataUrl}
                              alt={image.name}
                              className="h-10 w-10 object-cover rounded border border-border-primary"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(image.id)}
                              className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            >
                              <X className="w-2.5 h-2.5 text-text-secondary" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
              
              {toolType === 'codex' && (
                <Card variant="bordered" className="p-4">
                  <CodexConfigComponent
                    config={codexConfig}
                    onChange={setCodexConfig}
                    projectId={projectId?.toString()}
                    onPaste={handlePaste}
                  />
                  
                  {/* Attached items for Codex */}
                  {((codexConfig.attachedImages?.length ?? 0) > 0 || (codexConfig.attachedTexts?.length ?? 0) > 0) && (
                    <div className="mt-4 pt-4 border-t border-border-primary">
                      <p className="text-xs text-text-secondary mb-2">Attached Files:</p>
                      <div className="flex flex-wrap gap-2">
                        {codexConfig.attachedTexts?.map(text => (
                          <div key={text.id} className="relative group">
                            <div className="h-10 px-2.5 flex items-center gap-1.5 bg-surface-secondary rounded border border-border-primary">
                              <FileText className="w-3.5 h-3.5 text-text-secondary" />
                              <span className="text-xs text-text-secondary max-w-[120px] truncate">
                                {text.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeText(text.id)}
                              className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            >
                              <X className="w-2.5 h-2.5 text-text-secondary" />
                            </button>
                          </div>
                        ))}
                        
                        {codexConfig.attachedImages?.map(image => (
                          <div key={image.id} className="relative group">
                            <img
                              src={image.dataUrl}
                              alt={image.name}
                              className="h-10 w-10 object-cover rounded border border-border-primary"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(image.id)}
                              className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                            >
                              <X className="w-2.5 h-2.5 text-text-secondary" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
              
              {toolType === 'none' && (
                <Card variant="bordered" className="p-4 text-center text-text-tertiary">
                  <p className="text-sm">No tool will be launched. You can add tools later from within the session.</p>
                </Card>
              )}
              
              {/* Hidden original prompt field for backwards compatibility */}
              <div className="hidden">
                <label htmlFor="prompt" className="block text-sm font-medium text-text-secondary mb-2">
                  What would you like to work on? (Optional - leave empty to create session without Claude)
                </label>
                {/* Attached items */}
                {(attachedImages.length > 0 || attachedTexts.length > 0) && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {/* Attached text files */}
                    {attachedTexts.map(text => (
                      <div key={text.id} className="relative group">
                        <div className="h-10 px-2.5 flex items-center gap-1.5 bg-surface-secondary rounded border border-border-primary">
                          <FileText className="w-3.5 h-3.5 text-text-secondary" />
                          <span className="text-xs text-text-secondary max-w-[120px] truncate">
                            {text.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeText(text.id)}
                          className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <X className="w-2.5 h-2.5 text-text-secondary" />
                        </button>
                      </div>
                    ))}
                    
                    {/* Attached images */}
                    {attachedImages.map(image => (
                      <div key={image.id} className="relative group">
                        <img
                          src={image.dataUrl}
                          alt={image.name}
                          className="h-10 w-10 object-cover rounded border border-border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(image.id)}
                          className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <X className="w-2.5 h-2.5 text-text-secondary" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <FilePathAutocomplete
                    value={formData.prompt}
                    onChange={(value) => setFormData({ ...formData, prompt: value })}
                    projectId={projectId?.toString()}
                    placeholder="Describe your task... (use @ to reference files)"
                    className="w-full px-3 py-2 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary placeholder-text-tertiary"
                    isTextarea={true}
                    rows={3}
                    onPaste={handlePaste}
                  />
                  {/* Attachment button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 p-1.5 rounded hover:bg-surface-hover transition-colors"
                    title="Attach images"
                  >
                    <Paperclip className="w-4 h-4 text-text-tertiary hover:text-text-secondary" />
                  </button>
                </div>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    for (const file of files) {
                      const image = await processFile(file);
                      if (image) {
                        setAttachedImages(prev => [...prev, image]);
                      }
                    }
                    e.target.value = ''; // Reset input
                  }}
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
                  onChange={(_mode, settings) => {
                    setCommitModeSettings(settings);
                  }}
                />
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
            disabled={isSubmitting || !!worktreeError || (!hasApiKey && !sessionName)}
            loading={isSubmitting}
            title={
              isSubmitting ? 'Creating session...' :
              worktreeError ? 'Please fix the session name error' :
              (!hasApiKey && !sessionName) ? 'Please enter a session name (required without API key)' :
              toolType === 'none' ? 'Session will be created without AI tool' :
              undefined
            }
          >
            {isSubmitting ? 'Creating...' : `Create ${sessionCount > 1 ? sessionCount + ' Sessions' : 'Session'}`}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

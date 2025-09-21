import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API } from '../utils/api';
import type { CreateSessionRequest } from '../types/session';
import { useErrorStore } from '../stores/errorStore';
import { Sparkles, GitBranch, ChevronRight, ChevronDown, X, FileText, Paperclip, Code2, Settings2 } from 'lucide-react';
import FilePathAutocomplete from './FilePathAutocomplete';
import { CommitModeSettings } from './CommitModeSettings';
import type { CommitModeSettings as CommitModeSettingsType } from '../../../shared/types';
import { Modal, ModalHeader, ModalBody, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { ClaudeCodeConfigComponent, type ClaudeCodeConfig } from './dialog/ClaudeCodeConfig';
import { CodexConfigComponent, type CodexConfig } from './dialog/CodexConfig';
import { DEFAULT_CODEX_MODEL, type OpenAICodexModel } from '../../../shared/types/models';
import { useSessionPreferencesStore } from '../stores/sessionPreferencesStore';
import { ProviderSelection } from './ProviderSelection';

const LARGE_TEXT_THRESHOLD = 5000;
const TEXT_FILE_EXTENSIONS = /\.(?:txt|md|markdown|log|json|js|jsx|ts|tsx|py|rb|go|java|cs|c|cpp|h|hpp|rs|yml|yaml|sh|bash|zsh|html|css|scss|less|xml|csv)$/i;

const isLikelyTextFile = (file: File) => {
  if (file.type && file.type.startsWith('text/')) {
    return true;
  }

  const knownTypes = new Set([
    'application/json',
    'application/javascript',
    'application/xml',
    'application/x-python-code',
    'application/x-sh',
  ]);

  if (knownTypes.has(file.type)) {
    return true;
  }

  return TEXT_FILE_EXTENSIONS.test(file.name.toLowerCase());
};

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

const attachmentListsEqual = <T extends { id: string }>(a: T[] = [], b: T[] = []) => {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((item, index) => item.id === b[index]?.id);
};

interface CreateSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  projectId?: number;
}

export function CreateSessionDialog({ isOpen, onClose, projectName, projectId }: CreateSessionDialogProps) {
  const [sessionName, setSessionName] = useState<string>('');
  const [sessionCount, setSessionCount] = useState<number>(1);
  const [selectedProvider, setSelectedProvider] = useState<string>('anthropic');
  const [selectedModel, setSelectedModel] = useState<string>('claude-3-opus-20240229');
  const [claudeConfig, setClaudeConfig] = useState<ClaudeCodeConfig>({
    prompt: '',
    model: 'auto',
    permissionMode: 'ignore',
    ultrathink: false,
    attachedImages: [],
    attachedTexts: []
  });
  const [codexConfig, setCodexConfig] = useState<CodexConfig>({
    prompt: '',
    model: DEFAULT_CODEX_MODEL,
    modelProvider: 'openai',
    approvalPolicy: 'auto',
    sandboxMode: 'workspace-write',
    webSearch: false,
    thinkingLevel: 'medium',
    attachedImages: [],
    attachedTexts: []
  });
  const [formData, setFormData] = useState<CreateSessionRequest>({
    prompt: '',
    worktreeTemplate: '',
    count: 1,
    permissionMode: 'ignore'
    // Model is now managed at panel level, not session level
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
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const { showError } = useErrorStore();
  const { preferences, loadPreferences, updatePreferences } = useSessionPreferencesStore();

  const syncPromptAcrossConfigs = useCallback((newPrompt: string, source: 'claude' | 'codex' | 'none') => {
    setFormData(prev => (prev.prompt === newPrompt ? prev : { ...prev, prompt: newPrompt }));

    if (source !== 'claude') {
      setClaudeConfig(prev => (prev.prompt === newPrompt ? prev : { ...prev, prompt: newPrompt }));
    }

    if (source !== 'codex') {
      setCodexConfig(prev => (prev.prompt === newPrompt ? prev : { ...prev, prompt: newPrompt }));
    }
  }, []);

  const syncImageAttachments = useCallback((updater: (prev: AttachedImage[]) => AttachedImage[]) => {
    setAttachedImages(prevImages => {
      const updatedImages = updater(prevImages);

      if (attachmentListsEqual(prevImages, updatedImages)) {
        return prevImages;
      }

      setClaudeConfig(prev => {
        const current = prev.attachedImages || [];
        return attachmentListsEqual(current, updatedImages)
          ? prev
          : { ...prev, attachedImages: updatedImages };
      });

      setCodexConfig(prev => {
        const current = prev.attachedImages || [];
        return attachmentListsEqual(current, updatedImages)
          ? prev
          : { ...prev, attachedImages: updatedImages };
      });

      return updatedImages;
    });
  }, []);

  const syncTextAttachments = useCallback((updater: (prev: AttachedText[]) => AttachedText[]) => {
    setAttachedTexts(prevTexts => {
      const updatedTexts = updater(prevTexts);

      if (attachmentListsEqual(prevTexts, updatedTexts)) {
        return prevTexts;
      }

      setClaudeConfig(prev => {
        const current = prev.attachedTexts || [];
        return attachmentListsEqual(current, updatedTexts)
          ? prev
          : { ...prev, attachedTexts: updatedTexts };
      });

      setCodexConfig(prev => {
        const current = prev.attachedTexts || [];
        return attachmentListsEqual(current, updatedTexts)
          ? prev
          : { ...prev, attachedTexts: updatedTexts };
      });

      return updatedTexts;
    });
  }, []);

  const addImageAttachment = useCallback((image: AttachedImage) => {
    syncImageAttachments(prev => [...prev, image]);
  }, [syncImageAttachments]);

  const addTextAttachment = useCallback((text: AttachedText) => {
    syncTextAttachments(prev => [...prev, text]);
  }, [syncTextAttachments]);
  
  // Load session creation preferences when dialog opens and clear session name/prompt
  useEffect(() => {
    if (isOpen) {
      loadPreferences();
      // Always clear session name and prompts when dialog opens
      setSessionName('');
      setSessionCount(1);
      setFormData(prev => ({ ...prev, count: 1 }));
      syncPromptAcrossConfigs('', 'none');
      syncImageAttachments(() => []);
      syncTextAttachments(() => []);
    }
  }, [isOpen, loadPreferences, syncPromptAcrossConfigs, syncImageAttachments, syncTextAttachments]);

  useEffect(() => {
    if (!isOpen) {
      setIsDragging(false);
      dragCounterRef.current = 0;
    }
  }, [isOpen]);

  useEffect(() => {
    setIsDragging(false);
    dragCounterRef.current = 0;
  }, [selectedProvider]);

  // Update default model when provider changes
  useEffect(() => {
    if (selectedProvider === 'zai') {
      // Set GLM-4.5 as default for Z.ai
      setClaudeConfig(prev => ({ ...prev, model: 'glm-4.5' }));
    } else if (selectedProvider === 'anthropic') {
      // Set auto as default for Anthropic
      setClaudeConfig(prev => ({ ...prev, model: 'auto' }));
    }
  }, [selectedProvider]);

  // Apply loaded preferences to state
  useEffect(() => {
    if (preferences) {
      // Convert old toolType preferences to new provider system
      if (preferences.toolType === 'claude') {
        setSelectedProvider('anthropic');
        setSelectedModel(preferences.claudeConfig.model || 'claude-3-opus-20240229');
      } else if (preferences.toolType === 'codex') {
        setSelectedProvider('openai');
        setSelectedModel(preferences.codexConfig.model || 'gpt-4');
      } else {
        setSelectedProvider('none');
      }
      setClaudeConfig(prev => ({
        ...prev,
        model: preferences.claudeConfig.model,
        permissionMode: preferences.claudeConfig.permissionMode,
        ultrathink: preferences.claudeConfig.ultrathink
      }));
      setCodexConfig(prev => ({
        ...prev,
        model: preferences.codexConfig.model as OpenAICodexModel,
        modelProvider: preferences.codexConfig.modelProvider,
        approvalPolicy: preferences.codexConfig.approvalPolicy,
        sandboxMode: preferences.codexConfig.sandboxMode,
        webSearch: preferences.codexConfig.webSearch,
        thinkingLevel: preferences.codexConfig.thinkingLevel || 'medium'
      }));
      setShowAdvanced(preferences.showAdvanced);
      setCommitModeSettings(preferences.commitModeSettings);
      // Note: we don't apply baseBranch as it should be project-specific
    }
  }, [preferences]);

  // Save preferences when certain settings change
  const savePreferences = async (updates: Partial<typeof preferences>) => {
    await updatePreferences(updates);
  };
  
  // Note: Model preferences are now stored in panel settings, not at project level
  
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

  const generateTextId = useCallback(() => `txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // Check for text content first
    const textData = e.clipboardData.getData('text/plain');
    
    if (textData && textData.length > LARGE_TEXT_THRESHOLD) {
      // Large text pasted - convert to attachment
      e.preventDefault();
      
      const textAttachment: AttachedText = {
        id: generateTextId(),
        name: `Pasted Text (${textData.length.toLocaleString()} chars)`,
        content: textData,
        size: textData.length,
      };
      
      addTextAttachment(textAttachment);
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
          addImageAttachment(image);
        }
      }
    }
  }, [processFile, addImageAttachment, addTextAttachment, generateTextId]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files || []);

    if (files.length === 0) {
      const textData = e.dataTransfer.getData('text/plain');
      if (textData && textData.length > LARGE_TEXT_THRESHOLD) {
        const textAttachment: AttachedText = {
          id: generateTextId(),
          name: `Dropped Text (${textData.length.toLocaleString()} chars)`,
          content: textData,
          size: textData.length,
        };
        addTextAttachment(textAttachment);
        console.log(`[Drop Text] Automatically attached ${textData.length} characters from drop`);
      }
      return;
    }

    for (const file of files) {
      if (file.type && file.type.startsWith('image/')) {
        const image = await processFile(file);
        if (image) {
          addImageAttachment(image);
        }
        continue;
      }

      if (isLikelyTextFile(file)) {
        try {
          const content = await file.text();
          if (!content) {
            continue;
          }

          const textAttachment: AttachedText = {
            id: generateTextId(),
            name: `${file.name} (${content.length.toLocaleString()} chars)`,
            content,
            size: content.length,
          };
          addTextAttachment(textAttachment);
          console.log(`[Drop Text File] Attached ${file.name} (${content.length} chars)`);
        } catch (error) {
          console.error('Failed to read dropped text file:', error);
        }
      } else {
        console.warn('Unsupported file type for drop:', file.name);
      }
    }
  }, [addImageAttachment, addTextAttachment, processFile, generateTextId]);

  const removeImage = useCallback((id: string) => {
    syncImageAttachments(prev => prev.filter(img => img.id !== id));
  }, [syncImageAttachments]);

  const removeText = useCallback((id: string) => {
    syncTextAttachments(prev => prev.filter(txt => txt.id !== id));
  }, [syncTextAttachments]);
  
  if (!isOpen) return null;
  
  const validateWorktreeName = (name: string): string | null => {
    if (!name) return null; // Empty is allowed
    
    // Spaces are now allowed in session names
    // They will be converted to hyphens for the actual worktree name
    
    // Check for invalid git characters (excluding spaces which are now allowed)
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
      // Model is now managed at panel level, not session level
      let finalPermissionMode: 'ignore' | 'approve' = 'ignore';
      
      // Get attachments from the active config based on provider
      const activeAttachedImages = (selectedProvider === 'anthropic' || selectedProvider === 'zai') ? (claudeConfig.attachedImages || []) :
                                   selectedProvider === 'openai' ? (codexConfig.attachedImages || []) : [];
      const activeAttachedTexts = (selectedProvider === 'anthropic' || selectedProvider === 'zai') ? (claudeConfig.attachedTexts || []) :
                                 selectedProvider === 'openai' ? (codexConfig.attachedTexts || []) : [];

      if (selectedProvider === 'anthropic' || selectedProvider === 'zai') {
        finalPrompt = claudeConfig.prompt || '';
        if (claudeConfig.ultrathink && finalPrompt) {
          finalPrompt += '\nultrathink';
        }
        finalPermissionMode = claudeConfig.permissionMode;
      } else if (selectedProvider === 'openai') {
        finalPrompt = codexConfig.prompt || '';
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
        provider: selectedProvider,
        model: selectedModel,
        prompt: finalPrompt || '(no prompt)'
      });
      const response = await API.sessions.create({
        prompt: finalPrompt || undefined,
        worktreeTemplate: sessionName || undefined, // Pass undefined if empty for auto-naming
        count: sessionCount,
        providerId: selectedProvider,
        providerModel: selectedModel,
        permissionMode: finalPermissionMode,
        projectId,
        commitMode: commitModeSettings.mode,
        commitModeSettings: JSON.stringify(commitModeSettings),
        baseBranch: formData.baseBranch,
        codexConfig: selectedProvider === 'openai' ? {
          model: codexConfig.model,
          modelProvider: codexConfig.modelProvider,
          approvalPolicy: codexConfig.approvalPolicy,
          sandboxMode: codexConfig.sandboxMode,
          webSearch: codexConfig.webSearch,
          thinkingLevel: codexConfig.thinkingLevel
        } : undefined
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
      
      // Note: Model preferences are now stored in panel settings during panel creation
      
      onClose();
      // Reset form - name and prompt are cleared, but other settings are preserved from preferences
      // This will be handled by the useEffect when the dialog opens again
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
                          // Use the active provider's prompt for name generation
                          const promptForName = (selectedProvider === 'anthropic' || selectedProvider === 'zai') ? claudeConfig.prompt :
                                               selectedProvider === 'openai' ? codexConfig.prompt : '';
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
                      disabled={!selectedProvider || selectedProvider === 'none' ||
                               ((selectedProvider === 'anthropic' || selectedProvider === 'zai') && !claudeConfig.prompt?.trim()) ||
                               (selectedProvider === 'openai' && !codexConfig.prompt?.trim())}
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
                      setFormData(prev => ({ ...prev, count }));
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
              
              {/* Provider Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Select AI Provider
                </label>
                <ProviderSelection
                  selectedProvider={selectedProvider}
                  onProviderChange={(providerId, modelId) => {
                    setSelectedProvider(providerId);
                    setSelectedModel(modelId);
                  }}
                />
              </div>
              
              {/* Provider-specific configuration */}
              {(selectedProvider === 'anthropic' || selectedProvider === 'zai') && (
                <Card
                  variant="bordered"
                  className={`relative p-4 transition-colors ${
                    isDragging ? 'border-interactive border-dashed bg-interactive/10' : ''
                  }`}
                  onDrop={handleDrop}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                >
                  {isDragging && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-card border-2 border-dashed border-interactive bg-interactive/10 text-interactive">
                      <Paperclip className="w-5 h-5 mb-1" />
                      <span className="text-xs font-medium">Drop files to attach</span>
                    </div>
                  )}

                  <div className={isDragging ? 'opacity-60' : ''}>
                    <ClaudeCodeConfigComponent
                      config={claudeConfig}
                      providerId={selectedProvider} // Pass the selected provider ID
                      onChange={(newConfig) => {
                        setClaudeConfig(newConfig);
                        // Update the selected model to keep in sync with ProviderSelection
                        if (newConfig.model !== claudeConfig.model) {
                          setSelectedModel(newConfig.model);
                        }
                        syncPromptAcrossConfigs(newConfig.prompt ?? '', 'claude');
                        syncImageAttachments(() => [...(newConfig.attachedImages || [])]);
                        syncTextAttachments(() => [...(newConfig.attachedTexts || [])]);
                        // Save claude config preferences (excluding prompt and attachments)
                        const { prompt, attachedImages, attachedTexts, ...configToSave } = newConfig;
                        savePreferences({ claudeConfig: {
                          model: configToSave.model,
                          permissionMode: configToSave.permissionMode,
                          ultrathink: configToSave.ultrathink ?? false
                        } });
                      }}
                      projectId={projectId?.toString()}
                      onPaste={handlePaste}
                      onRemoveImage={removeImage}
                      onRemoveText={removeText}
                    />
                  </div>
                </Card>
              )}

              {selectedProvider === 'openai' && (
                <Card
                  variant="bordered"
                  className={`relative p-4 transition-colors ${
                    isDragging ? 'border-interactive border-dashed bg-interactive/10' : ''
                  }`}
                  onDrop={handleDrop}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                >
                  {isDragging && (
                    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-card border-2 border-dashed border-interactive bg-interactive/10 text-interactive">
                      <Paperclip className="w-5 h-5 mb-1" />
                      <span className="text-xs font-medium">Drop files to attach</span>
                    </div>
                  )}

                  <div className={isDragging ? 'opacity-60' : ''}>
                    <CodexConfigComponent
                      config={codexConfig}
                      onChange={(newConfig) => {
                        setCodexConfig(newConfig);
                        syncPromptAcrossConfigs(newConfig.prompt ?? '', 'codex');
                        syncImageAttachments(() => [...(newConfig.attachedImages || [])]);
                        syncTextAttachments(() => [...(newConfig.attachedTexts || [])]);
                        // Save codex config preferences (excluding prompt and attachments)
                        const { prompt, attachedImages, attachedTexts, ...configToSave } = newConfig;
                        savePreferences({ codexConfig: {
                          model: (configToSave.model ?? DEFAULT_CODEX_MODEL) as string,
                          modelProvider: configToSave.modelProvider ?? 'openai',
                          approvalPolicy: configToSave.approvalPolicy ?? 'auto',
                          sandboxMode: configToSave.sandboxMode ?? 'workspace-write',
                          webSearch: configToSave.webSearch ?? false,
                          thinkingLevel: configToSave.thinkingLevel ?? 'medium'
                        } });
                      }}
                      projectId={projectId?.toString()}
                      onPaste={handlePaste}
                      onRemoveImage={removeImage}
                      onRemoveText={removeText}
                    />
                  </div>
                </Card>
              )}

              {!selectedProvider || selectedProvider === 'none' && (
                <Card variant="bordered" className="p-4 text-center text-text-tertiary">
                  <p className="text-sm">No AI tool will be launched. You can add tools later from within the session.</p>
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
                    onChange={(value) => syncPromptAcrossConfigs(value, 'none')}
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
                        addImageAttachment(image);
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
                onClick={() => {
                  const newShowAdvanced = !showAdvanced;
                  setShowAdvanced(newShowAdvanced);
                  savePreferences({ showAdvanced: newShowAdvanced });
                }}
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
                        savePreferences({ baseBranch: selectedBranch });
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
                    savePreferences({ commitModeSettings: settings });
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
              !selectedProvider || selectedProvider === 'none' ? 'Session will be created without AI tool' :
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

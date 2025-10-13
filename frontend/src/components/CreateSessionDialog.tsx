import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API } from '../utils/api';
import type { CreateSessionRequest } from '../types/session';
import type { Project } from '../types/project';
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
import { DEFAULT_CODEX_MODEL, type OpenAICodexModel } from '../../../shared/types/models';
import { useSessionPreferencesStore, type SessionCreationPreferences } from '../stores/sessionPreferencesStore';

// Interface for branch information
interface BranchInfo {
  name: string;
  isCurrent: boolean;
  hasWorktree: boolean;
}

const LARGE_TEXT_THRESHOLD = 5000;

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
  initialPrompt?: string;
  initialSessionName?: string;
}

export function CreateSessionDialog({ isOpen, onClose, projectName, projectId, initialPrompt, initialSessionName }: CreateSessionDialogProps) {
  const [sessionName, setSessionName] = useState<string>(initialSessionName || '');
  const [sessionCount, setSessionCount] = useState<number>(1);
  const [selectedTools, setSelectedTools] = useState<{ claude: boolean; codex: boolean }>({
    claude: !!initialPrompt,
    codex: false
  });
  const [sharedPrompt, setSharedPrompt] = useState<string>(initialPrompt || '');
  const [claudeConfig, setClaudeConfig] = useState<ClaudeCodeConfig>({
    prompt: initialPrompt || '',
    model: 'auto',
    permissionMode: 'ignore',
    ultrathink: false,
    attachedImages: [],
    attachedTexts: []
  });
  const [codexConfig, setCodexConfig] = useState<CodexConfig>({
    prompt: initialPrompt || '',
    model: DEFAULT_CODEX_MODEL,
    modelProvider: 'openai',
    approvalPolicy: 'auto',  // Always 'auto' - manual mode not implemented
    sandboxMode: 'workspace-write',
    webSearch: false,
    thinkingLevel: 'medium',
    attachedImages: [],
    attachedTexts: []
  });
  const [formData, setFormData] = useState<CreateSessionRequest>({
    prompt: initialPrompt || '',
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showError } = useErrorStore();
  const { preferences, loadPreferences, updatePreferences } = useSessionPreferencesStore();

  const syncPromptAcrossConfigs = useCallback((newPrompt: string) => {
    setSharedPrompt(newPrompt);
    setFormData(prev => (prev.prompt === newPrompt ? prev : { ...prev, prompt: newPrompt }));
    setClaudeConfig(prev => (prev.prompt === newPrompt ? prev : { ...prev, prompt: newPrompt }));
    setCodexConfig(prev => (prev.prompt === newPrompt ? prev : { ...prev, prompt: newPrompt }));
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
      // Only clear session name if there's no initialSessionName
      if (!initialSessionName) {
        setSessionName('');
      } else {
        setSessionName(initialSessionName);
      }
      setSessionCount(1);
      setFormData(prev => ({ ...prev, count: 1 }));
      // Only clear prompts if there's no initialPrompt
      if (!initialPrompt) {
        syncPromptAcrossConfigs('');
      } else {
        // If we have an initialPrompt, sync it to all configs
        syncPromptAcrossConfigs(initialPrompt);
      }
      syncImageAttachments(() => []);
      syncTextAttachments(() => []);
    }
  }, [isOpen, loadPreferences, syncPromptAcrossConfigs, syncImageAttachments, syncTextAttachments, initialPrompt, initialSessionName]);


  // Apply loaded preferences to state
  useEffect(() => {
    if (preferences) {
      // Map the old toolType preference to the new selectedTools state
      if (initialPrompt) {
        // If we have an initialPrompt, default to Claude being selected
        setSelectedTools({ claude: true, codex: false });
      } else if (preferences.selectedTools) {
        setSelectedTools({
          claude: !!preferences.selectedTools.claude,
          codex: !!preferences.selectedTools.codex
        });
      } else if (preferences.toolType) {
        // Map old preference format to new checkbox format
        setSelectedTools({
          claude: preferences.toolType === 'claude',
          codex: preferences.toolType === 'codex'
        });
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
        approvalPolicy: 'auto',  // Always 'auto' - manual mode not implemented
        sandboxMode: preferences.codexConfig.sandboxMode,
        webSearch: preferences.codexConfig.webSearch,
        thinkingLevel: preferences.codexConfig.thinkingLevel || 'medium'
      }));
      setShowAdvanced(preferences.showAdvanced);
      setCommitModeSettings(preferences.commitModeSettings);
      // Note: we don't apply baseBranch as it should be project-specific
    }
  }, [preferences, initialPrompt]);

  // Save preferences when certain settings change
  const savePreferences = useCallback(async (updates: Partial<SessionCreationPreferences>) => {
    await updatePreferences(updates);
  }, [updatePreferences]);

  const persistSelectedToolsPreference = useCallback((tools: { claude: boolean; codex: boolean }) => {
    const nextToolType: SessionCreationPreferences['toolType'] = tools.claude && tools.codex
      ? 'none'
      : tools.claude
        ? 'claude'
        : tools.codex
          ? 'codex'
          : 'none';

    void savePreferences({
      toolType: nextToolType,
      selectedTools: {
        claude: tools.claude,
        codex: tools.codex
      }
    });
  }, [savePreferences]);
  
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
      }).catch((err: Error) => {
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
          const project = projectsResponse.data.find((p: Project) => p.id === projectId);
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
            const currentBranch = branchesResponse.data.find((b: BranchInfo) => b.isCurrent);
            if (currentBranch && !formData.baseBranch) {
              setFormData(prev => ({ ...prev, baseBranch: currentBranch.name }));
            }
          }
          
          if (mainBranchResponse.success && mainBranchResponse.data) {
            // Main branch detected but not currently used in UI
          }
        }).catch((err: Error) => {
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
    // Session name is always required when no tools are selected OR when there's no API key
    if (!sessionName && (!hasApiKey || (!selectedTools.claude && !selectedTools.codex))) {
      showError({
        title: 'Session Name Required',
        error: !selectedTools.claude && !selectedTools.codex
          ? 'Please provide a session name when creating a session without AI tools.'
          : 'Please provide a session name or add an Anthropic API key in Settings to enable auto-naming.'
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
      // Prepare shared prompt with attachments
      let finalPrompt = sharedPrompt || '';

      // Process attachments (shared across all tools)
      const attachmentPaths: string[] = [];

      // Save attached text files
      if (attachedTexts.length > 0) {
        const tempId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        for (const text of attachedTexts) {
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
      if (attachedImages.length > 0) {
        const tempId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        try {
          console.log(`[Image] Saving ${attachedImages.length} attached image(s) to temporary files`);
          const imagePaths = await window.electronAPI.sessions.saveImages(
            tempId,
            attachedImages.map(img => ({
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

      // Determine which tools to create sessions for
      const toolsToCreate: Array<'claude' | 'codex' | 'none'> = [];
      if (selectedTools.claude) toolsToCreate.push('claude');
      if (selectedTools.codex) toolsToCreate.push('codex');

      // If no tools selected, create a session with no agent
      if (toolsToCreate.length === 0) {
        toolsToCreate.push('none');
      }

      // Generate session name ONCE if not provided and we have API key + prompt
      let baseSessionName = sessionName;
      if (!baseSessionName && hasApiKey && finalPrompt.trim()) {
        try {
          console.log('[CreateSessionDialog] Generating session name from prompt');
          const response = await API.sessions.generateName(finalPrompt);
          if (response.success && response.data) {
            baseSessionName = response.data;
            console.log(`[CreateSessionDialog] Generated session name: ${baseSessionName}`);
          } else {
            // AI generation failed
            showError({
              title: 'Failed to Generate Session Name',
              error: response.error || 'Could not generate session name from prompt. Please provide a session name manually.'
            });
            return;
          }
        } catch (error) {
          console.error('[CreateSessionDialog] Failed to generate session name:', error);
          showError({
            title: 'Failed to Generate Session Name',
            error: 'An error occurred while generating the session name. Please provide a session name manually.'
          });
          return;
        }
      }

      // At this point, baseSessionName should always have a value (either user-provided or AI-generated)
      if (!baseSessionName) {
        showError({
          title: 'Session Name Required',
          error: 'Please provide a session name or add an Anthropic API key in Settings to enable auto-naming.'
        });
        return;
      }

      // Determine if we need to create a folder
      // Create folder when: multiple sessions (sessionCount > 1) OR multiple tools selected
      const shouldCreateFolder = sessionCount > 1 || toolsToCreate.length > 1;

      // Create folder first if needed
      let folderId: string | undefined;
      if (shouldCreateFolder && projectId) {
        try {
          const folderResponse = await API.folders.create(baseSessionName, projectId);
          if (folderResponse.success && folderResponse.data) {
            folderId = folderResponse.data.id;
            console.log(`[CreateSessionDialog] Created folder: ${baseSessionName} (${folderId})`);
            // Wait a bit to ensure the folder is created in the UI
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.error('[CreateSessionDialog] Failed to create folder:', error);
          // Continue without folder - sessions will be created at project level
        }
      }

      // Create sessions for each selected tool
      for (const toolType of toolsToCreate) {
        // Prepare tool-specific prompt
        let toolPrompt = finalPrompt;
        let toolPermissionMode: 'ignore' | 'approve' = 'ignore';

        if (toolType === 'claude') {
          if (claudeConfig.ultrathink && toolPrompt) {
            toolPrompt += '\nultrathink';
          }
          toolPermissionMode = claudeConfig.permissionMode;
        } else if (toolType === 'codex') {
          toolPermissionMode = formData.permissionMode || 'ignore';
        } else if (toolType === 'none') {
          // For sessions with no agent, use default permission mode
          toolPermissionMode = formData.permissionMode || 'ignore';
        }

        // Determine session name:
        // - If multiple tools selected, add tool prefix (e.g., 'CC-' for Claude Code or 'CX-' for Codex)
        // - If both sessionCount > 1 AND multiple tools, the count suffix will be added by taskQueue
        let finalSessionName: string | undefined;
        if (baseSessionName) {
          if (toolsToCreate.length > 1) {
            const prefix = toolType === 'claude' ? 'CC' : toolType === 'codex' ? 'CX' : toolType;
            finalSessionName = `${prefix}-${baseSessionName}`;
          } else {
            finalSessionName = baseSessionName;
          }
        }

        console.log('[CreateSessionDialog] Creating session with:', {
          sessionName: finalSessionName || '(auto-generate)',
          count: sessionCount,
          toolType,
          prompt: toolPrompt || '(no prompt)',
          folderId
        });

        const response = await API.sessions.create({
          prompt: toolPrompt || '',
          worktreeTemplate: finalSessionName,
          count: sessionCount,
          toolType,
          permissionMode: toolPermissionMode,
          projectId,
          folderId, // Pass the folder ID to assign sessions to the folder
          commitMode: commitModeSettings.mode,
          commitModeSettings: JSON.stringify(commitModeSettings),
          baseBranch: formData.baseBranch,
          codexConfig: toolType === 'codex' ? {
            model: codexConfig.model,
            modelProvider: codexConfig.modelProvider,
            approvalPolicy: 'auto',
            sandboxMode: codexConfig.sandboxMode,
            webSearch: codexConfig.webSearch,
            thinkingLevel: codexConfig.thinkingLevel
          } : undefined,
          claudeConfig: toolType === 'claude' ? {
            model: claudeConfig.model,
            permissionMode: claudeConfig.permissionMode,
            ultrathink: claudeConfig.ultrathink
          } : undefined
        });

        if (!response.success) {
          showError({
            title: `Failed to Create ${toolType === 'claude' ? 'Claude' : 'Codex'} Session`,
            error: response.error || 'An error occurred while creating the session.',
            details: response.details,
            command: response.command
          });
          // Continue creating other sessions even if one fails
          continue;
        }
      }

      onClose();
    } catch (error: unknown) {
      console.error('Error creating session:', error);
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while creating the session.';
      const errorDetails = error instanceof Error ? (error.stack || error.toString()) : String(error);
      showError({
        title: 'Failed to Create Session',
        error: errorMessage,
        details: errorDetails
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
                    Session Name {(!selectedTools.claude && !selectedTools.codex) || !hasApiKey ? '(Required)' : '(Optional)'}
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
                          // Use the shared prompt for name generation
                          const response = await API.sessions.generateName(sharedPrompt || 'New session');
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
                      disabled={!sharedPrompt?.trim()}
                      title="Generate name from prompt"
                      size="md"
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      {isGeneratingName ? 'Generating...' : 'Generate'}
                    </Button>
                  )}
                </div>
                  {!sessionName && (!hasApiKey || (!selectedTools.claude && !selectedTools.codex)) && (
                  <p className="text-xs text-status-warning mt-1">
                    {(!selectedTools.claude && !selectedTools.codex)
                      ? 'Session name is required when creating sessions without AI tools.'
                      : 'Session name is required. Add an Anthropic API key in Settings to enable AI-powered auto-naming.'}
                  </p>
                )}
                  {!worktreeError && (sessionName || (hasApiKey && (selectedTools.claude || selectedTools.codex))) && (
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
            
            {/* Shared Prompt Section */}
            <div className="p-6 border-b border-border-primary">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-interactive" />
                <h3 className="text-sm font-semibold text-text-primary">Initial Prompt</h3>
              </div>
              <div>
                <label htmlFor="shared-prompt" className="block text-sm font-medium text-text-secondary mb-2">
                  What would you like to work on?
                </label>
                {(attachedImages.length > 0 || attachedTexts.length > 0) && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {attachedTexts.map(text => (
                      <div key={text.id} className="relative group">
                        <div className="h-12 px-3 flex items-center gap-2 bg-surface-secondary rounded border border-border-primary">
                          <FileText className="w-4 h-4 text-text-secondary" />
                          <span className="text-xs text-text-secondary max-w-[150px] truncate">
                            {text.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeText(text.id)}
                          className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          aria-label={`Remove ${text.name}`}
                        >
                          <X className="w-2.5 h-2.5 text-text-secondary" />
                        </button>
                      </div>
                    ))}

                    {attachedImages.map(image => (
                      <div key={image.id} className="relative group">
                        <img
                          src={image.dataUrl}
                          alt={image.name}
                          className="h-12 w-12 object-cover rounded border border-border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(image.id)}
                          className="absolute -top-1 -right-1 bg-surface-primary border border-border-primary rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                          aria-label={`Remove ${image.name}`}
                        >
                          <X className="w-2.5 h-2.5 text-text-secondary" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <FilePathAutocomplete
                    value={sharedPrompt}
                    onChange={(value) => syncPromptAcrossConfigs(value)}
                    projectId={projectId?.toString()}
                    placeholder={!selectedTools.claude && !selectedTools.codex ? "Prompt disabled (no AI tools selected)" : "Describe your task... (use @ to reference files)"}
                    className="w-full px-3 py-2 pr-10 border border-border-primary rounded-md focus:outline-none focus:ring-2 focus:ring-interactive text-text-primary bg-surface-secondary placeholder-text-tertiary"
                    isTextarea={true}
                    rows={3}
                    onPaste={handlePaste}
                    disabled={!selectedTools.claude && !selectedTools.codex}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-2 right-2 p-1.5 rounded hover:bg-surface-hover transition-colors"
                    title="Attach images"
                    disabled={!selectedTools.claude && !selectedTools.codex}
                  >
                    <Paperclip className="w-4 h-4 text-text-tertiary hover:text-text-secondary" />
                  </button>
                </div>
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
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            {/* Tool Configuration Section */}
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Code2 className="w-4 h-4 text-interactive" />
                <h3 className="text-sm font-semibold text-text-primary">AI Tool Selection</h3>
              </div>

              {/* Tool Type Selection - Checkboxes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Select Tools (optional - select one, both, or none)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <Card
                    variant={selectedTools.claude ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      selectedTools.claude
                        ? 'border-interactive bg-interactive/10'
                        : ''
                    }`}
                    onClick={() => {
                      setSelectedTools(prev => {
                        const nextState = { ...prev, claude: !prev.claude };
                        persistSelectedToolsPreference(nextState);
                        return nextState;
                      });
                    }}
                  >
                    <div className="flex items-center gap-3 py-2 px-2">
                      <input
                        type="checkbox"
                        checked={selectedTools.claude}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-border-primary text-interactive focus:ring-2 focus:ring-interactive"
                      />
                      <div className="flex items-center gap-2 flex-1">
                        <Brain className={`w-5 h-5 ${selectedTools.claude ? 'text-interactive' : 'text-text-tertiary'}`} />
                        <div>
                          <span className={`text-sm font-medium block ${selectedTools.claude ? 'text-interactive' : ''}`}>Claude Code</span>
                          <span className="text-xs opacity-75">AI assistant</span>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card
                    variant={selectedTools.codex ? 'interactive' : 'bordered'}
                    padding="sm"
                    className={`relative cursor-pointer transition-all ${
                      selectedTools.codex
                        ? 'border-interactive bg-interactive/10'
                        : ''
                    }`}
                    onClick={() => {
                      setSelectedTools(prev => {
                        const nextState = { ...prev, codex: !prev.codex };
                        persistSelectedToolsPreference(nextState);
                        return nextState;
                      });
                    }}
                  >
                    <div className="flex items-center gap-3 py-2 px-2">
                      <input
                        type="checkbox"
                        checked={selectedTools.codex}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-border-primary text-interactive focus:ring-2 focus:ring-interactive"
                      />
                      <div className="flex items-center gap-2 flex-1">
                        <Code2 className={`w-5 h-5 ${selectedTools.codex ? 'text-interactive' : 'text-text-tertiary'}`} />
                        <div>
                          <span className={`text-sm font-medium block ${selectedTools.codex ? 'text-interactive' : ''}`}>Codex</span>
                          <span className="text-xs opacity-75">Multi-model AI</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
              
              {/* Tool-specific configuration */}
              {selectedTools.claude && (
                <Card variant="bordered" className="p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-interactive" />
                    <h4 className="text-sm font-semibold text-text-primary">Claude Code Settings</h4>
                  </div>
                  <ClaudeCodeConfigComponent
                    config={claudeConfig}
                    onChange={(newConfig) => {
                      setClaudeConfig(newConfig);
                      // Don't sync prompt anymore since it's managed at the top level
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
                    disabled={false}
                  />
                </Card>
              )}

              {selectedTools.codex && (
                <Card variant="bordered" className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Code2 className="w-4 h-4 text-interactive" />
                    <h4 className="text-sm font-semibold text-text-primary">Codex Settings</h4>
                  </div>
                  <CodexConfigComponent
                    config={codexConfig}
                    onChange={(newConfig) => {
                      setCodexConfig(newConfig);
                      // Don't sync prompt anymore since it's managed at the top level
                      // Save codex config preferences (excluding prompt and attachments)
                      const { prompt, attachedImages, attachedTexts, ...configToSave } = newConfig;
                      savePreferences({ codexConfig: {
                        model: (configToSave.model ?? DEFAULT_CODEX_MODEL) as string,
                        modelProvider: configToSave.modelProvider ?? 'openai',
                        approvalPolicy: 'auto',  // Always 'auto' - manual mode not implemented
                        sandboxMode: configToSave.sandboxMode ?? 'workspace-write',
                        webSearch: configToSave.webSearch ?? false,
                        thinkingLevel: configToSave.thinkingLevel ?? 'medium'
                      } });
                    }}
                    projectId={projectId?.toString()}
                    onPaste={handlePaste}
                    onRemoveImage={removeImage}
                    onRemoveText={removeText}
                    disabled={false}
                  />
                </Card>
              )}

              {!selectedTools.claude && !selectedTools.codex && (
                <Card variant="bordered" className="p-4 text-center text-text-tertiary">
                  <p className="text-sm">No AI tools selected. The session will be created without an AI agent.</p>
                  <p className="text-xs mt-2 opacity-75">You can use the terminal and git features without an AI assistant.</p>
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
                    onChange={(value) => syncPromptAcrossConfigs(value)}
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
            disabled={
              isSubmitting ||
              !!worktreeError ||
              (!sessionName && (!hasApiKey || (!selectedTools.claude && !selectedTools.codex)))
            }
            loading={isSubmitting}
            title={
              isSubmitting ? 'Creating session...' :
              worktreeError ? 'Please fix the session name error' :
              (!sessionName && (!hasApiKey || (!selectedTools.claude && !selectedTools.codex))) ?
                (!selectedTools.claude && !selectedTools.codex)
                  ? 'Please enter a session name (required for sessions without AI tools)'
                  : 'Please enter a session name (required without API key)' :
              undefined
            }
          >
            {isSubmitting ? 'Creating...' : (() => {
              const toolCount = Math.max(1, (selectedTools.claude ? 1 : 0) + (selectedTools.codex ? 1 : 0));
              const totalSessions = toolCount * sessionCount;
              return `Create ${totalSessions > 1 ? totalSessions + ' Sessions' : 'Session'}`;
            })()}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

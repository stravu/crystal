import { useState, useEffect, useCallback, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { usePanelStore } from '../stores/panelStore';
import type { Session } from '../types/session';
import { DEFAULT_CODEX_MODEL } from '../../../shared/types/models';

interface CodexPanelHook {
  activeSession: Session | null;
  isProcessing: boolean;
  isInitialized: boolean;
  handleSendMessage: (message: string, options?: any) => Promise<void>;
  handleApproval: (callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch') => Promise<void>;
  handleInterrupt: () => Promise<void>;
}

export function useCodexPanel(panelId: string, isActive: boolean): CodexPanelHook {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializingRef = useRef(false);
  const conversationHistoryRef = useRef<any[]>([]);

  // Get session from panel
  const panel = usePanelStore(state => {
    // state.panels is an object keyed by sessionId, we need to flatten it
    if (!state.panels) return undefined;
    const allPanels = Object.values(state.panels).flat();
    const found = allPanels.find(p => p && p.id === panelId);
    return found;
  });
  const sessionId = panel?.sessionId;
  
  // Get session data
  const activeSession = useSessionStore(state => {
    const session = state.sessions.find(s => s.id === sessionId) || null;
    return session;
  });

  // Initialize Codex panel when it becomes active and has a session
  useEffect(() => {
    if (isActive && sessionId && !isInitialized && !initializingRef.current) {
      initializeCodexPanel();
    }
  }, [isActive, sessionId, isInitialized]);

  // Listen for Codex events
  useEffect(() => {
    const handleOutput = (data: any) => {
      if (data.panelId === panelId) {

        const isCancellationMessage =
          data.type === 'json' &&
          data.data?.type === 'session' &&
          data.data?.data?.status === 'cancelled';

        if (isCancellationMessage) {
          setIsProcessing(false);
        }

        if (data.type === 'json' && data.data && !isCancellationMessage) {
          conversationHistoryRef.current.push({
            type: data.data.type || 'unknown',
            content: data.data,
            timestamp: data.timestamp || new Date().toISOString()
          });
        }

        if (data.type === 'json' && data.data?.msg?.type === 'task_complete') {
          setIsProcessing(false);
        }

        if (data.type === 'json' && data.data?.msg?.type === 'agent_message') {
          setIsProcessing(false);
        }

        // Don't re-dispatch the event - components already listen to IPC events directly
        // This was causing duplicate event handling
      }
    };

    const handleSpawned = (data: any) => {
      if (data.panelId === panelId) {
        setIsInitialized(true);
        setIsProcessing(false);
      }
    };

    const handleExit = (data: any) => {
      if (data.panelId === panelId) {
        setIsProcessing(false);
      }
    };

    const handleError = (data: any) => {
      if (data.panelId === panelId) {
        console.error('Codex panel error:', data.error);
        setIsProcessing(false);
      }
    };

    // Subscribe to Codex events
    window.electron?.on('codexPanel:output', handleOutput);
    window.electron?.on('codexPanel:spawned', handleSpawned);
    window.electron?.on('codexPanel:exit', handleExit);
    window.electron?.on('codexPanel:error', handleError);

    return () => {
      window.electron?.off('codexPanel:output', handleOutput);
      window.electron?.off('codexPanel:spawned', handleSpawned);
      window.electron?.off('codexPanel:exit', handleExit);
      window.electron?.off('codexPanel:error', handleError);
    };
  }, [panelId]);

  const initializeCodexPanel = async () => {
    if (!sessionId || !activeSession) {
      return;
    }
    
    try {
      initializingRef.current = true;
      
      // Initialize the Codex panel
      const initResult = await window.electron?.invoke('codexPanel:initialize', panelId, sessionId, activeSession.worktreePath);
      
      if (initResult?.hasExistingSession) {
        // If there's an existing session ID, treat the panel as initialized so we can continue it
        setIsInitialized(true);
        
        // Load existing conversation history for this panel
        try {
          const outputs = await window.electron?.invoke('codexPanel:getOutputs', panelId);
          if (outputs && outputs.length > 0) {
            // Rebuild conversation history from outputs
            const history: any[] = [];
            for (const output of outputs) {
              if (output.type === 'json' && output.data) {
                history.push({
                  type: output.data.type || 'unknown',
                  content: output.data,
                  timestamp: output.timestamp || new Date().toISOString()
                });
              }
            }
            conversationHistoryRef.current = history;
          }
        } catch (error) {
          console.error('Failed to load conversation history:', error);
        }
      } else {
        // Check if it's running
        const { isRunning } = await window.electron?.invoke('codexPanel:isRunning', panelId) || { isRunning: false };
        setIsInitialized(isRunning);
      }
      
    } catch (error) {
      console.error('Failed to initialize panel:', error);
    } finally {
      initializingRef.current = false;
    }
  };

  const handleSendMessage = useCallback(async (message: string, options?: any) => {
    if (!activeSession || !panelId) {
      return;
    }
    
    // Process attachments if present
    let finalMessage = message;
    const attachmentPaths: string[] = [];
    
    // Save text attachments to files and collect paths
    if (options?.attachedTexts && options.attachedTexts.length > 0) {
      try {
        for (const text of options.attachedTexts) {
          const textFilePath = await window.electronAPI.sessions.saveLargeText(
            activeSession.id,
            text.content
          );
          attachmentPaths.push(textFilePath);
        }
      } catch (error) {
        console.error('Failed to save text attachments:', error);
      }
    }
    
    // Save image attachments to files and collect paths
    if (options?.attachedImages && options.attachedImages.length > 0) {
      try {
        const imagePaths = await window.electronAPI.sessions.saveImages(
          activeSession.id,
          options.attachedImages.map((img: any) => ({
            name: img.name,
            dataUrl: img.dataUrl,
            type: img.type,
          }))
        );
        attachmentPaths.push(...imagePaths);
      } catch (error) {
        console.error('Failed to save image attachments:', error);
      }
    }
    
    // If we have attachment paths, append them to the message
    if (attachmentPaths.length > 0) {
      const attachmentsMessage = `\n\n<attachments>\nPlease look at these files which may provide additional instructions or context:\n${attachmentPaths.join('\n')}\n</attachments>`;
      finalMessage = message + attachmentsMessage;
    }
    
    // Add user message to conversation history
    conversationHistoryRef.current.push({
      type: 'user_input',
      content: finalMessage,
      timestamp: new Date().toISOString()
    });
    
    // Don't dispatch custom event - let the backend handle sending output events
    // This prevents duplicate events and maintains consistency
    
    setIsProcessing(true);
    
    try {
      if (!isInitialized) {
        // Start Codex with the initial prompt 
        await window.electron?.invoke('codexPanel:start', 
          panelId, 
          activeSession.worktreePath, 
          finalMessage,
          {
            model: options?.model || DEFAULT_CODEX_MODEL,
            modelProvider: options?.modelProvider || 'openai',
            sandboxMode: options?.sandboxMode || 'workspace-write',
            webSearch: options?.webSearch || false,
            thinkingLevel: options?.thinkingLevel || 'medium'
          }
        );
        setIsInitialized(true);
      } else {
        // In interactive mode, each new prompt requires spawning a new process with 'continue'
        // Get conversation history for context
        const conversationHistory = conversationHistoryRef.current || [];
        
        await window.electron?.invoke('codexPanel:continue', 
          panelId,
          activeSession.worktreePath,
          finalMessage,
          conversationHistory,
          {
            model: options?.model || DEFAULT_CODEX_MODEL,
            modelProvider: options?.modelProvider || 'openai',
            thinkingLevel: options?.thinkingLevel || 'medium',
            sandboxMode: options?.sandboxMode || 'workspace-write',
            webSearch: options?.webSearch || false
          }
        );
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsProcessing(false);
    }
  }, [activeSession, panelId, isInitialized]);

  const handleApproval = useCallback(async (callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch') => {
    if (!panelId) return;
    
    try {
      await window.electron?.invoke('codexPanel:sendApproval', panelId, callId, decision, type);
    } catch (error) {
      console.error('Failed to send approval:', error);
    }
  }, [panelId]);

  const handleInterrupt = useCallback(async () => {
    if (!panelId) return;
    
    try {
      await window.electron?.invoke('codexPanel:sendInterrupt', panelId);
      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to send interrupt:', error);
    }
  }, [panelId]);

  return {
    activeSession,
    isProcessing,
    isInitialized,
    handleSendMessage,
    handleApproval,
    handleInterrupt
  };
}

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
  console.log(`[codex-debug] useCodexPanel called: Panel ${panelId}, Active: ${isActive}`);
  
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
    if (found) {
      console.log(`[codex-debug] Panel found: ${found.id}, Session: ${found.sessionId}, Type: ${found.type}`);
    }
    return found;
  });
  const sessionId = panel?.sessionId;
  
  // Get session data
  const activeSession = useSessionStore(state => {
    const session = state.sessions.find(s => s.id === sessionId) || null;
    if (session) {
      console.log(`[codex-debug] Active session found: ${session.id}, Status: ${session.status}, Worktree: ${session.worktreePath}`);
    } else if (sessionId) {
      console.warn(`[codex-debug] No session found for ID: ${sessionId}`);
    }
    return session;
  });

  // Initialize Codex panel when it becomes active and has a session
  useEffect(() => {
    console.log(`[codex-debug] Init effect triggered: Active=${isActive}, SessionId=${sessionId}, Initialized=${isInitialized}, Initializing=${initializingRef.current}`);
    if (isActive && sessionId && !isInitialized && !initializingRef.current) {
      console.log(`[codex-debug] Triggering initialization for panel ${panelId}`);
      initializeCodexPanel();
    }
  }, [isActive, sessionId, isInitialized]);

  // Listen for Codex events
  useEffect(() => {
    const handleOutput = (data: any) => {
      if (data.panelId === panelId) {
        console.log(`[codex-debug] Output event received for panel ${panelId}:`, JSON.stringify(data).substring(0, 500));

        const isCancellationMessage =
          data.type === 'json' &&
          data.data?.type === 'session' &&
          data.data?.data?.status === 'cancelled';

        if (isCancellationMessage) {
          console.log(`[codex-debug] Cancellation message received for panel ${panelId}, marking processing as false`);
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
          console.log(`[codex-debug] Task complete received for panel ${panelId}, resetting processing state`);
          setIsProcessing(false);
        }

        if (data.type === 'json' && data.data?.msg?.type === 'agent_message') {
          console.log(`[codex-debug] Agent message received for panel ${panelId}, resetting processing state`);
          setIsProcessing(false);
        }

        // Don't re-dispatch the event - components already listen to IPC events directly
        // This was causing duplicate event handling
      }
    };

    const handleSpawned = (data: any) => {
      if (data.panelId === panelId) {
        console.log(`[codex-debug] Spawned event received for panel ${panelId}`);
        setIsInitialized(true);
        setIsProcessing(false);
      }
    };

    const handleExit = (data: any) => {
      if (data.panelId === panelId) {
        console.log(`[codex-debug] Exit event received for panel ${panelId}: Exit code ${data.exitCode}`);
        setIsProcessing(false);
      }
    };

    const handleError = (data: any) => {
      if (data.panelId === panelId) {
        console.error(`[codex-debug] Error event received for panel ${panelId}:`, data.error);
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
      console.warn(`[codex-debug] Cannot initialize panel ${panelId}: SessionId=${sessionId}, ActiveSession=${!!activeSession}`);
      return;
    }
    
    try {
      initializingRef.current = true;
      console.log(`[codex-debug] Starting initialization for panel ${panelId}, Session ${sessionId}, Worktree: ${activeSession.worktreePath}`);
      
      // Initialize the Codex panel
      console.log(`[codex-debug] Invoking codexPanel:initialize for panel ${panelId}`);
      const initResult = await window.electron?.invoke('codexPanel:initialize', panelId, sessionId, activeSession.worktreePath);
      
      if (initResult?.hasExistingSession) {
        console.log(`[codex-debug] Panel ${panelId} has an existing Codex session ID - marking as initialized for continuation`);
        // If there's an existing session ID, treat the panel as initialized so we can continue it
        setIsInitialized(true);
        
        // Load existing conversation history for this panel
        try {
          console.log(`[codex-debug] Loading conversation history for panel ${panelId}`);
          const outputs = await window.electron?.invoke('codexPanel:getOutputs', panelId);
          if (outputs && outputs.length > 0) {
            console.log(`[codex-debug] Loaded ${outputs.length} outputs for panel ${panelId}`);
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
            console.log(`[codex-debug] Restored ${history.length} conversation history items for panel ${panelId}`);
          }
        } catch (error) {
          console.error(`[codex-debug] Failed to load conversation history for panel ${panelId}:`, error);
        }
      } else {
        // Check if it's running
        console.log(`[codex-debug] Checking if panel ${panelId} is running`);
        const { isRunning } = await window.electron?.invoke('codexPanel:isRunning', panelId) || { isRunning: false };
        console.log(`[codex-debug] Panel ${panelId} running status: ${isRunning}`);
        setIsInitialized(isRunning);
      }
      
    } catch (error) {
      console.error(`[codex-debug] Failed to initialize panel ${panelId}:`, error);
    } finally {
      initializingRef.current = false;
      console.log(`[codex-debug] Initialization complete for panel ${panelId}`);
    }
  };

  const handleSendMessage = useCallback(async (message: string, options?: any) => {
    console.log(`[codex-debug] handleSendMessage called for panel ${panelId}: "${message}", Initialized: ${isInitialized}`);
    
    if (!activeSession || !panelId) {
      console.warn(`[codex-debug] Cannot send message: ActiveSession=${!!activeSession}, PanelId=${panelId}`);
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
          console.log(`[codex-debug] Saved text attachment: ${textFilePath}`);
        }
      } catch (error) {
        console.error('[codex-debug] Failed to save text attachments:', error);
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
        console.log(`[codex-debug] Saved ${imagePaths.length} image attachments`);
      } catch (error) {
        console.error('[codex-debug] Failed to save image attachments:', error);
      }
    }
    
    // If we have attachment paths, append them to the message
    if (attachmentPaths.length > 0) {
      const attachmentsMessage = `\n\n<attachments>\nPlease look at these files which may provide additional instructions or context:\n${attachmentPaths.join('\n')}\n</attachments>`;
      finalMessage = message + attachmentsMessage;
      console.log(`[codex-debug] Added ${attachmentPaths.length} attachment paths to message`);
    }
    
    // Add user message to conversation history
    conversationHistoryRef.current.push({
      type: 'user_input',
      content: finalMessage,
      timestamp: new Date().toISOString()
    });
    
    // Don't dispatch custom event - let the backend handle sending output events
    // This prevents duplicate events and maintains consistency
    console.log(`[codex-debug] Added user input to conversation history`);
    
    setIsProcessing(true);
    
    try {
      if (!isInitialized) {
        // Start Codex with the initial prompt
        console.log(`[codex-debug] Starting Codex for panel ${panelId} with initial prompt`);
        console.log(`[codex-debug] Options: ${JSON.stringify(options || {})}`); 
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
        console.log(`[codex-debug] Codex started for panel ${panelId}`);
      } else {
        // In interactive mode, each new prompt requires spawning a new process with 'continue'
        console.log(`[codex-debug] Continuing Codex session for panel ${panelId} with new prompt`);
        
        // Get conversation history for context
        const conversationHistory = conversationHistoryRef.current || [];
        console.log(`[codex-debug] Using ${conversationHistory.length} conversation history items`);
        
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
        console.log(`[codex-debug] Codex continue invoked for panel ${panelId}`);
      }
    } catch (error) {
      console.error(`[codex-debug] Failed to send message for panel ${panelId}:`, error);
      setIsProcessing(false);
    }
  }, [activeSession, panelId, isInitialized]);

  const handleApproval = useCallback(async (callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch') => {
    if (!panelId) {
      console.warn(`[codex-debug] Cannot send approval: No panel ID`);
      return;
    }
    
    try {
      console.log(`[codex-debug] Sending approval for panel ${panelId}: CallId=${callId}, Decision=${decision}, Type=${type}`);
      await window.electron?.invoke('codexPanel:sendApproval', panelId, callId, decision, type);
    } catch (error) {
      console.error(`[codex-debug] Failed to send approval for panel ${panelId}:`, error);
    }
  }, [panelId]);

  const handleInterrupt = useCallback(async () => {
    if (!panelId) {
      console.warn(`[codex-debug] Cannot send interrupt: No panel ID`);
      return;
    }
    
    try {
      console.log(`[codex-debug] Sending interrupt signal for panel ${panelId}`);
      await window.electron?.invoke('codexPanel:sendInterrupt', panelId);
      setIsProcessing(false);
    } catch (error) {
      console.error(`[codex-debug] Failed to send interrupt for panel ${panelId}:`, error);
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

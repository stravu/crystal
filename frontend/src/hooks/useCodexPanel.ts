import { useState, useEffect, useCallback, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { usePanelStore } from '../stores/panelStore';
import type { Session } from '../../../shared/types';

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
        // Handle output events - could update local state if needed
        console.log(`[codex-debug] Output event received for panel ${panelId}:`, JSON.stringify(data).substring(0, 500));
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
    window.electron.on('codexPanel:output', handleOutput);
    window.electron.on('codexPanel:spawned', handleSpawned);
    window.electron.on('codexPanel:exit', handleExit);
    window.electron.on('codexPanel:error', handleError);

    return () => {
      window.electron.off('codexPanel:output', handleOutput);
      window.electron.off('codexPanel:spawned', handleSpawned);
      window.electron.off('codexPanel:exit', handleExit);
      window.electron.off('codexPanel:error', handleError);
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
      await window.electron.invoke('codexPanel:initialize', panelId, sessionId, activeSession.worktreePath);
      
      // Check if it's running
      console.log(`[codex-debug] Checking if panel ${panelId} is running`);
      const { isRunning } = await window.electron.invoke('codexPanel:isRunning', panelId);
      console.log(`[codex-debug] Panel ${panelId} running status: ${isRunning}`);
      setIsInitialized(isRunning);
      
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
    
    // Immediately display the user's message in the output
    const userOutputEvent = {
      panelId,
      sessionId: activeSession.id,
      type: 'json',
      data: {
        type: 'user_input',
        content: message
      },
      timestamp: new Date().toISOString()
    };
    
    // Emit the event directly to the output view
    window.dispatchEvent(new CustomEvent('codexPanel:output', { detail: userOutputEvent }));
    console.log(`[codex-debug] Dispatched user input to output view`);
    
    setIsProcessing(true);
    
    try {
      if (!isInitialized) {
        // Start Codex with the initial prompt
        console.log(`[codex-debug] Starting Codex for panel ${panelId} with initial prompt: "${message}"`);
        console.log(`[codex-debug] Options: ${JSON.stringify(options || {})}`); 
        await window.electron.invoke('codexPanel:start', 
          panelId, 
          activeSession.worktreePath, 
          message,
          {
            model: options?.model || 'gpt-5',
            modelProvider: options?.modelProvider || 'openai',
            approvalPolicy: options?.approvalPolicy || 'manual',
            sandboxMode: options?.sandboxMode || 'workspace-write',
            webSearch: options?.webSearch || false
          }
        );
        setIsInitialized(true);
        console.log(`[codex-debug] Codex started for panel ${panelId}`);
      } else {
        // Send input to existing Codex process
        console.log(`[codex-debug] Sending input to existing Codex process for panel ${panelId}: "${message}"`);
        await window.electron.invoke('codexPanel:sendInput', panelId, message);
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
      await window.electron.invoke('codexPanel:sendApproval', panelId, callId, decision, type);
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
      await window.electron.invoke('codexPanel:sendInterrupt', panelId);
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
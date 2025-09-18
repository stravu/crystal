import { IpcMain } from 'electron';
import { CodexManager } from '../services/panels/codex/codexManager';
import { CodexPanelManager } from '../services/panels/codex/codexPanelManager';
import { panelManager } from '../services/panelManager';
import type { AppServices } from './types';
import type { CodexPanelState } from '../../../shared/types/panels';
import { DEFAULT_CODEX_MODEL } from '../../../shared/types/models';

// Singleton instances will be created in the register function
export let codexManager: CodexManager;
export let codexPanelManager: CodexPanelManager;

export function registerCodexPanelHandlers(ipcMain: IpcMain, services: AppServices) {
  const { sessionManager, logger, configManager } = services;
  
  // Initialize singleton instances
  if (!codexManager) {
    logger?.info('[codex-debug] Initializing CodexManager and CodexPanelManager singletons');
    codexManager = new CodexManager(sessionManager, logger, configManager);
    codexPanelManager = new CodexPanelManager(codexManager, sessionManager, logger, configManager);
  }

  // Initialize Codex panel
  ipcMain.handle('codexPanel:initialize', async (_, panelId: string, sessionId: string, worktreePath: string, prompt?: string) => {
    try {
      logger?.info(`[codex-debug] IPC initialize: Panel ${panelId}, Session ${sessionId}, Worktree: ${worktreePath}, Prompt: "${prompt?.substring(0, 100) || 'none'}"`);
      
      // Register the panel with the manager
      logger?.info(`[codex-debug] Registering panel ${panelId} with session ${sessionId}`);
      codexPanelManager.registerPanel(panelId, sessionId);
      
      // If a prompt is provided, start the Codex process
      if (prompt) {
        logger?.info(`[codex-debug] Starting Codex process with initial prompt`);
        await codexPanelManager.startPanel(panelId, worktreePath, prompt);
      } else {
        logger?.info(`[codex-debug] No initial prompt provided, panel registered but not started`);
      }
      
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to initialize panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Start Codex panel with a prompt
  ipcMain.handle('codexPanel:start', async (_, panelId: string, worktreePath: string, prompt: string, options?: {
    model?: string;
    modelProvider?: string;
    approvalPolicy?: 'auto' | 'manual';
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
    webSearch?: boolean;
  }) => {
    try {
      logger?.info(`[codex-debug] IPC start:\n  Panel: ${panelId}\n  Worktree: ${worktreePath}\n  Prompt: "${prompt}"\n  Model: ${options?.model || 'default'}\n  Provider: ${options?.modelProvider || 'default'}\n  Approval: ${options?.approvalPolicy || 'default'}\n  Sandbox: ${options?.sandboxMode || 'default'}\n  Web Search: ${options?.webSearch || false}`);
      
      await codexPanelManager.startPanel(
        panelId,
        worktreePath,
        prompt,
        options?.model,
        options?.modelProvider,
        options?.approvalPolicy,
        options?.sandboxMode,
        options?.webSearch
      );
      
      // Update panel state with the model and other settings
      // IMPORTANT: Get panel BEFORE startPanel to preserve any existing codexSessionId
      const panelBefore = panelManager.getPanel(panelId);
      let existingCodexSessionId: string | undefined;
      if (panelBefore) {
        const customStateBefore = panelBefore.state.customState as CodexPanelState;
        existingCodexSessionId = customStateBefore?.codexSessionId;
        if (existingCodexSessionId) {
          logger?.info(`[codex-debug] Existing codexSessionId found before start: ${existingCodexSessionId}`);
        }
      }
      
      // After startPanel, update the state
      const panel = panelManager.getPanel(panelId);
      if (panel) {
        const currentCustomState = panel.state.customState as CodexPanelState;
        const updatedState: CodexPanelState = {
          ...currentCustomState,
          isInitialized: true,
          lastPrompt: prompt,
          model: options?.model || DEFAULT_CODEX_MODEL,
          modelProvider: options?.modelProvider || 'openai',
          approvalPolicy: options?.approvalPolicy || 'manual',
          sandboxMode: options?.sandboxMode || 'workspace-write',
          lastActivityTime: new Date().toISOString()
        };
        
        // Preserve any existing or new codexSessionId
        if (existingCodexSessionId) {
          updatedState.codexSessionId = existingCodexSessionId;
          logger?.info(`[codex-debug] Preserving existing codexSessionId in start: ${existingCodexSessionId}`);
        } else if (currentCustomState?.codexSessionId) {
          updatedState.codexSessionId = currentCustomState.codexSessionId;
          logger?.info(`[codex-debug] Preserving new codexSessionId from start: ${currentCustomState.codexSessionId}`);
        }
        
        await panelManager.updatePanel(panelId, {
          state: {
            ...panel.state,
            customState: updatedState
          }
        });
      }
      
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to start panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Continue Codex conversation with history
  ipcMain.handle('codexPanel:continue', async (_, panelId: string, worktreePath: string, prompt: string, conversationHistory: any[], options?: {
    model?: string;
    modelProvider?: string;
  }) => {
    try {
      logger?.info(`[codex-debug] IPC continue:\n  Panel: ${panelId}\n  Worktree: ${worktreePath}\n  History items: ${conversationHistory.length}\n  Prompt: "${prompt}"\n  Model: ${options?.model || 'default'}\n  Provider: ${options?.modelProvider || 'default'}`);
      
      // Get the panel state BEFORE calling continuePanel to preserve codexSessionId
      const panelBefore = panelManager.getPanel(panelId);
      let savedCodexSessionId: string | undefined;
      if (panelBefore) {
        const customStateBefore = panelBefore.state.customState as CodexPanelState;
        savedCodexSessionId = customStateBefore?.codexSessionId;
        logger?.info(`[codex-debug] Saved codexSessionId before continuePanel: ${savedCodexSessionId || 'none'}`);
      }
      
      await codexPanelManager.continuePanel(
        panelId,
        worktreePath,
        prompt,
        conversationHistory,
        options?.model,
        options?.modelProvider
      );
      
      // Update panel state with the new prompt
      // IMPORTANT: Get fresh panel state but preserve the saved codexSessionId
      const panel = panelManager.getPanel(panelId);
      if (panel) {
        const currentCustomState = panel.state.customState as CodexPanelState;
        const updatedState: CodexPanelState = {
          ...currentCustomState,
          lastPrompt: prompt,
          lastActivityTime: new Date().toISOString()
        };
        
        // Only update model if provided
        if (options?.model) {
          updatedState.model = options.model;
          updatedState.modelProvider = options.modelProvider || currentCustomState?.modelProvider || 'openai';
        }
        
        // CRITICAL: Restore the saved codexSessionId
        if (savedCodexSessionId) {
          updatedState.codexSessionId = savedCodexSessionId;
          logger?.info(`[codex-debug] Restoring codexSessionId: ${savedCodexSessionId}`);
        } else if (currentCustomState?.codexSessionId) {
          // Fallback: if there's a codexSessionId in current state, preserve it
          updatedState.codexSessionId = currentCustomState.codexSessionId;
          logger?.info(`[codex-debug] Preserving existing codexSessionId: ${currentCustomState.codexSessionId}`);
        }
        
        await panelManager.updatePanel(panelId, {
          state: {
            ...panel.state,
            customState: updatedState
          }
        });
        logger?.info(`[codex-debug] Panel state updated after continue`);
      }
      
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to continue panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Stop Codex panel
  ipcMain.handle('codexPanel:stop', async (_, panelId: string) => {
    try {
      logger?.info(`[codex-debug] IPC stop: Panel ${panelId}`);
      await codexPanelManager.stopPanel(panelId);
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to stop panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Send input to Codex panel - DEPRECATED in interactive mode
  // In interactive mode, each prompt spawns a new process via start or continue
  // Keeping this handler for backward compatibility but it should not be used
  ipcMain.handle('codexPanel:sendInput', async (_, panelId: string, input: string) => {
    const error = new Error('sendInput is not supported in interactive mode. Use codexPanel:continue instead.');
    logger?.error(`[codex-debug] sendInput called but not supported in interactive mode for panel ${panelId}`);
    throw error;
  });

  // Send approval decision
  ipcMain.handle('codexPanel:sendApproval', async (_, panelId: string, callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch') => {
    try {
      logger?.info(`[codex-debug] IPC sendApproval:\n  Panel: ${panelId}\n  Call ID: ${callId}\n  Decision: ${decision}\n  Type: ${type}`);
      await codexPanelManager.sendApproval(panelId, callId, decision, type);
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to send approval to panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Send interrupt signal
  ipcMain.handle('codexPanel:sendInterrupt', async (_, panelId: string) => {
    try {
      logger?.info(`[codex-debug] IPC sendInterrupt: Panel ${panelId}`);
      await codexPanelManager.sendInterrupt(panelId);

      // Record a system message when the user cancels Codex execution
      const panel = panelManager.getPanel(panelId);
      const sessionId = panel?.sessionId;
      const timestamp = new Date();
      const cancellationMessage = {
        type: 'session',
        data: {
          status: 'cancelled',
          message: 'Cancelled by user',
          source: 'user'
        }
      };

      try {
        if (sessionManager?.addPanelOutput) {
          sessionManager.addPanelOutput(panelId, {
            type: 'json',
            data: cancellationMessage,
            timestamp
          });
        } else if (sessionId) {
          sessionManager.addSessionOutput(sessionId, {
            type: 'json',
            data: cancellationMessage,
            timestamp
          });
        }

        const payload = {
          panelId,
          sessionId,
          type: 'json' as const,
          data: cancellationMessage,
          timestamp
        };

        if (sessionId) {
          sessionManager.emit('session-output', payload);
          sessionManager.emit('session-output-available', { sessionId, panelId });
        }

        // Notify Codex-specific listeners so the UI updates immediately
        codexManager.emit('panel-output', payload);

        // Ensure session status reflects the stop request
        if (sessionId) {
          sessionManager.stopSession(sessionId);
        }
      } catch (loggingError) {
        logger?.warn(`[codex-debug] Failed to record cancellation message for panel ${panelId}:`, loggingError as Error);
      }
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to send interrupt to panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Check if panel is running
  ipcMain.handle('codexPanel:isRunning', async (_, panelId: string) => {
    try {
      const isRunning = codexPanelManager.isPanelRunning(panelId);
      logger?.info(`[codex-debug] IPC isRunning: Panel ${panelId} = ${isRunning}`);
      return { isRunning };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to check if panel ${panelId} is running:`, error as Error);
      throw error;
    }
  });

  // Get panel state
  ipcMain.handle('codexPanel:getState', async (_, panelId: string) => {
    try {
      const state = codexPanelManager.getPanelState(panelId);
      logger?.info(`[codex-debug] IPC getState: Panel ${panelId}, State: ${JSON.stringify(state)}`);
      return state;
    } catch (error) {
      logger?.error(`[codex-debug] Failed to get state for panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Get existing outputs for a panel
  ipcMain.handle('codexPanel:getOutputs', async (_, panelId: string, limit: number = 1000) => {
    try {
      logger?.info(`[codex-debug] IPC getOutputs: Panel ${panelId}, Limit: ${limit}`);
      const outputs = sessionManager.getSessionOutputsForPanel(panelId, limit);
      logger?.info(`[codex-debug] Found ${outputs.length} outputs for panel ${panelId}`);
      return outputs;
    } catch (error) {
      logger?.error(`[codex-debug] Failed to get outputs for panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Get debug state for a panel
  ipcMain.handle('codexPanel:getDebugState', async (_, { panelId }: { panelId: string }) => {
    try {
      logger?.info(`[codex-debug] IPC getDebugState: Panel ${panelId}`);
      const debugState = await codexManager.getDebugState(panelId);
      logger?.info(`[codex-debug] Debug state retrieved for panel ${panelId}`);
      return debugState;
    } catch (error) {
      logger?.error(`[codex-debug] Failed to get debug state for panel ${panelId}:`, error as Error);
      throw error;
    }
  });

  // Get Codex availability status
  ipcMain.handle('codexPanel:checkAvailability', async (_, customPath?: string) => {
    try {
      logger?.info(`[codex-debug] IPC checkAvailability: Custom path = ${customPath || 'none'}`);
      const availability = await codexManager.checkAvailability(customPath);
      logger?.info(`[codex-debug] Availability result: ${JSON.stringify(availability)}`);
      return availability;
    } catch (error) {
      logger?.error(`[codex-debug] Failed to check availability:`, error as Error);
      throw error;
    }
  });

  // Cleanup all panels for a session
  ipcMain.handle('codexPanel:cleanupSession', async (_, sessionId: string) => {
    try {
      logger?.info(`[codex-debug] IPC cleanupSession: Session ${sessionId}`);
      await codexPanelManager.cleanupSessionPanels(sessionId);
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to cleanup panels for session ${sessionId}:`, error as Error);
      throw error;
    }
  });

  // Forward panel-output events from the AbstractAIPanelManager
  // Note: We only listen to 'panel-output' to avoid duplicates, as AbstractAIPanelManager
  // already converts 'output' events to 'panel-output' with proper storage
  codexManager.on('panel-output', (data) => {
    logger?.info(`[codex-debug] Event panel-output: Panel ${data.panelId}, Type: ${data.type}, Data length: ${JSON.stringify(data.data).length}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:output', data);
    }
  });

  // Forward panel-spawned events from the AbstractAIPanelManager  
  codexManager.on('panel-spawned', (data) => {
    logger?.info(`[codex-debug] Event panel-spawned: Panel ${data.panelId}, Session ${data.sessionId}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:spawned', data);
    }
  });

  // Forward panel-exit events from the AbstractAIPanelManager
  codexManager.on('panel-exit', (data) => {
    logger?.info(`[codex-debug] Event panel-exit: Panel ${data.panelId}, Exit code: ${data.exitCode}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:exit', data);
    }
  });

  // Forward panel-error events from the AbstractAIPanelManager
  codexManager.on('panel-error', (data) => {
    logger?.error(`[codex-debug] Event panel-error: Panel ${data.panelId}, Error: ${data.error}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:error', data);
    }
  });

  logger?.info('[codex-debug] Codex panel IPC handlers registered successfully');
}

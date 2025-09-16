import { IpcMain } from 'electron';
import { CodexManager } from '../services/panels/codex/codexManager';
import { CodexPanelManager } from '../services/panels/codex/codexPanelManager';
import { panelManager } from '../services/panelManager';
import type { AppServices } from './types';
import type { CodexPanelState } from '../../../shared/types/panels';

// Singleton instances will be created in the register function
let codexManager: CodexManager;
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
      const panel = panelManager.getPanel(panelId);
      if (panel) {
        const updatedState: CodexPanelState = {
          ...panel.state.customState as CodexPanelState,
          isInitialized: true,
          lastPrompt: prompt,
          model: options?.model || 'gpt-5',
          modelProvider: options?.modelProvider || 'openai',
          approvalPolicy: options?.approvalPolicy || 'manual',
          sandboxMode: options?.sandboxMode || 'workspace-write',
          lastActivityTime: new Date().toISOString()
        };
        
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
      
      await codexPanelManager.continuePanel(
        panelId,
        worktreePath,
        prompt,
        conversationHistory,
        options?.model,
        options?.modelProvider
      );
      
      // Update panel state with the model if provided
      const panel = panelManager.getPanel(panelId);
      if (panel && options?.model) {
        const updatedState: CodexPanelState = {
          ...panel.state.customState as CodexPanelState,
          lastPrompt: prompt,
          model: options.model,
          modelProvider: options?.modelProvider || (panel.state.customState as CodexPanelState)?.modelProvider || 'openai',
          lastActivityTime: new Date().toISOString()
        };
        
        await panelManager.updatePanel(panelId, {
          state: {
            ...panel.state,
            customState: updatedState
          }
        });
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

  // Send input to Codex panel
  ipcMain.handle('codexPanel:sendInput', async (_, panelId: string, input: string) => {
    try {
      logger?.info(`[codex-debug] IPC sendInput: Panel ${panelId}, Input: "${input}"`);
      codexPanelManager.sendInputToPanel(panelId, input);
      return { success: true };
    } catch (error) {
      logger?.error(`[codex-debug] Failed to send input to panel ${panelId}:`, error as Error);
      throw error;
    }
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

  // Forward Codex events to renderer
  codexManager.on('output', (data) => {
    logger?.info(`[codex-debug] Event output: Panel ${data.panelId}, Type: ${data.type}, Data length: ${JSON.stringify(data.data).length}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:output', data);
    }
  });

  codexManager.on('spawned', (data) => {
    logger?.info(`[codex-debug] Event spawned: Panel ${data.panelId}, Session ${data.sessionId}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:spawned', data);
    }
  });

  codexManager.on('exit', (data) => {
    logger?.info(`[codex-debug] Event exit: Panel ${data.panelId}, Exit code: ${data.exitCode}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:exit', data);
    }
  });

  codexManager.on('error', (data) => {
    logger?.error(`[codex-debug] Event error: Panel ${data.panelId}, Error: ${data.error}`);
    const mainWindow = services.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('codexPanel:error', data);
    }
  });

  logger?.info('[codex-debug] Codex panel IPC handlers registered successfully');
}
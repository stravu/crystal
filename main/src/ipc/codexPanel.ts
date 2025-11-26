import { IpcMain } from 'electron';
import { BaseAIPanelHandler } from './baseAIPanelHandler';
import { CodexManager } from '../services/panels/codex/codexManager';
import { CodexPanelManager } from '../services/panels/codex/codexPanelManager';
import { panelManager } from '../services/panelManager';
import type { AppServices } from './types';
import type { CodexPanelState } from '../../../shared/types/panels';
import { DEFAULT_CODEX_MODEL } from '../../../shared/types/models';
import type { ConversationMessage } from '../database/models';

// Singleton instances will be created in the register function
export let codexManager: CodexManager;
export let codexPanelManager: CodexPanelManager;

class CodexPanelHandler extends BaseAIPanelHandler {
  protected createPanelManager(): CodexPanelManager {
    const { sessionManager, logger, configManager, analyticsManager } = this.services;

    // Initialize singleton instances if needed
    if (!codexManager) {
      this.services.logger?.info('[codex-debug] Initializing CodexManager singleton');
      codexManager = new CodexManager(sessionManager, logger, configManager);
    }

    return new CodexPanelManager(codexManager, sessionManager, logger, configManager, analyticsManager);
  }

  protected getInitialPanelState(): Partial<CodexPanelState> {
    return {
      isInitialized: false,
      codexResumeId: undefined
    };
  }

  /**
   * Apply Codex-specific default settings
   */
  protected applySettingsDefaults(settings: Record<string, unknown>): Record<string, unknown> {
    return {
      model: settings.model || DEFAULT_CODEX_MODEL,
      modelProvider: settings.modelProvider || 'openai',
      sandboxMode: settings.sandboxMode || 'workspace-write',
      webSearch: settings.webSearch ?? false,
      thinkingLevel: settings.thinkingLevel || 'medium',
      approvalPolicy: settings.approvalPolicy || 'manual',
      ...settings
    };
  }

  protected registerCustomHandlers(): void {
    const { sessionManager, logger, databaseService } = this.services;

    // Codex-specific initialize handler
    this.ipcMain.handle('codexPanel:initialize', async (_, panelId: string, sessionId: string, worktreePath: string, prompt?: string) => {
      try {
        logger?.info(`[codex-debug] IPC initialize: Panel ${panelId}, Session ${sessionId}, Worktree: ${worktreePath}, Prompt: "${prompt?.substring(0, 100) || 'none'}"`);
        
        // Check if the panel already has a codexSessionId (from a previous session)
        const existingCodexSessionId = sessionManager.getPanelCodexSessionId(panelId);
        
        if (existingCodexSessionId) {
          logger?.info(`[codex-debug] Panel ${panelId} has existing codexSessionId: ${existingCodexSessionId}`);
          // Just register the panel - the frontend will handle resuming when the user sends a message
          logger?.info(`[codex-debug] Registering panel ${panelId} with session ${sessionId} for potential resume`);
          // Pass false for isUserInitiated since this is runtime initialization, not panel creation
          (this.panelManager as CodexPanelManager).registerPanel(panelId, sessionId, undefined, false);
        } else {
          // Register the panel with the manager
          logger?.info(`[codex-debug] Registering new panel ${panelId} with session ${sessionId}`);
          // Pass false for isUserInitiated since this is runtime initialization, not panel creation
          (this.panelManager as CodexPanelManager).registerPanel(panelId, sessionId, undefined, false);
          
          // If a prompt is provided, start the Codex process
          if (prompt) {
            logger?.info(`[codex-debug] Starting Codex process with initial prompt`);
            await (this.panelManager as CodexPanelManager).startPanel(panelId, worktreePath, prompt);
          } else {
            logger?.info(`[codex-debug] No initial prompt provided, panel registered but not started`);
          }
        }
        
        return { success: true, hasExistingSession: !!existingCodexSessionId };
      } catch (error) {
        logger?.error(`[codex-debug] Failed to initialize panel ${panelId}:`, error as Error);
        throw error;
      }
    });

    // Custom start handler for Codex-specific options
    this.ipcMain.handle('codexPanel:start', async (_, panelId: string, worktreePath: string, prompt: string, options?: {
      model?: string;
      modelProvider?: string;
      approvalPolicy?: 'auto' | 'manual';
      sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
      webSearch?: boolean;
      thinkingLevel?: 'low' | 'medium' | 'high';
    }) => {
      try {
        logger?.info(`[codex-debug] IPC start:\n  Panel: ${panelId}\n  Worktree: ${worktreePath}\n  Prompt: "${prompt}"\n  Model: ${options?.model || 'default'}\n  Provider: ${options?.modelProvider || 'default'}\n  Approval: ${options?.approvalPolicy || 'default'}\n  Sandbox: ${options?.sandboxMode || 'default'}\n  Web Search: ${options?.webSearch || false}\n  Thinking Level: ${options?.thinkingLevel || 'default'}`);
        
        // Save the user prompt as a conversation message with panel_id
        sessionManager.addPanelConversationMessage(panelId, 'user', prompt);
        
        await (this.panelManager as CodexPanelManager).startPanel(
          panelId,
          worktreePath,
          prompt,
          options?.model,
          options?.modelProvider,
          options?.approvalPolicy,
          options?.sandboxMode,
          options?.webSearch,
          options?.thinkingLevel
        );
        
        // Save settings to unified database storage
        const settingsToSave = {
          model: options?.model || DEFAULT_CODEX_MODEL,
          modelProvider: options?.modelProvider || 'openai',
          approvalPolicy: options?.approvalPolicy || 'manual',
          sandboxMode: options?.sandboxMode || 'workspace-write',
          webSearch: options?.webSearch ?? false,
          thinkingLevel: options?.thinkingLevel || 'medium',
          lastPrompt: prompt,
          lastActivityTime: new Date().toISOString()
        };
        
        databaseService.updatePanelSettings(panelId, settingsToSave);
        
        // Also update panel state for runtime tracking
        const currentPanel = panelManager.getPanel(panelId);
        if (currentPanel) {
          const currentCustomState = currentPanel.state.customState as CodexPanelState;
          const updatedState: CodexPanelState = {
            ...currentCustomState,
            isInitialized: true,
            lastPrompt: prompt,
            model: settingsToSave.model,
            modelProvider: settingsToSave.modelProvider,
            approvalPolicy: settingsToSave.approvalPolicy,
            sandboxMode: settingsToSave.sandboxMode,
            webSearch: settingsToSave.webSearch,
            lastActivityTime: settingsToSave.lastActivityTime,
            codexConfig: {
              model: settingsToSave.model,
              thinkingLevel: settingsToSave.thinkingLevel,
              sandboxMode: settingsToSave.sandboxMode,
              webSearch: settingsToSave.webSearch
            }
          };
          
          await panelManager.updatePanel(panelId, {
            state: {
              ...currentPanel.state,
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

    // Override continue handler for Codex-specific behavior
    this.ipcMain.handle('codexPanel:continue', async (_, panelId: string, worktreePath: string, prompt: string, conversationHistory: ConversationMessage[], options?: {
      model?: string;
      modelProvider?: string;
      thinkingLevel?: 'low' | 'medium' | 'high';
      sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
      webSearch?: boolean;
    }) => {
      try {
        logger?.info(`[codex-debug] IPC continue:\n  Panel: ${panelId}\n  Worktree: ${worktreePath}\n  History items: ${conversationHistory.length}\n  Prompt: "${prompt}"\n  Model: ${options?.model || 'default'}\n  Provider: ${options?.modelProvider || 'default'}\n  Thinking Level: ${options?.thinkingLevel || 'default'}\n  Sandbox: ${options?.sandboxMode || 'default'}\n  Web Search: ${options?.webSearch ?? 'default'}`);
        
        // Save the new user prompt as a conversation message
        sessionManager.addPanelConversationMessage(panelId, 'user', prompt);
        
        await (this.panelManager as CodexPanelManager).continuePanel(
          panelId,
          worktreePath,
          prompt,
          conversationHistory,
          options?.model,
          options?.modelProvider,
          options?.thinkingLevel,
          undefined, // approvalPolicy - not used for now
          options?.sandboxMode,
          options?.webSearch
        );
        
        // Get existing settings from database
        const existingSettings = databaseService.getPanelSettings(panelId);
        
        // Build updated settings with only changed values
        const settingsToUpdate: Record<string, unknown> = {
          lastPrompt: prompt,
          lastActivityTime: new Date().toISOString()
        };
        
        if (options?.model) {
          settingsToUpdate.model = options.model;
          settingsToUpdate.modelProvider = options.modelProvider || existingSettings.modelProvider || 'openai';
        }
        
        if (options?.sandboxMode) {
          settingsToUpdate.sandboxMode = options.sandboxMode;
        }
        
        if (options?.webSearch !== undefined) {
          settingsToUpdate.webSearch = options.webSearch;
        }
        
        if (options?.thinkingLevel) {
          settingsToUpdate.thinkingLevel = options.thinkingLevel;
        }
        
        // Save to database
        databaseService.updatePanelSettings(panelId, settingsToUpdate);
        
        // Also update panel state for runtime tracking
        const panel = panelManager.getPanel(panelId);
        if (panel) {
          const currentCustomState = panel.state.customState as CodexPanelState;
          const updatedState: CodexPanelState = {
            ...currentCustomState,
            lastPrompt: prompt,
            lastActivityTime: typeof settingsToUpdate.lastActivityTime === 'string' ? settingsToUpdate.lastActivityTime : currentCustomState?.lastActivityTime || new Date().toISOString(),
            model: (typeof settingsToUpdate.model === 'string' ? settingsToUpdate.model : null) || currentCustomState?.model || DEFAULT_CODEX_MODEL,
            modelProvider: (typeof settingsToUpdate.modelProvider === 'string' ? settingsToUpdate.modelProvider : null) || currentCustomState?.modelProvider || 'openai',
            sandboxMode: (typeof settingsToUpdate.sandboxMode === 'string' ? settingsToUpdate.sandboxMode as 'read-only' | 'workspace-write' | 'danger-full-access' : null) || currentCustomState?.sandboxMode || 'workspace-write',
            webSearch: (typeof settingsToUpdate.webSearch === 'boolean' ? settingsToUpdate.webSearch : null) ?? currentCustomState?.webSearch ?? false,
            codexConfig: {
              model: (typeof settingsToUpdate.model === 'string' ? settingsToUpdate.model : null) || currentCustomState?.model || DEFAULT_CODEX_MODEL,
              thinkingLevel: (typeof settingsToUpdate.thinkingLevel === 'string' ? settingsToUpdate.thinkingLevel as 'low' | 'medium' | 'high' : null) || currentCustomState?.codexConfig?.thinkingLevel || 'medium',
              sandboxMode: (typeof settingsToUpdate.sandboxMode === 'string' ? settingsToUpdate.sandboxMode as 'read-only' | 'workspace-write' | 'danger-full-access' : null) || currentCustomState?.sandboxMode || 'workspace-write',
              webSearch: (typeof settingsToUpdate.webSearch === 'boolean' ? settingsToUpdate.webSearch : null) ?? currentCustomState?.webSearch ?? false
            }
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

    // Send approval decision
    this.ipcMain.handle('codexPanel:sendApproval', async (_, panelId: string, callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch') => {
      try {
        logger?.info(`[codex-debug] IPC sendApproval:\n  Panel: ${panelId}\n  Call ID: ${callId}\n  Decision: ${decision}\n  Type: ${type}`);
        await (this.panelManager as CodexPanelManager).sendApproval(panelId, callId, decision, type);
        return { success: true };
      } catch (error) {
        logger?.error(`[codex-debug] Failed to send approval to panel ${panelId}:`, error as Error);
        throw error;
      }
    });

    // Send interrupt signal
    this.ipcMain.handle('codexPanel:sendInterrupt', async (_, panelId: string) => {
      try {
        logger?.info(`[codex-debug] IPC sendInterrupt: Panel ${panelId}`);
        await (this.panelManager as CodexPanelManager).sendInterrupt(panelId);

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
    this.ipcMain.handle('codexPanel:isRunning', async (_, panelId: string) => {
      try {
        const isRunning = (this.panelManager as CodexPanelManager).isPanelRunning(panelId);
        logger?.info(`[codex-debug] IPC isRunning: Panel ${panelId} = ${isRunning}`);
        return { isRunning };
      } catch (error) {
        logger?.error(`[codex-debug] Failed to check if panel ${panelId} is running:`, error as Error);
        throw error;
      }
    });

    // Get panel state
    this.ipcMain.handle('codexPanel:getState', async (_, panelId: string) => {
      try {
        const state = (this.panelManager as CodexPanelManager).getPanelState(panelId);
        logger?.info(`[codex-debug] IPC getState: Panel ${panelId}, State: ${JSON.stringify(state)}`);
        return state;
      } catch (error) {
        logger?.error(`[codex-debug] Failed to get state for panel ${panelId}:`, error as Error);
        throw error;
      }
    });

    // Get debug state for a panel
    this.ipcMain.handle('codexPanel:getDebugState', async (_, { panelId }: { panelId: string }) => {
      try {
        logger?.verbose(`Getting debug state for Codex panel ${panelId}`);
        const debugState = await codexManager.getDebugState(panelId);
        return debugState;
      } catch (error) {
        logger?.error(`[codex-debug] Failed to get debug state for panel ${panelId}:`, error as Error);
        throw error;
      }
    });

    // Get Codex availability status
    this.ipcMain.handle('codexPanel:checkAvailability', async (_, customPath?: string) => {
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
    this.ipcMain.handle('codexPanel:cleanupSession', async (_, sessionId: string) => {
      try {
        logger?.info(`[codex-debug] IPC cleanupSession: Session ${sessionId}`);
        await (this.panelManager as CodexPanelManager).cleanupSessionPanels(sessionId);
        return { success: true };
      } catch (error) {
        logger?.error(`[codex-debug] Failed to cleanup panels for session ${sessionId}:`, error as Error);
        throw error;
      }
    });

    // Register aliases for camelCase compatibility
    // The base class registers codexPanel:get-outputs, but frontend uses codexPanel:getOutputs
    this.ipcMain.handle('codexPanel:getOutputs', async (_, panelId: string) => {
      try {
        const outputs = sessionManager.getPanelOutputs ? 
          sessionManager.getPanelOutputs(panelId) :
          [];
        
        // Return just the array, not wrapped in an object, for compatibility
        return outputs;
      } catch (error) {
        logger?.error(`Failed to get outputs for Codex panel:`, error as Error);
        // Return empty array on error to maintain consistent return type
        return [];
      }
    });

    // Register aliases for camelCase compatibility
    // The base class registers codexPanel:get-settings, but we also want codexPanel:getSettings
    this.ipcMain.handle('codexPanel:getSettings', async (_event, panelId: string) => {
      // Delegate to the base class implementation
      const settings = databaseService.getPanelSettings(panelId);
      const settingsWithDefaults = this.applySettingsDefaults(settings);
      return { success: true, data: settingsWithDefaults };
    });

    // Register alias for camelCase compatibility
    this.ipcMain.handle('codexPanel:setSettings', async (_event, panelId: string, settings: Record<string, unknown>) => {
      // Delegate to the base class implementation
      databaseService.updatePanelSettings(panelId, settings);
      return { success: true };
    });

    // Setup event forwarding
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    const { logger, getMainWindow } = this.services;

    // Forward panel-output events from the AbstractAIPanelManager
    codexManager.on('panel-output', (data) => {
      logger?.info(`[codex-debug] Event panel-output: Panel ${data.panelId}, Type: ${data.type}, Data length: ${JSON.stringify(data.data).length}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        logger?.info(`[codex-debug] Sending codexPanel:output to renderer for panel ${data.panelId}`);
        mainWindow.webContents.send('codexPanel:output', data);
      } else {
        logger?.warn(`[codex-debug] Cannot send codexPanel:output - no main window available`);
      }
    });

    // Forward panel-spawned events from the AbstractAIPanelManager  
    codexManager.on('panel-spawned', (data) => {
      logger?.info(`[codex-debug] Event panel-spawned: Panel ${data.panelId}, Session ${data.sessionId}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        logger?.info(`[codex-debug] Sending codexPanel:spawned to renderer for panel ${data.panelId}`);
        mainWindow.webContents.send('codexPanel:spawned', data);
      } else {
        logger?.warn(`[codex-debug] Cannot send codexPanel:spawned - no main window available`);
      }
    });

    // Forward panel-exit events from the AbstractAIPanelManager
    codexManager.on('panel-exit', (data) => {
      logger?.info(`[codex-debug] Event panel-exit: Panel ${data.panelId}, Exit code: ${data.exitCode}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        logger?.info(`[codex-debug] Sending codexPanel:exit to renderer for panel ${data.panelId}`);
        mainWindow.webContents.send('codexPanel:exit', data);
      } else {
        logger?.warn(`[codex-debug] Cannot send codexPanel:exit - no main window available`);
      }
    });

    // Forward panel-error events from the AbstractAIPanelManager
    codexManager.on('panel-error', (data) => {
      logger?.error(`[codex-debug] Event panel-error: Panel ${data.panelId}, Error: ${data.error}`);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        logger?.error(`[codex-debug] Sending codexPanel:error to renderer for panel ${data.panelId}`);
        mainWindow.webContents.send('codexPanel:error', data);
      } else {
        logger?.warn(`[codex-debug] Cannot send codexPanel:error - no main window available`);
      }
    });
  }
}

export function registerCodexPanelHandlers(ipcMain: IpcMain, services: AppServices) {
  const { logger } = services;
  
  const handler = new CodexPanelHandler(ipcMain, services, {
    panelType: 'codex',
    panelTypeName: 'Codex',
    ipcPrefix: 'codexPanel',
    defaultTitle: 'Codex'
  });
  
  // Export the manager for use by other modules
  codexPanelManager = handler['panelManager'] as CodexPanelManager;
  
  logger?.info('[codex-debug] Codex panel IPC handlers registered successfully');
}
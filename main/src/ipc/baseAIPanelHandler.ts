import { IpcMain } from 'electron';
import { AbstractAIPanelManager } from '../services/panels/ai/AbstractAIPanelManager';
import { panelManager } from '../services/panelManager';
import type { AppServices } from './types';
import type { ToolPanelType, ToolPanel, BaseAIPanelState } from '../../../shared/types/panels';

export interface AIPanelHandlerConfig {
  panelType: ToolPanelType;
  panelTypeName: string; // e.g., 'Claude', 'Codex'
  ipcPrefix: string; // e.g., 'claude-panels', 'codexPanel'
  defaultTitle?: string;
}

/**
 * Base class for AI panel IPC handlers
 * Provides common functionality for Claude, Codex, and other AI panels
 */
export abstract class BaseAIPanelHandler {
  protected panelManager: AbstractAIPanelManager;
  
  constructor(
    protected ipcMain: IpcMain,
    protected services: AppServices,
    protected config: AIPanelHandlerConfig
  ) {
    // Initialize panel manager in derived classes
    this.panelManager = this.createPanelManager();
    this.registerExistingPanels();
    this.registerCommonHandlers();
    this.registerCustomHandlers();
  }

  /**
   * Create the specific panel manager instance
   */
  protected abstract createPanelManager(): AbstractAIPanelManager;

  /**
   * Register any custom handlers specific to this AI tool
   */
  protected abstract registerCustomHandlers(): void;

  /**
   * Get initial state for a new panel
   */
  protected abstract getInitialPanelState(): BaseAIPanelState;

  /**
   * Transform panel state if needed (for tool-specific fields)
   */
  protected transformPanelState(panel: ToolPanel): BaseAIPanelState {
    // Default implementation - can be overridden
    // Cast to BaseAIPanelState since this is for AI panels
    return (panel.state.customState as BaseAIPanelState) || {};
  }

  /**
   * Register existing panels from the database
   */
  protected registerExistingPanels(): void {
    const { databaseService, logger } = this.services;

    logger?.info(`[${this.config.panelTypeName}] Registering existing ${this.config.panelTypeName} panels from database...`);
    const activePanels = databaseService.getActivePanels();
    const typedPanels = activePanels.filter(panel => panel.type === this.config.panelType);

    for (const panel of typedPanels) {
      try {
        // Pass false for isUserInitiated since this is restoration from database
        this.panelManager.registerPanel(panel.id, panel.sessionId, undefined, false);
        logger?.info(`[${this.config.panelTypeName}] Registered existing panel ${panel.id} for session ${panel.sessionId}`);
      } catch (error) {
        logger?.error(`[${this.config.panelTypeName}] Failed to register existing panel ${panel.id}: ${error}`);
      }
    }
    logger?.info(`[${this.config.panelTypeName}] Registered ${typedPanels.length} existing panels`);
  }

  /**
   * Register common IPC handlers that all AI panels share
   */
  protected registerCommonHandlers(): void {
    const { sessionManager, logger } = this.services;

    // Create a new panel
    this.ipcMain.handle(`${this.config.ipcPrefix}:create`, async (_event, sessionId: string, title?: string) => {
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:create called for sessionId: ${sessionId}`);

        // Create the panel using the generic panel manager
        const panel = await panelManager.createPanel({
          sessionId,
          type: this.config.panelType,
          title: title || this.config.defaultTitle || this.config.panelTypeName,
          initialState: {
            customState: this.getInitialPanelState()
          }
        });

        // Register the panel with the AI panel manager
        this.panelManager.registerPanel(panel.id, sessionId);

        return { success: true, data: panel };
      } catch (error) {
        logger?.error(`Failed to create ${this.config.panelTypeName} panel: ${error}`);
        return { success: false, error: `Failed to create ${this.config.panelTypeName} panel` };
      }
    });

    // Send input to a panel
    this.ipcMain.handle(`${this.config.ipcPrefix}:input`, async (_event, panelId: string, input: string) => {
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:input called for panelId: ${panelId}`);

        // Get the panel to find the session
        const panel = panelManager.getPanel(panelId);
        if (!panel) {
          return { success: false, error: 'Panel not found' };
        }

        // Check if AI is running for this panel
        const isRunning = this.panelManager.isPanelRunning(panelId);
        if (!isRunning) {
          return { success: false, error: `${this.config.panelTypeName} is not running for this panel` };
        }

        // Save the user input as a conversation message with panel_id
        sessionManager.addPanelConversationMessage(panelId, 'user', input);

        // Send input via the panel manager
        this.panelManager.sendInputToPanel(panelId, input);

        // Update panel state
        const updatedState = {
          ...(panel.state.customState || {}),
          lastInput: input,
          lastActivityTime: new Date().toISOString()
        };

        await panelManager.updatePanel(panelId, {
          state: {
            ...panel.state,
            customState: updatedState
          }
        });

        return { success: true };
      } catch (error) {
        logger?.error(`Failed to send input to ${this.config.panelTypeName} panel: ${error}`);
        return { success: false, error: `Failed to send input to ${this.config.panelTypeName} panel` };
      }
    });

    // Stop a panel
    this.ipcMain.handle(`${this.config.ipcPrefix}:stop`, async (_event, panelId: string) => {
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:stop called for panelId: ${panelId}`);

        // Stop AI via the panel manager
        await this.panelManager.stopPanel(panelId);

        // Update panel state
        const panel = panelManager.getPanel(panelId);
        if (panel) {
          const updatedState = {
            ...(panel.state.customState || {}),
            isInitialized: false,
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
        logger?.error(`Failed to stop ${this.config.panelTypeName} panel: ${error}`);
        return { success: false, error: `Failed to stop ${this.config.panelTypeName} panel` };
      }
    });

    // Get panel outputs
    this.ipcMain.handle(`${this.config.ipcPrefix}:get-outputs`, async (_event, panelId: string) => {
      try {
        const outputs = sessionManager.getPanelOutputs ? 
          sessionManager.getPanelOutputs(panelId) :
          [];
        
        return { success: true, data: outputs };
      } catch (error) {
        logger?.error(`Failed to get outputs for ${this.config.panelTypeName} panel: ${error}`);
        return { success: false, error: 'Failed to get outputs' };
      }
    });

    // Generic get settings handler
    this.ipcMain.handle(`${this.config.ipcPrefix}:get-settings`, async (_event, panelId: string) => {
      const { databaseService } = this.services;
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:get-settings called for panelId: ${panelId}`);
        
        // Get all settings from unified storage
        const settings = databaseService.getPanelSettings(panelId);
        
        // Allow derived classes to provide defaults via override
        const settingsWithDefaults = this.applySettingsDefaults(settings);
        
        return { success: true, data: settingsWithDefaults };
      } catch (error) {
        logger?.error(`Failed to get ${this.config.panelTypeName} panel settings: ${error}`);
        return { success: false, error: `Failed to get ${this.config.panelTypeName} panel settings` };
      }
    });

    // Generic set settings handler
    this.ipcMain.handle(`${this.config.ipcPrefix}:set-settings`, async (_event, panelId: string, settings: Record<string, unknown>) => {
      const { databaseService } = this.services;
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:set-settings called for panelId: ${panelId}`);
        
        // Update settings in unified storage
        databaseService.updatePanelSettings(panelId, settings);
        
        return { success: true };
      } catch (error) {
        logger?.error(`Failed to set ${this.config.panelTypeName} panel settings: ${error}`);
        return { success: false, error: `Failed to set ${this.config.panelTypeName} panel settings` };
      }
    });

    // Delete a panel
    this.ipcMain.handle(`${this.config.ipcPrefix}:delete`, async (_event, panelId: string) => {
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:delete called for panelId: ${panelId}`);

        // Stop AI if running
        if (this.panelManager.isPanelRunning(panelId)) {
          await this.panelManager.stopPanel(panelId);
        }

        // Unregister from AI panel manager
        this.panelManager.unregisterPanel(panelId);

        // Delete the panel using the generic panel manager
        await panelManager.deletePanel(panelId);

        return { success: true };
      } catch (error) {
        logger?.error(`Failed to delete ${this.config.panelTypeName} panel: ${error}`);
        return { success: false, error: `Failed to delete ${this.config.panelTypeName} panel` };
      }
    });

    // Get panel status
    this.ipcMain.handle(`${this.config.ipcPrefix}:status`, async (_event, panelId: string) => {
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:status called for panelId: ${panelId}`);

        const isRunning = this.panelManager.isPanelRunning(panelId);
        const panelState = this.panelManager.getPanelState(panelId);
        const process = this.panelManager.getPanelProcess(panelId);

        return { 
          success: true, 
          data: { 
            isRunning,
            state: panelState,
            hasProcess: !!process
          } 
        };
      } catch (error) {
        logger?.error(`Failed to get ${this.config.panelTypeName} panel status: ${error}`);
        return { success: false, error: `Failed to get ${this.config.panelTypeName} panel status` };
      }
    });

    // Get all panels for a session
    this.ipcMain.handle(`${this.config.ipcPrefix}:list`, async (_event, sessionId: string) => {
      try {
        logger?.info(`[IPC] ${this.config.ipcPrefix}:list called for sessionId: ${sessionId}`);

        const allPanels = panelManager.getPanelsForSession(sessionId);
        const typedPanels = allPanels.filter(panel => panel.type === this.config.panelType);

        // Enrich with runtime status
        const enrichedPanels = typedPanels.map(panel => ({
          ...panel,
          isRunning: this.panelManager.isPanelRunning(panel.id),
          runtimeState: this.panelManager.getPanelState(panel.id)
        }));

        return { success: true, data: enrichedPanels };
      } catch (error) {
        logger?.error(`Failed to list ${this.config.panelTypeName} panels: ${error}`);
        return { success: false, error: `Failed to list ${this.config.panelTypeName} panels` };
      }
    });
  }

  /**
   * Apply default settings for the panel type
   * Override this in derived classes to provide panel-specific defaults
   */
  protected applySettingsDefaults(settings: Record<string, unknown>): Record<string, unknown> {
    // Base implementation just returns settings as-is
    // Derived classes can override to add their defaults
    return settings;
  }

  /**
   * Helper method for start handlers - saves prompt and updates state
   */
  protected async handlePanelStart(
    panelId: string, 
    prompt: string, 
    additionalState?: unknown
  ): Promise<void> {
    const { sessionManager } = this.services;
    
    // Save the user prompt as a conversation message with panel_id
    sessionManager.addPanelConversationMessage(panelId, 'user', prompt);

    // Update panel state
    const panel = panelManager.getPanel(panelId);
    if (panel) {
      const updatedState = {
        ...(panel.state.customState || {}),
        isInitialized: true,
        lastPrompt: prompt,
        lastActivityTime: new Date().toISOString(),
        ...(additionalState && typeof additionalState === 'object' ? additionalState as Record<string, unknown> : {})
      };

      await panelManager.updatePanel(panelId, {
        state: {
          ...panel.state,
          customState: updatedState
        }
      });
    }
  }

  /**
   * Helper method for continue handlers - saves prompt and updates state
   */
  protected async handlePanelContinue(
    panelId: string, 
    prompt?: string, 
    additionalState?: unknown
  ): Promise<void> {
    const { sessionManager } = this.services;
    
    // Save the user prompt as a conversation message with panel_id
    if (prompt) {
      sessionManager.addPanelConversationMessage(panelId, 'user', prompt);
    }

    // Update panel state
    const panel = panelManager.getPanel(panelId);
    if (panel) {
      const updatedState: Record<string, unknown> = {
        ...(panel.state.customState || {}),
        isInitialized: true,
        lastActivityTime: new Date().toISOString(),
        ...(additionalState && typeof additionalState === 'object' ? additionalState as Record<string, unknown> : {})
      };
      
      if (prompt) {
        updatedState.lastPrompt = prompt;
      }

      await panelManager.updatePanel(panelId, {
        state: {
          ...panel.state,
          customState: updatedState
        }
      });
    }
  }
}
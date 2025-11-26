import { IpcMain } from 'electron';
import type { AppServices } from './types';
import { BaseAIPanelHandler } from './baseAIPanelHandler';
import { ClaudePanelManager } from '../services/panels/claude/claudePanelManager';
import { panelManager } from '../services/panelManager';
import { ClaudePanelState } from '../../../shared/types/panels';
import type { SessionOutput } from '../database/models';

let claudePanelManager: ClaudePanelManager;

class ClaudePanelHandler extends BaseAIPanelHandler {
  protected createPanelManager(): ClaudePanelManager {
    const { sessionManager, claudeCodeManager, logger, configManager, analyticsManager } = this.services;
    return new ClaudePanelManager(claudeCodeManager, sessionManager, logger, configManager, analyticsManager);
  }

  protected getInitialPanelState(): Partial<ClaudePanelState> {
    return {
      isInitialized: false,
      claudeResumeId: undefined,
      autoContextRunState: 'idle',
      contextUsage: null
    };
  }

  /**
   * Apply Claude-specific default settings
   */
  protected applySettingsDefaults(settings: Record<string, unknown>): Record<string, unknown> {
    const { configManager } = this.services;
    return {
      model: settings.model || configManager.getDefaultModel() || 'auto',
      commitMode: settings.commitMode ?? false,
      systemPrompt: settings.systemPrompt || null,
      maxTokens: settings.maxTokens || 4096,
      temperature: settings.temperature || 0.7,
      ...settings
    };
  }

  protected registerCustomHandlers(): void {
    const { sessionManager, databaseService, configManager, logger } = this.services;

    // Start Claude in a panel
    this.ipcMain.handle('claude-panels:start', async (_event, panelId: string, prompt: string, model?: string) => {
      try {
        console.log('[IPC] claude-panels:start called for panelId:', panelId);

        // Get the panel to verify it exists
        const panel = panelManager.getPanel(panelId);
        if (!panel) {
          return { success: false, error: 'Panel not found' };
        }

        // Get session details
        const session = sessionManager.getSession(panel.sessionId);
        if (!session) {
          return { success: false, error: 'Session not found' };
        }

        // Get model from panel settings if not provided
        let modelToUse = model;
        if (!modelToUse) {
          const settings = databaseService.getPanelSettings(panelId);
          modelToUse = (typeof settings?.model === 'string' ? settings.model : null) || configManager.getDefaultModel() || 'auto';
        }

        // Start Claude via the panel manager
        await (this.panelManager as ClaudePanelManager).startPanel(
          panelId, 
          session.worktreePath, 
          prompt, 
          undefined, // permissionMode 
          modelToUse
        );
        
        // Update panel state
        await this.handlePanelStart(panelId, prompt, {
          model: modelToUse
        });

        return { success: true };
      } catch (error) {
        console.error('Failed to start Claude panel:', error);
        return { success: false, error: 'Failed to start Claude panel' };
      }
    });

    // Continue conversation in a panel
    this.ipcMain.handle('claude-panels:continue', async (_event, panelId: string, prompt?: string, model?: string) => {
      try {
        console.log('[IPC] claude-panels:continue called for panelId:', panelId);

        // Get the panel to verify it exists
        const panel = panelManager.getPanel(panelId);
        if (!panel) {
          return { success: false, error: 'Panel not found' };
        }

        // Get session details
        const session = sessionManager.getSession(panel.sessionId);
        if (!session) {
          return { success: false, error: 'Session not found' };
        }

        // Get conversation history
        const conversationHistory = sessionManager.getPanelConversationMessages ? 
          sessionManager.getPanelConversationMessages(panelId) :
          sessionManager.getConversationMessages(panel.sessionId);

        // Continue via the panel manager
        await (this.panelManager as ClaudePanelManager).continuePanel(
          panelId, 
          session.worktreePath, 
          prompt || '', 
          conversationHistory, 
          model
        );
        
        // Update panel state
        await this.handlePanelContinue(panelId, prompt);

        return { success: true };
      } catch (error) {
        console.error('Failed to continue Claude panel:', error);
        return { success: false, error: 'Failed to continue Claude panel' };
      }
    });

    // Get Claude panel model settings (backward compatibility - delegates to get-settings)
    this.ipcMain.handle('claude-panels:get-model', async (_event, panelId: string) => {
      try {
        console.log('[IPC] claude-panels:get-model called for panelId:', panelId);
        
        const settings = databaseService.getPanelSettings(panelId);
        const settingsWithDefaults = this.applySettingsDefaults(settings);
        
        return { success: true, data: settingsWithDefaults.model };
      } catch (error) {
        console.error('Failed to get Claude panel model:', error);
        return { success: false, error: 'Failed to get Claude panel model' };
      }
    });

    // Set Claude panel model settings (backward compatibility - delegates to set-settings)
    this.ipcMain.handle('claude-panels:set-model', async (_event, panelId: string, model: string) => {
      try {
        console.log('[IPC] claude-panels:set-model called for panelId:', panelId, 'model:', model);
        
        databaseService.updatePanelSettings(panelId, { model });
        
        return { success: true };
      } catch (error) {
        console.error('Failed to set Claude panel model:', error);
        return { success: false, error: 'Failed to set Claude panel model' };
      }
    });

    // Generate compacted context for a Claude panel
    this.ipcMain.handle('claude-panels:generate-compacted-context', async (_event, panelId: string) => {
      try {
        console.log('[IPC] claude-panels:generate-compacted-context called for panelId:', panelId);

        // Get the panel to find the session
        const panel = panelManager.getPanel(panelId);
        if (!panel) {
          return { success: false, error: 'Panel not found' };
        }

        // Implement the same logic as the session handler - compaction is session-wide
        const session = await sessionManager.getSession(panel.sessionId);
        if (!session) {
          return { success: false, error: 'Session not found' };
        }

        // Get the database session for the compactor (it expects the database model)
        const dbSession = databaseService.getSession(panel.sessionId);
        if (!dbSession) {
          return { success: false, error: 'Session not found in database' };
        }

        // Use panel-based methods for Claude data
        const conversationMessages = sessionManager.getPanelConversationMessages ? 
          await sessionManager.getPanelConversationMessages(panelId) :
          await sessionManager.getConversationMessages(panel.sessionId);
        const promptMarkers = databaseService.getPanelPromptMarkers ? 
          databaseService.getPanelPromptMarkers(panelId) :
          databaseService.getPromptMarkers(panel.sessionId);
        const executionDiffs = databaseService.getPanelExecutionDiffs ? 
          databaseService.getPanelExecutionDiffs(panelId) :
          databaseService.getExecutionDiffs(panel.sessionId);
        const sessionOutputs = sessionManager.getPanelOutputs ? 
          await sessionManager.getPanelOutputs(panelId) :
          await sessionManager.getSessionOutputs(panel.sessionId);
        
        // Import the compactor utility
        const { ProgrammaticCompactor } = await import('../utils/contextCompactor');
        const compactor = new ProgrammaticCompactor(databaseService);
        
        // Generate the compacted summary
        const summary = await compactor.generateSummary(panel.sessionId, {
          session: dbSession,
          conversationMessages,
          promptMarkers,
          executionDiffs,
          sessionOutputs: sessionOutputs
        });
        
        // Set flag to skip --resume on the next execution
        console.log('[IPC] Setting skip_continue_next flag to true for session:', panel.sessionId);
        await sessionManager.updateSession(panel.sessionId, { skip_continue_next: true });
        
        // Verify the flag was set
        const updatedSession = databaseService.getSession(panel.sessionId);
        console.log('[IPC] Verified skip_continue_next flag after update:', {
          raw_value: updatedSession?.skip_continue_next,
          type: typeof updatedSession?.skip_continue_next,
          is_truthy: !!updatedSession?.skip_continue_next
        });
        console.log('[IPC] Generated compacted context summary and set skip_continue_next flag');
        
        // Add a system message to the session outputs so it appears in rich output view
        const contextCompactionMessage = {
          type: 'system',
          subtype: 'context_compacted',
          timestamp: new Date().toISOString(),
          summary: summary,
          message: 'Context has been compacted. You can continue chatting - your next message will automatically include the context summary above.'
        };
        
        // Add context compaction message using panel-based method
        if (sessionManager.addPanelOutput) {
          await sessionManager.addPanelOutput(panelId, {
            type: 'json',
            data: contextCompactionMessage,
            timestamp: new Date()
          });
        } else {
          await sessionManager.addSessionOutput(panel.sessionId, {
            type: 'json',
            data: contextCompactionMessage,
            timestamp: new Date()
          });
        }
        
        return { success: true, data: { summary } };
      } catch (error) {
        console.error('Failed to generate compacted context for Claude panel:', error);
        return { success: false, error: 'Failed to generate compacted context for Claude panel' };
      }
    });
  }
}

export function registerClaudePanelHandlers(ipcMain: IpcMain, services: AppServices): void {
  const handler = new ClaudePanelHandler(ipcMain, services, {
    panelType: 'claude',
    panelTypeName: 'Claude',
    ipcPrefix: 'claude-panels',
    defaultTitle: 'Claude'
  });
  
  // Export the manager for use by other modules
  claudePanelManager = handler['panelManager'] as ClaudePanelManager;
}

// Export the manager instance for use by other modules
export { claudePanelManager };

import { IpcMain } from 'electron';
import type { AppServices } from './types';
import { ClaudePanelManager } from '../services/panels/claude/claudePanelManager';
import { panelManager } from '../services/panelManager';
import { ClaudePanelState } from '../../../shared/types/panels';

let claudePanelManager: ClaudePanelManager;

export function registerClaudePanelHandlers(ipcMain: IpcMain, services: AppServices): void {
  const {
    sessionManager,
    databaseService,
    claudeCodeManager,
    logger,
    configManager
  } = services;

  // Initialize the Claude panel manager wrapper
  claudePanelManager = new ClaudePanelManager(claudeCodeManager, sessionManager, logger, configManager);

  // Create a new Claude panel
  ipcMain.handle('claude-panels:create', async (_event, sessionId: string, title?: string) => {
    try {
      console.log('[IPC] claude-panels:create called for sessionId:', sessionId);

      // Create the panel using the generic panel manager
      const panel = await panelManager.createPanel({
        sessionId,
        type: 'claude',
        title: title || 'Claude',
        initialState: {
          isInitialized: false,
          claudeResumeId: undefined
        }
      });

      // Register the panel with the Claude panel manager
      claudePanelManager.registerPanel(panel.id, sessionId, panel.state.customState as ClaudePanelState);

      return { success: true, data: panel };
    } catch (error) {
      console.error('Failed to create Claude panel:', error);
      return { success: false, error: 'Failed to create Claude panel' };
    }
  });

  // Start Claude in a panel
  ipcMain.handle('claude-panels:start', async (_event, panelId: string, prompt: string, permissionMode?: 'approve' | 'ignore', model?: string) => {
    try {
      console.log('[IPC] claude-panels:start called for panelId:', panelId);

      // Get the panel to find the session
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }

      // Get session details
      const session = await sessionManager.getSession(panel.sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Save the user prompt as a conversation message with panel_id
      sessionManager.addPanelConversationMessage(panelId, 'user', prompt);

      // Start Claude via the panel manager
      await claudePanelManager.startPanel(panelId, session.worktreePath, prompt, permissionMode, model);
      
      // Update panel state
      const updatedState: ClaudePanelState = {
        ...panel.state.customState as ClaudePanelState,
        isInitialized: true,
        lastPrompt: prompt,
        model,
        permissionMode,
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
      console.error('Failed to start Claude panel:', error);
      return { success: false, error: 'Failed to start Claude panel' };
    }
  });

  // Continue Claude conversation in a panel
  ipcMain.handle('claude-panels:continue', async (_event, panelId: string, prompt?: string, model?: string) => {
    try {
      console.log('[IPC] claude-panels:continue called for panelId:', panelId);

      // Get the panel to find the session
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }

      // Get session details
      const session = await sessionManager.getSession(panel.sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Save the user prompt as a conversation message with panel_id
      if (prompt) {
        sessionManager.addPanelConversationMessage(panelId, 'user', prompt);
      }

      // Get conversation history using panel-based method for Claude data
      const conversationHistory = sessionManager.getPanelConversationMessages ? 
        sessionManager.getPanelConversationMessages(panelId) :
        sessionManager.getConversationMessages(panel.sessionId);

      // Continue Claude via the panel manager
      const continuePrompt = prompt || '';
      await claudePanelManager.continuePanel(panelId, session.worktreePath, continuePrompt, conversationHistory, model);
      
      // Update panel state
      const updatedState: ClaudePanelState = {
        ...panel.state.customState as ClaudePanelState,
        isInitialized: true,
        lastPrompt: prompt,
        model: model || (panel.state.customState as ClaudePanelState)?.model,
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
      console.error('Failed to continue Claude panel:', error);
      return { success: false, error: 'Failed to continue Claude panel' };
    }
  });

  // Send input to a Claude panel
  ipcMain.handle('claude-panels:input', async (_event, panelId: string, input: string) => {
    try {
      console.log('[IPC] claude-panels:input called for panelId:', panelId);

      // Get the panel to find the session
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }

      // Check if Claude is running for this panel
      const isRunning = claudePanelManager.isPanelRunning(panelId);
      if (!isRunning) {
        return { success: false, error: 'Claude is not running for this panel' };
      }

      // Save the user input as a conversation message with panel_id
      sessionManager.addPanelConversationMessage(panelId, 'user', input);

      // Send input via the panel manager
      claudePanelManager.sendInputToPanel(panelId, input);
      
      // Update panel state
      const updatedState: ClaudePanelState = {
        ...panel.state.customState as ClaudePanelState,
        lastPrompt: input,
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
      console.error('Failed to send input to Claude panel:', error);
      return { success: false, error: 'Failed to send input to Claude panel' };
    }
  });

  // Stop Claude in a panel
  ipcMain.handle('claude-panels:stop', async (_event, panelId: string) => {
    try {
      console.log('[IPC] claude-panels:stop called for panelId:', panelId);

      // Stop Claude via the panel manager
      await claudePanelManager.stopPanel(panelId);
      
      // Get the panel and update its state
      const panel = panelManager.getPanel(panelId);
      if (panel) {
        const updatedState: ClaudePanelState = {
          ...panel.state.customState as ClaudePanelState,
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
      console.error('Failed to stop Claude panel:', error);
      return { success: false, error: 'Failed to stop Claude panel' };
    }
  });

  // Delete a Claude panel
  ipcMain.handle('claude-panels:delete', async (_event, panelId: string) => {
    try {
      console.log('[IPC] claude-panels:delete called for panelId:', panelId);

      // Stop Claude if running
      if (claudePanelManager.isPanelRunning(panelId)) {
        await claudePanelManager.stopPanel(panelId);
      }

      // Unregister from Claude panel manager
      claudePanelManager.unregisterPanel(panelId);

      // Delete the panel using the generic panel manager
      await panelManager.deletePanel(panelId);

      return { success: true };
    } catch (error) {
      console.error('Failed to delete Claude panel:', error);
      return { success: false, error: 'Failed to delete Claude panel' };
    }
  });

  // Get Claude panel status
  ipcMain.handle('claude-panels:status', async (_event, panelId: string) => {
    try {
      console.log('[IPC] claude-panels:status called for panelId:', panelId);

      const isRunning = claudePanelManager.isPanelRunning(panelId);
      const panelState = claudePanelManager.getPanelState(panelId);
      const process = claudePanelManager.getPanelProcess(panelId);

      return { 
        success: true, 
        data: { 
          isRunning,
          state: panelState,
          hasProcess: !!process
        } 
      };
    } catch (error) {
      console.error('Failed to get Claude panel status:', error);
      return { success: false, error: 'Failed to get Claude panel status' };
    }
  });

  // Get all Claude panels for a session
  ipcMain.handle('claude-panels:list', async (_event, sessionId: string) => {
    try {
      console.log('[IPC] claude-panels:list called for sessionId:', sessionId);

      const allPanels = panelManager.getPanelsForSession(sessionId);
      const claudePanels = allPanels.filter(panel => panel.type === 'claude');

      // Enrich with runtime status
      const enrichedPanels = claudePanels.map(panel => ({
        ...panel,
        isRunning: claudePanelManager.isPanelRunning(panel.id),
        runtimeState: claudePanelManager.getPanelState(panel.id)
      }));

      return { success: true, data: enrichedPanels };
    } catch (error) {
      console.error('Failed to list Claude panels:', error);
      return { success: false, error: 'Failed to list Claude panels' };
    }
  });

  // Generate compacted context for a Claude panel (similar to session handler)
  ipcMain.handle('claude-panels:generate-compacted-context', async (_event, panelId: string) => {
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
        sessionOutputs: sessionOutputs as any // Type conversion needed
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

// Export the manager instance for use by other modules
export { claudePanelManager };
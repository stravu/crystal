import { IpcMain, BrowserWindow } from 'electron';
import { panelManager } from '../services/panelManager';
import { terminalPanelManager } from '../services/terminalPanelManager';
import { databaseService } from '../services/database';
import { CreatePanelRequest, PanelEventType, ToolPanel, BaseAIPanelState } from '../../../shared/types/panels';
import type { AppServices } from './types';

export function registerPanelHandlers(ipcMain: IpcMain, services: AppServices) {
  // Panel CRUD operations
  ipcMain.handle('panels:create', async (_, request: CreatePanelRequest) => {
    try {
      const panel = await panelManager.createPanel(request);

      // Auto-register Claude panels so they're hooked to the Claude runtime
      if (panel.type === 'claude') {
        try {
          const { claudePanelManager } = require('./claudePanel');
          if (claudePanelManager) {
            claudePanelManager.registerPanel(panel.id, panel.sessionId, panel.state.customState);
          } else {
            console.warn('[Panels IPC] ClaudePanelManager not initialized yet; will register later');
          }
        } catch (err) {
          console.error('[Panels IPC] Failed to register Claude panel with ClaudePanelManager:', err);
        }
      }

      // Auto-register Codex panels so they're hooked to the Codex runtime
      if (panel.type === 'codex') {
        try {
          const { codexPanelManager } = require('./codexPanel');
          if (codexPanelManager) {
            codexPanelManager.registerPanel(panel.id, panel.sessionId, panel.state.customState);
          } else {
            console.warn('[Panels IPC] CodexPanelManager not initialized yet; will register later');
          }
        } catch (err) {
          console.error('[Panels IPC] Failed to register Codex panel with CodexPanelManager:', err);
        }
      }

      return { success: true, data: panel };
    } catch (error) {
      console.error('[IPC] Failed to create panel:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  ipcMain.handle('panels:delete', async (_, panelId: string) => {
    try {
      // Clean up terminal process if it's a terminal panel
      const panel = panelManager.getPanel(panelId);
      // Unregister Claude panels from ClaudePanelManager
      if (panel?.type === 'claude') {
        try {
          const { claudePanelManager } = require('./claudePanel');
          if (claudePanelManager) {
            // Stop if running, then unregister
            if (claudePanelManager.isPanelRunning(panelId)) {
              await claudePanelManager.stopPanel(panelId);
            }
            claudePanelManager.unregisterPanel(panelId);
          }
        } catch (err) {
          console.warn('[Panels IPC] Failed to unregister Claude panel during delete:', err);
        }
      }
      // Unregister Codex panels from CodexPanelManager
      if (panel?.type === 'codex') {
        try {
          const { codexPanelManager } = require('./codexPanel');
          if (codexPanelManager) {
            // Stop if running, then unregister
            if (codexPanelManager.isPanelRunning(panelId)) {
              await codexPanelManager.stopPanel(panelId);
            }
            codexPanelManager.unregisterPanel(panelId);
          }
        } catch (err) {
          console.warn('[Panels IPC] Failed to unregister Codex panel during delete:', err);
        }
      }
      if (panel?.type === 'terminal') {
        terminalPanelManager.destroyTerminal(panelId);
      }
      
      await panelManager.deletePanel(panelId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to delete panel:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  ipcMain.handle('panels:update', async (_, panelId: string, updates: Partial<ToolPanel>) => {
    try {
      // Track panel rename if title is being updated
      if (updates.title) {
        const panel = panelManager.getPanel(panelId);
        if (panel && panel.title !== updates.title && services.analyticsManager) {
          services.analyticsManager.track('panel_renamed', {
            panel_type: panel.type
          });
        }
      }

      const result = await panelManager.updatePanel(panelId, updates);
      return { success: true, data: result };
    } catch (error) {
      console.error('[IPC] Failed to update panel:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  ipcMain.handle('panels:list', async (_, sessionId: string) => {
    try {
      const panels = panelManager.getPanelsForSession(sessionId);
      return { success: true, data: panels };
    } catch (error) {
      console.error('[IPC] Failed to list panels:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  ipcMain.handle('panels:set-active', async (_, sessionId: string, panelId: string) => {
    try {
      await panelManager.setActivePanel(sessionId, panelId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to set active panel:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  ipcMain.handle('panels:getActive', async (_, sessionId: string) => {
    return databaseService.getActivePanel(sessionId);
  });
  
  // Panel initialization (lazy loading)
  ipcMain.handle('panels:initialize', async (_, panelId: string, options?: { cwd?: string; sessionId?: string }) => {
    
    const panel = panelManager.getPanel(panelId);
    if (!panel) {
      throw new Error(`Panel ${panelId} not found`);
    }
    
    // Mark panel as viewed
    if (!panel.state.hasBeenViewed) {
      panel.state.hasBeenViewed = true;
      await panelManager.updatePanel(panelId, { state: panel.state });
    }
    
    // Initialize based on panel type
    if (panel.type === 'terminal') {
      const cwd = options?.cwd || process.cwd();
      await terminalPanelManager.initializeTerminal(panel, cwd);
    }
    
    return true;
  });
  
  ipcMain.handle('panels:checkInitialized', async (_, panelId: string) => {
    const panel = panelManager.getPanel(panelId);
    if (!panel) return false;
    
    if (panel.type === 'terminal') {
      return terminalPanelManager.isTerminalInitialized(panelId);
    }
    
    if (panel.type === 'diff') {
      // Diff panels don't have background processes, so they're always "initialized"
      return true;
    }
    
    if (panel.type === 'claude') {
      const customState = panel.state.customState as { isInitialized?: boolean } | undefined;
      return customState?.isInitialized || false;
    }
    
    if (panel.type === 'codex') {
      const customState = panel.state.customState as { isInitialized?: boolean } | undefined;
      return customState?.isInitialized || false;
    }
    
    // Editor panels don't need initialization
    if (panel.type === 'editor') {
      return true;
    }
    
    return false;
  });
  
  // Event handlers
  ipcMain.handle('panels:emitEvent', async (_, panelId: string, eventType: PanelEventType, data: unknown) => {
    return panelManager.emitPanelEvent(panelId, eventType, data);
  });

  // Clear unviewed content flag for AI panels
  ipcMain.handle('panels:clearUnviewedContent', async (event, panelId: string) => {
    try {
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }

      // Only applicable to AI panels
      if (panel.type !== 'claude' && panel.type !== 'codex') {
        return { success: true };
      }

      const customState = (panel.state.customState as BaseAIPanelState | undefined) ?? {};

      // Clear unviewed content flag and reset status if it was completed_unviewed
      const nextCustomState: BaseAIPanelState = {
        ...customState,
        hasUnviewedContent: false,
        panelStatus: customState.panelStatus === 'completed_unviewed' ? 'stopped' : customState.panelStatus,
        lastActivityTime: new Date().toISOString()
      };

      const nextPanelState = {
        ...panel.state,
        customState: nextCustomState
      };

      await panelManager.updatePanel(panelId, { state: nextPanelState });

      // Notify frontend of the update
      const webContents = event.sender;
      if (webContents && !webContents.isDestroyed()) {
        try {
          webContents.send('panel:updated', {
            ...panel,
            state: nextPanelState
          });
        } catch (ipcError) {
          console.error(`[Panels IPC] Failed to send panel:updated event for panel ${panelId}:`, ipcError);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to clear unviewed content:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  // Panel-specific terminal handlers (called via panels: namespace from frontend)
  ipcMain.handle('panels:resize-terminal', async (_, panelId: string, cols: number, rows: number) => {
    try {
      await terminalPanelManager.resizeTerminal(panelId, cols, rows);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to resize terminal:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  ipcMain.handle('panels:send-terminal-input', async (_, panelId: string, data: string) => {
    try {
      await terminalPanelManager.writeToTerminal(panelId, data);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Failed to send terminal input:', error);
      return { success: false, error: (error as Error).message };
    }
  });
  
  // Note: Panel output handlers (get-output, get-conversation-messages, get-json-messages, get-prompts, continue)
  // are implemented in session.ts as they need access to sessionManager methods
  
  // Terminal-specific handlers (internal use)
  ipcMain.handle('terminal:input', async (_, panelId: string, data: string) => {
    return terminalPanelManager.writeToTerminal(panelId, data);
  });
  
  ipcMain.handle('terminal:resize', async (_, panelId: string, cols: number, rows: number) => {
    return terminalPanelManager.resizeTerminal(panelId, cols, rows);
  });
  
  ipcMain.handle('terminal:getState', async (_, panelId: string) => {
    return terminalPanelManager.getTerminalState(panelId);
  });
  
  ipcMain.handle('terminal:saveState', async (_, panelId: string) => {
    return terminalPanelManager.saveTerminalState(panelId);
  });
}

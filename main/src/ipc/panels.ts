import { IpcMain } from 'electron';
import { panelManager } from '../services/panelManager';
import { terminalPanelManager } from '../services/terminalPanelManager';
import { databaseService } from '../services/database';
import { CreatePanelRequest, PanelEventType, ToolPanel } from '../../../shared/types/panels';
import type { AppServices } from './types';

export function registerPanelHandlers(ipcMain: IpcMain, _services: AppServices) {
  // Panel CRUD operations
  ipcMain.handle('panels:create', async (_, request: CreatePanelRequest) => {
    try {
      const panel = await panelManager.createPanel(request);

      // Panel managers will auto-register when they initialize
      // Note: Avoiding require() to prevent circular dependencies
      console.log(`[Panels IPC] Created ${panel.type} panel ${panel.id} - manager will register when ready`);

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
      // Panel managers will clean up when they detect panel deletion
      // Note: Avoiding require() to prevent circular dependencies
      console.log(`[Panels IPC] Deleted ${panel?.type} panel ${panelId} - manager will clean up when ready`);
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

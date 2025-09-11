import { IpcMain } from 'electron';
import { panelManager } from '../services/panelManager';
import { terminalPanelManager } from '../services/terminalPanelManager';
import { databaseService } from '../services/database';
import { CreatePanelRequest, PanelEventType } from '../../../shared/types/panels';
import type { AppServices } from './types';

export function registerPanelHandlers(ipcMain: IpcMain, services: AppServices) {
  // Panel CRUD operations
  ipcMain.handle('panels:create', async (_, request: CreatePanelRequest) => {
    console.log('[IPC] Creating panel:', request);
    return panelManager.createPanel(request);
  });
  
  ipcMain.handle('panels:delete', async (_, panelId: string) => {
    console.log('[IPC] Deleting panel:', panelId);
    
    // Clean up terminal process if it's a terminal panel
    const panel = panelManager.getPanel(panelId);
    if (panel?.type === 'terminal') {
      terminalPanelManager.destroyTerminal(panelId);
    }
    
    return panelManager.deletePanel(panelId);
  });
  
  ipcMain.handle('panels:update', async (_, panelId: string, updates: any) => {
    console.log('[IPC] Updating panel:', panelId, updates);
    return panelManager.updatePanel(panelId, updates);
  });
  
  ipcMain.handle('panels:list', async (_, sessionId: string) => {
    console.log('[IPC] Listing panels for session:', sessionId);
    return panelManager.getPanelsForSession(sessionId);
  });
  
  ipcMain.handle('panels:setActive', async (_, sessionId: string, panelId: string) => {
    console.log('[IPC] Setting active panel:', sessionId, panelId);
    return panelManager.setActivePanel(sessionId, panelId);
  });
  
  ipcMain.handle('panels:getActive', async (_, sessionId: string) => {
    console.log('[IPC] Getting active panel for session:', sessionId);
    return databaseService.getActivePanel(sessionId);
  });
  
  // Panel initialization (lazy loading)
  ipcMain.handle('panels:initialize', async (_, panelId: string, options?: any) => {
    console.log('[IPC] Initializing panel:', panelId, options);
    
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
    
    return panel.state.customState?.isInitialized || false;
  });
  
  // Event handlers
  ipcMain.handle('panels:emitEvent', async (_, panelId: string, eventType: PanelEventType, data: any) => {
    console.log('[IPC] Emitting panel event:', panelId, eventType);
    return panelManager.emitPanelEvent(panelId, eventType, data);
  });
  
  // Terminal-specific handlers
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
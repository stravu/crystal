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

    let finalRequest = { ...request };

    // For Claude panels, inherit provider information from the session
    if (request.type === 'claude') {
      try {
        // Get session details to inherit provider information
        const session = services.sessionManager.getSession(request.sessionId);
        if (session) {
          // Update the initial state to include provider information
          finalRequest = {
            ...request,
            initialState: {
              ...request.initialState,
              providerId: session.providerId || 'anthropic',
              providerModel: session.providerModel || 'claude-3-opus-20240229'
            }
          };

          // Update panel with provider information in database after creation
          // We'll do this after the panel is created
        }
      } catch (err) {
        console.error('[Panels IPC] Failed to get session for Claude panel provider inheritance:', err);
      }
    }

    const panel = await panelManager.createPanel(finalRequest);

    // For Claude panels, update the database with provider information
    if (panel.type === 'claude') {
      try {
        const session = services.sessionManager.getSession(panel.sessionId);
        if (session) {
          databaseService.updatePanel(panel.id, {
            provider_id: session.providerId || 'anthropic',
            provider_model: session.providerModel || 'claude-3-opus-20240229'
          });
        }
      } catch (err) {
        console.error('[Panels IPC] Failed to update Claude panel with provider information:', err);
      }
    }

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

    return panel;
  });
  
  ipcMain.handle('panels:delete', async (_, panelId: string) => {
    console.log('[IPC] Deleting panel:', panelId);
    
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
    
    return panelManager.deletePanel(panelId);
  });
  
  ipcMain.handle('panels:update', async (_, panelId: string, updates: any) => {
    console.log('[IPC] Updating panel:', panelId);
    console.log('[IPC] Updates:', JSON.stringify(updates, null, 2));
    
    const result = await panelManager.updatePanel(panelId, updates);
    console.log('[IPC] Update result:', result);
    
    return result;
  });
  
  ipcMain.handle('panels:list', async (_, sessionId: string) => {
    console.log('[IPC] Listing panels for session:', sessionId);
    const panels = panelManager.getPanelsForSession(sessionId);
    console.log('[IPC] Found panels:', panels.map(p => ({
      id: p.id,
      type: p.type,
      title: p.title,
      state: p.state
    })));
    return panels;
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
    
    if (panel.type === 'diff') {
      // Diff panels don't have background processes, so they're always "initialized"
      return true;
    }
    
    if (panel.type === 'claude') {
      const customState = panel.state.customState as any;
      return customState?.isInitialized || false;
    }
    
    if (panel.type === 'codex') {
      const customState = panel.state.customState as any;
      return customState?.isInitialized || false;
    }
    
    // Editor panels don't need initialization
    if (panel.type === 'editor') {
      return true;
    }
    
    return false;
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

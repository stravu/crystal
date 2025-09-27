import { IpcMain } from 'electron';
import * as path from 'path';
import { panelManager } from '../services/panelManager';
import type { AppServices } from './types';

interface OpenFileInEditorRequest {
  sessionId: string;
  filePath: string;
  panelId?: string; // Optional: specific panel to open in
}

interface CreateEditorPanelRequest {
  sessionId: string;
  filePath?: string; // Optional: file to open initially
  title?: string; // Optional: custom title
}

export function registerEditorPanelHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { sessionManager } = services;
  
  // Create a new editor panel
  ipcMain.handle('editor:createPanel', async (_, request: CreateEditorPanelRequest) => {
    try {
      const { sessionId, filePath, title } = request;
      
      // Verify session exists
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      
      // Generate title from filepath or use default
      const panelTitle = title || (filePath ? path.basename(filePath) : 'Editor');
      
      // Create the panel
      const panel = await panelManager.createPanel({
        sessionId,
        type: 'editor',
        title: panelTitle,
        initialState: filePath ? {
          customState: {
            filePath,
            isDirty: false
          }
        } : undefined
      });
      
      return { success: true, panel };
    } catch (error) {
      console.error('Failed to create editor panel:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
  
  // Open a file in an editor panel (creates new panel or uses existing)
  ipcMain.handle('editor:openFile', async (_, request: OpenFileInEditorRequest) => {
    try {
      const { sessionId, filePath, panelId } = request;
      
      // Verify session exists
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      
      let targetPanelId = panelId;
      
      // If no panel specified, find an existing editor panel or create one
      if (!targetPanelId) {
        const panels = panelManager.getPanelsForSession(sessionId);
        const editorPanel = panels.find(p => p.type === 'editor' && !(p.state?.customState as {filePath?: string})?.filePath);
        
        if (editorPanel) {
          targetPanelId = editorPanel.id;
        } else {
          // Create a new editor panel
          const newPanel = await panelManager.createPanel({
            sessionId,
            type: 'editor',
            title: path.basename(filePath)
          });
          targetPanelId = newPanel.id;
        }
      }
      
      // Get the existing panel to preserve its state
      const targetPanel = panelManager.getPanel(targetPanelId!);
      
      // Update the panel with the file path
      await panelManager.updatePanel(targetPanelId!, {
        title: path.basename(filePath),
        state: {
          isActive: targetPanel?.state?.isActive || false,
          isPinned: targetPanel?.state?.isPinned,
          hasBeenViewed: targetPanel?.state?.hasBeenViewed,
          customState: {
            filePath,
            isDirty: false
          }
        }
      });
      
      return { success: true, panelId: targetPanelId };
    } catch (error) {
      console.error('Failed to open file in editor panel:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
  
  // Get editor-specific panel state
  ipcMain.handle('editor:getPanelState', async (_, panelId: string) => {
    try {
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }
      
      return { 
        success: true, 
        state: panel.state?.customState || {} 
      };
    } catch (error) {
      console.error('Failed to get editor panel state:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
  
  // Update editor-specific panel state
  ipcMain.handle('editor:updatePanelState', async (_, panelId: string, state: Record<string, unknown>) => {
    try {
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }
      
      await panelManager.updatePanel(panelId, {
        state: {
          ...panel.state,
          customState: {
            ...panel.state?.customState,
            ...state
          }
        }
      });
      
      return { success: true };
    } catch (error) {
      console.error('Failed to update editor panel state:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });
}
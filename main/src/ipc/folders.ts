import { IpcMain } from 'electron';
import type { Folder } from '../database/models';
import type { AppServices } from './types';

export function registerFolderHandlers(ipcMain: IpcMain, services: AppServices) {
  const { databaseService, getMainWindow } = services;

  // Get all folders for a project
  ipcMain.handle('folders:get-by-project', async (_, projectId: number) => {
    try {
      const folders = databaseService.getFoldersForProject(projectId);
      return { success: true, data: folders };
    } catch (error: any) {
      console.error('[IPC] Failed to get folders:', error);
      return { success: false, error: error.message || 'Failed to get folders' };
    }
  });

  // Create a new folder
  ipcMain.handle('folders:create', async (_, name: string, projectId: number) => {
    try {
      const folder = databaseService.createFolder(name, projectId);
      return { success: true, data: folder };
    } catch (error: any) {
      console.error('[IPC] Failed to create folder:', error);
      return { success: false, error: error.message || 'Failed to create folder' };
    }
  });

  // Update a folder
  ipcMain.handle('folders:update', async (event, folderId: string, updates: { name?: string; display_order?: number }) => {
    try {
      databaseService.updateFolder(folderId, updates);
      
      // Get the updated folder to emit the event
      const updatedFolder = databaseService.getFolder(folderId);
      if (updatedFolder) {
        
        // Emit the folder:updated event to notify the frontend
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log(`[IPC] Emitting folder:updated event for folder ${folderId}`);
          mainWindow.webContents.send('folder:updated', updatedFolder);
        }
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to update folder:', error);
      return { success: false, error: error.message || 'Failed to update folder' };
    }
  });

  // Delete a folder
  ipcMain.handle('folders:delete', async (_, folderId: string) => {
    try {
      databaseService.deleteFolder(folderId);
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to delete folder:', error);
      return { success: false, error: error.message || 'Failed to delete folder' };
    }
  });

  // Reorder folders within a project
  ipcMain.handle('folders:reorder', async (_, projectId: number, folderIds: string[]) => {
    try {
      databaseService.reorderFolders(projectId, folderIds);
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to reorder folders:', error);
      return { success: false, error: error.message || 'Failed to reorder folders' };
    }
  });

  // Move session to folder
  ipcMain.handle('folders:move-session', async (_, sessionId: string, folderId: string | null) => {
    try {
      // Get the session to verify it exists
      const session = databaseService.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // If moving to a folder, verify it exists and belongs to the same project
      if (folderId !== null) {
        const folder = databaseService.getFolder(folderId);
        if (!folder) {
          throw new Error('Folder not found');
        }
        if (folder.project_id !== session.project_id) {
          throw new Error('Folder belongs to a different project');
        }
      }

      // Update the session
      databaseService.updateSession(sessionId, { folder_id: folderId });
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to move session to folder:', error);
      return { success: false, error: error.message || 'Failed to move session to folder' };
    }
  });
}
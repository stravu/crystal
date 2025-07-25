import { IpcMain } from 'electron';
import type { Folder } from '../database/models';
import type { AppServices } from './types';

// Convert database folder (snake_case) to frontend folder (camelCase)
export function convertDbFolderToFolder(dbFolder: Folder) {
  return {
    id: dbFolder.id,
    name: dbFolder.name,
    projectId: dbFolder.project_id,
    parentFolderId: dbFolder.parent_folder_id,
    displayOrder: dbFolder.display_order,
    createdAt: dbFolder.created_at,
    updatedAt: dbFolder.updated_at
  };
}

export function registerFolderHandlers(ipcMain: IpcMain, services: AppServices) {
  const { databaseService, getMainWindow } = services;

  // Get all folders for a project
  ipcMain.handle('folders:get-by-project', async (_, projectId: number) => {
    try {
      const folders = databaseService.getFoldersForProject(projectId);
      const convertedFolders = folders.map(convertDbFolderToFolder);
      return { success: true, data: convertedFolders };
    } catch (error: any) {
      console.error('[IPC] Failed to get folders:', error);
      return { success: false, error: error.message || 'Failed to get folders' };
    }
  });

  // Create a new folder
  ipcMain.handle('folders:create', async (_, name: string, projectId: number, parentFolderId?: string | null) => {
    try {
      const folder = databaseService.createFolder(name, projectId, parentFolderId);
      const convertedFolder = convertDbFolderToFolder(folder);
      return { success: true, data: convertedFolder };
    } catch (error: any) {
      console.error('[IPC] Failed to create folder:', error);
      return { success: false, error: error.message || 'Failed to create folder' };
    }
  });

  // Update a folder
  ipcMain.handle('folders:update', async (_, folderId: string, updates: { name?: string; display_order?: number; parent_folder_id?: string | null }) => {
    try {
      databaseService.updateFolder(folderId, updates);
      
      // Get the updated folder to emit the event
      const updatedFolder = databaseService.getFolder(folderId);
      if (updatedFolder) {
        
        // Emit the folder:updated event to notify the frontend
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log(`[IPC] Emitting folder:updated event for folder ${folderId}`);
          const convertedFolder = convertDbFolderToFolder(updatedFolder);
          mainWindow.webContents.send('folder:updated', convertedFolder);
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

  // Move folder to another folder (for nesting)
  ipcMain.handle('folders:move', async (_, folderId: string, parentFolderId: string | null) => {
    try {
      // Get the folder to verify it exists
      const folder = databaseService.getFolder(folderId);
      if (!folder) {
        throw new Error('Folder not found');
      }

      // If moving to a parent folder, verify it exists and belongs to the same project
      if (parentFolderId !== null) {
        const parentFolder = databaseService.getFolder(parentFolderId);
        if (!parentFolder) {
          throw new Error('Parent folder not found');
        }
        if (parentFolder.project_id !== folder.project_id) {
          throw new Error('Parent folder belongs to a different project');
        }

        // Check for circular reference
        if (databaseService.wouldCreateCircularReference(folderId, parentFolderId)) {
          throw new Error('Cannot move folder into its own descendant');
        }

        // Check nesting depth
        const depth = databaseService.getFolderDepth(parentFolderId);
        if (depth >= 4) { // Parent is at depth 4, so child would be at depth 5
          throw new Error('Maximum nesting depth (5 levels) reached');
        }
      }

      // Update the folder
      databaseService.updateFolder(folderId, { parent_folder_id: parentFolderId });
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to move folder:', error);
      return { success: false, error: error.message || 'Failed to move folder' };
    }
  });
}
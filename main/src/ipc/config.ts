import { IpcMain } from 'electron';
import type { AppServices } from './types';

export function registerConfigHandlers(ipcMain: IpcMain, { configManager, claudeCodeManager }: AppServices): void {
  ipcMain.handle('config:get', async () => {
    try {
      const config = configManager.getConfig();
      return { success: true, data: config };
    } catch (error) {
      console.error('Failed to get config:', error);
      return { success: false, error: 'Failed to get config' };
    }
  });

  ipcMain.handle('config:update', async (_event, updates: any) => {
    try {
      console.log('[Config] Received update request with keys:', Object.keys(updates));
      
      // Check if Claude path is being updated
      const oldConfig = configManager.getConfig();
      const claudePathChanged = updates.claudeExecutablePath !== undefined && 
                               updates.claudeExecutablePath !== oldConfig.claudeExecutablePath;
      
      if (claudePathChanged) {
        console.log('[Config] Claude path changing from:', oldConfig.claudeExecutablePath);
        console.log('[Config] Claude path changing to:', updates.claudeExecutablePath);
      }
      
      await configManager.updateConfig(updates);
      
      // Clear Claude availability cache if the path changed
      if (claudePathChanged) {
        claudeCodeManager.clearAvailabilityCache();
        console.log('[Config] Claude executable path changed, cleared availability cache');
      }
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('[Config] Failed to update config:', errorMessage);
      console.error('[Config] Error stack:', errorStack);
      console.error('[Config] Updates that failed:', updates);
      return { success: false, error: `Failed to update config: ${errorMessage}` };
    }
  });
} 
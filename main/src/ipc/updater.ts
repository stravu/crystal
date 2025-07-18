import { IpcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { AppServices } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { commandExecutor } from '../utils/commandExecutor';

export function registerUpdaterHandlers(ipcMain: IpcMain, { app, versionChecker }: AppServices): void {
  // Version checking handlers
  ipcMain.handle('version:check-for-updates', async () => {
    try {
      const versionInfo = await versionChecker.checkForUpdates();
      return { success: true, data: versionInfo };
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return { success: false, error: 'Failed to check for updates' };
    }
  });

  ipcMain.handle('version:get-info', () => {
    try {
      let buildDate: string | undefined;
      let gitCommit: string | undefined;
      
      // Try to read build info if in packaged app
      if (app.isPackaged) {
        try {
          const buildInfoPath = path.join(process.resourcesPath, 'app', 'main', 'dist', 'buildInfo.json');
          if (fs.existsSync(buildInfoPath)) {
            const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
            buildDate = buildInfo.buildDate;
          }
        } catch (err) {
          console.log('Could not read build info:', err);
        }
      }

      // Try to get git commit hash
      try {
        const gitHash = commandExecutor.execSync('git rev-parse --short HEAD', { 
          encoding: 'utf8',
          cwd: app.isPackaged ? process.resourcesPath : process.cwd()
        }).trim();
        
        // Check if the working directory is clean (no uncommitted changes)
        try {
          commandExecutor.execSync('git diff-index --quiet HEAD --', { 
            encoding: 'utf8',
            cwd: app.isPackaged ? process.resourcesPath : process.cwd()
          });
          gitCommit = gitHash;
        } catch {
          // Working directory has uncommitted changes
          gitCommit = `${gitHash} (modified)`;
        }
      } catch (err) {
        console.log('Could not get git commit:', err);
        // In packaged app, git info might not be available
        gitCommit = app.isPackaged ? undefined : 'unknown';
      }

      return {
        success: true,
        data: {
          current: app.getVersion(),
          name: app.getName(),
          workingDirectory: process.cwd(),
          buildDate,
          gitCommit
        }
      };
    } catch (error) {
      console.error('Failed to get version info:', error);
      return { success: false, error: 'Failed to get version info' };
    }
  });

  // Auto-updater handlers
  ipcMain.handle('updater:check-and-download', async () => {
    try {
      if (!app.isPackaged && !process.env.TEST_UPDATES) {
        return { success: false, error: 'Auto-update is only available in packaged apps' };
      }

      // Check for updates using autoUpdater
      const result = await autoUpdater.checkForUpdatesAndNotify();

      return { success: true, message: 'Checking for updates...', data: result };
    } catch (error) {
      console.error('Failed to check for updates with autoUpdater:', error);
      return { success: false, error: 'Failed to check for updates' };
    }
  });

  ipcMain.handle('updater:download-update', async () => {
    try {
      if (!app.isPackaged && !process.env.TEST_UPDATES) {
        return { success: false, error: 'Auto-update is only available in packaged apps' };
      }

      // Start downloading the update
      const result = await autoUpdater.downloadUpdate();

      return { success: true, message: 'Downloading update...', data: result };
    } catch (error) {
      console.error('Failed to download update:', error);
      return { success: false, error: 'Failed to download update' };
    }
  });

  ipcMain.handle('updater:install-update', () => {
    try {
      if (!app.isPackaged && !process.env.TEST_UPDATES) {
        return { success: false, error: 'Auto-update is only available in packaged apps' };
      }

      // Quit and install the update
      autoUpdater.quitAndInstall(false, true);

      return { success: true, message: 'Installing update...' };
    } catch (error) {
      console.error('Failed to install update:', error);
      return { success: false, error: 'Failed to install update' };
    }
  });
} 
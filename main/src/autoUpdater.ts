import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  // Only setup auto-updater for packaged apps (not development)
  if (!app.isPackaged && !process.env.TEST_UPDATES) {
    console.log('[AutoUpdater] App is not packaged, skipping auto-updater setup');
    return;
  }

  // TEST MODE: Use local server for testing
  if (process.env.TEST_UPDATES === 'true') {
    const { setupTestUpdater } = require('./test-updater');
    setupTestUpdater();
    console.log('[AutoUpdater] Using test update server at:', process.env.UPDATE_SERVER_URL || 'http://localhost:8080');
  } else {
    // Configure electron-updater for production
    autoUpdater.autoDownload = false; // We'll manually trigger downloads
    autoUpdater.autoInstallOnAppQuit = true;

    // The publish configuration in package.json will be used automatically
    // No need to manually set feed URL with electron-updater
  }

  // Error handling
  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:error', {
        message: error.message,
        stack: error.stack
      });
    }
  });

  // Update checking
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:checking-for-update');
    }
  });

  // Update available
  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-available', info);
    }
  });

  // No update available
  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No update available:', info);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-not-available', info);
    }
  });

  // Download progress
  autoUpdater.on('download-progress', (progressInfo) => {
    console.log('[AutoUpdater] Download progress:', progressInfo.percent);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:download-progress', progressInfo);
    }
  });

  // Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info);
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-downloaded', info);
      // Let the renderer handle the UI - no native dialog
    }
  });
} 
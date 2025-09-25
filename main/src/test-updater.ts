import { autoUpdater } from 'electron-updater';

export function setupTestUpdater() {
  // Point to local server for testing
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: process.env.UPDATE_SERVER_URL || 'http://localhost:8080'
  });
  
  // Configure for testing
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  
  // Log all events for debugging
  autoUpdater.logger = console;
  // Set debug level for winston-based loggers if available
  const logger = autoUpdater.logger as { transports?: { file?: { level: string } } };
  if (logger && logger.transports && logger.transports.file) {
    logger.transports.file.level = 'debug';
  }
}
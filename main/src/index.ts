// Load ReadableStream polyfill before any other imports
import './polyfills/readablestream';

// Fix GTK 2/3 and GTK 4 conflict on Linux (Electron 36 issue)
// This MUST be done before importing electron
import { app } from 'electron';
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('gtk-version', '3');
}

// Now import the rest of electron
import { BrowserWindow, ipcMain, shell, dialog, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import { TaskQueue } from './services/taskQueue';
import { SessionManager } from './services/sessionManager';
import { ConfigManager } from './services/configManager';
import { WorktreeManager } from './services/worktreeManager';
import { WorktreeNameGenerator } from './services/worktreeNameGenerator';
import { GitDiffManager } from './services/gitDiffManager';
import { GitStatusManager } from './services/gitStatusManager';
import { ExecutionTracker } from './services/executionTracker';
import { DatabaseService } from './database/database';
import { RunCommandManager } from './services/runCommandManager';
import { PermissionIpcServer } from './services/permissionIpcServer';
import { VersionChecker } from './services/versionChecker';
import { StravuAuthManager } from './services/stravuAuthManager';
import { StravuNotebookService } from './services/stravuNotebookService';
import { Logger } from './utils/logger';
import { ArchiveProgressManager } from './services/archiveProgressManager';
import { AnalyticsManager } from './services/analyticsManager';
import { initializeCommitManager } from './services/commitManager';
import { setCrystalDirectory } from './utils/crystalDirectory';
import { getCurrentWorktreeName } from './utils/worktreeUtils';
import { registerIpcHandlers } from './ipc';
import { setupAutoUpdater } from './autoUpdater';
import { setupEventListeners } from './events';
import { AppServices } from './ipc/types';
import { CliManagerFactory } from './services/cliManagerFactory';
import { AbstractCliManager } from './services/panels/cli/AbstractCliManager';
import { setupConsoleWrapper } from './utils/consoleWrapper';
import * as fs from 'fs';

export let mainWindow: BrowserWindow | null = null;

/**
 * Set the application title based on development mode and worktree
 */
function setAppTitle() {
  if (!app.isPackaged) {
    const worktreeName = getCurrentWorktreeName(process.cwd());
    if (worktreeName) {
      const title = `Crystal [${worktreeName}]`;
      if (mainWindow) {
        mainWindow.setTitle(title);
      }
      return title;
    }
  }
  
  // Default title
  const title = 'Crystal';
  if (mainWindow) {
    mainWindow.setTitle(title);
  }
  return title;
}
let taskQueue: TaskQueue | null = null;

// Service instances
let configManager: ConfigManager;
let logger: Logger;
let sessionManager: SessionManager;
let worktreeManager: WorktreeManager;
let cliManagerFactory: CliManagerFactory;
let defaultCliManager: AbstractCliManager;
let gitDiffManager: GitDiffManager;
let gitStatusManager: GitStatusManager;
let executionTracker: ExecutionTracker;
let worktreeNameGenerator: WorktreeNameGenerator;
let databaseService: DatabaseService;
let runCommandManager: RunCommandManager;
let permissionIpcServer: PermissionIpcServer | null;
let versionChecker: VersionChecker;
let stravuAuthManager: StravuAuthManager;
let stravuNotebookService: StravuNotebookService;
let archiveProgressManager: ArchiveProgressManager;
let analyticsManager: AnalyticsManager;

// Store app start time for session duration tracking
let appStartTime: number;

// Store original console methods before overriding
// These must be captured immediately when the module loads
const originalLog: typeof console.log = console.log;
const originalError: typeof console.error = console.error;
const originalWarn: typeof console.warn = console.warn;
const originalInfo: typeof console.info = console.info;

const isDevelopment = process.env.NODE_ENV !== 'production' && !app.isPackaged;
const NIMBALYST_URL = 'https://nimbalyst.com/';
const NIMBALYST_DOWNLOAD_URL = 'https://nimbalyst.com/download/';

async function showNimbalystMigrationPopup(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  // Load preview image as base64 data URI
  let previewImageSrc = '';
  try {
    const imagePath = path.join(app.getAppPath(), 'main/assets/nimbalyst-preview.jpg');
    const imageData = fs.readFileSync(imagePath);
    previewImageSrc = `data:image/jpeg;base64,${imageData.toString('base64')}`;
  } catch {
    // Image not found — modal will just skip the preview
  }

  const modal = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 660,
    height: 760,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    title: 'Crystal Is Now Nimbalyst',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  modal.removeMenu();

  modal.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const modalHtml = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Crystal Is Now Nimbalyst</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0f1219;
        color: #f9fafb;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .container {
        text-align: center;
        padding: 32px 44px;
        max-width: 600px;
        width: 100%;
      }
      .logo {
        width: 56px;
        height: 56px;
        margin: 0 auto 16px;
      }
      h1 {
        font-size: 21px;
        font-weight: 700;
        margin-bottom: 6px;
        letter-spacing: -0.3px;
      }
      .subtitle {
        font-size: 13px;
        line-height: 1.5;
        color: #9ca3af;
        margin-bottom: 20px;
      }
      .preview {
        margin-bottom: 20px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid #1e2433;
      }
      .preview img {
        width: 100%;
        display: block;
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      button {
        border: none;
        border-radius: 10px;
        padding: 11px 16px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: opacity 0.15s, transform 0.1s;
        width: 100%;
      }
      button:hover { opacity: 0.9; }
      button:active { transform: scale(0.98); }
      .btn-row {
        display: flex;
        gap: 8px;
      }
      .btn-row button { flex: 1; }
      #download {
        background: linear-gradient(135deg, #4f6ef7, #6395ff);
        color: white;
      }
      #website {
        background: #1a1f2e;
        color: #d1d5db;
      }
      #continue {
        background: none;
        color: #6b7280;
        font-size: 13px;
        padding: 6px;
      }
      #continue:hover { color: #9ca3af; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="logo">
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path fill="#6395ff" d="m 196.40239,23.285532 c -0.54602,8.293741 -12.43549,6.934573 -14.77155,14.911232 -1.80051,6.147936 9.8144,9.871544 6.00441,15.021586 -4.94327,6.681938 -14.21051,-0.889398 -20.48824,4.558023 -4.8385,4.198549 2.91945,13.610539 -3.07004,15.883196 -7.77108,2.948667 -11.4738,-8.430992 -19.70006,-7.242327 -6.34031,0.916152 -4.90242,13.028284 -11.16979,11.702004 -8.13162,-1.720786 -5.09423,-13.295805 -12.65725,-16.74329 -5.82912,-2.657116 -11.1678,8.309642 -15.7232,3.80551 C 98.916245,59.337564 107.72938,51.24217 103.23082,44.253089 99.763598,38.86632 89.343337,45.205836 87.946205,38.953881 86.133492,30.842262 97.924274,28.796724 97.918427,20.48503 97.913921,14.078869 85.720439,13.77839 87.925159,7.7635646 90.785679,-0.04039043 101.81062,4.613372 106.29934,-2.3820311 c 3.45964,-5.3916419 -6.635717,-12.2367149 -1.52913,-16.1047469 6.62556,-5.01859 13.38432,4.856936 20.94247,1.398815 5.82538,-2.665315 1.03335,-13.881719 7.4205,-14.374885 8.28703,-0.639859 8.63374,11.322021 16.86167,12.499111 6.34159,0.907231 8.37433,-11.119376 14.01417,-8.081098 7.31742,3.942023 1.14202,14.192444 7.42741,19.6310273 4.8444,4.1917375 13.05652,-4.8267093 16.15844,0.7783797 4.02459,7.27234109 -6.71229,12.5568672 -4.365,20.530232 1.80914,6.145397 13.59336,2.998403 13.17252,9.390728 z" transform="matrix(7.5995429,0,0,7.5995429,-560.09045,326.96861)"/><text xml:space="preserve" style="font-weight:bold;font-size:527.974px;font-family:'Chalkboard SE';fill:#ffffff" x="306.01437" y="668.91577">#</text></svg>
      </div>
      <h1>Crystal is now Nimbalyst</h1>
      <p class="subtitle">Crystal has evolved into Nimbalyst with powerful new features. We recommend making the switch.</p>
      ${previewImageSrc ? `<div class="preview"><img src="${previewImageSrc}" alt="Nimbalyst preview" /></div>` : ''}
      <div class="actions">
        <button id="download">Download Nimbalyst</button>
        <div class="btn-row">
          <button id="website">Visit Website</button>
          <button id="continue">Continue with Crystal</button>
        </div>
      </div>
    </div>
    <script>
      document.getElementById('website')?.addEventListener('click', () => {
        window.open('${NIMBALYST_URL}', '_blank', 'noopener,noreferrer');
      });
      document.getElementById('download')?.addEventListener('click', () => {
        window.open('${NIMBALYST_DOWNLOAD_URL}', '_blank', 'noopener,noreferrer');
      });
      document.getElementById('continue')?.addEventListener('click', () => {
        window.close();
      });
    </script>
  </body>
</html>`;

  modal.once('ready-to-show', () => {
    modal.show();
  });

  await modal.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(modalHtml)}`);

  await new Promise<void>((resolve) => {
    modal.once('closed', () => resolve());
  });
}

// Reset debug log files at startup in development mode
if (isDevelopment) {
  const frontendLogPath = path.join(process.cwd(), 'crystal-frontend-debug.log');
  const backendLogPath = path.join(process.cwd(), 'crystal-backend-debug.log');

  try {
    fs.writeFileSync(frontendLogPath, '');
    fs.writeFileSync(backendLogPath, '');
  } catch (error) {
    // Don't crash if we can't reset the log files
    console.error('Failed to reset debug log files:', error);
  }
}

// Set up console wrapper to reduce logging in production
setupConsoleWrapper();

// Parse command-line arguments for custom Crystal directory
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  // Support both --crystal-dir=/path and --crystal-dir /path formats
  if (arg.startsWith('--crystal-dir=')) {
    const dir = arg.substring('--crystal-dir='.length);
    setCrystalDirectory(dir);
    console.log(`[Main] Using custom Crystal directory: ${dir}`);
  } else if (arg === '--crystal-dir' && i + 1 < args.length) {
    const dir = args[i + 1];
    setCrystalDirectory(dir);
    console.log(`[Main] Using custom Crystal directory: ${dir}`);
    i++; // Skip the next argument since we've consumed it
  }
}

// Install Devtron in development
if (isDevelopment) {
  // Devtron can be installed manually in DevTools console with: require('devtron').install()
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    ...(process.platform === 'darwin' ? {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 10, y: 10 }
    } : {})
  });

  // Increase max listeners to prevent warning when many panels are active
  // Each panel can register multiple event listeners
  mainWindow.webContents.setMaxListeners(100);

  if (isDevelopment) {
    await mainWindow.loadURL('http://localhost:4521');
    mainWindow.webContents.openDevTools();
    
    // Enable IPC debugging in development
    
    // Log all IPC calls in main process
    const originalHandle = ipcMain.handle;
    ipcMain.handle = function(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown) {
      const wrappedListener = async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
        if (channel.startsWith('stravu:')) {
        }
        const result = await listener(event, ...args);
        if (channel.startsWith('stravu:')) {
        }
        return result;
      };
      return originalHandle.call(this, channel, wrappedListener);
    };
  } else {
    // In production, use app.getAppPath() to get the root directory
    // This works correctly whether the app is packaged in ASAR or not
    const indexPath = path.join(app.getAppPath(), 'frontend/dist/index.html');
    console.log('Loading index.html from:', indexPath);

    try {
      await mainWindow.loadFile(indexPath);
    } catch (error) {
      console.error('Failed to load index.html:', error);
      console.error('App path:', app.getAppPath());
      console.error('__dirname:', __dirname);
      
      // Fallback: try relative path (for edge cases)
      const fallbackPath = path.join(__dirname, '../../../../frontend/dist/index.html');
      console.error('Trying fallback path:', fallbackPath);
      try {
        await mainWindow.loadFile(fallbackPath);
      } catch (fallbackError) {
        console.error('Fallback path also failed:', fallbackError);
      }
    }
  }

  // Set the app title based on development mode and worktree
  setAppTitle();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Log any console messages from the renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Skip messages that are already prefixed to avoid circular logging
    if (message.includes('[Main Process]') || message.includes('[Renderer]')) {
      return;
    }
    // Also skip Electron security warnings and other system messages
    if (message.includes('Electron Security Warning') || sourceId.includes('electron/js2c')) {
      return;
    }
    
    // In development, log ALL console messages to help with debugging
    if (isDevelopment) {
      const levelNames = ['verbose', 'info', 'warning', 'error'];
      const levelName = levelNames[level] || 'unknown';
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [FRONTEND ${levelName.toUpperCase()}] ${message}`;
      
      // Always log to main console
      
      // Also write to debug log file for Claude Code to read
      const debugLogPath = path.join(process.cwd(), 'crystal-frontend-debug.log');
      const logLine = `${logMessage} (${path.basename(sourceId)}:${line})\n`;
      
      try {
        fs.appendFileSync(debugLogPath, logLine);
      } catch (error) {
        // Don't crash if we can't write to the log file
        console.error('Failed to write to debug log:', error);
      }
    } else {
      // In production, only log errors and warnings from renderer
      if (level >= 2) { // 2 = warning, 3 = error
      }
    }
  });

  // Override console methods to forward to renderer and logger
  console.log = (...args: unknown[]) => {
    // Format the message
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    // Write to logger if available
    if (logger) {
      logger.info(message);
    } else {
      originalLog.apply(console, args);
    }

    // In development, also write to backend debug log file
    if (isDevelopment) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [BACKEND LOG] ${message}`;
      const debugLogPath = path.join(process.cwd(), 'crystal-backend-debug.log');
      const logLine = `${logMessage}\n`;

      try {
        fs.appendFileSync(debugLogPath, logLine);
      } catch (error) {
        // Don't crash if we can't write to the log file
        originalLog('[Main] Failed to write to backend debug log:', error);
      }
    }

    // Forward to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('main-log', 'log', message);
      } catch (e) {
        // If sending to renderer fails, use original console to avoid recursion
        originalLog('[Main] Failed to send log to renderer:', e);
      }
    }
  };

  console.error = (...args: unknown[]) => {
    // Prevent infinite recursion by checking if we're already in an error handler
    if ((console.error as typeof console.error & { __isHandlingError?: boolean }).__isHandlingError) {
      return originalError.apply(console, args);
    }
    
    (console.error as typeof console.error & { __isHandlingError?: boolean }).__isHandlingError = true;
    
    try {
      // If logger is not initialized or we're in the logger itself, use original console
      if (!logger) {
        originalError.apply(console, args);
        return;
      }

      const message = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          if (arg instanceof Error) {
            return `Error: ${arg.message}\nStack: ${arg.stack}`;
          }
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            // Handle circular structure
            return `[Object with circular structure: ${arg.constructor?.name || 'Object'}]`;
          }
        }
        return String(arg);
      }).join(' ');

      // Extract Error object if present
      const errorObj = args.find(arg => arg instanceof Error) as Error | undefined;

      // Use logger but with recursion protection
      logger.error(message, errorObj);

      // In development, also write to backend debug log file
      if (isDevelopment) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [BACKEND ERROR] ${message}`;
        const debugLogPath = path.join(process.cwd(), 'crystal-backend-debug.log');
        const logLine = `${logMessage}\n`;

        try {
          fs.appendFileSync(debugLogPath, logLine);
        } catch (error) {
          // Don't crash if we can't write to the log file
          originalError('[Main] Failed to write to backend debug log:', error);
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('main-log', 'error', message);
        } catch (e) {
          // If sending to renderer fails, use original console to avoid recursion
          originalError('[Main] Failed to send error to renderer:', e);
        }
      }
    } catch (e) {
      // If anything fails in the error handler, fall back to original
      originalError.apply(console, args);
    } finally {
      (console.error as typeof console.error & { __isHandlingError?: boolean }).__isHandlingError = false;
    }
  };

  console.warn = (...args: unknown[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        if (arg instanceof Error) {
          return `Error: ${arg.message}\nStack: ${arg.stack}`;
        }
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          // Handle circular structure
          return `[Object with circular structure: ${arg.constructor?.name || 'Object'}]`;
        }
      }
      return String(arg);
    }).join(' ');

    // Extract Error object if present for warnings too
    const errorObj = args.find(arg => arg instanceof Error) as Error | undefined;

    if (logger) {
      logger.warn(message, errorObj);
    } else {
      originalWarn.apply(console, args);
    }

    // In development, also write to backend debug log file
    if (isDevelopment) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [BACKEND WARNING] ${message}`;
      const debugLogPath = path.join(process.cwd(), 'crystal-backend-debug.log');
      const logLine = `${logMessage}\n`;

      try {
        fs.appendFileSync(debugLogPath, logLine);
      } catch (error) {
        // Don't crash if we can't write to the log file
        originalWarn('[Main] Failed to write to backend debug log:', error);
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('main-log', 'warn', message);
      } catch (e) {
        // If sending to renderer fails, use original console to avoid recursion
        originalWarn('[Main] Failed to send warning to renderer:', e);
      }
    }
  };

  console.info = (...args: unknown[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        if (arg instanceof Error) {
          return `Error: ${arg.message}\nStack: ${arg.stack}`;
        }
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          // Handle circular structure
          return `[Object with circular structure: ${arg.constructor?.name || 'Object'}]`;
        }
      }
      return String(arg);
    }).join(' ');

    if (logger) {
      logger.info(message);
    } else {
      originalInfo.apply(console, args);
    }

    // In development, also write to backend debug log file
    if (isDevelopment) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [BACKEND INFO] ${message}`;
      const debugLogPath = path.join(process.cwd(), 'crystal-backend-debug.log');
      const logLine = `${logMessage}\n`;

      try {
        fs.appendFileSync(debugLogPath, logLine);
      } catch (error) {
        // Don't crash if we can't write to the log file
        originalInfo('[Main] Failed to write to backend debug log:', error);
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('main-log', 'info', message);
      } catch (e) {
        // If sending to renderer fails, use original console to avoid recursion
        originalInfo('[Main] Failed to send info to renderer:', e);
      }
    }
  };

  console.debug = (...args: unknown[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        if (arg instanceof Error) {
          return `Error: ${arg.message}\nStack: ${arg.stack}`;
        }
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          // Handle circular structure
          return `[Object with circular structure: ${arg.constructor?.name || 'Object'}]`;
        }
      }
      return String(arg);
    }).join(' ');

    // In development, also write to backend debug log file
    if (isDevelopment) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [BACKEND DEBUG] ${message}`;
      const debugLogPath = path.join(process.cwd(), 'crystal-backend-debug.log');
      const logLine = `${logMessage}\n`;

      try {
        fs.appendFileSync(debugLogPath, logLine);
      } catch (error) {
        // Don't crash if we can't write to the log file
        console.error('[Main] Failed to write to backend debug log:', error);
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('main-log', 'debug', message);
      } catch (e) {
        // If sending to renderer fails, use original console to avoid recursion
        console.error('[Main] Failed to send debug to renderer:', e);
      }
    }
  };

  // Log any renderer errors
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details);
  });

  // Handle window focus/blur/minimize for smart git status polling
  mainWindow.on('focus', () => {
    if (gitStatusManager) {
      gitStatusManager.handleVisibilityChange(false); // false = visible/focused
    }
  });

  mainWindow.on('blur', () => {
    if (gitStatusManager) {
      gitStatusManager.handleVisibilityChange(true); // true = hidden/blurred
    }
  });

  mainWindow.on('minimize', () => {
    if (gitStatusManager) {
      gitStatusManager.handleVisibilityChange(true); // true = hidden/minimized
    }
  });

  mainWindow.on('restore', () => {
    if (gitStatusManager) {
      gitStatusManager.handleVisibilityChange(false); // false = visible/restored
    }
  });
}

async function initializeServices() {
  configManager = new ConfigManager();
  await configManager.initialize();

  // Initialize logger early so it can capture all logs
  logger = new Logger(configManager);
  console.log('[Main] Logger initialized with file logging to ~/.crystal/logs');
  
  // Initialize commitManager with configManager
  initializeCommitManager(configManager, logger);

  // Use the same database path as the original backend
  const dbPath = configManager.getDatabasePath();
  databaseService = new DatabaseService(dbPath);
  databaseService.initialize();

  // Initialize analytics manager early so it can be used by SessionManager
  analyticsManager = new AnalyticsManager(configManager);
  await analyticsManager.initialize();

  // Set analytics manager on logsManager for script execution tracking
  const { logsManager } = await import('./services/panels/logPanel/logsManager');
  logsManager.setAnalyticsManager(analyticsManager);

  sessionManager = new SessionManager(databaseService, analyticsManager);
  sessionManager.initializeFromDatabase();

  archiveProgressManager = new ArchiveProgressManager();

  // Start permission IPC server
  console.log('[Main] Initializing Permission IPC server...');
  permissionIpcServer = new PermissionIpcServer();
  console.log('[Main] Starting Permission IPC server...');

  let permissionIpcPath: string | null = null;
  try {
    await permissionIpcServer.start();
    permissionIpcPath = permissionIpcServer.getSocketPath();
    console.log('[Main] Permission IPC server started successfully');
    console.log('[Main] Permission IPC socket path:', permissionIpcPath);
  } catch (error) {
    console.error('[Main] Failed to start Permission IPC server:', error);
    console.error('[Main] Permission-based MCP will be disabled');
    permissionIpcServer = null;
  }

  // Create worktree manager with configManager and analyticsManager
  worktreeManager = new WorktreeManager(configManager, analyticsManager);

  // Initialize the active project's worktree directory if one exists
  const activeProject = sessionManager.getActiveProject();
  if (activeProject) {
    await worktreeManager.initializeProject(activeProject.path);
  }

  // Initialize CLI manager factory
  cliManagerFactory = CliManagerFactory.getInstance(logger, configManager);

  // Create default CLI manager (Claude) with permission IPC path
  // Skip validation during startup - tools will be validated when actually used
  defaultCliManager = await cliManagerFactory.createManager('claude', {
    sessionManager,
    logger,
    configManager,
    additionalOptions: { permissionIpcPath },
    skipValidation: true  // Allow Crystal to start even if Claude Code is not installed
  });
  gitDiffManager = new GitDiffManager(logger, analyticsManager);
  gitStatusManager = new GitStatusManager(sessionManager, worktreeManager, gitDiffManager, logger);
  executionTracker = new ExecutionTracker(sessionManager, gitDiffManager);
  worktreeNameGenerator = new WorktreeNameGenerator(configManager);
  runCommandManager = new RunCommandManager(databaseService);

  // Initialize version checker
  versionChecker = new VersionChecker(configManager, logger);
  stravuAuthManager = new StravuAuthManager(logger);
  stravuNotebookService = new StravuNotebookService(stravuAuthManager, logger);

  taskQueue = new TaskQueue({
    sessionManager,
    worktreeManager,
    claudeCodeManager: defaultCliManager, // Use default CLI manager for backward compatibility
    gitDiffManager,
    executionTracker,
    worktreeNameGenerator,
    getMainWindow: () => mainWindow
  });

  const services: AppServices = {
    app,
    configManager,
    databaseService,
    sessionManager,
    worktreeManager,
    cliManagerFactory,
    claudeCodeManager: defaultCliManager, // Backward compatibility
    gitDiffManager,
    gitStatusManager,
    executionTracker,
    worktreeNameGenerator,
    runCommandManager,
    versionChecker,
    stravuAuthManager,
    stravuNotebookService,
    taskQueue,
    getMainWindow: () => mainWindow,
    logger,
    archiveProgressManager,
    analyticsManager,
  };

  // Initialize IPC handlers first so managers (like ClaudePanelManager) are ready
  registerIpcHandlers(services);
  // Then set up event listeners that may rely on initialized managers
  setupEventListeners(services, () => mainWindow);
  
  // Register console logging IPC handler for development
  if (isDevelopment) {
    ipcMain.handle('console:log', (event, logData) => {
      const { level, args, timestamp, source } = logData;
      const message = args.join(' ');
      const logLine = `[${timestamp}] [${source.toUpperCase()} ${level.toUpperCase()}] ${message}\n`;
      
      // Write to debug log file
      const debugLogPath = path.join(process.cwd(), 'crystal-frontend-debug.log');
      try {
        fs.appendFileSync(debugLogPath, logLine);
      } catch (error) {
        console.error('Failed to write console log to debug file:', error);
      }
      
      // Also log to main console with prefix
      console.log(`[Frontend ${level}] ${message}`);
    });
  }
  
  // Start periodic version checking (only if enabled in settings)
  versionChecker.startPeriodicCheck();
  
  // Start git status polling
  gitStatusManager.startPolling();
}

app.whenReady().then(async () => {
  // Record app start time
  appStartTime = Date.now();

  console.log('[Main] App is ready, initializing services...');
  await initializeServices();
  console.log('[Main] Services initialized, creating window...');
  await createWindow();
  console.log('[Main] Window created successfully');
  await showNimbalystMigrationPopup();

  // Track app lifecycle events
  try {
    const currentVersion = app.getVersion();
    const lastVersion = databaseService.getLastAppVersion();
    const isFirstLaunch = lastVersion === null;

    // Check if version changed (app update)
    if (lastVersion && lastVersion !== currentVersion) {
      console.log(`[Analytics] App updated from ${lastVersion} to ${currentVersion}`);
      analyticsManager.track('app_updated', {
        previous_version: lastVersion,
        new_version: currentVersion
      });
    }

    // Track app opened - use minimal tracking if analytics is disabled
    console.log(`[Analytics] App opened (version: ${currentVersion}, first_launch: ${isFirstLaunch}, analytics_enabled: ${configManager.isAnalyticsEnabled()})`);
    if (configManager.isAnalyticsEnabled()) {
      analyticsManager.track('app_opened', {
        is_first_launch: isFirstLaunch
      });
    } else {
      // Track minimal app_opened event even when opted out
      analyticsManager.trackMinimalEvent('app_opened', {
        is_first_launch: isFirstLaunch
      });
    }

    // Record app open in database with version
    databaseService.recordAppOpen(false, false, currentVersion);
  } catch (error) {
    console.error('[Analytics] Failed to track app lifecycle events:', error);
  }

  // Configure auto-updater
  setupAutoUpdater(() => mainWindow);

  // Check for updates after window is created
  setTimeout(async () => {
    console.log('[Main] Performing startup version check...');
    await versionChecker.checkOnStartup();
  }, 1000); // Small delay to ensure window is fully ready

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('[Main] Activating app, creating new window...');
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  // Check if there are active archive tasks
  if (archiveProgressManager && archiveProgressManager.hasActiveTasks()) {
    event.preventDefault();
    
    console.log('[Main] Archive tasks in progress, showing warning dialog...');
    const activeCount = archiveProgressManager.getActiveTaskCount();
    const choice = mainWindow 
      ? dialog.showMessageBoxSync(mainWindow, {
          type: 'warning',
          title: 'Archive Tasks In Progress',
          message: `Crystal is removing ${activeCount} worktree${activeCount > 1 ? 's' : ''} in the background.`,
          detail: 'Git worktree removal can take time, especially for large repositories with many files. If you quit now, the worktree directories may not be fully cleaned up and you may need to remove them manually.\n\nDo you want to quit anyway?',
          buttons: ['Wait', 'Quit Anyway'],
          defaultId: 0,
          cancelId: 0
        })
      : dialog.showMessageBoxSync({
          type: 'warning',
          title: 'Archive Tasks In Progress',
          message: `Crystal is removing ${activeCount} worktree${activeCount > 1 ? 's' : ''} in the background.`,
          detail: 'Git worktree removal can take time, especially for large repositories with many files. If you quit now, the worktree directories may not be fully cleaned up and you may need to remove them manually.\n\nDo you want to quit anyway?',
          buttons: ['Wait', 'Quit Anyway'],
          defaultId: 0,
          cancelId: 0
        });
    
    if (choice === 1) {
      // User chose to quit anyway
      archiveProgressManager.clearAll();
      app.exit(0);
    }
    // Otherwise, the quit is cancelled and app continues
    return;
  }
  
  // Cleanup all sessions and terminate child processes
  if (sessionManager) {
    console.log('[Main] Cleaning up sessions and terminating child processes...');
    await sessionManager.cleanup();
    console.log('[Main] Session cleanup complete');
  }

  // Stop all run commands
  if (runCommandManager) {
    console.log('[Main] Stopping all run commands...');
    await runCommandManager.stopAllRunCommands();
    console.log('[Main] Run commands stopped');
  }
  
  // Stop git status polling
  if (gitStatusManager) {
    console.log('[Main] Stopping git status polling...');
    gitStatusManager.stopPolling();
    console.log('[Main] Git status polling stopped');
  }

  // Shutdown CLI manager factory and all CLI processes
  if (cliManagerFactory) {
    console.log('[Main] Shutting down CLI manager factory and all CLI processes...');
    await cliManagerFactory.shutdown();
    console.log('[Main] CLI manager factory shutdown complete');
  }

  // Close task queue
  if (taskQueue) {
    await taskQueue.close();
  }

  // Stop permission IPC server
  if (permissionIpcServer) {
    console.log('[Main] Stopping permission IPC server...');
    await permissionIpcServer.stop();
    console.log('[Main] Permission IPC server stopped');
  }
  
  // Stop version checker
  if (versionChecker) {
    versionChecker.stopPeriodicCheck();
  }

  // Track app closed event with session duration
  if (analyticsManager && appStartTime) {
    try {
      const sessionDurationSeconds = Math.floor((Date.now() - appStartTime) / 1000);
      console.log(`[Analytics] App closed after ${sessionDurationSeconds} seconds`);
      analyticsManager.track('app_closed', {
        session_duration_seconds: sessionDurationSeconds
      });

      // Flush analytics events before shutdown
      await analyticsManager.flush();
      await analyticsManager.shutdown();
    } catch (error) {
      console.error('[Analytics] Failed to track app_closed event:', error);
    }
  }

  // Close logger to ensure all logs are flushed
  if (logger) {
    logger.close();
  }
});

// Export getter function for mainWindow
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

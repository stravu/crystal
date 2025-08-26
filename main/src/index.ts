// Load ReadableStream polyfill before any other imports
import './polyfills/readablestream';

// Fix GTK 2/3 and GTK 4 conflict on Linux (Electron 36 issue)
// This MUST be done before importing electron
import { app } from 'electron';
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('gtk-version', '3');
}

// Now import the rest of electron
import { BrowserWindow, ipcMain, shell, dialog } from 'electron';
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
import { setCrystalDirectory } from './utils/crystalDirectory';
import { getCurrentWorktreeName } from './utils/worktreeUtils';
import { registerIpcHandlers } from './ipc';
import { setupAutoUpdater } from './autoUpdater';
import { setupEventListeners } from './events';
import { AppServices } from './ipc/types';
import { ClaudeCodeManager } from './services/claudeCodeManager';
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
      console.log('🎯 [APP TITLE] Setting development title:', title);
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
let claudeCodeManager: ClaudeCodeManager;
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

// Store original console methods before overriding
// These must be captured immediately when the module loads
const originalLog: typeof console.log = console.log;
const originalError: typeof console.error = console.error;
const originalWarn: typeof console.warn = console.warn;
const originalInfo: typeof console.info = console.info;

const isDevelopment = process.env.NODE_ENV !== 'production' && !app.isPackaged;

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
  console.log('[Main] Development mode - Devtron can be installed in DevTools console');
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

  if (isDevelopment) {
    await mainWindow.loadURL('http://localhost:4521');
    mainWindow.webContents.openDevTools();
    
    // Enable IPC debugging in development
    console.log('[Main] 🔍 IPC debugging enabled - check DevTools console for IPC call logs');
    
    // Log all IPC calls in main process
    const originalHandle = ipcMain.handle;
    ipcMain.handle = function(channel: string, listener: any) {
      const wrappedListener = async (event: any, ...args: any[]) => {
        if (channel.startsWith('stravu:')) {
          console.log(`[IPC] 📞 ${channel}`, args.length > 0 ? args : '(no args)');
        }
        const result = await listener(event, ...args);
        if (channel.startsWith('stravu:')) {
          console.log(`[IPC] 📤 ${channel} response:`, result);
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
      console.log(`[Renderer ${levelName}] ${message} (${sourceId}:${line})`);
      
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
        console.log(`[Renderer] ${message} (${sourceId}:${line})`);
      }
    }
  });

  // Override console methods to forward to renderer and logger
  console.log = (...args: any[]) => {
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

  console.error = (...args: any[]) => {
    // Prevent infinite recursion by checking if we're already in an error handler
    if ((console.error as any).__isHandlingError) {
      return originalError.apply(console, args);
    }
    
    (console.error as any).__isHandlingError = true;
    
    try {
      // If logger is not initialized or we're in the logger itself, use original console
      if (!logger) {
        originalError.apply(console, args);
        return;
      }

      const message = args.map(arg => {
        if (typeof arg === 'object') {
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
      (console.error as any).__isHandlingError = false;
    }
  };

  console.warn = (...args: any[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
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

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('main-log', 'warn', message);
      } catch (e) {
        // If sending to renderer fails, use original console to avoid recursion
        originalWarn('[Main] Failed to send warning to renderer:', e);
      }
    }
  };

  console.info = (...args: any[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
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

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('main-log', 'info', message);
      } catch (e) {
        // If sending to renderer fails, use original console to avoid recursion
        originalInfo('[Main] Failed to send info to renderer:', e);
      }
    }
  };

  // Log any renderer errors
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details);
  });

  // Handle window focus/blur for smart git status polling
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
}

async function initializeServices() {
  configManager = new ConfigManager();
  await configManager.initialize();

  // Initialize logger early so it can capture all logs
  logger = new Logger(configManager);
  console.log('[Main] Logger initialized with file logging to ~/.crystal/logs');

  // Use the same database path as the original backend
  const dbPath = configManager.getDatabasePath();
  databaseService = new DatabaseService(dbPath);
  databaseService.initialize();

  sessionManager = new SessionManager(databaseService);
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

  // Create worktree manager without a specific path
  worktreeManager = new WorktreeManager();

  // Initialize the active project's worktree directory if one exists
  const activeProject = sessionManager.getActiveProject();
  if (activeProject) {
    await worktreeManager.initializeProject(activeProject.path);
  }

  claudeCodeManager = new ClaudeCodeManager(sessionManager, logger, configManager, permissionIpcPath);
  gitDiffManager = new GitDiffManager();
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
    claudeCodeManager,
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
    claudeCodeManager,
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
  };

  // Set up IPC event listeners for real-time updates
  setupEventListeners(services, () => mainWindow);
  registerIpcHandlers(services);
  
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
  console.log('[Main] App is ready, initializing services...');
  await initializeServices();
  console.log('[Main] Services initialized, creating window...');
  await createWindow();
  console.log('[Main] Window created successfully');
  
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

  // Kill all Claude processes
  if (claudeCodeManager) {
    console.log('[Main] Killing all Claude processes...');
    await claudeCodeManager.killAllProcesses();
    console.log('[Main] Claude processes killed');
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

  // Close logger to ensure all logs are flushed
  if (logger) {
    logger.close();
  }
});

// Export getter function for mainWindow
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

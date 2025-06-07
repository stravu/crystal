import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { Server } from './server';
import { TaskQueue } from './services/taskQueue';
import { SessionManager } from './services/sessionManager';
import { ConfigManager } from './services/configManager';
import { WorktreeManager } from './services/worktreeManager';
// Import ClaudeCodeManager dynamically to avoid node-pty issues
import { GitDiffManager } from './services/gitDiffManager';
import { ExecutionTracker } from './services/executionTracker';
import { DatabaseService } from './database/database';

let mainWindow: BrowserWindow | null = null;
let server: Server | null = null;
let taskQueue: TaskQueue | null = null;

const isDevelopment = process.env.NODE_ENV !== 'production';

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 }
  });

  if (isDevelopment) {
    await mainWindow.loadURL('http://localhost:4521');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeServices() {
  const configManager = new ConfigManager();
  await configManager.initialize();
  
  // Use the same database path as the original backend
  const dbPath = configManager.getDatabasePath();
  const databaseService = new DatabaseService(dbPath);
  databaseService.initialize();
  
  const sessionManager = new SessionManager(databaseService);
  sessionManager.initializeFromDatabase();
  
  // Create worktree manager without a specific path
  const worktreeManager = new WorktreeManager();
  
  // Initialize the active project's worktree directory if one exists
  const activeProject = sessionManager.getActiveProject();
  if (activeProject) {
    await worktreeManager.initializeProject(activeProject.path);
  }
  
  const { ClaudeCodeManager } = await import('./services/claudeCodeManager');
  const claudeCodeManager = new ClaudeCodeManager(sessionManager);
  const gitDiffManager = new GitDiffManager();
  const executionTracker = new ExecutionTracker(sessionManager, gitDiffManager);

  taskQueue = new TaskQueue({
    sessionManager,
    worktreeManager,
    claudeCodeManager,
    gitDiffManager,
    executionTracker
  });

  server = new Server({
    configManager,
    sessionManager,
    worktreeManager,
    claudeCodeManager,
    gitDiffManager,
    executionTracker,
    taskQueue,
    databaseService
  });

  await server.start();
}

app.whenReady().then(async () => {
  await initializeServices();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (server) {
    await server.stop();
  }
  if (taskQueue) {
    await taskQueue.close();
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});
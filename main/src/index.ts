import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { TaskQueue } from './services/taskQueue';
import { SessionManager } from './services/sessionManager';
import { ConfigManager } from './services/configManager';
import { WorktreeManager } from './services/worktreeManager';
import { WorktreeNameGenerator } from './services/worktreeNameGenerator';
import { GitDiffManager } from './services/gitDiffManager';
import { ExecutionTracker } from './services/executionTracker';
import { DatabaseService } from './database/database';
import type { CreateSessionRequest } from './types/session';

let mainWindow: BrowserWindow | null = null;
let taskQueue: TaskQueue | null = null;

// Service instances
let configManager: ConfigManager;
let sessionManager: SessionManager;
let worktreeManager: WorktreeManager;
let claudeCodeManager: any;
let gitDiffManager: GitDiffManager;
let executionTracker: ExecutionTracker;
let worktreeNameGenerator: WorktreeNameGenerator;
let databaseService: DatabaseService;

const isDevelopment = process.env.NODE_ENV !== 'production' && !app.isPackaged;

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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 }
  });

  if (isDevelopment) {
    await mainWindow.loadURL('http://localhost:4521');
    mainWindow.webContents.openDevTools();
  } else {
    // Open DevTools in production for debugging
    mainWindow.webContents.openDevTools();
    
    // Log the path we're trying to load
    const indexPath = path.join(__dirname, '../../frontend/dist/index.html');
    console.log('Loading index.html from:', indexPath);
    
    try {
      await mainWindow.loadFile(indexPath);
    } catch (error) {
      console.error('Failed to load index.html:', error);
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Log any console messages from the renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`);
  });

  // Log any renderer errors
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details);
  });
}

async function initializeServices() {
  configManager = new ConfigManager();
  await configManager.initialize();
  
  // Use the same database path as the original backend
  const dbPath = configManager.getDatabasePath();
  databaseService = new DatabaseService(dbPath);
  databaseService.initialize();
  
  sessionManager = new SessionManager(databaseService);
  sessionManager.initializeFromDatabase();
  
  // Create worktree manager without a specific path
  worktreeManager = new WorktreeManager();
  
  // Initialize the active project's worktree directory if one exists
  const activeProject = sessionManager.getActiveProject();
  if (activeProject) {
    await worktreeManager.initializeProject(activeProject.path);
  }
  
  const { ClaudeCodeManager } = await import('./services/claudeCodeManager');
  claudeCodeManager = new ClaudeCodeManager(sessionManager);
  gitDiffManager = new GitDiffManager();
  executionTracker = new ExecutionTracker(sessionManager, gitDiffManager);
  worktreeNameGenerator = new WorktreeNameGenerator(configManager);

  taskQueue = new TaskQueue({
    sessionManager,
    worktreeManager,
    claudeCodeManager,
    gitDiffManager,
    executionTracker,
    worktreeNameGenerator
  });

  // Set up IPC event listeners for real-time updates
  setupEventListeners();
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
  if (taskQueue) {
    await taskQueue.close();
  }
});

// Set up event listeners for real-time updates
function setupEventListeners() {
  // Listen to sessionManager events and broadcast to renderer
  sessionManager.on('session-created', (session) => {
    if (mainWindow) {
      mainWindow.webContents.send('session:created', session);
    }
  });

  sessionManager.on('session-updated', (session) => {
    if (mainWindow) {
      mainWindow.webContents.send('session:updated', session);
    }
  });

  sessionManager.on('session-deleted', (session) => {
    if (mainWindow) {
      mainWindow.webContents.send('session:deleted', session);
    }
  });

  sessionManager.on('sessions-loaded', (sessions) => {
    if (mainWindow) {
      mainWindow.webContents.send('sessions:loaded', sessions);
    }
  });

  // Listen to claudeCodeManager events
  claudeCodeManager.on('output', (output: any) => {
    // Save output to database
    sessionManager.addSessionOutput(output.sessionId, {
      type: output.type,
      data: output.data,
      timestamp: output.timestamp
    });
    
    // Broadcast to renderer
    if (mainWindow) {
      mainWindow.webContents.send('session:output', output);
    }
  });

  claudeCodeManager.on('spawned', async ({ sessionId }: { sessionId: string }) => {
    await sessionManager.updateSession(sessionId, { status: 'running' });
    
    // Start execution tracking
    try {
      const session = await sessionManager.getSession(sessionId);
      if (session && session.worktreePath) {
        await executionTracker.startExecution(sessionId, session.worktreePath);
      }
    } catch (error) {
      console.error(`Failed to start execution tracking for session ${sessionId}:`, error);
    }
  });

  claudeCodeManager.on('exit', async ({ sessionId, exitCode, signal }: { sessionId: string; exitCode: number; signal: string }) => {
    console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
    await sessionManager.setSessionExitCode(sessionId, exitCode);
    await sessionManager.updateSession(sessionId, { status: 'stopped' });
    
    // End execution tracking
    try {
      if (executionTracker.isTracking(sessionId)) {
        await executionTracker.endExecution(sessionId);
      }
    } catch (error) {
      console.error(`Failed to end execution tracking for session ${sessionId}:`, error);
    }
  });

  claudeCodeManager.on('error', async ({ sessionId, error }: { sessionId: string; error: string }) => {
    console.log(`Session ${sessionId} encountered an error: ${error}`);
    await sessionManager.updateSession(sessionId, { status: 'error', error });
    
    // Cancel execution tracking on error
    try {
      if (executionTracker.isTracking(sessionId)) {
        executionTracker.cancelExecution(sessionId);
      }
    } catch (trackingError) {
      console.error(`Failed to cancel execution tracking for session ${sessionId}:`, trackingError);
    }
  });

  // Listen to script output events
  sessionManager.on('script-output', (output) => {
    // Broadcast script output to renderer
    if (mainWindow) {
      mainWindow.webContents.send('script:output', output);
    }
  });
}

// Basic app info handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// Session management handlers
ipcMain.handle('sessions:get-all', async () => {
  try {
    const sessions = await sessionManager.getAllSessions();
    return { success: true, data: sessions };
  } catch (error) {
    console.error('Failed to get sessions:', error);
    return { success: false, error: 'Failed to get sessions' };
  }
});

ipcMain.handle('sessions:get', async (_event, sessionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    return { success: true, data: session };
  } catch (error) {
    console.error('Failed to get session:', error);
    return { success: false, error: 'Failed to get session' };
  }
});

ipcMain.handle('sessions:create', async (_event, request: CreateSessionRequest) => {
  try {
    const activeProject = sessionManager.getActiveProject();
    if (!activeProject) {
      return { success: false, error: 'No active project. Please select a project first.' };
    }

    if (!taskQueue) {
      return { success: false, error: 'Task queue not initialized' };
    }

    const count = request.count || 1;
    
    if (count > 1) {
      const jobs = await taskQueue.createMultipleSessions(request.prompt, request.worktreeTemplate || '', count);
      return { success: true, data: { jobIds: jobs.map(job => job.id) } };
    } else {
      const job = await taskQueue.createSession({
        prompt: request.prompt,
        worktreeTemplate: request.worktreeTemplate || ''
      });
      return { success: true, data: { jobId: job.id } };
    }
  } catch (error) {
    console.error('Failed to create session:', error);
    return { success: false, error: `Failed to create session: ${error}` };
  }
});

ipcMain.handle('sessions:delete', async (_event, sessionId: string) => {
  try {
    await sessionManager.archiveSession(sessionId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete session:', error);
    return { success: false, error: 'Failed to delete session' };
  }
});

ipcMain.handle('sessions:input', async (_event, sessionId: string, input: string) => {
  try {
    claudeCodeManager.sendInput(sessionId, input);
    return { success: true };
  } catch (error) {
    console.error('Failed to send input:', error);
    return { success: false, error: 'Failed to send input' };
  }
});

ipcMain.handle('sessions:continue', async (_event, sessionId: string, prompt?: string) => {
  try {
    // Get session details
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Get conversation history
    const conversationHistory = sessionManager.getConversationMessages(sessionId);
    
    // If no prompt provided, use empty string (for resuming)
    const continuePrompt = prompt || '';
    
    // Continue the session with the existing conversation
    await claudeCodeManager.continueSession(sessionId, session.worktreePath, continuePrompt, conversationHistory);
    return { success: true };
  } catch (error) {
    console.error('Failed to continue conversation:', error);
    return { success: false, error: 'Failed to continue conversation' };
  }
});

ipcMain.handle('sessions:get-output', async (_event, sessionId: string) => {
  try {
    const outputs = await sessionManager.getSessionOutputs(sessionId);
    return { success: true, data: outputs };
  } catch (error) {
    console.error('Failed to get session outputs:', error);
    return { success: false, error: 'Failed to get session outputs' };
  }
});

ipcMain.handle('sessions:get-conversation', async (_event, sessionId: string) => {
  try {
    const messages = await sessionManager.getConversationMessages(sessionId);
    return { success: true, data: messages };
  } catch (error) {
    console.error('Failed to get conversation messages:', error);
    return { success: false, error: 'Failed to get conversation messages' };
  }
});

ipcMain.handle('sessions:mark-viewed', async (_event, sessionId: string) => {
  try {
    await sessionManager.markSessionAsViewed(sessionId);
    return { success: true };
  } catch (error) {
    console.error('Failed to mark session as viewed:', error);
    return { success: false, error: 'Failed to mark session as viewed' };
  }
});

ipcMain.handle('sessions:stop', async (_event, sessionId: string) => {
  try {
    await claudeCodeManager.stopSession(sessionId);
    return { success: true };
  } catch (error) {
    console.error('Failed to stop session:', error);
    return { success: false, error: 'Failed to stop session' };
  }
});

// Git and execution handlers
ipcMain.handle('sessions:get-executions', async (_event, sessionId: string) => {
  try {
    const executions = await executionTracker.getExecutionDiffs(sessionId);
    return { success: true, data: executions };
  } catch (error) {
    console.error('Failed to get executions:', error);
    return { success: false, error: 'Failed to get executions' };
  }
});

ipcMain.handle('sessions:get-execution-diff', async (_event, sessionId: string, executionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    // For now, return the combined diff - we'll need to implement individual execution diff later
    const diff = await executionTracker.getCombinedDiff(sessionId, [parseInt(executionId)]);
    return { success: true, data: diff };
  } catch (error) {
    console.error('Failed to get execution diff:', error);
    return { success: false, error: 'Failed to get execution diff' };
  }
});

ipcMain.handle('sessions:git-commit', async (_event, sessionId: string, message: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    // For now, we don't have a commitChanges method - would need to implement
    // await gitDiffManager.commitChanges(session.worktreePath, message);
    return { success: false, error: 'Git commit not implemented yet' };
  } catch (error) {
    console.error('Failed to commit changes:', error);
    return { success: false, error: 'Failed to commit changes' };
  }
});

ipcMain.handle('sessions:git-diff', async (_event, sessionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    const diff = await gitDiffManager.getGitDiff(session.worktreePath);
    return { success: true, data: diff };
  } catch (error) {
    console.error('Failed to get git diff:', error);
    return { success: false, error: 'Failed to get git diff' };
  }
});

// Configuration handlers
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
    await configManager.updateConfig(updates);
    return { success: true };
  } catch (error) {
    console.error('Failed to update config:', error);
    return { success: false, error: 'Failed to update config' };
  }
});

// Project handlers
ipcMain.handle('projects:get-all', async () => {
  try {
    const projects = databaseService.getAllProjects();
    return { success: true, data: projects };
  } catch (error) {
    console.error('Failed to get projects:', error);
    return { success: false, error: 'Failed to get projects' };
  }
});

ipcMain.handle('projects:get-active', async () => {
  try {
    const activeProject = sessionManager.getActiveProject();
    return { success: true, data: activeProject };
  } catch (error) {
    console.error('Failed to get active project:', error);
    return { success: false, error: 'Failed to get active project' };
  }
});

ipcMain.handle('projects:create', async (_event, projectData: any) => {
  try {
    const project = databaseService.createProject(
      projectData.name,
      projectData.path,
      projectData.systemPrompt,
      projectData.runScript
    );
    return { success: true, data: project };
  } catch (error) {
    console.error('Failed to create project:', error);
    return { success: false, error: 'Failed to create project' };
  }
});

ipcMain.handle('projects:activate', async (_event, projectId: string) => {
  try {
    const project = databaseService.setActiveProject(parseInt(projectId));
    if (project) {
      sessionManager.setActiveProject(project);
      await worktreeManager.initializeProject(project.path);
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to activate project:', error);
    return { success: false, error: 'Failed to activate project' };
  }
});

ipcMain.handle('projects:update', async (_event, projectId: string, updates: any) => {
  try {
    const project = databaseService.updateProject(parseInt(projectId), updates);
    return { success: true, data: project };
  } catch (error) {
    console.error('Failed to update project:', error);
    return { success: false, error: 'Failed to update project' };
  }
});

ipcMain.handle('projects:delete', async (_event, projectId: string) => {
  try {
    const success = databaseService.deleteProject(parseInt(projectId));
    return { success: true, data: success };
  } catch (error) {
    console.error('Failed to delete project:', error);
    return { success: false, error: 'Failed to delete project' };
  }
});

// Script execution handlers
ipcMain.handle('sessions:has-run-script', async (_event, sessionId: string) => {
  try {
    const runScript = sessionManager.getProjectRunScript(sessionId);
    return { success: true, data: !!runScript };
  } catch (error) {
    console.error('Failed to check run script:', error);
    return { success: false, error: 'Failed to check run script' };
  }
});

ipcMain.handle('sessions:get-running-session', async () => {
  try {
    const runningSessionId = sessionManager.getCurrentRunningSessionId();
    return { success: true, data: runningSessionId };
  } catch (error) {
    console.error('Failed to get running session:', error);
    return { success: false, error: 'Failed to get running session' };
  }
});

ipcMain.handle('sessions:run-script', async (_event, sessionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    const commands = sessionManager.getProjectRunScript(sessionId);
    if (!commands) {
      return { success: false, error: 'No run script configured for this project' };
    }

    sessionManager.runScript(sessionId, commands, session.worktreePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to run script:', error);
    return { success: false, error: 'Failed to run script' };
  }
});

ipcMain.handle('sessions:stop-script', async () => {
  try {
    sessionManager.stopRunningScript();
    return { success: true };
  } catch (error) {
    console.error('Failed to stop script:', error);
    return { success: false, error: 'Failed to stop script' };
  }
});

ipcMain.handle('sessions:get-prompts', async (_event, sessionId: string) => {
  try {
    const prompts = sessionManager.getSessionPrompts(sessionId);
    return { success: true, data: prompts };
  } catch (error) {
    console.error('Failed to get session prompts:', error);
    return { success: false, error: 'Failed to get session prompts' };
  }
});

ipcMain.handle('sessions:get-combined-diff', async (_event, sessionId: string, executionIds?: number[]) => {
  try {
    const diff = await executionTracker.getCombinedDiff(sessionId, executionIds);
    return { success: true, data: diff };
  } catch (error) {
    console.error('Failed to get combined diff:', error);
    return { success: false, error: 'Failed to get combined diff' };
  }
});

// Git merge operations (placeholders - would need implementation)
ipcMain.handle('sessions:merge-main-to-worktree', async (_event, sessionId: string) => {
  try {
    // TODO: Implement git merge from main to worktree
    return { success: false, error: 'Git merge not implemented yet' };
  } catch (error) {
    console.error('Failed to merge main to worktree:', error);
    return { success: false, error: 'Failed to merge main to worktree' };
  }
});

ipcMain.handle('sessions:merge-worktree-to-main', async (_event, sessionId: string) => {
  try {
    // TODO: Implement git merge from worktree to main
    return { success: false, error: 'Git merge not implemented yet' };
  } catch (error) {
    console.error('Failed to merge worktree to main:', error);
    return { success: false, error: 'Failed to merge worktree to main' };
  }
});

// Prompts handlers
ipcMain.handle('prompts:get-all', async () => {
  try {
    const prompts = sessionManager.getPromptHistory();
    return { success: true, data: prompts };
  } catch (error) {
    console.error('Failed to get prompts:', error);
    return { success: false, error: 'Failed to get prompts' };
  }
});
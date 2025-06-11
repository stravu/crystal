import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import { execSync } from './utils/commandExecutor';
import { TaskQueue } from './services/taskQueue';
import { SessionManager } from './services/sessionManager';
import { ConfigManager } from './services/configManager';
import { WorktreeManager } from './services/worktreeManager';
import { WorktreeNameGenerator } from './services/worktreeNameGenerator';
import { GitDiffManager, type GitDiffResult } from './services/gitDiffManager';
import { ExecutionTracker } from './services/executionTracker';
import { DatabaseService } from './database/database';
import { RunCommandManager } from './services/runCommandManager';
import { PermissionIpcServer } from './services/permissionIpcServer';
import { PermissionManager } from './services/permissionManager';
import { StravuAuthManager } from './services/stravuAuthManager';
import { StravuNotebookService } from './services/stravuNotebookService';
import { Logger } from './utils/logger';
import type { CreateSessionRequest } from './types/session';

let mainWindow: BrowserWindow | null = null;
let taskQueue: TaskQueue | null = null;

// Service instances
let configManager: ConfigManager;
let logger: Logger;
let sessionManager: SessionManager;
let worktreeManager: WorktreeManager;
let claudeCodeManager: any;
let gitDiffManager: GitDiffManager;
let executionTracker: ExecutionTracker;
let worktreeNameGenerator: WorktreeNameGenerator;
let databaseService: DatabaseService;
let runCommandManager: RunCommandManager;
let permissionIpcServer: PermissionIpcServer | null;
let stravuAuthManager: StravuAuthManager;
let stravuNotebookService: StravuNotebookService;

// Store original console methods before overriding
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalWarn: typeof console.warn;
let originalInfo: typeof console.info;

const isDevelopment = process.env.NODE_ENV !== 'production' && !app.isPackaged;

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
    // Skip messages that are already prefixed to avoid circular logging
    if (message.includes('[Main Process]') || message.includes('[Renderer]')) {
      return;
    }
    // Also skip Electron security warnings and other system messages
    if (message.includes('Electron Security Warning') || sourceId.includes('electron/js2c')) {
      return;
    }
    // Only log errors and warnings from renderer, not all messages
    if (level >= 2) { // 2 = warning, 3 = error
      console.log(`[Renderer] ${message} (${sourceId}:${line})`);
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
      mainWindow.webContents.send('main-log', 'log', message);
    }
  };

  console.error = (...args: any[]) => {
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

    if (logger) {
      logger.error(message, errorObj);
    } else {
      originalError.apply(console, args);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-log', 'error', message);
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
      mainWindow.webContents.send('main-log', 'warn', message);
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
      mainWindow.webContents.send('main-log', 'info', message);
    }
  };

  // Log any renderer errors
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process crashed:', details);
  });
}

async function initializeServices() {
  // Store original console methods before any overrides
  originalLog = console.log;
  originalError = console.error;
  originalWarn = console.warn;
  originalInfo = console.info;

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

  const { ClaudeCodeManager } = await import('./services/claudeCodeManager');
  claudeCodeManager = new ClaudeCodeManager(sessionManager, logger, configManager, permissionIpcPath);
  gitDiffManager = new GitDiffManager();
  executionTracker = new ExecutionTracker(sessionManager, gitDiffManager);
  worktreeNameGenerator = new WorktreeNameGenerator(configManager);
  runCommandManager = new RunCommandManager(databaseService);
  stravuAuthManager = new StravuAuthManager(logger);
  stravuNotebookService = new StravuNotebookService(stravuAuthManager, logger);

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
  console.log('[Main] App is ready, initializing services...');
  await initializeServices();
  console.log('[Main] Services initialized, creating window...');
  await createWindow();
  console.log('[Main] Window created successfully');

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

app.on('before-quit', async () => {
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

  // Close logger to ensure all logs are flushed
  if (logger) {
    logger.close();
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
  claudeCodeManager.on('output', async (output: any) => {
    // Save output to database
    sessionManager.addSessionOutput(output.sessionId, {
      type: output.type,
      data: output.data,
      timestamp: output.timestamp
    });

    // Broadcast to renderer
    if (mainWindow) {
      // If it's a JSON message, also send a formatted stdout version
      if (output.type === 'json') {
        const { formatJsonForOutputEnhanced } = await import('./utils/toolFormatter');
        const formattedOutput = formatJsonForOutputEnhanced(output.data);
        if (formattedOutput) {
          // Send the formatted version as stdout
          mainWindow.webContents.send('session:output', {
            sessionId: output.sessionId,
            type: 'stdout',
            data: formattedOutput,
            timestamp: output.timestamp
          });
        }
      }

      // Always send the original output (for Messages view)
      mainWindow.webContents.send('session:output', output);
    }
  });

  claudeCodeManager.on('spawned', async ({ sessionId }: { sessionId: string }) => {
    await sessionManager.updateSession(sessionId, { status: 'running' });

    // Start execution tracking
    try {
      const session = await sessionManager.getSession(sessionId);
      if (session && session.worktreePath) {
        // Get the latest prompt from prompt markers or use the session prompt
        const promptMarkers = sessionManager.getPromptMarkers(sessionId);
        const latestPrompt = promptMarkers.length > 0
          ? promptMarkers[promptMarkers.length - 1].prompt_text
          : session.prompt;

        await executionTracker.startExecution(sessionId, session.worktreePath, undefined, latestPrompt);

        // NOTE: Run commands are NOT started automatically when Claude spawns
        // They should only run when the user clicks the play button
      }
    } catch (error) {
      console.error(`Failed to start execution tracking for session ${sessionId}:`, error);
    }
  });

  claudeCodeManager.on('exit', async ({ sessionId, exitCode, signal }: { sessionId: string; exitCode: number; signal: string }) => {
    console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
    await sessionManager.setSessionExitCode(sessionId, exitCode);
    await sessionManager.updateSession(sessionId, { status: 'stopped' });

    // Stop run commands
    try {
      runCommandManager.stopRunCommands(sessionId);
    } catch (error) {
      console.error(`Failed to stop run commands for session ${sessionId}:`, error);
    }

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

    // Stop run commands on error
    try {
      runCommandManager.stopRunCommands(sessionId);
    } catch (stopError) {
      console.error(`Failed to stop run commands for session ${sessionId}:`, stopError);
    }

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

  // Listen to run command manager events
  runCommandManager.on('output', (output) => {
    // Store run command output with the session's script output
    if (output.sessionId && output.data) {
      sessionManager.addScriptOutput(output.sessionId, output.data);
    }
  });

  runCommandManager.on('error', (error) => {
    console.error(`Run command error for session ${error.sessionId}:`, error.error);
    // Add error to script output
    if (error.sessionId) {
      sessionManager.addScriptOutput(error.sessionId, `\n[Error] ${error.displayName}: ${error.error}\n`);
    }
  });

  runCommandManager.on('exit', (info) => {
    console.log(`Run command exited: ${info.displayName}, exitCode: ${info.exitCode}`);
    // Add exit info to script output
    if (info.sessionId && info.exitCode !== 0) {
      sessionManager.addScriptOutput(info.sessionId, `\n[Exit] ${info.displayName} exited with code ${info.exitCode}\n`);
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
  console.log('[IPC] sessions:create handler called with request:', request);
  try {
    const activeProject = sessionManager.getActiveProject();
    console.log('[IPC] Active project:', activeProject);
    if (!activeProject) {
      console.warn('[IPC] No active project found');
      return { success: false, error: 'No active project. Please select a project first.' };
    }

    if (!taskQueue) {
      console.error('[IPC] Task queue not initialized');
      return { success: false, error: 'Task queue not initialized' };
    }

    const count = request.count || 1;
    console.log(`[IPC] Creating ${count} session(s) with prompt: "${request.prompt}"`);

    if (count > 1) {
      console.log('[IPC] Creating multiple sessions...');
      const jobs = await taskQueue.createMultipleSessions(request.prompt, request.worktreeTemplate || '', count, request.permissionMode);
      console.log(`[IPC] Created ${jobs.length} jobs:`, jobs.map(job => job.id));
      return { success: true, data: { jobIds: jobs.map(job => job.id) } };
    } else {
      console.log('[IPC] Creating single session...');
      const job = await taskQueue.createSession({
        prompt: request.prompt,
        worktreeTemplate: request.worktreeTemplate || '',
        permissionMode: request.permissionMode
      });
      console.log('[IPC] Created job with ID:', job.id);
      return { success: true, data: { jobId: job.id } };
    }
  } catch (error) {
    console.error('[IPC] Failed to create session:', error);
    console.error('[IPC] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    // Extract detailed error information
    let errorMessage = 'Failed to create session';
    let errorDetails = '';
    let command = '';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.toString();

      // Check if it's a git command error
      const gitError = error as any;
      if (gitError.gitCommand) {
        command = gitError.gitCommand;
      } else if (gitError.cmd) {
        command = gitError.cmd;
      }

      // Include git output if available
      if (gitError.gitOutput) {
        errorDetails = gitError.gitOutput;
      } else if (gitError.stderr) {
        errorDetails = gitError.stderr;
      }
    }

    return {
      success: false,
      error: errorMessage,
      details: errorDetails,
      command: command
    };
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
    // Store user input in session outputs for persistence
    const userInputDisplay = `> ${input.trim()}\n`;
    await sessionManager.addSessionOutput(sessionId, {
      type: 'stdout',
      data: userInputDisplay,
      timestamp: new Date()
    });

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

    // Update session status to initializing
    sessionManager.updateSession(sessionId, { status: 'initializing' });

    // Add the prompt to conversation history and prompt markers (if a prompt is provided)
    if (continuePrompt) {
      sessionManager.continueConversation(sessionId, continuePrompt);
    }

    // Continue the session with the existing conversation
    await claudeCodeManager.continueSession(sessionId, session.worktreePath, continuePrompt, conversationHistory);

    // The session manager will update status based on Claude output
    return { success: true };
  } catch (error) {
    console.error('Failed to continue conversation:', error);
    return { success: false, error: 'Failed to continue conversation' };
  }
});

ipcMain.handle('sessions:get-output', async (_event, sessionId: string) => {
  try {
    const outputs = await sessionManager.getSessionOutputs(sessionId);

    // Transform JSON messages to output format on the fly
    const { formatJsonForOutputEnhanced } = await import('./utils/toolFormatter');
    const transformedOutputs = outputs.map(output => {
      if (output.type === 'json') {
        // Generate output format from JSON using enhanced formatter
        const outputText = formatJsonForOutputEnhanced(output.data);
        if (outputText) {
          // Return both the JSON and a generated output version
          return [
            output, // Keep the JSON message for Messages view
            {
              ...output,
              type: 'stdout' as const,
              data: outputText
            }
          ];
        }
        return [output]; // If no output format, just return JSON
      }
      return [output]; // Non-JSON outputs pass through
    }).flat();

    return { success: true, data: transformedOutputs };
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

ipcMain.handle('sessions:generate-name', async (_event, prompt: string) => {
  try {
    const name = await worktreeNameGenerator.generateWorktreeName(prompt);
    return { success: true, data: name };
  } catch (error) {
    console.error('Failed to generate session name:', error);
    return { success: false, error: 'Failed to generate session name' };
  }
});

// Git and execution handlers
ipcMain.handle('sessions:get-executions', async (_event, sessionId: string) => {
  try {
    // Get session to find worktree path
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    // Get git commit history from the worktree
    const project = sessionManager.getProjectForSession(sessionId);
    const mainBranch = project?.main_branch || 'main';
    const commits = gitDiffManager.getCommitHistory(session.worktreePath, 50, mainBranch);

    // Check for uncommitted changes
    const uncommittedDiff = await gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
    const hasUncommittedChanges = uncommittedDiff.stats.filesChanged > 0;

    // Transform commits to execution diff format for compatibility
    const executions: any[] = commits.map((commit, index) => ({
      id: index + 1,
      session_id: sessionId,
      prompt_text: commit.message,
      execution_sequence: index + 1,
      git_diff: null, // Will be loaded on demand
      files_changed: [],
      stats_additions: commit.stats.additions,
      stats_deletions: commit.stats.deletions,
      stats_files_changed: commit.stats.filesChanged,
      before_commit_hash: `${commit.hash}~1`,
      after_commit_hash: commit.hash,
      timestamp: commit.date.toISOString()
    }));

    // Add uncommitted changes as the first item if they exist
    if (hasUncommittedChanges) {
      executions.unshift({
        id: 0, // Special ID for uncommitted changes
        session_id: sessionId,
        prompt_text: 'Uncommitted changes',
        execution_sequence: 0,
        git_diff: null,
        files_changed: uncommittedDiff.changedFiles || [],
        stats_additions: uncommittedDiff.stats.additions,
        stats_deletions: uncommittedDiff.stats.deletions,
        stats_files_changed: uncommittedDiff.stats.filesChanged,
        before_commit_hash: commits.length > 0 ? commits[0].hash : 'HEAD',
        after_commit_hash: 'UNCOMMITTED',
        timestamp: new Date().toISOString()
      });
    }

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

    // Get git commit history
    const project = sessionManager.getProjectForSession(sessionId);
    const mainBranch = project?.main_branch || 'main';
    const commits = gitDiffManager.getCommitHistory(session.worktreePath, 50, mainBranch);
    const executionIndex = parseInt(executionId) - 1;

    if (executionIndex < 0 || executionIndex >= commits.length) {
      return { success: false, error: 'Invalid execution ID' };
    }

    // Get diff for the specific commit
    const commit = commits[executionIndex];
    const diff = gitDiffManager.getCommitDiff(session.worktreePath, commit.hash);
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

// Dialog handlers
ipcMain.handle('dialog:open-file', async (_event, options?: Electron.OpenDialogOptions) => {
  try {
    if (!mainWindow) {
      return { success: false, error: 'No main window available' };
    }

    const defaultOptions: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      ...options
    };

    const result = await dialog.showOpenDialog(mainWindow, defaultOptions);

    if (result.canceled) {
      return { success: true, data: null };
    }

    return { success: true, data: result.filePaths[0] };
  } catch (error) {
    console.error('Failed to open file dialog:', error);
    return { success: false, error: 'Failed to open file dialog' };
  }
});

ipcMain.handle('dialog:open-directory', async (_event, options?: Electron.OpenDialogOptions) => {
  try {
    if (!mainWindow) {
      return { success: false, error: 'No main window available' };
    }

    const defaultOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      ...options
    };

    const result = await dialog.showOpenDialog(mainWindow, defaultOptions);

    if (result.canceled) {
      return { success: true, data: null };
    }

    return { success: true, data: result.filePaths[0] };
  } catch (error) {
    console.error('Failed to open directory dialog:', error);
    return { success: false, error: 'Failed to open directory dialog' };
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
    console.log('[Main] Creating project:', projectData);

    // Import fs and exec utilities
    const { mkdirSync, existsSync } = require('fs');
    const { execSync: nodeExecSync } = require('child_process');

    // Create directory if it doesn't exist
    if (!existsSync(projectData.path)) {
      console.log('[Main] Creating directory:', projectData.path);
      mkdirSync(projectData.path, { recursive: true });
    }

    // Check if it's a git repository
    let isGitRepo = false;
    try {
      nodeExecSync(`cd "${projectData.path}" && git rev-parse --is-inside-work-tree`, { encoding: 'utf-8' });
      isGitRepo = true;
      console.log('[Main] Directory is already a git repository');
    } catch (error) {
      console.log('[Main] Directory is not a git repository, initializing...');
    }

    // Initialize git if needed
    if (!isGitRepo) {
      try {
        // Use the specified main branch name if provided
        const branchName = projectData.mainBranch || 'main';

        nodeExecSync(`cd "${projectData.path}" && git init`, { encoding: 'utf-8' });
        console.log('[Main] Git repository initialized successfully');

        // Create and checkout the specified branch
        nodeExecSync(`cd "${projectData.path}" && git checkout -b ${branchName}`, { encoding: 'utf-8' });
        console.log(`[Main] Created and checked out branch: ${branchName}`);

        // Create initial commit
        nodeExecSync(`cd "${projectData.path}" && git commit -m "Initial commit" --allow-empty`, { encoding: 'utf-8' });
        console.log('[Main] Created initial empty commit');
      } catch (error) {
        console.error('[Main] Failed to initialize git repository:', error);
        // Continue anyway - let the user handle git setup manually if needed
      }
    }

    // Detect or use the provided main branch
    let mainBranch: string | undefined = projectData.mainBranch;
    if (!mainBranch && isGitRepo) {
      try {
        mainBranch = await worktreeManager.detectMainBranch(projectData.path);
        console.log('[Main] Detected main branch:', mainBranch);
      } catch (error) {
        console.log('[Main] Could not detect main branch, skipping:', error);
        // Not a git repository or error detecting, that's okay
      }
    }

    const project = databaseService.createProject(
      projectData.name,
      projectData.path,
      projectData.systemPrompt,
      projectData.runScript,
      mainBranch,
      projectData.buildScript
    );

    // If run_script was provided, also create run commands
    if (projectData.runScript && project) {
      const commands = projectData.runScript.split('\n').filter((cmd: string) => cmd.trim());
      commands.forEach((command: string, index: number) => {
        databaseService.createRunCommand(
          project.id,
          command.trim(),
          `Command ${index + 1}`,
          index
        );
      });
    }

    console.log('[Main] Project created successfully:', project);
    return { success: true, data: project };
  } catch (error) {
    console.error('[Main] Failed to create project:', error);

    // Extract detailed error information
    let errorMessage = 'Failed to create project';
    let errorDetails = '';
    let command = '';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || error.toString();

      // Check if it's a command error
      const cmdError = error as any;
      if (cmdError.cmd) {
        command = cmdError.cmd;
      }

      // Include command output if available
      if (cmdError.stderr) {
        errorDetails = cmdError.stderr;
      } else if (cmdError.stdout) {
        errorDetails = cmdError.stdout;
      }
    }

    return {
      success: false,
      error: errorMessage,
      details: errorDetails,
      command: command
    };
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
    // Update the project
    const project = databaseService.updateProject(parseInt(projectId), updates);

    // If run_script was updated, also update the run commands table
    if (updates.run_script !== undefined) {
      const projectIdNum = parseInt(projectId);

      // Delete existing run commands
      databaseService.deleteProjectRunCommands(projectIdNum);

      // Add new run commands from the multiline script
      if (updates.run_script) {
        const commands = updates.run_script.split('\n').filter((cmd: string) => cmd.trim());
        commands.forEach((command: string, index: number) => {
          databaseService.createRunCommand(
            projectIdNum,
            command.trim(),
            `Command ${index + 1}`,
            index
          );
        });
      }
    }

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

ipcMain.handle('projects:detect-branch', async (_event, path: string) => {
  try {
    const branch = await worktreeManager.detectMainBranch(path);
    return { success: true, data: branch };
  } catch (error) {
    console.log('[Main] Could not detect branch:', error);
    return { success: true, data: 'main' }; // Return default if detection fails
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
    // Get session to find worktree path
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    // Handle uncommitted changes request
    if (executionIds && executionIds.length === 1 && executionIds[0] === 0) {
      const uncommittedDiff = await gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
      return { success: true, data: uncommittedDiff };
    }

    // Get git commit history
    const project = sessionManager.getProjectForSession(sessionId);
    const mainBranch = project?.main_branch || 'main';
    const commits = gitDiffManager.getCommitHistory(session.worktreePath, 50, mainBranch);

    if (!commits.length) {
      return {
        success: true,
        data: {
          diff: '',
          stats: { additions: 0, deletions: 0, filesChanged: 0 },
          changedFiles: []
        }
      };
    }

    // If we have a range selection (2 IDs), use git diff between them
    if (executionIds && executionIds.length === 2) {
      const sortedIds = [...executionIds].sort((a, b) => a - b);

      // Handle range that includes uncommitted changes
      if (sortedIds[0] === 0 || sortedIds[1] === 0) {
        // If uncommitted is in the range, get diff from the other commit to working directory
        const commitId = sortedIds[0] === 0 ? sortedIds[1] : sortedIds[0];
        const commitIndex = commitId - 1;

        if (commitIndex >= 0 && commitIndex < commits.length) {
          const fromCommit = commits[commitIndex];
          // Get diff from commit to working directory (includes uncommitted changes)
          const diff = execSync(
            `git diff ${fromCommit.hash}`,
            { cwd: session.worktreePath, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
          );

          const stats = gitDiffManager.parseDiffStats(
            execSync(`git diff --stat ${fromCommit.hash}`, { cwd: session.worktreePath, encoding: 'utf8' })
          );

          const changedFiles = execSync(
            `git diff --name-only ${fromCommit.hash}`,
            { cwd: session.worktreePath, encoding: 'utf8' }
          ).trim().split('\n').filter(Boolean);

          return {
            success: true,
            data: {
              diff,
              stats,
              changedFiles,
              beforeHash: fromCommit.hash,
              afterHash: 'UNCOMMITTED'
            }
          };
        }
      }

      // For regular commit ranges, we want to show all changes introduced by the selected commits
      // - Commits are stored newest first (index 0 = newest)
      // - User selects from older to newer visually
      // - We need to go back one commit before the older selection to show all changes
      const newerIndex = sortedIds[0] - 1;   // Lower ID = newer commit
      const olderIndex = sortedIds[1] - 1;   // Higher ID = older commit

      if (newerIndex >= 0 && newerIndex < commits.length && olderIndex >= 0 && olderIndex < commits.length) {
        const newerCommit = commits[newerIndex]; // Newer commit
        const olderCommit = commits[olderIndex]; // Older commit

        // To show all changes introduced by the selected commits, we diff from
        // the parent of the older commit to the newer commit
        let fromCommitHash: string;

        try {
          // Try to get the parent of the older commit
          const parentHash = execSync(`git rev-parse ${olderCommit.hash}^`, {
            cwd: session.worktreePath,
            encoding: 'utf8'
          }).trim();
          fromCommitHash = parentHash;
        } catch (error) {
          // If there's no parent (initial commit), use git's empty tree hash
          fromCommitHash = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        }

        // Use git diff to show all changes from before the range to the newest selected commit
        const diff = await gitDiffManager.captureCommitDiff(
          session.worktreePath,
          fromCommitHash,
          newerCommit.hash
        );
        return { success: true, data: diff };
      }
    }

    // If no specific execution IDs are provided, get diff from first to last commit
    if (!executionIds || executionIds.length === 0) {
      if (commits.length === 0) {
        return {
          success: true,
          data: {
            diff: '',
            stats: { additions: 0, deletions: 0, filesChanged: 0 },
            changedFiles: []
          }
        };
      }

      // For a single commit, show the commit's own changes
      if (commits.length === 1) {
        const diff = gitDiffManager.getCommitDiff(session.worktreePath, commits[0].hash);
        return { success: true, data: diff };
      }

      // For multiple commits, get diff from parent of first commit to HEAD (all changes)
      const firstCommit = commits[commits.length - 1]; // Oldest commit
      let fromCommitHash: string;

      try {
        // Try to get the parent of the first commit
        fromCommitHash = execSync(`git rev-parse ${firstCommit.hash}^`, {
          cwd: session.worktreePath,
          encoding: 'utf8'
        }).trim();
      } catch (error) {
        // If there's no parent (initial commit), use git's empty tree hash
        fromCommitHash = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
      }

      const diff = await gitDiffManager.captureCommitDiff(
        session.worktreePath,
        fromCommitHash,
        'HEAD'
      );
      return { success: true, data: diff };
    }

    // For multiple individual selections, we need to create a range from first to last
    if (executionIds.length > 2) {
      const sortedIds = [...executionIds].sort((a, b) => a - b);
      const firstId = sortedIds[sortedIds.length - 1]; // Highest ID = oldest commit
      const lastId = sortedIds[0]; // Lowest ID = newest commit

      const fromIndex = firstId - 1;
      const toIndex = lastId - 1;

      if (fromIndex >= 0 && fromIndex < commits.length && toIndex >= 0 && toIndex < commits.length) {
        const fromCommit = commits[fromIndex]; // Oldest selected
        const toCommit = commits[toIndex]; // Newest selected

        const diff = await gitDiffManager.captureCommitDiff(
          session.worktreePath,
          fromCommit.hash,
          toCommit.hash
        );
        return { success: true, data: diff };
      }
    }

    // Single commit selection
    if (executionIds.length === 1) {
      const commitIndex = executionIds[0] - 1;
      if (commitIndex >= 0 && commitIndex < commits.length) {
        const commit = commits[commitIndex];
        const diff = gitDiffManager.getCommitDiff(session.worktreePath, commit.hash);
        return { success: true, data: diff };
      }
    }

    // Fallback to empty diff
    return {
      success: true,
      data: {
        diff: '',
        stats: { additions: 0, deletions: 0, filesChanged: 0 },
        changedFiles: []
      }
    };
  } catch (error) {
    console.error('Failed to get combined diff:', error);
    return { success: false, error: 'Failed to get combined diff' };
  }
});

// Git rebase operations
ipcMain.handle('sessions:rebase-main-into-worktree', async (_event, sessionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (!session.worktreePath) {
      return { success: false, error: 'Session has no worktree path' };
    }

    // Get the project to find the main branch
    const project = sessionManager.getProjectForSession(sessionId);
    if (!project) {
      return { success: false, error: 'Project not found for session' };
    }

    const mainBranch = project.main_branch || 'main';

    await worktreeManager.rebaseMainIntoWorktree(session.worktreePath, mainBranch);

    return { success: true, data: { message: `Successfully rebased ${mainBranch} into worktree` } };
  } catch (error: any) {
    console.error('Failed to rebase main into worktree:', error);

    // Pass detailed git error information to frontend
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rebase main into worktree',
      gitError: {
        command: error.gitCommand,
        output: error.gitOutput,
        workingDirectory: error.workingDirectory,
        originalError: error.originalError?.message
      }
    };
  }
});

ipcMain.handle('sessions:squash-and-rebase-to-main', async (_event, sessionId: string, commitMessage: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (!session.worktreePath) {
      return { success: false, error: 'Session has no worktree path' };
    }

    // Get the project to find the main branch and project path
    const project = sessionManager.getProjectForSession(sessionId);
    if (!project) {
      return { success: false, error: 'Project not found for session' };
    }

    const mainBranch = project.main_branch || 'main';

    await worktreeManager.squashAndRebaseWorktreeToMain(project.path, session.worktreePath, mainBranch, commitMessage);

    return { success: true, data: { message: `Successfully squashed and rebased worktree to ${mainBranch}` } };
  } catch (error: any) {
    console.error('Failed to squash and rebase worktree to main:', error);

    // Pass detailed git error information to frontend
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to squash and rebase worktree to main',
      gitError: {
        commands: error.gitCommands,
        output: error.gitOutput,
        workingDirectory: error.workingDirectory,
        projectPath: error.projectPath,
        originalError: error.originalError?.message
      }
    };
  }
});

// Git operation helpers
ipcMain.handle('sessions:has-changes-to-rebase', async (_event, sessionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    const project = sessionManager.getProjectForSession(sessionId);
    if (!project) {
      return { success: false, error: 'Project not found for session' };
    }

    const mainBranch = project.main_branch || 'main';
    const hasChanges = await worktreeManager.hasChangesToRebase(session.worktreePath, mainBranch);

    return { success: true, data: hasChanges };
  } catch (error) {
    console.error('Failed to check for changes to rebase:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to check for changes to rebase' };
  }
});

ipcMain.handle('sessions:get-git-commands', async (_event, sessionId: string) => {
  try {
    const session = await sessionManager.getSession(sessionId);
    if (!session || !session.worktreePath) {
      return { success: false, error: 'Session or worktree path not found' };
    }

    const project = sessionManager.getProjectForSession(sessionId);
    if (!project) {
      return { success: false, error: 'Project not found for session' };
    }

    const mainBranch = project.main_branch || 'main';

    // Get current branch name
    const { execSync } = require('child_process');
    const currentBranch = execSync(`cd "${session.worktreePath}" && git branch --show-current`, { encoding: 'utf8' }).trim();

    const rebaseCommands = worktreeManager.generateRebaseCommands(mainBranch);
    const squashCommands = worktreeManager.generateSquashCommands(mainBranch, currentBranch);

    return {
      success: true,
      data: {
        rebaseCommands,
        squashCommands,
        mainBranch,
        currentBranch
      }
    };
  } catch (error) {
    console.error('Failed to get git commands:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get git commands' };
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

ipcMain.handle('prompts:get-by-id', async (_event, promptId: string) => {
  try {
    const promptMarker = sessionManager.getPromptById(promptId);
    return { success: true, data: promptMarker };
  } catch (error) {
    console.error('Failed to get prompt by id:', error);
    return { success: false, error: 'Failed to get prompt by id' };
  }
});

// System utilities
ipcMain.handle('openExternal', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external URL:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to open URL' };
  }
});

// Stravu OAuth integration handlers
ipcMain.handle('stravu:get-connection-status', async () => {
  try {
    const connectionState = stravuAuthManager.getConnectionState();
    return { success: true, data: connectionState };
  } catch (error) {
    console.error('Failed to get Stravu connection status:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get connection status' };
  }
});

ipcMain.handle('stravu:initiate-auth', async () => {
  try {
    const result = await stravuAuthManager.authenticate();
    return {
      success: true,
      data: {
        authUrl: stravuAuthManager.getCurrentSession()?.authUrl,
        sessionId: stravuAuthManager.getCurrentSession()?.sessionId
      }
    };
  } catch (error) {
    console.error('Failed to initiate Stravu authentication:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to initiate authentication' };
  }
});

ipcMain.handle('stravu:check-auth-status', async (_event, sessionId: string) => {
  try {
    const result = await stravuAuthManager.pollForCompletion(sessionId);

    if (result.status === 'pending') {
      return { success: true, data: { status: 'pending' } };
    } else {
      return {
        success: true,
        data: {
          status: 'completed',
          memberInfo: {
            memberId: result.memberId || '',
            orgSlug: result.orgSlug || '',
            scopes: result.scopes || []
          }
        }
      };
    }
  } catch (error) {
    console.error('Failed to check Stravu auth status:', error);
    return {
      success: true,
      data: {
        status: 'error',
        error: error instanceof Error ? error.message : 'Authentication failed'
      }
    };
  }
});

ipcMain.handle('stravu:disconnect', async () => {
  try {
    await stravuAuthManager.disconnect();
    stravuNotebookService.clearCache();
    return { success: true };
  } catch (error) {
    console.error('Failed to disconnect from Stravu:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to disconnect' };
  }
});

ipcMain.handle('stravu:get-notebooks', async () => {
  try {
    if (!stravuAuthManager.isConnected()) {
      return { success: false, error: 'Not connected to Stravu' };
    }

    const notebooks = await stravuNotebookService.getNotebooks();
    return { success: true, data: notebooks };
  } catch (error) {
    console.error('Failed to get Stravu notebooks:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get notebooks' };
  }
});

ipcMain.handle('stravu:get-notebook', async (_event, notebookId: string) => {
  try {
    if (!stravuAuthManager.isConnected()) {
      return { success: false, error: 'Not connected to Stravu' };
    }

    const notebook = await stravuNotebookService.getNotebookContent(notebookId);
    return { success: true, data: notebook };
  } catch (error) {
    console.error('Failed to get Stravu notebook:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to get notebook' };
  }
});

ipcMain.handle('stravu:search-notebooks', async (_event, query: string, limit?: number) => {
  try {
    if (!stravuAuthManager.isConnected()) {
      return { success: false, error: 'Not connected to Stravu' };
    }

    const results = await stravuNotebookService.searchNotebooks(query, limit);
    return { success: true, data: results };
  } catch (error) {
    console.error('Failed to search Stravu notebooks:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to search notebooks' };
  }
});

// Export getter function for mainWindow
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

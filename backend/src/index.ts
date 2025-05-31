import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { SessionManager } from './services/sessionManager.js';
import { WorktreeManager } from './services/worktreeManager.js';
import { ClaudeCodeManager } from './services/claudeCodeManager.js';
import { ConfigManager } from './services/configManager.js';
import { DatabaseService } from './database/database.js';
import { createSessionRouter } from './routes/sessions.js';
import { createConfigRouter } from './routes/config.js';
import { Logger } from './utils/logger.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4521',
    methods: ['GET', 'POST']
  }
});

const configManager = new ConfigManager(process.env.GIT_REPO_PATH);
const logger = new Logger(configManager);
let databaseService: DatabaseService;
let sessionManager: SessionManager;
let worktreeManager = new WorktreeManager(configManager.getGitRepoPath());
const claudeCodeManager = new ClaudeCodeManager(logger);

async function initialize() {
  await configManager.initialize();
  
  // Initialize database and session manager
  databaseService = new DatabaseService(configManager.getDatabasePath());
  await databaseService.initialize();
  sessionManager = new SessionManager(databaseService);
  
  worktreeManager = new WorktreeManager(configManager.getGitRepoPath());
  await worktreeManager.initialize();
  
  // Initialize session manager with persisted sessions
  await sessionManager.initializeFromDatabase();
  
  configManager.on('config-updated', async (config) => {
    worktreeManager = new WorktreeManager(config.gitRepoPath);
    await worktreeManager.initialize();
  });
  
  sessionManager.on('sessions-loaded', (sessions) => {
    io.emit('sessions:loaded', sessions);
  });
  
  sessionManager.on('session-created', (session) => {
    io.emit('session:created', session);
  });

  sessionManager.on('session-updated', (session) => {
    io.emit('session:updated', session);
  });

  sessionManager.on('session-deleted', (session) => {
    io.emit('session:deleted', session);
  });

  sessionManager.on('session-output', (output) => {
    const dataPreview = typeof output.data === 'string' 
      ? output.data.substring(0, 50) 
      : JSON.stringify(output.data).substring(0, 50);
    console.log('Emitting session output to WebSocket:', output.sessionId, dataPreview);
    io.emit('session:output', output);
  });

  claudeCodeManager.on('output', async (output) => {
    await sessionManager.addSessionOutput(output.sessionId, {
      type: output.type,
      data: output.data,
      timestamp: output.timestamp
    });
  });

  claudeCodeManager.on('spawned', async ({ sessionId }) => {
    await sessionManager.updateSession(sessionId, { status: 'running' });
  });

  claudeCodeManager.on('exit', async ({ sessionId, exitCode, signal }) => {
    logger.info(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
    await sessionManager.setSessionExitCode(sessionId, exitCode);
    await sessionManager.updateSession(sessionId, { status: 'stopped' });
  });

  claudeCodeManager.on('error', async ({ sessionId, error }) => {
    logger.error(`Session ${sessionId} encountered an error: ${error}`);
    await sessionManager.updateSession(sessionId, { 
      status: 'error',
      error 
    });
  });

  // Add routes after everything is initialized
  app.use('/api/sessions', createSessionRouter(sessionManager, () => worktreeManager, claudeCodeManager, logger));
  app.use('/api/config', createConfigRouter(configManager));

  // Set up WebSocket handling after sessionManager is ready
  io.on('connection', async (socket) => {
    console.log('Client connected:', socket.id);
    
    try {
      const sessions = await sessionManager.getAllSessions();
      socket.emit('sessions:initial', sessions);
    } catch (error) {
      console.error('Error fetching sessions for new client:', error);
      socket.emit('sessions:initial', []);
    }
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes will be added after initialization

const PORT = process.env.PORT || 3521;

initialize().then(() => {
  httpServer.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
    console.log('Database and session manager initialized successfully');
  });
}).catch((error) => {
  console.error('Failed to initialize server:', error);
  console.error('Error stack:', error.stack);
  process.exit(1);
});
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { SessionManager } from './services/sessionManager.js';
import { WorktreeManager } from './services/worktreeManager.js';
import { ClaudeCodeManager } from './services/claudeCodeManager.js';
import { ConfigManager } from './services/configManager.js';
import { createSessionRouter } from './routes/sessions.js';
import { createConfigRouter } from './routes/config.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4521',
    methods: ['GET', 'POST']
  }
});

const configManager = new ConfigManager(process.env.GIT_REPO_PATH || process.cwd());
const sessionManager = new SessionManager();
let worktreeManager = new WorktreeManager(configManager.getGitRepoPath());
const claudeCodeManager = new ClaudeCodeManager();

async function initialize() {
  await configManager.initialize();
  worktreeManager = new WorktreeManager(configManager.getGitRepoPath());
  await worktreeManager.initialize();
  
  configManager.on('config-updated', async (config) => {
    worktreeManager = new WorktreeManager(config.gitRepoPath);
    await worktreeManager.initialize();
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
    io.emit('session:output', output);
  });

  claudeCodeManager.on('output', (output) => {
    sessionManager.addSessionOutput(output.sessionId, {
      type: output.type,
      data: output.data,
      timestamp: output.timestamp
    });
  });

  claudeCodeManager.on('exit', ({ sessionId }) => {
    sessionManager.updateSession(sessionId, { status: 'stopped' });
  });

  claudeCodeManager.on('error', ({ sessionId, error }) => {
    sessionManager.updateSession(sessionId, { 
      status: 'error',
      error 
    });
  });
}

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/sessions', createSessionRouter(sessionManager, worktreeManager, claudeCodeManager));
app.use('/api/config', createConfigRouter(configManager));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.emit('sessions:initial', sessionManager.getAllSessions());
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3521;

initialize().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((error) => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
});
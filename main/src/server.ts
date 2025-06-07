import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as path from 'path';

import { setupSessionRoutes } from './routes/sessions';
import { setupConfigRoutes } from './routes/config';
import { setupPromptRoutes } from './routes/prompts';
import { createProjectsRouter } from './routes/projects';

import type { SessionManager } from './services/sessionManager';
import type { ConfigManager } from './services/configManager';
import type { WorktreeManager } from './services/worktreeManager';
import type { ClaudeCodeManager } from './services/claudeCodeManager';
import type { GitDiffManager } from './services/gitDiffManager';
import type { ExecutionTracker } from './services/executionTracker';
import type { TaskQueue } from './services/taskQueue';
import type { DatabaseService } from './database/database';

interface ServerOptions {
  configManager: ConfigManager;
  sessionManager: SessionManager;
  worktreeManager: WorktreeManager;
  claudeCodeManager: ClaudeCodeManager;
  gitDiffManager: GitDiffManager;
  executionTracker: ExecutionTracker;
  taskQueue: TaskQueue;
  databaseService: DatabaseService;
}

export class Server {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private port = 3001;

  constructor(private options: ServerOptions) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: ['http://localhost:4521', 'http://localhost:5173', 'http://localhost:3000'],
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: ['http://localhost:4521', 'http://localhost:5173', 'http://localhost:3000'],
      credentials: true
    }));
    this.app.use(express.json());
  }

  private setupRoutes() {
    const { configManager, sessionManager, worktreeManager, claudeCodeManager, gitDiffManager, executionTracker, taskQueue } = this.options;

    setupSessionRoutes(this.app, {
      sessionManager,
      worktreeManager,
      claudeCodeManager,
      gitDiffManager,
      executionTracker,
      taskQueue,
      io: this.io
    });

    setupConfigRoutes(this.app, { configManager });
    setupPromptRoutes(this.app, { sessionManager });
    
    // Add projects router
    const projectsRouter = createProjectsRouter(this.options.databaseService, sessionManager);
    this.app.use('/api/projects', projectsRouter);

    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../../../frontend/dist')));
      this.app.get('*', (_req, res) => {
        res.sendFile(path.join(__dirname, '../../../frontend/dist/index.html'));
      });
    }
  }

  private setupSocketIO() {
    const { sessionManager, claudeCodeManager } = this.options;
    
    this.io.on('connection', async (socket) => {
      console.log('Client connected:', socket.id);
      
      // Send initial sessions when client connects
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

    // Listen to sessionManager events and broadcast to all clients
    sessionManager.on('session-created', (session) => {
      this.io.emit('session:created', session);
    });

    sessionManager.on('session-updated', (session) => {
      this.io.emit('session:updated', session);
    });

    sessionManager.on('session-deleted', (session) => {
      this.io.emit('session:deleted', session);
    });

    sessionManager.on('sessions-loaded', (sessions) => {
      this.io.emit('sessions:loaded', sessions);
    });

    // Listen to claudeCodeManager events
    claudeCodeManager.on('output', (output) => {
      // Save output to database
      sessionManager.addSessionOutput(output.sessionId, {
        type: output.type,
        data: output.data,
        timestamp: output.timestamp
      });
      
      // Broadcast to all clients
      this.io.emit('session:output', output);
    });

    claudeCodeManager.on('spawned', async ({ sessionId }) => {
      await sessionManager.updateSession(sessionId, { status: 'running' });
      
      // Start execution tracking
      try {
        const session = await sessionManager.getSession(sessionId);
        if (session && session.worktreePath) {
          await this.options.executionTracker.startExecution(sessionId, session.worktreePath);
        }
      } catch (error) {
        console.error(`Failed to start execution tracking for session ${sessionId}:`, error);
      }
    });

    claudeCodeManager.on('exit', async ({ sessionId, exitCode, signal }) => {
      console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      await sessionManager.setSessionExitCode(sessionId, exitCode);
      await sessionManager.updateSession(sessionId, { status: 'stopped' });
      
      // End execution tracking
      try {
        if (this.options.executionTracker.isTracking(sessionId)) {
          await this.options.executionTracker.endExecution(sessionId);
        }
      } catch (error) {
        console.error(`Failed to end execution tracking for session ${sessionId}:`, error);
      }
    });

    claudeCodeManager.on('error', async ({ sessionId, error }) => {
      console.log(`Session ${sessionId} encountered an error: ${error}`);
      await sessionManager.updateSession(sessionId, { status: 'error', error });
      
      // Cancel execution tracking on error
      try {
        if (this.options.executionTracker.isTracking(sessionId)) {
          this.options.executionTracker.cancelExecution(sessionId);
        }
      } catch (trackingError) {
        console.error(`Failed to cancel execution tracking for session ${sessionId}:`, trackingError);
      }
    });

    // Listen to script output events
    sessionManager.on('script-output', (output) => {
      // Broadcast script output to all clients
      this.io.emit('script:output', output);
    });
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(this.port, () => {
        console.log(`Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.io.close(() => {
        this.httpServer.close(() => {
          console.log('Server stopped');
          resolve();
        });
      });
    });
  }
}
import Bull from 'bull';
import { SimpleQueue } from './simpleTaskQueue';
import type { SessionManager } from './sessionManager';
import type { WorktreeManager } from './worktreeManager';
import { WorktreeNameGenerator } from './worktreeNameGenerator';
import type { ClaudeCodeManager } from './claudeCodeManager';
import type { GitDiffManager } from './gitDiffManager';
import type { ExecutionTracker } from './executionTracker';

interface TaskQueueOptions {
  sessionManager: SessionManager;
  worktreeManager: WorktreeManager;
  claudeCodeManager: ClaudeCodeManager;
  gitDiffManager: GitDiffManager;
  executionTracker: ExecutionTracker;
  worktreeNameGenerator: WorktreeNameGenerator;
}

interface CreateSessionJob {
  prompt: string;
  worktreeTemplate: string;
  index?: number;
  permissionMode?: 'approve' | 'ignore';
}

interface ContinueSessionJob {
  sessionId: string;
  prompt: string;
}

interface SendInputJob {
  sessionId: string;
  input: string;
}

export class TaskQueue {
  private sessionQueue: Bull.Queue<CreateSessionJob> | SimpleQueue<CreateSessionJob>;
  private inputQueue: Bull.Queue<SendInputJob> | SimpleQueue<SendInputJob>;
  private continueQueue: Bull.Queue<ContinueSessionJob> | SimpleQueue<ContinueSessionJob>;
  private useSimpleQueue: boolean;

  constructor(private options: TaskQueueOptions) {
    console.log('[TaskQueue] Initializing task queue...');
    
    // Check if we're in Electron without Redis
    this.useSimpleQueue = !process.env.REDIS_URL && typeof process.versions.electron !== 'undefined';
    
    if (this.useSimpleQueue) {
      console.log('[TaskQueue] Using SimpleQueue for Electron environment');
      
      this.sessionQueue = new SimpleQueue<CreateSessionJob>('session-creation', 5);
      this.inputQueue = new SimpleQueue<SendInputJob>('session-input', 10);
      this.continueQueue = new SimpleQueue<ContinueSessionJob>('session-continue', 10);
    } else {
      // Use Bull with Redis
      const redisOptions = process.env.REDIS_URL ? {
        redis: process.env.REDIS_URL
      } : undefined;
      
      console.log('[TaskQueue] Using Bull with Redis:', process.env.REDIS_URL || 'default');

      this.sessionQueue = new Bull('session-creation', redisOptions || {
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false
        }
      });

      this.inputQueue = new Bull('session-input', redisOptions || {
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false
        }
      });

      this.continueQueue = new Bull('session-continue', redisOptions || {
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false
        }
      });
    }
    
    // Add event handlers for debugging
    this.sessionQueue.on('active', (job: any) => {
      console.log(`[TaskQueue] Job ${job.id} is active`);
    });
    
    this.sessionQueue.on('completed', (job: any, result: any) => {
      console.log(`[TaskQueue] Job ${job.id} completed:`, result);
    });
    
    this.sessionQueue.on('failed', (job: any, err: any) => {
      console.error(`[TaskQueue] Job ${job.id} failed:`, err);
    });
    
    this.sessionQueue.on('error', (error: any) => {
      console.error('[TaskQueue] Queue error:', error);
    });

    console.log('[TaskQueue] Setting up processors...');
    this.setupProcessors();
    console.log('[TaskQueue] Task queue initialized');
  }

  private setupProcessors() {
    this.sessionQueue.process(5, async (job) => {
      const { prompt, worktreeTemplate, index, permissionMode } = job.data;
      const { sessionManager, worktreeManager, claudeCodeManager } = this.options;

      console.log(`[TaskQueue] Processing session creation job ${job.id}`, { prompt, worktreeTemplate, index, permissionMode });

      try {
        const activeProject = sessionManager.getActiveProject();
        
        if (!activeProject) {
          throw new Error('No active project selected');
        }

        let worktreeName = worktreeTemplate;
        
        // Generate a name if template is empty
        if (!worktreeName || worktreeName.trim() === '') {
          console.log(`[TaskQueue] No worktree template provided, generating name from prompt...`);
          // Use the AI-powered name generator or smart fallback
          worktreeName = await this.options.worktreeNameGenerator.generateWorktreeName(prompt);
          console.log(`[TaskQueue] Generated base name: ${worktreeName}`);
        }
        
        // Ensure uniqueness among all sessions (including archived)
        worktreeName = await this.ensureUniqueSessionName(worktreeName, index);
        
        console.log(`[TaskQueue] Creating worktree with name: ${worktreeName}`);
        console.log(`[TaskQueue] Active project:`, JSON.stringify({
          id: activeProject.id,
          name: activeProject.name,
          build_script: activeProject.build_script,
          run_script: activeProject.run_script
        }, null, 2));

        const { worktreePath } = await worktreeManager.createWorktree(activeProject.path, worktreeName, undefined);
        console.log(`[TaskQueue] Worktree created at: ${worktreePath}`);
        
        const sessionName = worktreeName;
        console.log(`[TaskQueue] Creating session in database`);
        
        const session = await sessionManager.createSession(
          sessionName,
          worktreePath,
          prompt,
          worktreeName,
          permissionMode
        );
        console.log(`[TaskQueue] Session created with ID: ${session.id}`);

        // Add the initial prompt marker
        sessionManager.addInitialPromptMarker(session.id, prompt);
        console.log(`[TaskQueue] Added initial prompt marker for session ${session.id}`);

        // Add the initial prompt to conversation messages for continuation support
        sessionManager.addConversationMessage(session.id, 'user', prompt);
        console.log(`[TaskQueue] Added initial prompt to conversation messages for session ${session.id}`);

        // Add the initial prompt to output so it's visible
        const timestamp = new Date().toLocaleTimeString();
        const initialPromptDisplay = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[42m\x1b[30m 👤 USER PROMPT \x1b[0m\r\n` +
                                     `\x1b[1m\x1b[92m${prompt}\x1b[0m\r\n\r\n`;
        await sessionManager.addSessionOutput(session.id, {
          type: 'stdout',
          data: initialPromptDisplay,
          timestamp: new Date()
        });
        console.log(`[TaskQueue] Added initial prompt to session output for session ${session.id}`);
        
        // Emit the session-created event BEFORE running build script so UI shows immediately
        sessionManager.emitSessionCreated(session);
        console.log(`[TaskQueue] Emitted session-created event for session ${session.id}`);
        
        // Run build script after session is visible in UI
        if (activeProject.build_script) {
          console.log(`[TaskQueue] Running build script for session ${session.id}`);
          
          // Add a "waiting for build" message to output
          const buildWaitingMessage = `\x1b[36m[${new Date().toLocaleTimeString()}]\x1b[0m \x1b[1m\x1b[33m⏳ Waiting for build script to complete...\x1b[0m\r\n\r\n`;
          await sessionManager.addSessionOutput(session.id, {
            type: 'stdout',
            data: buildWaitingMessage,
            timestamp: new Date()
          });
          
          const buildCommands = activeProject.build_script.split('\n').filter(cmd => cmd.trim());
          const buildResult = await sessionManager.runBuildScript(session.id, buildCommands, worktreePath);
          console.log(`[TaskQueue] Build script completed. Success: ${buildResult.success}`);
        }

        console.log(`[TaskQueue] Starting Claude Code for session ${session.id} with permission mode: ${permissionMode}`);
        await claudeCodeManager.startSession(session.id, session.worktreePath, prompt, permissionMode);
        console.log(`[TaskQueue] Claude Code started successfully for session ${session.id}`);

        return { sessionId: session.id };
      } catch (error) {
        console.error(`[TaskQueue] Failed to create session:`, error);
        throw error;
      }
    });

    this.inputQueue.process(10, async (job) => {
      const { sessionId, input } = job.data;
      const { claudeCodeManager } = this.options;
      
      await claudeCodeManager.sendInput(sessionId, input);
    });

    this.continueQueue.process(10, async (job) => {
      const { sessionId, prompt } = job.data;
      const { sessionManager, claudeCodeManager } = this.options;
      
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const messages = await sessionManager.getConversationMessages(sessionId);
      await claudeCodeManager.continueSession(sessionId, session.worktreePath, prompt, messages);
    });
  }

  async createSession(data: CreateSessionJob): Promise<Bull.Job<CreateSessionJob> | any> {
    console.log('[TaskQueue] Adding session creation job to queue:', data);
    const job = await this.sessionQueue.add(data);
    console.log('[TaskQueue] Job added successfully with ID:', job.id);
    return job;
  }

  async createMultipleSessions(prompt: string, worktreeTemplate: string, count: number, permissionMode?: 'approve' | 'ignore'): Promise<(Bull.Job<CreateSessionJob> | any)[]> {
    const jobs = [];
    for (let i = 0; i < count; i++) {
      jobs.push(this.sessionQueue.add({ prompt, worktreeTemplate, index: i, permissionMode }));
    }
    return Promise.all(jobs);
  }

  async sendInput(sessionId: string, input: string): Promise<Bull.Job<SendInputJob> | any> {
    return this.inputQueue.add({ sessionId, input });
  }

  async continueSession(sessionId: string, prompt: string): Promise<Bull.Job<ContinueSessionJob> | any> {
    return this.continueQueue.add({ sessionId, prompt });
  }

  private async ensureUniqueSessionName(baseName: string, index?: number): Promise<string> {
    const { sessionManager } = this.options;
    const db = (sessionManager as any).db;
    
    let candidateName = baseName;
    
    // Add index suffix if provided (for multiple sessions)
    if (index !== undefined) {
      candidateName = `${baseName}-${index + 1}`;
    }
    
    // Check for existing sessions with this name (including archived)
    let counter = 1;
    let uniqueName = candidateName;
    
    while (true) {
      // Check both active and archived sessions
      const existingSession = db.db.prepare(`
        SELECT id FROM sessions 
        WHERE (name = ? OR worktree_name = ?)
        LIMIT 1
      `).get(uniqueName, uniqueName);
      
      if (!existingSession) {
        break;
      }
      
      // If we already have an index, increment after the index
      if (index !== undefined) {
        uniqueName = `${baseName}-${index + 1}-${counter}`;
      } else {
        uniqueName = `${baseName}-${counter}`;
      }
      counter++;
    }
    
    return uniqueName;
  }

  async close() {
    await this.sessionQueue.close();
    await this.inputQueue.close();
    await this.continueQueue.close();
  }
}
import Bull from 'bull';
import { SimpleQueue } from './simpleTaskQueue';
import type { SessionManager } from './sessionManager';
import type { WorktreeManager } from './worktreeManager';
import { WorktreeNameGenerator } from './worktreeNameGenerator';
import type { ClaudeCodeManager } from './claudeCodeManager';
import type { GitDiffManager } from './gitDiffManager';
import type { ExecutionTracker } from './executionTracker';
import { formatForDisplay } from '../utils/timestampUtils';
import * as os from 'os';

interface TaskQueueOptions {
  sessionManager: SessionManager;
  worktreeManager: WorktreeManager;
  claudeCodeManager: ClaudeCodeManager;
  gitDiffManager: GitDiffManager;
  executionTracker: ExecutionTracker;
  worktreeNameGenerator: WorktreeNameGenerator;
  getMainWindow: () => Electron.BrowserWindow | null;
}

interface CreateSessionJob {
  prompt: string;
  worktreeTemplate: string;
  index?: number;
  permissionMode?: 'approve' | 'ignore';
  projectId?: number;
  folderId?: string;
  baseBranch?: string;
  autoCommit?: boolean;
  model?: string;
  commitMode?: 'structured' | 'checkpoint' | 'disabled';
  commitModeSettings?: string; // JSON string of CommitModeSettings
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
    
    // Determine concurrency based on platform
    // Linux has stricter PTY and file descriptor limits, so we reduce concurrency
    const isLinux = os.platform() === 'linux';
    const sessionConcurrency = isLinux ? 1 : 5;
    
    console.log(`[TaskQueue] Platform: ${os.platform()}, Session concurrency: ${sessionConcurrency}`);
    
    if (this.useSimpleQueue) {
      console.log('[TaskQueue] Using SimpleQueue for Electron environment');
      
      this.sessionQueue = new SimpleQueue<CreateSessionJob>('session-creation', sessionConcurrency);
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
    // Use platform-specific concurrency for session processing
    const isLinux = os.platform() === 'linux';
    const sessionConcurrency = isLinux ? 1 : 5;
    
    this.sessionQueue.process(sessionConcurrency, async (job) => {
      const { prompt, worktreeTemplate, index, permissionMode, projectId, baseBranch, autoCommit, model } = job.data;
      const { sessionManager, worktreeManager, claudeCodeManager } = this.options;

      console.log(`[TaskQueue] Processing session creation job ${job.id}`, { prompt, worktreeTemplate, index, permissionMode, projectId, baseBranch });

      try {
        let targetProject;
        
        if (projectId) {
          // Use the project specified in the job
          targetProject = sessionManager.getProjectById(projectId);
          if (!targetProject) {
            throw new Error(`Project with ID ${projectId} not found`);
          }
        } else {
          // Fall back to active project for backward compatibility
          targetProject = sessionManager.getActiveProject();
          if (!targetProject) {
            throw new Error('No project specified and no active project selected');
          }
        }

        let worktreeName = worktreeTemplate;
        
        // Generate a name if template is empty - but skip if we're in multi-session creation with index
        if (!worktreeName || worktreeName.trim() === '') {
          // If this is part of a multi-session creation (has index), the base name should have been generated already
          if (index !== undefined && index >= 0) {
            console.log(`[TaskQueue] Multi-session creation detected (index ${index}), using fallback name`);
            worktreeName = 'session';
          } else {
            console.log(`[TaskQueue] No worktree template provided, generating name from prompt...`);
            // Use the AI-powered name generator or smart fallback
            worktreeName = await this.options.worktreeNameGenerator.generateWorktreeName(prompt);
            console.log(`[TaskQueue] Generated base name: ${worktreeName}`);
          }
        }
        
        // Ensure uniqueness among all sessions (including archived)
        worktreeName = await this.ensureUniqueSessionName(worktreeName, index);
        
        console.log(`[TaskQueue] Creating worktree with name: ${worktreeName}`);
        console.log(`[TaskQueue] Target project:`, JSON.stringify({
          id: targetProject.id,
          name: targetProject.name,
          build_script: targetProject.build_script,
          run_script: targetProject.run_script
        }, null, 2));

        const { worktreePath, baseCommit, baseBranch: actualBaseBranch } = await worktreeManager.createWorktree(targetProject.path, worktreeName, undefined, baseBranch, targetProject.worktree_folder);
        console.log(`[TaskQueue] Worktree created at: ${worktreePath}`);
        console.log(`[TaskQueue] Base commit: ${baseCommit}, Base branch: ${actualBaseBranch}`);
        
        const sessionName = worktreeName;
        console.log(`[TaskQueue] Creating session in database`);
        
        const session = await sessionManager.createSession(
          sessionName,
          worktreePath,
          prompt,
          worktreeName,
          permissionMode,
          targetProject.id,
          false, // isMainRepo = false for regular sessions
          autoCommit,
          job.data.folderId,
          model,
          baseCommit,
          actualBaseBranch,
          job.data.commitMode,
          job.data.commitModeSettings
        );
        console.log(`[TaskQueue] Session created with ID: ${session.id}`);

        // Add the initial prompt marker
        sessionManager.addInitialPromptMarker(session.id, prompt);
        console.log(`[TaskQueue] Added initial prompt marker for session ${session.id}`);

        // Add the initial prompt to conversation messages for continuation support
        sessionManager.addConversationMessage(session.id, 'user', prompt);
        console.log(`[TaskQueue] Added initial prompt to conversation messages for session ${session.id}`);

        // Add the initial prompt to output so it's visible
        const timestamp = formatForDisplay(new Date());
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
        if (targetProject.build_script) {
          console.log(`[TaskQueue] Running build script for session ${session.id}`);
          
          // Add a "waiting for build" message to output
          const buildWaitingMessage = `\x1b[36m[${formatForDisplay(new Date())}]\x1b[0m \x1b[1m\x1b[33m⏳ Waiting for build script to complete...\x1b[0m\r\n\r\n`;
          await sessionManager.addSessionOutput(session.id, {
            type: 'stdout',
            data: buildWaitingMessage,
            timestamp: new Date()
          });
          
          const buildCommands = targetProject.build_script.split('\n').filter(cmd => cmd.trim());
          const buildResult = await sessionManager.runBuildScript(session.id, buildCommands, worktreePath);
          console.log(`[TaskQueue] Build script completed. Success: ${buildResult.success}`);
        }

        console.log(`[TaskQueue] Starting Claude Code for session ${session.id} with permission mode: ${permissionMode} and model: ${model}`);
        await claudeCodeManager.startSession(session.id, session.worktreePath, prompt, permissionMode, model);
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

  async createMultipleSessions(prompt: string, worktreeTemplate: string, count: number, permissionMode?: 'approve' | 'ignore', projectId?: number, baseBranch?: string, autoCommit?: boolean, model?: string, commitMode?: 'structured' | 'checkpoint' | 'disabled', commitModeSettings?: string): Promise<(Bull.Job<CreateSessionJob> | any)[]> {
    let folderId: string | undefined;
    let generatedBaseName: string | undefined;
    
    // Generate a name if no template provided
    if (!worktreeTemplate || worktreeTemplate.trim() === '') {
      try {
        generatedBaseName = await this.options.worktreeNameGenerator.generateWorktreeName(prompt);
        console.log(`[TaskQueue] Generated base name for multi-session: ${generatedBaseName}`);
      } catch (error) {
        console.error('[TaskQueue] Failed to generate worktree name:', error);
        generatedBaseName = 'multi-session';
      }
    }
    
    // Create a folder for multi-session prompts
    if (count > 1 && projectId) {
      try {
        const { sessionManager } = this.options;
        const db = (sessionManager as any).db;
        const folderName = worktreeTemplate || generatedBaseName || 'Multi-session prompt';
        
        console.log(`[TaskQueue] Creating folder for multi-session prompt. ProjectId: ${projectId}, type: ${typeof projectId}`);
        
        // Ensure projectId is a number
        const numericProjectId = typeof projectId === 'string' ? parseInt(projectId, 10) : projectId;
        if (isNaN(numericProjectId)) {
          throw new Error(`Invalid project ID: ${projectId}`);
        }
        
        const folder = db.createFolder(folderName, numericProjectId);
        folderId = folder.id;
        console.log(`[TaskQueue] Created folder "${folderName}" with ID ${folderId} for ${count} sessions`);
        
        // Emit folder created event immediately and wait for it to be processed
        const getMainWindow = this.options.getMainWindow;
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log(`[TaskQueue] Emitting folder:created event for folder ${folder.id}`);
          mainWindow.webContents.send('folder:created', folder);
          console.log(`[TaskQueue] folder:created event emitted successfully`);
          
          // Wait a bit to ensure the frontend has processed the folder event
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          console.warn(`[TaskQueue] Could not emit folder:created event - main window not available`);
        }
      } catch (error) {
        console.error('[TaskQueue] Failed to create folder for multi-session prompt:', error);
        // Continue without folder - sessions will be created at project level
      }
    }
    
    const jobs = [];
    for (let i = 0; i < count; i++) {
      // Use the generated base name if no template was provided
      const templateToUse = worktreeTemplate || generatedBaseName || '';
      jobs.push(this.sessionQueue.add({ prompt, worktreeTemplate: templateToUse, index: i, permissionMode, projectId, folderId, baseBranch, autoCommit, model, commitMode, commitModeSettings }));
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
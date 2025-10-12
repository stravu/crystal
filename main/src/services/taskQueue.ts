import Bull from 'bull';
import { SimpleQueue } from './simpleTaskQueue';
import { SessionManager } from './sessionManager';
import type { WorktreeManager } from './worktreeManager';
import { WorktreeNameGenerator } from './worktreeNameGenerator';
import type { AbstractCliManager } from './panels/cli/AbstractCliManager';
import type { GitDiffManager } from './gitDiffManager';
import type { ExecutionTracker } from './executionTracker';
import { formatForDisplay } from '../utils/timestampUtils';
import * as os from 'os';
import { panelManager } from './panelManager';
import { getCodexModelConfig } from '../../../shared/types/models';
import type { Session } from '../types/session';
import type { ToolPanel } from '../../../shared/types/panels';
import type { DatabaseService } from '../database/database';
import type { Project } from '../database/models';

interface TaskQueueOptions {
  sessionManager: SessionManager;
  worktreeManager: WorktreeManager;
  claudeCodeManager: AbstractCliManager;
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
  toolType?: 'claude' | 'codex' | 'none';
  commitMode?: 'structured' | 'checkpoint' | 'disabled';
  commitModeSettings?: string; // JSON string of CommitModeSettings
  codexConfig?: {
    model?: string;
    modelProvider?: string;
    approvalPolicy?: 'auto' | 'manual';
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
    webSearch?: boolean;
    thinkingLevel?: 'low' | 'medium' | 'high';
  };
  claudeConfig?: {
    model?: string;
    permissionMode?: 'approve' | 'ignore';
    ultrathink?: boolean;
  };
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
    this.sessionQueue.on('active', (...args: unknown[]) => {
      const job = args[0] as { id: string | number };
      // Job active tracking removed - verbose debug logging
    });
    
    this.sessionQueue.on('completed', (...args: unknown[]) => {
      const job = args[0] as { id: string | number };
      const result = args[1];
      // Job completion tracking removed - verbose debug logging
    });
    
    this.sessionQueue.on('failed', (...args: unknown[]) => {
      const job = args[0] as { id: string | number };
      const err = args[1] as Error;
      console.error(`[TaskQueue] Job ${job.id} failed:`, err);
    });
    
    this.sessionQueue.on('error', (...args: unknown[]) => {
      const error = args[0] as Error;
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
      const { prompt, worktreeTemplate, index, permissionMode, projectId, baseBranch, autoCommit, toolType, codexConfig, claudeConfig } = job.data;
      const { sessionManager, worktreeManager, claudeCodeManager } = this.options;

      // Processing session creation job - verbose debug logging removed

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
        let sessionName: string;
        
        // Generate a name if template is empty - but skip if we're in multi-session creation with index
        if (!worktreeName || worktreeName.trim() === '') {
          // If this is part of a multi-session creation (has index), the base name should have been generated already
          if (index !== undefined && index >= 0) {
            // Multi-session creation detected - verbose debug logging removed
            worktreeName = 'session';
            sessionName = 'Session';
          } else {
            // No worktree template provided - verbose debug logging removed
            // Use the AI-powered name generator to generate a session name with spaces
            sessionName = await this.options.worktreeNameGenerator.generateSessionName(prompt);
            // Convert the session name to a worktree name (spaces to hyphens)
            worktreeName = sessionName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            // Generated names - verbose debug logging removed
          }
        } else {
          // If we have a worktree template, use it as the session name as-is
          sessionName = worktreeName;
          
          // For the worktree name, replace spaces with hyphens and make it lowercase
          // but keep hyphens that are already there
          if (worktreeName.includes(' ')) {
            worktreeName = worktreeName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          } else {
            // Already a valid worktree name format (no spaces), just clean it up
            worktreeName = worktreeName.toLowerCase().replace(/[^a-z0-9-]/g, '');
          }
        }
        
        // Ensure uniqueness for both names
        const { sessionName: uniqueSessionName, worktreeName: uniqueWorktreeName } = 
          await this.ensureUniqueNames(sessionName, worktreeName, targetProject, index);
        sessionName = uniqueSessionName;
        worktreeName = uniqueWorktreeName;
        

        const { worktreePath, baseCommit, baseBranch: actualBaseBranch } = await worktreeManager.createWorktree(targetProject.path, worktreeName, undefined, baseBranch, targetProject.worktree_folder || undefined);

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
          toolType,
          baseCommit,
          actualBaseBranch,
          job.data.commitMode,
          job.data.commitModeSettings
        );
        
        // Attach codexConfig to the session object for the panel creation in events.ts
        if (codexConfig) {
          (session as Session & { codexConfig?: typeof codexConfig }).codexConfig = codexConfig;
        }
        
        // Attach claudeConfig to the session object for the panel creation in events.ts
        if (claudeConfig) {
          (session as Session & { claudeConfig?: typeof claudeConfig }).claudeConfig = claudeConfig;
        }

        // Only add prompt-related data if there's actually a prompt
        if (prompt && prompt.trim().length > 0) {
          // Add the initial prompt marker
          sessionManager.addInitialPromptMarker(session.id, prompt);

          // Add the initial prompt to conversation messages for continuation support
          sessionManager.addConversationMessage(session.id, 'user', prompt);

          // Add the initial prompt to output so it's visible
          const timestamp = formatForDisplay(new Date());
          const initialPromptDisplay = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[42m\x1b[30m 👤 USER PROMPT \x1b[0m\r\n` +
                                       `\x1b[1m\x1b[92m${prompt}\x1b[0m\r\n\r\n`;
          await sessionManager.addSessionOutput(session.id, {
            type: 'stdout',
            data: initialPromptDisplay,
            timestamp: new Date()
          });
        } else {
        }
        
        // Ensure diff panel exists for this session
        await panelManager.ensureDiffPanel(session.id);

        // Emit the session-created event BEFORE running build script so UI shows immediately
        sessionManager.emitSessionCreated(session);

        // Run build script after session is visible in UI
        if (targetProject.build_script) {
          console.log(`[TaskQueue] Running build script for session ${session.id}`);

          // Update status message
          sessionManager.updateSessionStatus(session.id, 'initializing', 'Running build script...');

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

        // Only start an AI panel if there's a prompt
        if (prompt && prompt.trim().length > 0) {
          const resolvedToolType: 'claude' | 'codex' | 'none' = toolType || 'claude';

          if (resolvedToolType === 'codex') {
            // Update status message
            sessionManager.updateSessionStatus(session.id, 'initializing', 'Starting Codex...');

            // Wait for the Codex panel to be created by the session-created event handler in events.ts
            let codexPanel = null;
            let attempts = 0;
            const maxAttempts = 15;

            while (!codexPanel && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 200));
              const { panelManager } = require('./panelManager');
              const existingPanels = panelManager.getPanelsForSession(session.id);
              codexPanel = existingPanels.find((p: ToolPanel) => p.type === 'codex');
              attempts++;
            }

            if (codexPanel) {
              const { codexPanelManager } = require('../ipc/codexPanel');
              if (codexPanelManager) {
                try {
                  // Record initial prompt in panel conversation history
                  try {
                    sessionManager.addPanelConversationMessage(codexPanel.id, 'user', prompt);
                  } catch (e) {
                    console.warn('[TaskQueue] Failed to add initial panel conversation message:', e);
                  }

                  await codexPanelManager.startPanel(
                    codexPanel.id,
                    session.worktreePath,
                    prompt,
                    codexConfig?.model,
                    codexConfig?.modelProvider,
                    codexConfig?.approvalPolicy,
                    codexConfig?.sandboxMode,
                    codexConfig?.webSearch,
                    codexConfig?.thinkingLevel
                  );
                } catch (error) {
                  console.error('[TaskQueue] Failed to start Codex via panel manager:', error);
                  throw new Error(`Failed to start Codex panel: ${error}`);
                }
              } else {
                console.error('[TaskQueue] CodexPanelManager not available, cannot start Codex');
                throw new Error('Codex panel manager not available');
              }
            } else {
              console.error(`[TaskQueue] No Codex panel found for session ${session.id} after ${maxAttempts} attempts`);
              console.error('[TaskQueue] This indicates the panel creation failed in events.ts.');
              throw new Error('No Codex panel found - cannot start Codex without a real panel ID');
            }
          } else if (resolvedToolType === 'claude') {
            // Update status message
            sessionManager.updateSessionStatus(session.id, 'initializing', 'Starting Claude Code...');

            // Wait for the Claude panel to be created by the session-created event handler in events.ts
            let claudePanel = null;
            let attempts = 0;
            const maxAttempts = 15; // Increased attempts for better reliability

            while (!claudePanel && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
              const { panelManager } = require('./panelManager');
              const existingPanels = panelManager.getPanelsForSession(session.id);
              claudePanel = existingPanels.find((p: ToolPanel) => p.type === 'claude');
              attempts++;
            }

            if (claudePanel) {
              // Import the claude panel manager to start Claude properly
              const { claudePanelManager } = require('../ipc/claudePanel');

              if (claudePanelManager) {
                try {
                  // Record the initial prompt in panel conversation history
                  try {
                    sessionManager.addPanelConversationMessage(claudePanel.id, 'user', prompt);
                  } catch (e) {
                    console.warn('[TaskQueue] Failed to add initial panel conversation message:', e);
                  }

                  // Use the claude panel manager directly instead of calling IPC handlers
                  // Model is now managed at panel level
                  const modelToUse = claudeConfig?.model || 'auto';
                  await claudePanelManager.startPanel(claudePanel.id, session.worktreePath, prompt, permissionMode, modelToUse);
                } catch (error) {
                  console.error(`[TaskQueue] Failed to start Claude via panel manager:`, error);
                  throw new Error(`Failed to start Claude panel: ${error}`);
                }
              } else {
                console.error(`[TaskQueue] ClaudePanelManager not available, cannot start with real panel ID`);
                throw new Error('Claude panel manager not available');
              }
            } else {
              console.error(`[TaskQueue] No Claude panel found for session ${session.id} after ${maxAttempts} attempts`);
              throw new Error('No Claude panel found - cannot start Claude without a real panel ID');
            }
          } else if (resolvedToolType === 'none') {
            // No AI tool selected - update session status to stopped
            console.log(`[TaskQueue] Session ${session.id} has no AI tool configured, marking as stopped`);
            await sessionManager.updateSession(session.id, { status: 'stopped', statusMessage: undefined });

            // Add an informational message to the output
            const timestamp = formatForDisplay(new Date());
            const noToolMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[90m ℹ️  NO AI TOOL CONFIGURED \x1b[0m\r\n` +
                                  `\x1b[90mThis session was created without an AI tool.\x1b[0m\r\n` +
                                  `\x1b[90mYou can use the terminal and other features without AI assistance.\x1b[0m\r\n\r\n`;
            await sessionManager.addSessionOutput(session.id, {
              type: 'stdout',
              data: noToolMessage,
              timestamp: new Date()
            });
          }
        } else {
          // No prompt provided - update session status to stopped if toolType is 'none'
          const resolvedToolType: 'claude' | 'codex' | 'none' = toolType || 'claude';
          if (resolvedToolType === 'none') {
            console.log(`[TaskQueue] Session ${session.id} has no prompt and no AI tool, marking as stopped`);
            await sessionManager.updateSession(session.id, { status: 'stopped', statusMessage: undefined });
          }
        }

        return { sessionId: session.id };
      } catch (error) {
        console.error(`[TaskQueue] Failed to create session:`, error);
        throw error;
      }
    });

    this.inputQueue.process(10, async (job) => {
      const { sessionId, input } = job.data;
      
      // Find the Claude panel for this session
      const { panelManager } = require('./panelManager');
      const existingPanels = panelManager.getPanelsForSession(sessionId);
      const claudePanel = existingPanels.find((p: ToolPanel) => p.type === 'claude');
      
      if (!claudePanel) {
        throw new Error(`No Claude panel found for session ${sessionId}`);
      }

      // Use the claude panel manager instead of the legacy session-based approach
      const { claudePanelManager } = require('../ipc/claudePanel');
      
      if (!claudePanelManager) {
        throw new Error('Claude panel manager not available');
      }

      claudePanelManager.sendInputToPanel(claudePanel.id, input);
    });

    this.continueQueue.process(10, async (job) => {
      const { sessionId, prompt } = job.data;
      const { sessionManager } = this.options;
      
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Find the Claude panel for this session
      const { panelManager } = require('./panelManager');
      const existingPanels = panelManager.getPanelsForSession(sessionId);
      const claudePanel = existingPanels.find((p: ToolPanel) => p.type === 'claude');
      
      if (!claudePanel) {
        throw new Error(`No Claude panel found for session ${sessionId}`);
      }

      // Use the claude panel manager instead of the legacy session-based approach
      const { claudePanelManager } = require('../ipc/claudePanel');
      
      if (!claudePanelManager) {
        throw new Error('Claude panel manager not available');
      }

      // Get conversation history using panel-based method for Claude data
      const conversationHistory = sessionManager.getPanelConversationMessages ? 
        await sessionManager.getPanelConversationMessages(claudePanel.id) :
        await sessionManager.getConversationMessages(sessionId);

      await claudePanelManager.continuePanel(claudePanel.id, session.worktreePath, prompt, conversationHistory);
    });
  }

  async createSession(data: CreateSessionJob): Promise<Bull.Job<CreateSessionJob> | { id: string; data: CreateSessionJob; status: string }> {
    const job = await this.sessionQueue.add(data);
    return job;
  }

  async createMultipleSessions(
    prompt: string,
    worktreeTemplate: string,
    count: number,
    permissionMode?: 'approve' | 'ignore',
    projectId?: number,
    baseBranch?: string,
    autoCommit?: boolean,
    toolType?: 'claude' | 'codex' | 'none',
    commitMode?: 'structured' | 'checkpoint' | 'disabled',
    commitModeSettings?: string,
    codexConfig?: {
      model?: string;
      modelProvider?: string;
      approvalPolicy?: 'auto' | 'manual';
      sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
      webSearch?: boolean;
      thinkingLevel?: 'low' | 'medium' | 'high';
    },
    claudeConfig?: {
      model?: string;
      permissionMode?: 'approve' | 'ignore';
      ultrathink?: boolean;
    },
    providedFolderId?: string
  ): Promise<(Bull.Job<CreateSessionJob> | { id: string; data: CreateSessionJob; status: string })[]> {
    let folderId: string | undefined = providedFolderId;
    let generatedBaseName: string | undefined;
    
    // Generate a name if no template provided
    if (!worktreeTemplate || worktreeTemplate.trim() === '') {
      try {
        generatedBaseName = await this.options.worktreeNameGenerator.generateWorktreeName(prompt);
      } catch (error) {
        console.error('[TaskQueue] Failed to generate worktree name:', error);
        generatedBaseName = 'multi-session';
      }
    }
    
    // Create a folder for multi-session prompts (only if not already provided)
    if (!providedFolderId && count > 1 && projectId) {
      try {
        const { sessionManager } = this.options;
        const db = sessionManager.db as DatabaseService;
        const folderName = worktreeTemplate || generatedBaseName || 'Multi-session prompt';
        
        // Ensure projectId is a number
        const numericProjectId = typeof projectId === 'string' ? parseInt(projectId, 10) : projectId;
        if (isNaN(numericProjectId)) {
          throw new Error(`Invalid project ID: ${projectId}`);
        }
        
        const folder = db.createFolder(folderName, numericProjectId);
        folderId = folder.id;
        
        // Emit folder created event immediately and wait for it to be processed
        const getMainWindow = this.options.getMainWindow;
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('folder:created', folder);
          
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
      jobs.push(this.sessionQueue.add({ prompt, worktreeTemplate: templateToUse, index: i, permissionMode, projectId, folderId, baseBranch, autoCommit, toolType, commitMode, commitModeSettings, codexConfig, claudeConfig }));
    }
    return Promise.all(jobs);
  }

  async sendInput(sessionId: string, input: string): Promise<Bull.Job<SendInputJob> | { id: string; data: SendInputJob; status: string }> {
    return this.inputQueue.add({ sessionId, input });
  }

  async continueSession(sessionId: string, prompt: string): Promise<Bull.Job<ContinueSessionJob> | { id: string; data: ContinueSessionJob; status: string }> {
    return this.continueQueue.add({ sessionId, prompt });
  }

  private async ensureUniqueSessionName(baseName: string, index?: number): Promise<string> {
    const { sessionManager } = this.options;
    const db = sessionManager.db;
    
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
      if (!db.checkSessionNameExists(uniqueName)) {
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

  private async ensureUniqueNames(baseSessionName: string, baseWorktreeName: string, project: Project, index?: number): Promise<{ sessionName: string; worktreeName: string }> {
    const { sessionManager, worktreeManager } = this.options;
    const db = sessionManager.db;
    
    let candidateSessionName = baseSessionName;
    let candidateWorktreeName = baseWorktreeName;
    
    // Add index suffix if provided (for multiple sessions)
    if (index !== undefined) {
      candidateSessionName = `${baseSessionName} ${index + 1}`;
      candidateWorktreeName = `${baseWorktreeName}-${index + 1}`;
    }
    
    // Check for existing sessions with these names (including archived)
    let counter = 1;
    let uniqueSessionName = candidateSessionName;
    let uniqueWorktreeName = candidateWorktreeName;
    
    while (true) {
      // Check session name and worktree name separately using public methods
      // This is important because different session names could map to the same worktree name
      // e.g., "Fix Auth Bug" and "Fix-Auth-Bug" both become "fix-auth-bug"
      const sessionNameExists = db.checkSessionNameExists(uniqueSessionName);
      const worktreeNameExists = db.checkSessionNameExists(uniqueWorktreeName);
      
      // Check if worktree directory exists on filesystem
      // This handles cases where a worktree was created outside of Crystal
      let worktreePathExists = false;
      try {
        if (project) {
          const path = require('path');
          const fs = require('fs');
          const worktreeFolder = project.worktree_folder || 'worktrees';
          const worktreePath = path.join(project.path, worktreeFolder, uniqueWorktreeName);
          worktreePathExists = fs.existsSync(worktreePath);
        }
      } catch (e) {
        // Ignore filesystem check errors
      }
      
      // All must be unique (session name, worktree name in DB, and no filesystem conflict)
      if (!sessionNameExists && !worktreeNameExists && !worktreePathExists) {
        break;
      }
      
      // If any is taken, increment both to keep them in sync
      if (index !== undefined) {
        uniqueSessionName = `${baseSessionName} ${index + 1} ${counter}`;
        uniqueWorktreeName = `${baseWorktreeName}-${index + 1}-${counter}`;
      } else {
        uniqueSessionName = `${baseSessionName} ${counter}`;
        uniqueWorktreeName = `${baseWorktreeName}-${counter}`;
      }
      counter++;
    }
    
    return { sessionName: uniqueSessionName, worktreeName: uniqueWorktreeName };
  }

  async close() {
    await this.sessionQueue.close();
    await this.inputQueue.close();
    await this.continueQueue.close();
  }
}

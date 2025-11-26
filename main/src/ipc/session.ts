import { IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { AppServices } from './types';
import type { CreateSessionRequest } from '../types/session';
import { getCrystalSubdirectory } from '../utils/crystalDirectory';
import { convertDbFolderToFolder } from './folders';
import { panelManager } from '../services/panelManager';
import { 
  validateSessionExists, 
  validatePanelSessionOwnership, 
  validatePanelExists,
  validateSessionIsActive,
  logValidationFailure,
  createValidationError
} from '../utils/sessionValidation';
import type { SerializedArchiveTask } from '../services/archiveProgressManager';

export function registerSessionHandlers(ipcMain: IpcMain, services: AppServices): void {
  const {
    sessionManager,
    databaseService,
    taskQueue,
    worktreeManager,
    cliManagerFactory,
    claudeCodeManager, // For backward compatibility
    worktreeNameGenerator,
    gitStatusManager,
    archiveProgressManager
  } = services;

  // Helper function to get CLI manager for a specific tool
  // TODO: This will be used in the future to support multiple CLI tools
  const getCliManager = async (toolId: string = 'claude') => {
    try {
      return await cliManagerFactory.createManager(toolId, {
        sessionManager,
        additionalOptions: {}
      });
    } catch (error) {
      console.warn(`Failed to get CLI manager for ${toolId}, falling back to default:`, error);
      return claudeCodeManager; // Fallback to default for backward compatibility
    }
  };

  // NOTE: Current IPC handlers use claudeCodeManager directly for backward compatibility
  // Future versions will use getCliManager() to support multiple CLI tools dynamically

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

  ipcMain.handle('sessions:get-all-with-projects', async () => {
    try {
      const allProjects = databaseService.getAllProjects();
      const projectsWithSessions = allProjects.map(project => {
        const sessions = sessionManager.getSessionsForProject(project.id);
        const folders = databaseService.getFoldersForProject(project.id);
        const convertedFolders = folders.map(convertDbFolderToFolder);
        return {
          ...project,
          sessions,
          folders: convertedFolders
        };
      });
      return { success: true, data: projectsWithSessions };
    } catch (error) {
      console.error('Failed to get sessions with projects:', error);
      return { success: false, error: 'Failed to get sessions with projects' };
    }
  });

  ipcMain.handle('sessions:get-archived-with-projects', async () => {
    try {
      const allProjects = databaseService.getAllProjects();
      const projectsWithArchivedSessions = allProjects.map(project => {
        const archivedSessions = databaseService.getArchivedSessions(project.id);
        return {
          ...project,
          sessions: archivedSessions,
          folders: [] // Archived sessions don't need folders
        };
      }).filter(project => project.sessions.length > 0); // Only include projects with archived sessions
      return { success: true, data: projectsWithArchivedSessions };
    } catch (error) {
      console.error('Failed to get archived sessions with projects:', error);
      return { success: false, error: 'Failed to get archived sessions with projects' };
    }
  });

  ipcMain.handle('sessions:create', async (_event, request: CreateSessionRequest) => {
    try {
      let targetProject;

      if (request.projectId) {
        // Use the project specified in the request
        targetProject = databaseService.getProject(request.projectId);
        if (!targetProject) {
          return { success: false, error: 'Project not found' };
        }
      } else {
        // Fall back to active project for backward compatibility
        targetProject = sessionManager.getActiveProject();
        if (!targetProject) {
          console.warn('[IPC] No project specified and no active project found');
          return { success: false, error: 'No project specified. Please provide a projectId.' };
        }
      }

      if (!taskQueue) {
        console.error('[IPC] Task queue not initialized');
        return { success: false, error: 'Task queue not initialized' };
      }

      const count = request.count || 1;

      if (count > 1) {
        const jobs = await taskQueue.createMultipleSessions(
          request.prompt,
          request.worktreeTemplate || '',
          count,
          request.permissionMode,
          targetProject.id,
          request.baseBranch,
          request.autoCommit,
          request.toolType,
          request.commitMode,
          request.commitModeSettings,
          request.codexConfig,
          request.claudeConfig,
          request.folderId
        );

        // Note: Model is now stored at panel level, not session level

        return { success: true, data: { jobIds: jobs.map(job => job.id) } };
      } else {
        const job = await taskQueue.createSession({
          prompt: request.prompt,
          worktreeTemplate: request.worktreeTemplate || '',
          permissionMode: request.permissionMode,
          projectId: targetProject.id,
          folderId: request.folderId,
          baseBranch: request.baseBranch,
          autoCommit: request.autoCommit,
          toolType: request.toolType,
          commitMode: request.commitMode,
          commitModeSettings: request.commitModeSettings,
          codexConfig: request.codexConfig,
          claudeConfig: request.claudeConfig
        });

        // Note: Model is now stored at panel level, not session level

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
        const gitError = error as Error & { gitCommand?: string; cmd?: string; gitOutput?: string; stderr?: string };
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
      // Get database session details before archiving (includes worktree_name and project_id)
      const dbSession = databaseService.getSession(sessionId);
      if (!dbSession) {
        return { success: false, error: 'Session not found' };
      }
      
      // Check if session is already archived
      if (dbSession.archived) {
        return { success: false, error: 'Session is already archived' };
      }

      // Add a message to session output about archiving
      const timestamp = new Date().toLocaleTimeString();
      let archiveMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 📦 ARCHIVING SESSION \x1b[0m\r\n`;
      archiveMessage += `\x1b[90mSession will be archived and removed from the active sessions list.\x1b[0m\r\n`;

      // Archive the session immediately to provide fast feedback to the user
      await sessionManager.archiveSession(sessionId);

      // Add the archive message to session output
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: archiveMessage,
        timestamp: new Date()
      });

      // Create cleanup callback for background operations
      const cleanupCallback = async () => {
        let cleanupMessage = '';
        
        // Clean up the worktree if session has one (but not for main repo sessions)
        if (dbSession.worktree_name && dbSession.project_id && !dbSession.is_main_repo) {
          const project = databaseService.getProject(dbSession.project_id);
          if (project) {
            try {
              // Update progress: removing worktree
              if (archiveProgressManager) {
                archiveProgressManager.updateTaskStatus(sessionId, 'removing-worktree');
              }

              // Pass session creation date for analytics tracking
              const sessionCreatedAt = dbSession.created_at ? new Date(dbSession.created_at) : undefined;
              await worktreeManager.removeWorktree(project.path, dbSession.worktree_name, project.worktree_folder || undefined, sessionCreatedAt);

              cleanupMessage += `\x1b[32m✓ Worktree removed successfully\x1b[0m\r\n`;
            } catch (worktreeError) {
              // Log the error but don't fail
              console.error(`[Main] Failed to remove worktree ${dbSession.worktree_name}:`, worktreeError);
              cleanupMessage += `\x1b[33m⚠ Failed to remove worktree (manual cleanup may be needed)\x1b[0m\r\n`;
              
              // Update progress: failed
              if (archiveProgressManager) {
                archiveProgressManager.updateTaskStatus(sessionId, 'failed', 'Failed to remove worktree');
              }
            }
          }
        }

        // Clean up session artifacts (images)
        const artifactsDir = getCrystalSubdirectory('artifacts', sessionId);
        if (existsSync(artifactsDir)) {
          try {
            // Update progress: cleaning artifacts
            if (archiveProgressManager) {
              archiveProgressManager.updateTaskStatus(sessionId, 'cleaning-artifacts');
            }
            
            await fs.rm(artifactsDir, { recursive: true, force: true });
            
            cleanupMessage += `\x1b[32m✓ Artifacts removed successfully\x1b[0m\r\n`;
          } catch (artifactsError) {
            console.error(`[Main] Failed to remove artifacts for session ${sessionId}:`, artifactsError);
            cleanupMessage += `\x1b[33m⚠ Failed to remove artifacts (manual cleanup may be needed)\x1b[0m\r\n`;
          }
        }

        // If there were any cleanup messages, add them to the session output
        if (cleanupMessage) {
          sessionManager.addSessionOutput(sessionId, {
            type: 'stdout',
            data: cleanupMessage,
            timestamp: new Date()
          });
        }
      };

      // Queue the cleanup task if we have worktree cleanup to do
      if (dbSession.worktree_name && dbSession.project_id && !dbSession.is_main_repo) {
        const project = databaseService.getProject(dbSession.project_id);
        if (project && archiveProgressManager) {
          archiveProgressManager.addTask(
            sessionId,
            dbSession.name,
            dbSession.worktree_name,
            project.name,
            cleanupCallback
          );
        }
      } else {
        // No worktree cleanup needed, just run artifact cleanup immediately
        setImmediate(() => cleanupCallback());
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to delete session:', error);
      return { success: false, error: 'Failed to delete session' };
    }
  });

  ipcMain.handle('sessions:input', async (_event, sessionId: string, input: string) => {
    try {
      // Validate session exists and is active
      const sessionValidation = validateSessionIsActive(sessionId);
      if (!sessionValidation.valid) {
        logValidationFailure('sessions:input', sessionValidation);
        return createValidationError(sessionValidation);
      }

      // Update session status back to running when user sends input
      const currentSession = await sessionManager.getSession(sessionId);
      if (currentSession && currentSession.status === 'waiting') {
        console.log(`[Main] User sent input to session ${sessionId}, updating status to 'running'`);
        await sessionManager.updateSession(sessionId, { status: 'running' });
      }

      // Store user input in session outputs for persistence
      const userInputDisplay = `> ${input.trim()}\n`;
      await sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: userInputDisplay,
        timestamp: new Date()
      });

      // Check if session uses structured commit mode and enhance the input
      let finalInput = input;
      const dbSession = databaseService.getSession(sessionId);
      if (dbSession?.commit_mode === 'structured') {
        console.log(`[IPC] Session ${sessionId} uses structured commit mode, enhancing input`);
        
        // Parse commit mode settings
        let commitModeSettings;
        try {
          commitModeSettings = dbSession.commit_mode_settings ? 
            JSON.parse(dbSession.commit_mode_settings) : 
            { mode: 'structured' };
        } catch (e) {
          console.error(`[IPC] Failed to parse commit mode settings:`, e);
          commitModeSettings = { mode: 'structured' };
        }
        
        // Get structured prompt template from settings or use default
        const { DEFAULT_STRUCTURED_PROMPT_TEMPLATE } = require('../../../shared/types');
        const structuredPromptTemplate = commitModeSettings?.structuredPromptTemplate || DEFAULT_STRUCTURED_PROMPT_TEMPLATE;
        
        // Add structured commit instructions to the input
        finalInput = `${input}\n\n${structuredPromptTemplate}`;
        console.log(`[IPC] Added structured commit instructions to input`);
      }

      // Get session to determine tool type
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Determine which tool type to use for panel operations
      const sessionToolType = session.toolType || 'claude'; // Default to claude for backward compatibility
      
      // Panel Integration: Find or create appropriate panel for input based on session's tool type
      console.log(`[IPC] Checking for ${sessionToolType} panels for session ${sessionId}`);
      const inputPanels = panelManager.getPanelsForSession(sessionId);
      const inputToolPanels = inputPanels.filter(p => p.type === sessionToolType);
      
      if (inputToolPanels.length === 0 && sessionToolType !== 'none') {
        console.log(`[IPC] No ${sessionToolType} panel found, creating one for session ${sessionId}`);
        try {
          const panelTitle = sessionToolType === 'codex' ? 'Codex' : 'Claude';
          await panelManager.createPanel({
            sessionId: sessionId,
            type: sessionToolType as 'claude' | 'codex',
            title: panelTitle
          });
          console.log(`[IPC] Created ${sessionToolType} panel for session ${sessionId}`);
        } catch (error) {
          console.error(`[IPC] Failed to create ${sessionToolType} panel for session ${sessionId}:`, error);
          // Continue without panel - fallback to session-level handling
        }
      } else if (sessionToolType !== 'none') {
        console.log(`[IPC] Found ${inputToolPanels.length} ${sessionToolType} panel(s) for session ${sessionId}`);
      }

      // Handle based on tool type
      if (sessionToolType === 'codex') {
        // For Codex sessions, route through the Codex panel manager
        console.log(`[IPC] Session ${sessionId} is a Codex session - routing to Codex panel`);
        
        // Get Codex panels for this session after potential creation
        const postCreateCodexPanels = panelManager.getPanelsForSession(sessionId).filter(p => p.type === 'codex');
        
        if (postCreateCodexPanels.length === 0) {
          console.error(`[IPC] No Codex panels found for session ${sessionId} after creation attempt`);
          return { success: false, error: 'No Codex panels found for session' };
        }
        
        // Use the first Codex panel
        const codexPanel = postCreateCodexPanels[0];
        console.log(`[IPC] Using Codex panel ${codexPanel.id} for input to session ${sessionId}`);
        
        // Get Codex manager instance
        const { cliManagerFactory } = require('../services/cliManagerFactory');
        const codexManager = cliManagerFactory.getCodexManager();
        
        if (!codexManager) {
          console.error(`[IPC] Codex manager not available`);
          return { success: false, error: 'Codex manager not available' };
        }
        
        // Check if Codex is running for this panel
        const isCodexRunning = codexManager.isPanelRunning(codexPanel.id);
        
        if (!isCodexRunning) {
          console.log(`[IPC] Codex not running for panel ${codexPanel.id}, starting it now...`);
          
          // Start Codex via the panel with the input as the initial prompt (finalInput already includes structured commit enhancement)
          await codexManager.startPanel(codexPanel.id, sessionId, session.worktreePath, finalInput);
          
          // Update session status to running
          await sessionManager.updateSession(sessionId, { status: 'running' });
        } else {
          console.log(`[IPC] Codex already running for panel ${codexPanel.id}, continuing conversation...`);
          
          // Continue the Codex conversation with the new input (finalInput already includes structured commit enhancement)
          await codexManager.continuePanel(codexPanel.id, sessionId, session.worktreePath, finalInput, []);
          
          // Update session status to running
          await sessionManager.updateSession(sessionId, { status: 'running' });
        }
        
        return { success: true };
      }
      
      if (sessionToolType === 'none') {
        console.log(`[IPC] Session ${sessionId} has no tool type - cannot send input`);
        return { success: false, error: 'Session has no tool configured' };
      }

      // Get Claude panels for this session after potential creation (only for Claude sessions)
      const postCreatePanels = panelManager.getPanelsForSession(sessionId);
      const postCreateClaudePanels = postCreatePanels.filter(p => p.type === 'claude');
      
      if (postCreateClaudePanels.length === 0) {
        console.error(`[IPC] No Claude panels found for session ${sessionId} after creation attempt`);
        return { success: false, error: 'No Claude panels found for session' };
      }
      
      // Use the first Claude panel (in most cases there will be only one)
      const claudePanel = postCreateClaudePanels[0];
      console.log(`[IPC] Using Claude panel ${claudePanel.id} for input to session ${sessionId}`);
      
      // Check if Claude Code is running for this panel
      // TODO: In the future, this should detect the panel's CLI tool type and get the appropriate manager
      const isClaudeRunning = claudeCodeManager.isPanelRunning(claudePanel.id);
      
      if (!isClaudeRunning) {
        console.log(`[IPC] Claude Code not running for panel ${claudePanel.id}, starting it now...`);
        
        // Session already fetched above, no need to fetch again
        
        // Start Claude Code via the panel with the input as the initial prompt
        await claudeCodeManager.startPanel(claudePanel.id, sessionId, session.worktreePath, finalInput, session.permissionMode);
        
        // Update session status to running
        await sessionManager.updateSession(sessionId, { status: 'running' });
      } else {
        // Claude Code is already running, just send the input to the panel
        claudeCodeManager.sendInput(claudePanel.id, finalInput);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to send input:', error);
      return { success: false, error: 'Failed to send input' };
    }
  });

  ipcMain.handle('sessions:get-or-create-main-repo', async (_event, projectId: number) => {
    try {
      console.log('[IPC] sessions:get-or-create-main-repo handler called with projectId:', projectId);

      // Get or create the main repo session
      const session = await sessionManager.getOrCreateMainRepoSession(projectId);

      // If it's a newly created session, just emit the created event
      const dbSession = databaseService.getSession(session.id);
      if (dbSession && dbSession.status === 'pending') {
        console.log('[IPC] New main repo session created:', session.id);

        // Emit session created event
        sessionManager.emitSessionCreated(session);

        // Set the status to stopped since Claude Code isn't running yet
        sessionManager.updateSession(session.id, { status: 'stopped' });
      }

      return { success: true, data: session };
    } catch (error) {
      console.error('Failed to get or create main repo session:', error);
      return { success: false, error: 'Failed to get or create main repo session' };
    }
  });

  ipcMain.handle('sessions:continue', async (_event, sessionId: string, prompt?: string, model?: string) => {
    try {
      // Validate session exists and is active
      const sessionValidation = validateSessionIsActive(sessionId);
      if (!sessionValidation.valid) {
        logValidationFailure('sessions:continue', sessionValidation);
        return createValidationError(sessionValidation);
      }

      // Get session details
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Determine tool type for this session
      const sessionToolType = session.toolType || 'claude'; // Default to claude for backward compatibility
      
      // For Codex sessions, continuing is not supported
      if (sessionToolType === 'codex') {
        console.log(`[IPC] Session ${sessionId} is a Codex session - continue not supported`);
        return { success: false, error: 'Continue not supported for Codex sessions. Use the Codex panel interface.' };
      }
      
      if (sessionToolType === 'none') {
        console.log(`[IPC] Session ${sessionId} has no tool type - cannot continue`);
        return { success: false, error: 'Session has no tool configured' };
      }

      // Check if Claude is already running for this session to prevent duplicate starts
      if (claudeCodeManager.isSessionRunning(sessionId)) {
        console.log(`[IPC] Session ${sessionId} is already running, preventing duplicate continue`);
        return { success: false, error: 'Session is already processing a request' };
      }

      // Claude Panel Integration: Find or create Claude panel for continuation (only for Claude sessions)
      if (prompt) {
        console.log(`[IPC] Checking for Claude panels for session ${sessionId}`);
        const continuePanels = panelManager.getPanelsForSession(sessionId);
        const continueClaudePanels = continuePanels.filter(p => p.type === 'claude');
        
        if (continueClaudePanels.length === 0) {
          console.log(`[IPC] No Claude panel found, creating one for session ${sessionId}`);
          try {
            console.log('[IPC] Routing panels:continue to ClaudePanelManager.continuePanel');
            await panelManager.createPanel({
              sessionId: sessionId,
              type: 'claude',
              title: 'Claude'
            });
            console.log(`[IPC] Created Claude panel for session ${sessionId}`);
          } catch (error) {
            console.error(`[IPC] Failed to create Claude panel for session ${sessionId}:`, error);
            // Continue without panel - fallback to session-level handling
          }
        } else {
          console.log(`[IPC] Found ${continueClaudePanels.length} Claude panel(s) for session ${sessionId}`);
          // Route to panel-based handler if panels exist  
          // For now, continue with session-level handling but panels will handle the UI
        }
      }

      // MIGRATION FIX: Get conversation history using appropriate method
      const continuePanelsAfterCheck = panelManager.getPanelsForSession(sessionId);
      const continueClaudePanelsAfterCheck = continuePanelsAfterCheck.filter(p => p.type === 'claude');
      
      let conversationHistory;
      if (continueClaudePanelsAfterCheck.length > 0 && sessionManager.getPanelConversationMessages) {
        // Use panel-based method for migrated sessions
        console.log(`[IPC] Using panel-based conversation history for session ${sessionId} with Claude panel ${continueClaudePanelsAfterCheck[0].id}`);
        conversationHistory = sessionManager.getPanelConversationMessages(continueClaudePanelsAfterCheck[0].id);
      } else {
        // Use session-based method for non-migrated sessions
        conversationHistory = sessionManager.getConversationMessages(sessionId);
      }

      // If no prompt provided, use empty string (for resuming)
      const continuePrompt = prompt || '';

      // Check if this is a main repo session that hasn't started Claude Code yet
      const dbSession = databaseService.getSession(sessionId);
      const isMainRepoFirstStart = dbSession?.is_main_repo && conversationHistory.length === 0 && continuePrompt;

      // Update session status to initializing and clear run_started_at
      sessionManager.updateSession(sessionId, {
        status: 'initializing',
        run_started_at: null // Clear previous run time
      });

      if (isMainRepoFirstStart && continuePrompt) {
        // First message in main repo session - start Claude Code without --resume
        console.log(`[IPC] Starting Claude Code for main repo session ${sessionId} with first prompt`);

        // Add initial prompt marker
        sessionManager.addInitialPromptMarker(sessionId, continuePrompt);

        // Add initial prompt to conversation messages
        sessionManager.addConversationMessage(sessionId, 'user', continuePrompt);

        // Add the prompt to output so it's visible
        const timestamp = new Date().toLocaleTimeString();
        const initialPromptDisplay = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[42m\x1b[30m 👤 USER PROMPT \x1b[0m\r\n` +
                                     `\x1b[1m\x1b[92m${continuePrompt}\x1b[0m\r\n\r\n`;
        await sessionManager.addSessionOutput(sessionId, {
          type: 'stdout',
          data: initialPromptDisplay,
          timestamp: new Date()
        });

        // Run build script if configured
        const project = dbSession?.project_id ? databaseService.getProject(dbSession.project_id) : null;
        if (project?.build_script) {
          console.log(`[IPC] Running build script for main repo session ${sessionId}`);

          const buildWaitingMessage = `\x1b[36m[${new Date().toLocaleTimeString()}]\x1b[0m \x1b[1m\x1b[33m⏳ Waiting for build script to complete...\x1b[0m\r\n\r\n`;
          await sessionManager.addSessionOutput(sessionId, {
            type: 'stdout',
            data: buildWaitingMessage,
            timestamp: new Date()
          });

          const buildCommands = project.build_script.split('\n').filter(cmd => cmd.trim());
          const buildResult = await sessionManager.runBuildScript(sessionId, buildCommands, session.worktreePath);
          console.log(`[IPC] Build script completed. Success: ${buildResult.success}`);
        }

        // Get Claude panels for this session
        const mainRepoPanels = panelManager.getPanelsForSession(sessionId);
        const mainRepoClaudePanels = mainRepoPanels.filter(p => p.type === 'claude');
        
        if (mainRepoClaudePanels.length > 0) {
          // Start Claude Code via the first Claude panel
          const claudePanel = mainRepoClaudePanels[0];
          console.log(`[IPC] Starting Claude via panel ${claudePanel.id} for main repo session ${sessionId}`);
          // Model is now managed at panel level
          await claudeCodeManager.startPanel(
            claudePanel.id,
            sessionId,
            session.worktreePath,
            continuePrompt,
            dbSession?.permission_mode,
            model
          );
        } else {
          // Fallback to session-based start
          console.log(`[IPC] No Claude panels found, falling back to session-based start for ${sessionId}`);
          // Model is now managed at panel level  
          await claudeCodeManager.startSession(
            sessionId,
            session.worktreePath,
            continuePrompt,
            dbSession?.permission_mode,
            model
          );
        }
      } else {
        // Normal continue for existing sessions
        if (continuePrompt) {
          await sessionManager.continueConversation(sessionId, continuePrompt);
        }

        // Get Claude panels for this session
        const normalContinuePanels = panelManager.getPanelsForSession(sessionId);
        const normalContinueClaudePanels = normalContinuePanels.filter(p => p.type === 'claude');
        
        if (normalContinueClaudePanels.length > 0) {
          // Continue Claude conversation via the first Claude panel
          const claudePanel = normalContinueClaudePanels[0];
          // Model is now managed at panel level
          console.log(`[IPC] Continuing Claude via panel ${claudePanel.id} for session ${sessionId}`);
          await claudeCodeManager.continuePanel(
            claudePanel.id,
            sessionId,
            session.worktreePath,
            continuePrompt,
            conversationHistory,
            model
          );
        } else {
          // Fallback to session-based continue
          // Model is now managed at panel level
          console.log(`[IPC] No Claude panels found, continuing session ${sessionId}`);
          await claudeCodeManager.continueSession(
            sessionId,
            session.worktreePath,
            continuePrompt,
            conversationHistory,
            model
          );
        }
      }

      // The session manager will update status based on Claude output
      return { success: true };
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      return { success: false, error: 'Failed to continue conversation' };
    }
  });

  ipcMain.handle('sessions:get-output', async (_event, sessionId: string, limit?: number) => {
    try {
      // Validate session exists
      const sessionValidation = validateSessionExists(sessionId);
      if (!sessionValidation.valid) {
        logValidationFailure('sessions:get-output', sessionValidation);
        return createValidationError(sessionValidation);
      }

      // Performance optimization: Default to loading only recent outputs
      const DEFAULT_OUTPUT_LIMIT = 5000;
      const outputLimit = limit || DEFAULT_OUTPUT_LIMIT;
      
      console.log(`[IPC] sessions:get-output called for session: ${sessionId} with limit: ${outputLimit}`);
      
      // Migration: Check if this session needs a Claude panel
      const session = await sessionManager.getSession(sessionId);
      if (session && !session.archived) {
        const sessionToolType = session.toolType ?? 'claude';
        if (sessionToolType === 'claude') {
          console.log(`[IPC] Checking for Claude panels migration for session ${sessionId}`);
          const existingPanels = panelManager.getPanelsForSession(sessionId);
          const claudePanels = existingPanels.filter(p => p.type === 'claude');

          // Check if session has conversation history but no Claude panels
          const conversationHistory = sessionManager.getConversationMessages(sessionId);
          const hasConversation = conversationHistory.length > 0;
          const hasClaudePanels = claudePanels.length > 0;

          if (hasConversation && !hasClaudePanels) {
            console.log(`[IPC] Session ${sessionId} has conversation history but no Claude panels, creating one`);
            try {
              await panelManager.createPanel({
                sessionId: sessionId,
                type: 'claude',
                title: 'Claude'
              });
              console.log(`[IPC] Migrated session ${sessionId} to use Claude panel`);
            } catch (error) {
              console.error(`[IPC] Failed to create Claude panel during migration for session ${sessionId}:`, error);
            }
          }
        } else {
          console.log(`[IPC] Skipping Claude panel migration for session ${sessionId} with tool type ${sessionToolType}`);
        }

        // Refresh git status when session is loaded/viewed
        gitStatusManager.refreshSessionGitStatus(sessionId, false).catch(error => {
          console.error(`[IPC] Failed to refresh git status for session ${sessionId}:`, error);
        });
      }
      
      // MIGRATION FIX: Check if session has Claude panels and use panel-based data retrieval
      const sessionPanels = panelManager.getPanelsForSession(sessionId);
      const sessionClaudePanels = sessionPanels.filter(p => p.type === 'claude');
      
      let outputs;
      if (sessionClaudePanels.length > 0 && sessionManager.getPanelOutputs) {
        // Use panel-based method for migrated sessions
        console.log(`[IPC] Using panel-based output retrieval for session ${sessionId} with Claude panel ${sessionClaudePanels[0].id}`);
        outputs = await sessionManager.getPanelOutputs(sessionClaudePanels[0].id, outputLimit);
      } else {
        // Use session-based method for non-migrated sessions
        outputs = await sessionManager.getSessionOutputs(sessionId, outputLimit);
      }
      console.log(`[IPC] Retrieved ${outputs.length} outputs for session ${sessionId}`);

      // Performance optimization: Process outputs in batches to avoid blocking
      const { formatJsonForOutputEnhanced } = await import('../utils/toolFormatter');
      const BATCH_SIZE = 100;
      const transformedOutputs = [];
      
      for (let i = 0; i < outputs.length; i += BATCH_SIZE) {
        const batch = outputs.slice(i, Math.min(i + BATCH_SIZE, outputs.length));
        
        const transformedBatch = batch.map(output => {
          if (output.type === 'json') {
            // Generate formatted output from JSON
            const outputText = formatJsonForOutputEnhanced(output.data as Record<string, unknown>);
            if (outputText) {
              // Return as stdout for the Output view
              return {
                ...output,
                type: 'stdout' as const,
                data: outputText
              };
            }
            // If no output format can be generated, skip this JSON message
            return null;
          }
          // Pass through all other output types including 'error'
          return output; 
        }).filter(Boolean);
        
        transformedOutputs.push(...transformedBatch);
      } // Remove any null entries
      return { success: true, data: transformedOutputs };
    } catch (error) {
      console.error('Failed to get session outputs:', error);
      return { success: false, error: 'Failed to get session outputs' };
    }
  });

  ipcMain.handle('sessions:get-conversation', async (_event, sessionId: string) => {
    try {
      // MIGRATION FIX: Check if session has Claude panels and use panel-based data retrieval
      const sessionPanels = panelManager.getPanelsForSession(sessionId);
      const sessionClaudePanels = sessionPanels.filter(p => p.type === 'claude');
      
      let messages;
      if (sessionClaudePanels.length > 0 && sessionManager.getPanelConversationMessages) {
        // Use panel-based method for migrated sessions
        console.log(`[IPC] Using panel-based conversation retrieval for session ${sessionId} with Claude panel ${sessionClaudePanels[0].id}`);
        messages = await sessionManager.getPanelConversationMessages(sessionClaudePanels[0].id);
      } else {
        // Use session-based method for non-migrated sessions
        messages = await sessionManager.getConversationMessages(sessionId);
      }
      
      return { success: true, data: messages };
    } catch (error) {
      console.error('Failed to get conversation messages:', error);
      return { success: false, error: 'Failed to get conversation messages' };
    }
  });

  ipcMain.handle('sessions:get-conversation-messages', async (_event, sessionId: string) => {
    try {
      // MIGRATION FIX: Check if session has Claude panels and use panel-based data retrieval
      const sessionPanels = panelManager.getPanelsForSession(sessionId);
      const sessionClaudePanels = sessionPanels.filter(p => p.type === 'claude');
      
      let messages;
      if (sessionClaudePanels.length > 0 && sessionManager.getPanelConversationMessages) {
        // Use panel-based method for migrated sessions
        console.log(`[IPC] Using panel-based conversation messages retrieval for session ${sessionId} with Claude panel ${sessionClaudePanels[0].id}`);
        messages = await sessionManager.getPanelConversationMessages(sessionClaudePanels[0].id);
      } else {
        // Use session-based method for non-migrated sessions
        messages = await sessionManager.getConversationMessages(sessionId);
      }
      
      return { success: true, data: messages };
    } catch (error) {
      console.error('Failed to get conversation messages:', error);
      return { success: false, error: 'Failed to get conversation messages' };
    }
  });

  // Panel-based handlers for Claude panels
  ipcMain.handle('panels:get-output', async (_event, panelId: string, limit?: number) => {
    try {
      // Validate panel exists
      const panelValidation = validatePanelExists(panelId);
      if (!panelValidation.valid) {
        logValidationFailure('panels:get-output', panelValidation);
        return createValidationError(panelValidation);
      }

      const outputLimit = limit && limit > 0 ? Math.min(limit, 10000) : undefined;
      console.log(`[IPC] panels:get-output called for panel: ${panelId} (session: ${panelValidation.sessionId}) with limit: ${outputLimit}`);
      
      if (!sessionManager.getPanelOutputs) {
        console.error('[IPC] Panel-based output methods not available on sessionManager');
        return { success: false, error: 'Panel-based output methods not available' };
      }
      
      const outputs = await sessionManager.getPanelOutputs(panelId, outputLimit);
      console.log(`[IPC] Returning ${outputs.length} outputs for panel ${panelId}`);
      return { success: true, data: outputs };
    } catch (error) {
      console.error('Failed to get panel outputs:', error);
      return { success: false, error: 'Failed to get panel outputs' };
    }
  });

  ipcMain.handle('panels:get-conversation-messages', async (_event, panelId: string) => {
    try {
      if (!sessionManager.getPanelConversationMessages) {
        console.error('[IPC] Panel-based conversation methods not available on sessionManager');
        return { success: false, error: 'Panel-based conversation methods not available' };
      }

      const messages = await sessionManager.getPanelConversationMessages(panelId);
      // Ensure timestamps are in ISO format for proper sorting with JSON messages
      const messagesWithIsoTimestamps = messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.includes('T') || msg.timestamp.includes('Z')
          ? msg.timestamp  // Already ISO format
          : msg.timestamp + 'Z'  // SQLite format, append Z for UTC
      }));
      return { success: true, data: messagesWithIsoTimestamps };
    } catch (error) {
      console.error('Failed to get panel conversation messages:', error);
      return { success: false, error: 'Failed to get panel conversation messages' };
    }
  });

  ipcMain.handle('panels:get-json-messages', async (_event, panelId: string) => {
    try {
      console.log(`[IPC] panels:get-json-messages called for panel: ${panelId}`);

      if (!sessionManager.getPanelOutputs) {
        console.error('[IPC] Panel-based output methods not available on sessionManager');
        return { success: false, error: 'Panel-based output methods not available' };
      }

      // Get all outputs and filter for JSON messages only
      const outputs = await sessionManager.getPanelOutputs(panelId);
      const jsonMessages = outputs
        .filter(output => output.type === 'json')
        .map(output => {
          // Return the unwrapped message data with timestamp
          // The message transformer expects the actual message object, not wrapped in { type: 'json', data: ... }
          if (output.data && typeof output.data === 'object') {
            return {
              ...output.data as Record<string, unknown>,
              timestamp: output.timestamp instanceof Date
                ? output.timestamp.toISOString()
                : (typeof output.timestamp === 'string' ? output.timestamp : '')
            };
          }
          // If data is a string, try to parse it
          if (typeof output.data === 'string') {
            try {
              const parsed = JSON.parse(output.data);
              return {
                ...parsed,
                timestamp: output.timestamp instanceof Date
                  ? output.timestamp.toISOString()
                  : (typeof output.timestamp === 'string' ? output.timestamp : '')
              };
            } catch {
              // If parsing fails, return as-is with timestamp
              return {
                data: output.data,
                timestamp: output.timestamp instanceof Date
                  ? output.timestamp.toISOString()
                  : (typeof output.timestamp === 'string' ? output.timestamp : '')
              };
            }
          }
          // Fallback
          return output.data;
        });

      console.log(`[IPC] Returning ${jsonMessages.length} JSON messages for panel ${panelId}`);
      return { success: true, data: jsonMessages };
    } catch (error) {
      console.error('Failed to get panel JSON messages:', error);
      return { success: false, error: 'Failed to get panel JSON messages' };
    }
  });

  ipcMain.handle('panels:get-prompts', async (_event, panelId: string) => {
    try {
      console.log(`[IPC] panels:get-prompts called for panel: ${panelId}`);
      
      // Get all conversation messages to find assistant responses
      const allMessages = databaseService.getPanelConversationMessages(panelId);
      
      // Build prompts with assistant response timestamps
      const prompts = allMessages
        .map((msg, index) => {
          if (msg.message_type === 'user') {
            // Find the next assistant message for completion timestamp
            const nextAssistantMsg = allMessages
              .slice(index + 1)
              .find(m => m.message_type === 'assistant');
            
            return {
              id: msg.id,
              session_id: msg.session_id,
              panel_id: panelId,
              prompt_text: msg.content,
              output_index: index,
              timestamp: msg.timestamp,
              // Use the assistant's response timestamp as completion
              completion_timestamp: nextAssistantMsg?.timestamp
            };
          }
          return null;
        })
        .filter(Boolean); // Remove nulls (assistant messages)
      
      console.log(`[IPC] Returning ${prompts.length} user prompts for panel ${panelId}`);
      return { success: true, data: prompts };
    } catch (error) {
      console.error('Failed to get panel prompts:', error);
      return { success: false, error: 'Failed to get panel prompts' };
    }
  });

  // Generic panel input handlers that route to specific panel type handlers
  ipcMain.handle('panels:send-input', async (_event, panelId: string, input: string) => {
    try {
      console.log(`[IPC] panels:send-input called for panel: ${panelId}`);

      // Validate panel exists
      const panelValidation = validatePanelExists(panelId);
      if (!panelValidation.valid) {
        logValidationFailure('panels:send-input', panelValidation);
        return createValidationError(panelValidation);
      }

      // Additional validation that the session is active
      const sessionValidation = validateSessionIsActive(panelValidation.sessionId!);
      if (!sessionValidation.valid) {
        logValidationFailure('panels:send-input session check', sessionValidation);
        return createValidationError(sessionValidation);
      }

      // Get the panel to determine its type
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }

      console.log(`[IPC] Validated panel ${panelId} belongs to session ${panel.sessionId}`);

      // Route to appropriate panel type handler
      switch (panel.type) {
        case 'claude':
          try {
            // Save the user input as a conversation message for panel history
            if (input) {
              sessionManager.addPanelConversationMessage(panelId, 'user', input);
            }
            // Call Claude panel manager directly
            const { claudePanelManager } = require('./claudePanel');
            if (!claudePanelManager) {
              return { success: false, error: 'Claude panel manager not available' };
            }
            claudePanelManager.sendInputToPanel(panelId, input);
            return { success: true };
          } catch (err) {
            console.error('Failed to send input to Claude panel:', err);
            return { success: false, error: 'Failed to send input to Claude panel' };
          }
        case 'terminal':
          // Terminal panels don't have input handlers - they use runTerminalCommand
          return { success: false, error: 'Terminal panels use different input methods' };
        default:
          return { success: false, error: `Unsupported panel type: ${panel.type}` };
      }
    } catch (error) {
      console.error('Failed to send input to panel:', error);
      return { success: false, error: 'Failed to send input to panel' };
    }
  });

  ipcMain.handle('panels:continue', async (_event, panelId: string, input: string, model?: string) => {
    try {
      console.log(`[IPC] panels:continue called for panel: ${panelId}`);

      // Validate panel exists
      const panelValidation = validatePanelExists(panelId);
      if (!panelValidation.valid) {
        logValidationFailure('panels:continue', panelValidation);
        return createValidationError(panelValidation);
      }

      // Additional validation that the session is active
      const sessionValidation = validateSessionIsActive(panelValidation.sessionId!);
      if (!sessionValidation.valid) {
        logValidationFailure('panels:continue session check', sessionValidation);
        return createValidationError(sessionValidation);
      }

      // Get the panel to determine its type
      const panel = panelManager.getPanel(panelId);
      if (!panel) {
        return { success: false, error: 'Panel not found' };
      }

      console.log(`[IPC] Validated panel ${panelId} belongs to session ${panel.sessionId}`);

      // Route to appropriate panel type handler
      switch (panel.type) {
        case 'codex':
          try {
            const { codexPanelManager } = require('./codexPanel');
            if (!codexPanelManager) {
              return { success: false, error: 'Codex panel manager not available' };
            }

            // Get session to retrieve worktreePath
            const session = await sessionManager.getSession(panel.sessionId);
            if (!session) {
              return { success: false, error: 'Session not found' };
            }

            // Save the user input as a conversation message
            if (input) {
              sessionManager.addPanelConversationMessage(panelId, 'user', input);
            }

            // Check if there's a Codex session ID for resumption
            const isRunning = codexPanelManager.isPanelRunning(panelId);
            const hasCodexSessionId = !!sessionManager.getPanelCodexSessionId(panelId);

            if (!isRunning && !hasCodexSessionId) {
              // No running process and no session ID, start fresh
              console.log('[IPC] panels:continue starting fresh Codex session (no running process, no codex_session_id)');
              // Model is stored in panel state for Codex panels
              await codexPanelManager.startPanel(panelId, panel.sessionId, session.worktreePath, input || '');
              return { success: true };
            }

            // Otherwise continue with resume
            const conversationHistory = sessionManager.getPanelConversationMessages
              ? await sessionManager.getPanelConversationMessages(panelId)
              : [];
              
            console.log('[IPC] panels:continue resuming Codex conversation via continuePanel');
            await codexPanelManager.continuePanel(
              panelId,
              panel.sessionId,  // Add the missing sessionId parameter
              session.worktreePath,
              input || '',
              conversationHistory
            );
            return { success: true };
          } catch (err) {
            console.error('Failed to continue Codex panel:', err);
            return { success: false, error: 'Failed to continue Codex panel' };
          }
          
        case 'claude':
          try {
            const { claudePanelManager } = require('./claudePanel');
            if (!claudePanelManager) {
              return { success: false, error: 'Claude panel manager not available' };
            }

            // Get session to retrieve worktreePath and determine resume behavior
            const session = await sessionManager.getSession(panel.sessionId);
            if (!session) {
              return { success: false, error: 'Session not found' };
            }

            // Save the user input as a conversation message
            if (input) {
              sessionManager.addPanelConversationMessage(panelId, 'user', input);
            }

            // If there's no running process and no Claude session id yet, this is likely the first message.
            // Start fresh (no --resume) so the user can begin a new conversation.
            const isRunning = claudePanelManager.isPanelRunning(panelId);
            const hasClaudeSessionId = !!sessionManager.getPanelClaudeSessionId(panelId);

            if (!isRunning && !hasClaudeSessionId) {
              console.log('[IPC] panels:continue starting fresh via startPanel (no running process, no claude_session_id)');
              const dbSession = sessionManager.getDbSession(panel.sessionId);
              // Model is now managed at panel level in Claude panel settings
              await claudePanelManager.startPanel(
                panelId,
                session.worktreePath,
                input || '',
                dbSession?.permission_mode,
                model
              );
              return { success: true };
            }

            // Otherwise continue; ClaudeCodeManager enforces strict --resume behavior
            const conversationHistory = sessionManager.getPanelConversationMessages
              ? await sessionManager.getPanelConversationMessages(panelId)
              : await sessionManager.getConversationMessages(panel.sessionId);

            // Model is now managed at panel level in Claude panel settings
            await claudePanelManager.continuePanel(
              panelId,
              session.worktreePath,
              input || '',
              conversationHistory,
              model
            );
            return { success: true };
          } catch (err) {
            console.error('Failed to continue Claude panel:', err);
            return { success: false, error: 'Failed to continue Claude panel' };
          }
        default:
          return { success: false, error: `Panel type ${panel.type} does not support continue operation` };
      }
    } catch (error) {
      console.error('Failed to continue panel conversation:', error);
      return { success: false, error: 'Failed to continue panel conversation' };
    }
  });

  ipcMain.handle('sessions:generate-compacted-context', async (_event, sessionId: string) => {
    try {
      console.log('[IPC] sessions:generate-compacted-context called for sessionId:', sessionId);
      
      // Get all the data we need for compaction
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Get the database session for the compactor (it expects the database model)
      const dbSession = databaseService.getSession(sessionId);
      if (!dbSession) {
        return { success: false, error: 'Session not found in database' };
      }

      // MIGRATION FIX: Use panel-based data retrieval if session has Claude panels
      const compactPanels = panelManager.getPanelsForSession(sessionId);
      const compactClaudePanels = compactPanels.filter(p => p.type === 'claude');
      
      let conversationMessages, promptMarkers, executionDiffs, sessionOutputs;
      
      if (compactClaudePanels.length > 0) {
        // Use panel-based methods for migrated sessions
        const claudePanel = compactClaudePanels[0];
        console.log(`[IPC] Using panel-based data retrieval for context compaction, session ${sessionId} with Claude panel ${claudePanel.id}`);
        
        conversationMessages = sessionManager.getPanelConversationMessages ? 
          await sessionManager.getPanelConversationMessages(claudePanel.id) :
          await sessionManager.getConversationMessages(sessionId);
          
        promptMarkers = databaseService.getPanelPromptMarkers ? 
          databaseService.getPanelPromptMarkers(claudePanel.id) :
          databaseService.getPromptMarkers(sessionId);
          
        executionDiffs = databaseService.getPanelExecutionDiffs ? 
          databaseService.getPanelExecutionDiffs(claudePanel.id) :
          databaseService.getExecutionDiffs(sessionId);
          
        sessionOutputs = sessionManager.getPanelOutputs ? 
          await sessionManager.getPanelOutputs(claudePanel.id) :
          await sessionManager.getSessionOutputs(sessionId);
      } else {
        // Use session-based methods for non-migrated sessions
        conversationMessages = await sessionManager.getConversationMessages(sessionId);
        promptMarkers = databaseService.getPromptMarkers(sessionId);
        executionDiffs = databaseService.getExecutionDiffs(sessionId);
        sessionOutputs = await sessionManager.getSessionOutputs(sessionId);
      }
      
      // Import the compactor utility
      const { ProgrammaticCompactor } = await import('../utils/contextCompactor');
      const compactor = new ProgrammaticCompactor(databaseService);
      
      // Generate the compacted summary
      const summary = await compactor.generateSummary(sessionId, {
        session: dbSession,
        conversationMessages,
        promptMarkers,
        executionDiffs,
        sessionOutputs: sessionOutputs
      });
      
      // Set flag to skip --resume on the next execution
      console.log('[IPC] Setting skip_continue_next flag to true for session:', sessionId);
      await sessionManager.updateSession(sessionId, { skip_continue_next: true });
      
      // Verify the flag was set
      const updatedSession = databaseService.getSession(sessionId);
      console.log('[IPC] Verified skip_continue_next flag after update:', {
        raw_value: updatedSession?.skip_continue_next,
        type: typeof updatedSession?.skip_continue_next,
        is_truthy: !!updatedSession?.skip_continue_next
      });
      console.log('[IPC] Generated compacted context summary and set skip_continue_next flag');
      
      // Add a system message to the session outputs so it appears in rich output view
      const contextCompactionMessage = {
        type: 'system',
        subtype: 'context_compacted',
        timestamp: new Date().toISOString(),
        summary: summary,
        message: 'Context has been compacted. You can continue chatting - your next message will automatically include the context summary above.'
      };
      
      await sessionManager.addSessionOutput(sessionId, {
        type: 'json',
        data: contextCompactionMessage,
        timestamp: new Date()
      });
      
      return { success: true, data: { summary } };
    } catch (error) {
      console.error('Failed to generate compacted context:', error);
      return { success: false, error: 'Failed to generate compacted context' };
    }
  });

  ipcMain.handle('sessions:get-json-messages', async (_event, sessionId: string) => {
    try {
      console.log(`[IPC] sessions:get-json-messages called for session: ${sessionId}`);
      
      // MIGRATION FIX: Check if session has Claude panels and use panel-based data retrieval
      const jsonPanels = panelManager.getPanelsForSession(sessionId);
      const jsonClaudePanels = jsonPanels.filter(p => p.type === 'claude');
      
      let outputs;
      if (jsonClaudePanels.length > 0 && sessionManager.getPanelOutputs) {
        // Use panel-based method for migrated sessions
        console.log(`[IPC] Using panel-based output retrieval for JSON messages, session ${sessionId} with Claude panel ${jsonClaudePanels[0].id}`);
        outputs = await sessionManager.getPanelOutputs(jsonClaudePanels[0].id);
      } else {
        // Use session-based method for non-migrated sessions
        outputs = await sessionManager.getSessionOutputs(sessionId);
      }
      console.log(`[IPC] Retrieved ${outputs.length} total outputs for session ${sessionId}`);
      
      // Helper function to check if stdout/stderr contains git operation output
      const isGitOperation = (data: string): boolean => {
        return data.includes('🔄 GIT OPERATION') || 
               data.includes('Successfully rebased') ||
               data.includes('Successfully squashed and rebased') ||
               data.includes('Successfully pulled latest changes') ||
               data.includes('Successfully pushed changes to remote') ||
               data.includes('Rebase failed:') ||
               data.includes('Squash and rebase failed:') ||
               data.includes('Pull failed:') ||
               data.includes('Push failed:') ||
               data.includes('Aborted rebase successfully');
      };
      
      // Filter to JSON messages, error messages, and git operation stdout/stderr messages
      const jsonMessages = outputs
        .filter(output => 
          output.type === 'json' || 
          output.type === 'error' ||
          ((output.type === 'stdout' || output.type === 'stderr') && isGitOperation(output.data as string))
        )
        .map(output => {
          if (output.type === 'error') {
            // Transform error outputs to a format that RichOutputView can handle
            const errorData = output.data as Record<string, unknown>;
            return {
              type: 'system',
              subtype: 'error',
              timestamp: output.timestamp.toISOString(),
              error: errorData.error,
              details: errorData.details,
              message: `${errorData.error}${errorData.details ? '\n\n' + errorData.details : ''}`
            };
          } else if (output.type === 'stdout' || output.type === 'stderr') {
            // Transform git operation stdout/stderr to system messages that RichOutputView can display
            const isError = output.type === 'stderr' || (output.data as string).includes('failed:') || (output.data as string).includes('✗');
            return {
              type: 'system',
              subtype: isError ? 'git_error' : 'git_operation',
              timestamp: output.timestamp.toISOString(),
              message: output.data,
              // Add raw data for processing
              raw_output: output.data
            };
          } else {
            // Regular JSON messages - safe to spread since we know it's a Record
            const jsonData = output.data as Record<string, unknown>;
            return {
              ...jsonData,
              timestamp: output.timestamp.toISOString()
            } as Record<string, unknown>;
          }
        });
      
      console.log(`[IPC] Found ${jsonMessages.length} messages (including git operations) for session ${sessionId}`);
      return { success: true, data: jsonMessages };
    } catch (error) {
      console.error('Failed to get JSON messages:', error);
      return { success: false, error: 'Failed to get JSON messages' };
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
      // Get Claude panels for this session and stop them
      const stopPanels = panelManager.getPanelsForSession(sessionId);
      const stopClaudePanels = stopPanels.filter(p => p.type === 'claude');
      
      if (stopClaudePanels.length > 0) {
        // Stop all Claude panels for this session
        console.log(`[IPC] Stopping ${stopClaudePanels.length} Claude panel(s) for session ${sessionId}`);
        for (const claudePanel of stopClaudePanels) {
          await claudeCodeManager.stopPanel(claudePanel.id);
        }
      } else {
        // Fallback to session-based stop
        console.log(`[IPC] No Claude panels found, stopping session ${sessionId} directly`);
        await claudeCodeManager.stopSession(sessionId);
      }

      const timestamp = new Date();
      const cancellationMessage = {
        type: 'session',
        data: {
          status: 'cancelled',
          message: 'Cancelled by user',
          source: 'user'
        }
      };

      try {
        if (stopClaudePanels.length > 0 && sessionManager.addPanelOutput) {
          for (const claudePanel of stopClaudePanels) {
            sessionManager.addPanelOutput(claudePanel.id, {
              type: 'json',
              data: cancellationMessage,
              timestamp
            });

            const payload = {
              panelId: claudePanel.id,
              sessionId,
              type: 'json' as const,
              data: cancellationMessage,
              timestamp
            };

            sessionManager.emit('session-output', payload);
            sessionManager.emit('session-output-available', { sessionId, panelId: claudePanel.id });
          }
        } else {
          sessionManager.addSessionOutput(sessionId, {
            type: 'json',
            data: cancellationMessage,
            timestamp
          });
        }
      } catch (loggingError) {
        console.warn('[IPC] Failed to record cancellation message for session stop:', loggingError);
      }

      sessionManager.stopSession(sessionId);
      
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

  ipcMain.handle('sessions:rename', async (_event, sessionId: string, newName: string) => {
    try {
      // Update the session name in the database
      const updatedSession = databaseService.updateSession(sessionId, { name: newName });
      if (!updatedSession) {
        return { success: false, error: 'Session not found' };
      }

      // Emit update event so frontend gets notified
      const session = sessionManager.getSession(sessionId);
      if (session) {
        session.name = newName;
        sessionManager.emit('session-updated', session);
      }

      return { success: true, data: updatedSession };
    } catch (error) {
      console.error('Failed to rename session:', error);
      return { success: false, error: 'Failed to rename session' };
    }
  });

  ipcMain.handle('sessions:toggle-favorite', async (_event, sessionId: string) => {
    try {
      console.log('[IPC] sessions:toggle-favorite called for sessionId:', sessionId);
      
      // Get current session to check current favorite status
      const currentSession = databaseService.getSession(sessionId);
      if (!currentSession) {
        console.error('[IPC] Session not found in database:', sessionId);
        return { success: false, error: 'Session not found' };
      }
      
      console.log('[IPC] Current session favorite status:', currentSession.is_favorite);

      // Toggle the favorite status
      const newFavoriteStatus = !currentSession.is_favorite;
      console.log('[IPC] Toggling favorite status to:', newFavoriteStatus);
      
      const updatedSession = databaseService.updateSession(sessionId, { is_favorite: newFavoriteStatus });
      if (!updatedSession) {
        console.error('[IPC] Failed to update session in database');
        return { success: false, error: 'Failed to update session' };
      }
      
      console.log('[IPC] Database updated successfully. Updated session:', updatedSession.is_favorite);

      // Emit update event so frontend gets notified
      const session = sessionManager.getSession(sessionId);
      if (session) {
        session.isFavorite = newFavoriteStatus;
        console.log('[IPC] Emitting session-updated event with favorite status:', session.isFavorite);
        sessionManager.emit('session-updated', session);
      } else {
        console.warn('[IPC] Session not found in session manager:', sessionId);
      }

      return { success: true, data: { isFavorite: newFavoriteStatus } };
    } catch (error) {
      console.error('Failed to toggle favorite status:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return { success: false, error: 'Failed to toggle favorite status' };
    }
  });

  ipcMain.handle('sessions:toggle-auto-commit', async (_event, sessionId: string) => {
    try {
      console.log('[IPC] sessions:toggle-auto-commit called for sessionId:', sessionId);
      
      // Get current session to check current auto_commit status
      const currentSession = databaseService.getSession(sessionId);
      if (!currentSession) {
        console.error('[IPC] Session not found in database:', sessionId);
        return { success: false, error: 'Session not found' };
      }
      
      console.log('[IPC] Current session auto_commit status:', currentSession.auto_commit);

      // Toggle the auto_commit status
      const newAutoCommitStatus = !(currentSession.auto_commit ?? true); // Default to true if not set
      console.log('[IPC] Toggling auto_commit status to:', newAutoCommitStatus);
      
      const updatedSession = databaseService.updateSession(sessionId, { auto_commit: newAutoCommitStatus });
      if (!updatedSession) {
        console.error('[IPC] Failed to update session in database');
        return { success: false, error: 'Failed to update session' };
      }
      
      console.log('[IPC] Database updated successfully. Updated session auto_commit:', updatedSession.auto_commit);

      // Emit update event so frontend gets notified
      const session = sessionManager.getSession(sessionId);
      if (session) {
        session.autoCommit = newAutoCommitStatus;
        console.log('[IPC] Emitting session-updated event with auto_commit status:', session.autoCommit);
        sessionManager.emit('session-updated', session);
      } else {
        console.warn('[IPC] Session not found in session manager:', sessionId);
      }

      return { success: true, data: { autoCommit: newAutoCommitStatus } };
    } catch (error) {
      console.error('Failed to toggle auto-commit status:', error);
      if (error instanceof Error) {
        console.error('Error stack:', error.stack);
      }
      return { success: false, error: 'Failed to toggle auto-commit status' };
    }
  });

  ipcMain.handle('sessions:reorder', async (_event, sessionOrders: Array<{ id: string; displayOrder: number }>) => {
    try {
      databaseService.reorderSessions(sessionOrders);
      return { success: true };
    } catch (error) {
      console.error('Failed to reorder sessions:', error);
      return { success: false, error: 'Failed to reorder sessions' };
    }
  });

  // Save images for a session
  ipcMain.handle('sessions:save-images', async (_event, sessionId: string, images: Array<{ name: string; dataUrl: string; type: string }>) => {
    try {
      // For pending sessions (those created before the actual session), we still need to save the files
      // Check if this is a pending session ID (starts with 'pending_')
      const isPendingSession = sessionId.startsWith('pending_');
      
      if (!isPendingSession) {
        // For real sessions, verify it exists
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error('Session not found');
        }
      }

      // Create images directory in CRYSTAL_DIR/artifacts/{sessionId}
      const imagesDir = getCrystalSubdirectory('artifacts', sessionId);
      if (!existsSync(imagesDir)) {
        await fs.mkdir(imagesDir, { recursive: true });
      }

      const savedPaths: string[] = [];
      
      for (const image of images) {
        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 9);
        const extension = image.type.split('/')[1] || 'png';
        const filename = `${timestamp}_${randomStr}.${extension}`;
        const filePath = path.join(imagesDir, filename);

        // Extract base64 data
        const base64Data = image.dataUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        // Save the image
        await fs.writeFile(filePath, buffer);
        
        // Return the absolute path that Claude Code can access
        savedPaths.push(filePath);
      }

      return savedPaths;
    } catch (error) {
      console.error('Failed to save images:', error);
      throw error;
    }
  });

  // Save large text for a session
  ipcMain.handle('sessions:save-large-text', async (_event, sessionId: string, text: string) => {
    try {
      // For pending sessions (those created before the actual session), we still need to save the files
      // Check if this is a pending session ID (starts with 'pending_')
      const isPendingSession = sessionId.startsWith('pending_');
      
      if (!isPendingSession) {
        // For real sessions, verify it exists
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
          throw new Error('Session not found');
        }
      }

      // Create text directory in CRYSTAL_DIR/artifacts/{sessionId}
      const textDir = getCrystalSubdirectory('artifacts', sessionId);
      if (!existsSync(textDir)) {
        await fs.mkdir(textDir, { recursive: true });
      }

      // Generate unique filename
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 9);
      const filename = `text_${timestamp}_${randomStr}.txt`;
      const filePath = path.join(textDir, filename);

      // Save the text content
      await fs.writeFile(filePath, text, 'utf8');
      
      console.log(`[Large Text] Saved ${text.length} characters to ${filePath}`);
      
      // Return the absolute path that Claude Code can access
      return filePath;
    } catch (error) {
      console.error('Failed to save large text:', error);
      throw error;
    }
  });

  // Restore functionality removed - worktrees are deleted on archive so restore doesn't make sense

  // Debug handler to check table structure
  ipcMain.handle('debug:get-table-structure', async (_event, tableName: 'folders' | 'sessions') => {
    try {
      const structure = databaseService.getTableStructure(tableName);
      return { success: true, data: structure };
    } catch (error) {
      console.error('Failed to get table structure:', error);
      return { success: false, error: 'Failed to get table structure' };
    }
  });

  // Archive progress handler
  ipcMain.handle('archive:get-progress', async () => {
    try {
      if (!archiveProgressManager) {
        return { success: true, data: { tasks: [], activeCount: 0, totalCount: 0 } };
      }
      
      const tasks = archiveProgressManager.getActiveTasks();
      const activeCount = tasks.filter((t: SerializedArchiveTask) => 
        t.status !== 'completed' && t.status !== 'failed'
      ).length;
      
      return { 
        success: true, 
        data: { 
          tasks, 
          activeCount, 
          totalCount: tasks.length 
        } 
      };
    } catch (error) {
      console.error('Failed to get archive progress:', error);
      return { success: false, error: 'Failed to get archive progress' };
    }
  });

  // Session statistics handler
  ipcMain.handle('sessions:get-statistics', async (_event, sessionId: string) => {
    try {
      console.log('[IPC] sessions:get-statistics called for sessionId:', sessionId);
      
      // Get session details
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      // Calculate session duration
      const startTime = new Date(session.createdAt).getTime();
      const endTime = session.status === 'stopped' || session.status === 'completed_unviewed'
        ? (session.lastActivity ? new Date(session.lastActivity).getTime() : Date.now())
        : Date.now();
      const duration = endTime - startTime;

      // Get token usage from session_outputs with type 'json'
      const tokenUsageData = databaseService.getSessionTokenUsage(sessionId);
      
      // Get execution diffs for file changes
      const executionDiffs = databaseService.getExecutionDiffs(sessionId);
      
      // Calculate file statistics
      let totalFilesChanged = 0;
      let totalLinesAdded = 0;
      let totalLinesDeleted = 0;
      const filesModified = new Set<string>();
      
      executionDiffs.forEach(diff => {
        totalFilesChanged += diff.stats_files_changed || 0;
        totalLinesAdded += diff.stats_additions || 0;
        totalLinesDeleted += diff.stats_deletions || 0;
        
        // Track unique files
        if (diff.files_changed) {
          try {
            const files = Array.isArray(diff.files_changed) 
              ? diff.files_changed 
              : JSON.parse(diff.files_changed);
            files.forEach((file: string) => filesModified.add(file));
          } catch (e) {
            // Ignore parse errors
          }
        }
      });

      // MIGRATION FIX: Get prompt count and messages using appropriate method
      const statsPanels = panelManager.getPanelsForSession(sessionId);
      const statsClaudePanels = statsPanels.filter(p => p.type === 'claude');
      
      let promptMarkers, messageCount;
      if (statsClaudePanels.length > 0) {
        // Use panel-based methods for migrated sessions
        const claudePanel = statsClaudePanels[0];
        console.log(`[IPC] Using panel-based prompt/message counts for session ${sessionId} with Claude panel ${claudePanel.id}`);
        
        promptMarkers = databaseService.getPanelPromptMarkers ? 
          databaseService.getPanelPromptMarkers(claudePanel.id) :
          databaseService.getPromptMarkers(sessionId);
          
        messageCount = databaseService.getPanelConversationMessageCount ? 
          databaseService.getPanelConversationMessageCount(claudePanel.id) :
          databaseService.getConversationMessageCount(sessionId);
      } else {
        // Use session-based methods for non-migrated sessions
        promptMarkers = databaseService.getPromptMarkers(sessionId);
        messageCount = databaseService.getConversationMessageCount(sessionId);
      }
      
      // Get session outputs count by type
      const outputCounts = databaseService.getSessionOutputCounts(sessionId);
      
      // Get tool usage statistics
      const toolUsage = databaseService.getSessionToolUsage(sessionId);

      const statistics = {
        session: {
          id: session.id,
          name: session.name,
          status: session.status,
          // Model is now managed at panel level, not session level
          createdAt: session.createdAt,
          updatedAt: session.lastActivity || session.createdAt,
          duration: duration,
          worktreePath: session.worktreePath,
          branch: session.baseBranch || 'main'
        },
        tokens: {
          totalInputTokens: tokenUsageData.totalInputTokens,
          totalOutputTokens: tokenUsageData.totalOutputTokens,
          totalCacheReadTokens: tokenUsageData.totalCacheReadTokens,
          totalCacheCreationTokens: tokenUsageData.totalCacheCreationTokens,
          messageCount: tokenUsageData.messageCount
        },
        files: {
          totalFilesChanged: filesModified.size,
          totalLinesAdded,
          totalLinesDeleted,
          filesModified: Array.from(filesModified),
          executionCount: executionDiffs.length
        },
        activity: {
          promptCount: promptMarkers.length,
          messageCount: messageCount,
          outputCounts: outputCounts,
          lastActivity: session.lastActivity || session.createdAt
        },
        toolUsage: {
          tools: toolUsage.tools,
          totalToolCalls: toolUsage.totalToolCalls
        }
      };

      return { success: true, data: statistics };
    } catch (error) {
      console.error('Failed to get session statistics:', error);
      return { success: false, error: 'Failed to get session statistics' };
    }
  });

  // Set active session for smart git status polling
  ipcMain.handle('sessions:set-active-session', async (event, sessionId: string | null) => {
    try {
      // Notify GitStatusManager about the active session change
      gitStatusManager.setActiveSession(sessionId);
      return { success: true };
    } catch (error) {
      console.error('Failed to set active session:', error);
      return { success: false, error: 'Failed to set active session' };
    }
  });

} 

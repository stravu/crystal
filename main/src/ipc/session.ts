import { IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { AppServices } from './types';
import type { CreateSessionRequest } from '../types/session';
import { getCrystalSubdirectory } from '../utils/crystalDirectory';

export function registerSessionHandlers(ipcMain: IpcMain, services: AppServices): void {
  const {
    sessionManager,
    databaseService,
    taskQueue,
    worktreeManager,
    claudeCodeManager,
    worktreeNameGenerator
  } = services;

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
      console.log('[IPC] sessions:get called for sessionId:', sessionId);
      const session = await sessionManager.getSession(sessionId);
      console.log('[IPC] sessions:get result:', session ? `Found session ${session.id}` : 'Session not found');

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
        return {
          ...project,
          sessions,
          folders
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
    console.log('[IPC] sessions:create handler called with request:', request);
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
      console.log(`[IPC] Creating ${count} session(s) with prompt: "${request.prompt}"`);

      if (count > 1) {
        console.log('[IPC] Creating multiple sessions...');
        const jobs = await taskQueue.createMultipleSessions(request.prompt, request.worktreeTemplate || '', count, request.permissionMode, targetProject.id, request.baseBranch, request.autoCommit, request.model);
        console.log(`[IPC] Created ${jobs.length} jobs:`, jobs.map(job => job.id));
        return { success: true, data: { jobIds: jobs.map(job => job.id) } };
      } else {
        console.log('[IPC] Creating single session...');
        const job = await taskQueue.createSession({
          prompt: request.prompt,
          worktreeTemplate: request.worktreeTemplate || '',
          permissionMode: request.permissionMode,
          projectId: targetProject.id,
          baseBranch: request.baseBranch,
          autoCommit: request.autoCommit,
          model: request.model
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

      // Clean up the worktree if session has one (but not for main repo sessions)
      if (dbSession.worktree_name && dbSession.project_id && !dbSession.is_main_repo) {
        const project = databaseService.getProject(dbSession.project_id);
        if (project) {
          try {
            console.log(`[Main] Removing worktree ${dbSession.worktree_name} for session ${sessionId}`);
            archiveMessage += `\x1b[90mRemoving git worktree: ${dbSession.worktree_name}\x1b[0m\r\n`;

            await worktreeManager.removeWorktree(project.path, dbSession.worktree_name, project.worktree_folder);

            console.log(`[Main] Successfully removed worktree ${dbSession.worktree_name}`);
            archiveMessage += `\x1b[32m✓ Worktree removed successfully\x1b[0m\r\n`;
          } catch (worktreeError) {
            // Log the error but don't fail the session deletion
            console.error(`[Main] Failed to remove worktree ${dbSession.worktree_name}:`, worktreeError);
            archiveMessage += `\x1b[33m⚠ Failed to remove worktree (manual cleanup may be needed)\x1b[0m\r\n`;
            // Continue with session deletion even if worktree removal fails
          }
        }
      }

      // Clean up session artifacts (images)
      const artifactsDir = getCrystalSubdirectory('artifacts', sessionId);
      if (existsSync(artifactsDir)) {
        try {
          console.log(`[Main] Removing artifacts directory for session ${sessionId}`);
          archiveMessage += `\x1b[90mRemoving session artifacts...\x1b[0m\r\n`;
          
          await fs.rm(artifactsDir, { recursive: true, force: true });
          
          console.log(`[Main] Successfully removed artifacts for session ${sessionId}`);
          archiveMessage += `\x1b[32m✓ Artifacts removed successfully\x1b[0m\r\n`;
        } catch (artifactsError) {
          console.error(`[Main] Failed to remove artifacts for session ${sessionId}:`, artifactsError);
          archiveMessage += `\x1b[33m⚠ Failed to remove artifacts (manual cleanup may be needed)\x1b[0m\r\n`;
          // Continue with session deletion even if artifacts removal fails
        }
      }

      archiveMessage += `\x1b[90mSession archived. It will no longer appear in the active sessions list.\x1b[0m\r\n\r\n`;

      // Add the archive message to session output
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: archiveMessage,
        timestamp: new Date()
      });

      // Archive the session
      await sessionManager.archiveSession(sessionId);

      return { success: true };
    } catch (error) {
      console.error('Failed to delete session:', error);
      return { success: false, error: 'Failed to delete session' };
    }
  });

  ipcMain.handle('sessions:input', async (_event, sessionId: string, input: string) => {
    try {
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

      claudeCodeManager.sendInput(sessionId, input);
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
      const session = sessionManager.getOrCreateMainRepoSession(projectId);

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
      // Get session details
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Get conversation history
      const conversationHistory = sessionManager.getConversationMessages(sessionId);

      // If no prompt provided, use empty string (for resuming)
      const continuePrompt = prompt || '';

      // Check if this is a main repo session that hasn't started Claude Code yet
      const dbSession = databaseService.getSession(sessionId);
      const isMainRepoFirstStart = dbSession?.is_main_repo && conversationHistory.length === 0 && continuePrompt;

      // Update session status to initializing and clear run_started_at
      // Also update the model if provided
      const updateData: any = {
        status: 'initializing',
        run_started_at: null // Clear previous run time
      };
      
      // If a model was provided and it's different, update it now
      if (model && model !== dbSession?.model) {
        updateData.model = model;
        console.log(`[IPC] Updating session ${sessionId} model from ${dbSession?.model} to ${model}`);
      }
      
      sessionManager.updateSession(sessionId, updateData);

      if (isMainRepoFirstStart && continuePrompt) {
        // First message in main repo session - start Claude Code without --continue
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

        // Start Claude Code with the user's prompt
        // Use the provided model if specified, otherwise fall back to the session's original model
        const modelToUse = model || dbSession?.model || 'claude-sonnet-4-20250514';
        await claudeCodeManager.startSession(sessionId, session.worktreePath, continuePrompt, dbSession?.permission_mode, modelToUse);
      } else {
        // Normal continue for existing sessions
        if (continuePrompt) {
          sessionManager.continueConversation(sessionId, continuePrompt);
        }

        // Continue the session with the existing conversation
        // Use the provided model if specified, otherwise fall back to the session's original model
        const modelToUse = model || dbSession?.model || 'claude-sonnet-4-20250514';
        
        console.log(`[IPC] Continue session ${sessionId} - provided model: ${model}, current model: ${dbSession?.model}, modelToUse: ${modelToUse}`);
        
        await claudeCodeManager.continueSession(sessionId, session.worktreePath, continuePrompt, conversationHistory, modelToUse);
      }

      // The session manager will update status based on Claude output
      return { success: true };
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      return { success: false, error: 'Failed to continue conversation' };
    }
  });

  ipcMain.handle('sessions:get-output', async (_event, sessionId: string) => {
    try {
      console.log(`[IPC] sessions:get-output called for session: ${sessionId}`);
      const outputs = await sessionManager.getSessionOutputs(sessionId);
      console.log(`[IPC] Retrieved ${outputs.length} outputs for session ${sessionId}`);

      // Transform JSON messages to formatted stdout on the fly
      const { formatJsonForOutputEnhanced } = await import('../utils/toolFormatter');
      const transformedOutputs = outputs.map(output => {
        if (output.type === 'json') {
          // Generate formatted output from JSON
          const outputText = formatJsonForOutputEnhanced(output.data);
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
        return output; // Non-JSON outputs pass through
      }).filter(Boolean); // Remove any null entries
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
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
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
} 
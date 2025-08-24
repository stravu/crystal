import { IpcMain } from 'electron';
import type { AppServices } from './types';

export function registerProjectHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { databaseService, sessionManager, worktreeManager } = services;

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
          // Always use 'main' as the default branch name for new repos
          const branchName = 'main';

          nodeExecSync(`cd "${projectData.path}" && git init`, { encoding: 'utf-8' });
          console.log('[Main] Git repository initialized successfully');

          // Create and checkout the main branch
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

      // Always detect the main branch - never use projectData.mainBranch
      let mainBranch: string | undefined;
      if (isGitRepo) {
        try {
          mainBranch = await worktreeManager.getProjectMainBranch(projectData.path);
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
        projectData.buildScript,
        undefined, // default_permission_mode
        projectData.openIdeCommand,
        projectData.commitMode,
        projectData.commitStructuredPromptTemplate,
        projectData.commitCheckpointPrefix
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

      // Emit event to notify frontend about project update
      if (project) {
        sessionManager.emit('project:updated', project);
      }

      return { success: true, data: project };
    } catch (error) {
      console.error('Failed to update project:', error);
      return { success: false, error: 'Failed to update project' };
    }
  });

  ipcMain.handle('projects:delete', async (_event, projectId: string) => {
    try {
      const projectIdNum = parseInt(projectId);
      
      // Get all sessions for this project to check for running scripts
      const projectSessions = databaseService.getAllSessions(projectIdNum);
      
      // Check if any session from this project has a running script
      const currentRunningSessionId = sessionManager.getCurrentRunningSessionId();
      if (currentRunningSessionId) {
        const runningSession = projectSessions.find(s => s.id === currentRunningSessionId);
        if (runningSession) {
          console.log(`[Main] Stopping running script for session ${currentRunningSessionId} before deleting project`);
          sessionManager.stopRunningScript();
        }
      }
      
      // Close all terminal sessions for this project
      for (const session of projectSessions) {
        if (sessionManager.hasTerminalSession(session.id)) {
          console.log(`[Main] Closing terminal session ${session.id} before deleting project`);
          await sessionManager.closeTerminalSession(session.id);
        }
      }
      
      // Now safe to delete the project
      const success = databaseService.deleteProject(projectIdNum);
      return { success: true, data: success };
    } catch (error) {
      console.error('Failed to delete project:', error);
      return { success: false, error: 'Failed to delete project' };
    }
  });

  ipcMain.handle('projects:reorder', async (_event, projectOrders: Array<{ id: number; displayOrder: number }>) => {
    try {
      databaseService.reorderProjects(projectOrders);
      return { success: true };
    } catch (error) {
      console.error('Failed to reorder projects:', error);
      return { success: false, error: 'Failed to reorder projects' };
    }
  });

  ipcMain.handle('projects:detect-branch', async (_event, path: string) => {
    try {
      const branch = await worktreeManager.getProjectMainBranch(path);
      return { success: true, data: branch };
    } catch (error) {
      console.log('[Main] Could not detect branch:', error);
      return { success: true, data: 'main' }; // Return default if detection fails
    }
  });

  ipcMain.handle('projects:list-branches', async (_event, projectId: string) => {
    try {
      const project = databaseService.getProject(parseInt(projectId));
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const branches = await worktreeManager.listBranches(project.path);
      return { success: true, data: branches };
    } catch (error) {
      console.error('[Main] Failed to list branches:', error);
      return { success: false, error: 'Failed to list branches' };
    }
  });

  ipcMain.handle('projects:refresh-git-status', async (_event, projectId: string) => {
    try {
      const projectIdNum = parseInt(projectId);
      
      // Check if the project exists
      const project = databaseService.getProject(projectIdNum);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }
      
      // Get all sessions for this project
      const sessions = await sessionManager.getAllSessions();
      const projectSessions = sessions.filter(s => s.projectId === projectIdNum && !s.archived && s.status !== 'error');
      
      // Use gitStatusManager from services
      const { gitStatusManager } = services;
      
      // Count the sessions that will be refreshed
      const sessionsToRefresh = projectSessions.filter(session => session.worktreePath);
      const sessionCount = sessionsToRefresh.length;
      
      // Start the refresh in background (non-blocking)
      // Don't await this - let it run asynchronously
      setImmediate(() => {
        const refreshPromises = sessionsToRefresh
          .map(session => 
            gitStatusManager.refreshSessionGitStatus(session.id, true) // true = user initiated
              .catch(error => {
                console.error(`[Main] Failed to refresh git status for session ${session.id}:`, error);
                return null;
              })
          );
        
        // Log when all refreshes complete (in background)
        Promise.allSettled(refreshPromises).then(results => {
          const refreshedCount = results.filter(result => result.status === 'fulfilled').length;
          console.log(`[Main] Background refresh completed: ${refreshedCount}/${sessionCount} sessions`);
        });
      });
      
      // Return immediately with the count of sessions that will be refreshed
      console.log(`[Main] Starting background refresh for ${sessionCount} sessions`);
      
      return { success: true, data: { count: sessionCount, backgroundRefresh: true } };
    } catch (error) {
      console.error('[Main] Failed to start project git status refresh:', error);
      return { success: false, error: 'Failed to refresh git status' };
    }
  });
} 
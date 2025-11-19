import { IpcMain } from 'electron';
import type { AppServices } from './types';
import type { CreateProjectRequest, UpdateProjectRequest } from '../../../frontend/src/types/project';
import { scriptExecutionTracker } from '../services/scriptExecutionTracker';
import { panelManager } from '../services/panelManager';

// Helper function to stop a running project script
async function stopProjectScriptInternal(projectId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const runningScript = scriptExecutionTracker.getRunningScript();

    // If a specific project ID is provided, only stop if it matches the running project
    if (projectId !== undefined && runningScript?.type === 'project' && runningScript?.id !== projectId) {
      return { success: true }; // Not running, nothing to stop
    }

    // If there's a running project script, stop it
    if (runningScript && runningScript.type === 'project' && runningScript.sessionId) {
      const projectIdToStop = runningScript.id as number;

      // Mark as closing
      scriptExecutionTracker.markClosing('project', projectIdToStop);

      const { panelManager } = require('../services/panelManager');
      const { logsManager } = require('../services/panels/logPanel/logsManager');

      const panels = await panelManager.getPanelsForSession(runningScript.sessionId);
      const logsPanel = panels?.find((p: { type: string }) => p.type === 'logs');
      if (logsPanel) {
        await logsManager.stopScript(logsPanel.id);
      }

      // Mark as stopped
      scriptExecutionTracker.stop('project', projectIdToStop);

      console.log(`[Main] Stopped project script for project ${projectIdToStop}`);
    }

    return { success: true };
  } catch (error) {
    console.error('[Main] Failed to stop project script:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to stop project script' };
  }
}

export function registerProjectHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { databaseService, sessionManager, worktreeManager, analyticsManager } = services;

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

  ipcMain.handle('projects:create', async (_event, projectData: CreateProjectRequest) => {
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

      // Track project creation
      if (analyticsManager && project) {
        const allProjects = databaseService.getAllProjects();
        analyticsManager.track('project_created', {
          was_auto_initialized: !isGitRepo,
          project_count: allProjects.length
        });
      }

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
        const cmdError = error as Error & { cmd?: string; stderr?: string; stdout?: string };
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

        // Track project switch
        if (analyticsManager) {
          const projectIdNum = parseInt(projectId);
          const projectSessions = databaseService.getAllSessions(projectIdNum);
          const hasActiveSessions = projectSessions.some(s => s.status === 'running' || s.status === 'pending');
          analyticsManager.track('project_switched', {
            has_active_sessions: hasActiveSessions
          });
        }
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to activate project:', error);
      return { success: false, error: 'Failed to activate project' };
    }
  });

  ipcMain.handle('projects:update', async (_event, projectId: string, updates: UpdateProjectRequest) => {
    try {
      // Update the project
      const project = databaseService.updateProject(parseInt(projectId), updates);

      // If run_script was updated, also update the run commands table
      if (updates.run_script !== undefined) {
        const projectIdNum = parseInt(projectId);

        // Delete existing run commands
        databaseService.deleteProjectRunCommands(projectIdNum);

        // Add new run commands from the multiline script
        // Treat empty string and null the same - both mean no commands
        if (updates.run_script && updates.run_script.trim()) {
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

      // Track project settings update
      if (analyticsManager && project) {
        // Determine which category of setting was updated
        let settingCategory = 'other';
        if (updates.system_prompt !== undefined) {
          settingCategory = 'system_prompt';
        } else if (updates.run_script !== undefined || updates.build_script !== undefined) {
          settingCategory = 'scripts';
        } else if (updates.commit_mode !== undefined || updates.commit_structured_prompt_template !== undefined || updates.commit_checkpoint_prefix !== undefined) {
          settingCategory = 'commit';
        } else if (updates.open_ide_command !== undefined) {
          settingCategory = 'ide';
        } else if (updates.name !== undefined) {
          settingCategory = 'name';
        }

        analyticsManager.track('project_settings_updated', {
          setting_category: settingCategory
        });
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
      
      // Get the project to access its path
      const project = databaseService.getProject(projectIdNum);
      if (!project) {
        console.error(`[Main] Project ${projectIdNum} not found`);
        return { success: false, error: 'Project not found' };
      }
      
      // Get all sessions for this project (including archived) to clean up worktrees
      const allProjectSessions = databaseService.getAllSessionsIncludingArchived().filter(s => s.project_id === projectIdNum);
      const projectSessions = databaseService.getAllSessions(projectIdNum);
      
      console.log(`[Main] Deleting project ${project.name} with ${allProjectSessions.length} total sessions`);
      
      // Check if any session from this project has a running script
      const runningScript = scriptExecutionTracker.getRunningScript();
      if (runningScript) {
        const runningSession = projectSessions.find(s => s.id === runningScript.id);
        if (runningSession && runningScript.type === 'session') {
          console.log(`[Main] Stopping running script for session ${runningScript.id} before deleting project`);
          await sessionManager.stopRunningScript();
          // Ensure tracker is updated even if sessionManager's internal update fails
          scriptExecutionTracker.stop('session', runningScript.id);
        }
      }
      
      // Close all terminal sessions for this project
      for (const session of projectSessions) {
        if (sessionManager.hasTerminalSession(session.id)) {
          console.log(`[Main] Closing terminal session ${session.id} before deleting project`);
          await sessionManager.closeTerminalSession(session.id);
        }
      }
      
      // Clean up all worktrees for this project (including archived sessions)
      let worktreeCleanupCount = 0;
      for (const session of allProjectSessions) {
        // Skip sessions that are main repo or don't have worktrees
        if (session.is_main_repo || !session.worktree_name) {
          continue;
        }
        
        try {
          console.log(`[Main] Removing worktree '${session.worktree_name}' for session ${session.id}`);
          // Pass session creation date for analytics tracking
          const sessionCreatedAt = session.created_at ? new Date(session.created_at) : undefined;
          await worktreeManager.removeWorktree(project.path, session.worktree_name, project.worktree_folder || undefined, sessionCreatedAt);
          worktreeCleanupCount++;
        } catch (error) {
          // Log error but continue with other worktrees
          console.error(`[Main] Failed to remove worktree '${session.worktree_name}' for session ${session.id}:`, error);
        }
      }
      
      console.log(`[Main] Cleaned up ${worktreeCleanupCount} worktrees for project ${project.name}`);

      // Track project deletion before actually deleting
      if (analyticsManager) {
        const projectAge = Math.floor((Date.now() - new Date(project.created_at).getTime()) / (1000 * 60 * 60 * 24));
        analyticsManager.track('project_deleted', {
          session_count: projectSessions.length,
          project_age_days: projectAge
        });
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

  ipcMain.handle('projects:get-running-script', async () => {
    try {
      const runningProjectId = scriptExecutionTracker.getRunningScriptId('project');
      return { success: true, data: runningProjectId };
    } catch (error) {
      console.error('[Main] Failed to get running project script:', error);
      return { success: false, error: 'Failed to get running project script' };
    }
  });

  ipcMain.handle('projects:stop-script', async (_event, projectId?: number) => {
    return stopProjectScriptInternal(projectId);
  });

  ipcMain.handle('projects:run-script', async (_event, projectId: number) => {
    try {
      // Get the project
      const project = databaseService.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      // Get the run script
      if (!project.run_script || !project.run_script.trim()) {
        return { success: false, error: 'No run script configured for this project' };
      }

      // If there's already a running script (any type), stop it first
      const runningScript = scriptExecutionTracker.getRunningScript();
      if (runningScript) {
        console.log(`[Main] Stopping currently running ${runningScript.type} script for ${runningScript.type}:${runningScript.id}`);

        // Mark the old script as closing
        scriptExecutionTracker.markClosing(runningScript.type, runningScript.id);

        // Stop the script based on its type
        if (runningScript.type === 'project') {
          // Call internal stop function
          const stopResult = await stopProjectScriptInternal(runningScript.id as number);
          if (!stopResult?.success) {
            console.warn('[Main] Failed to stop running project script, continuing anyway');
          }
        } else if (runningScript.type === 'session') {
          // Stop session script through logs panel
          const sessionIdToStop = runningScript.id as string;
          const panels = await panelManager.getPanelsForSession(sessionIdToStop);
          const logsPanel = panels?.find((p: { type: string }) => p.type === 'logs');
          if (logsPanel) {
            const { logsManager } = require('../services/panels/logPanel/logsManager');
            await logsManager.stopScript(logsPanel.id);
          }
          // Also try old mechanism as fallback
          await sessionManager.stopRunningScript();
          // Mark as stopped in tracker
          scriptExecutionTracker.stop('session', sessionIdToStop);
        }
      }

      // Get or create main repo session for this project
      const mainRepoSession = await sessionManager.getOrCreateMainRepoSession(projectId);
      if (!mainRepoSession) {
        return { success: false, error: 'Failed to get or create main repo session' };
      }

      const sessionId = mainRepoSession.id;

      // Run the script in the project root using logsManager
      const { logsManager } = require('../services/panels/logPanel/logsManager');
      await logsManager.runScript(sessionId, project.run_script, project.path);

      // Track the running project
      scriptExecutionTracker.start('project', projectId, sessionId);

      return { success: true, data: { sessionId } };
    } catch (error) {
      console.error('[Main] Failed to run project script:', error);

      // Clear running state on error
      scriptExecutionTracker.stop('project', projectId);

      return { success: false, error: error instanceof Error ? error.message : 'Failed to run project script' };
    }
  });
} 
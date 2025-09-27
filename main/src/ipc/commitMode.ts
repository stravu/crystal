import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { projectDetectionService } from '../services/projectDetection';
import { commitManager } from '../services/commitManager';
import type { ProjectCharacteristics, CommitModeSettings, FinalizeSessionOptions } from '../../../shared/types';
import type { DatabaseService } from '../database/database';
import type { Logger } from '../utils/logger';
import type { SessionManager } from '../services/sessionManager';
import type { Session } from '../types/session';

export function registerCommitModeHandlers(db: DatabaseService, logger?: Logger, sessionManager?: SessionManager): void {
  // Get project characteristics for commit mode detection
  ipcMain.handle('commit-mode:get-project-characteristics', async (
    _event: IpcMainInvokeEvent,
    projectPath: string
  ): Promise<ProjectCharacteristics> => {
    try {
      logger?.verbose(`Getting project characteristics for: ${projectPath}`);
      const characteristics = await projectDetectionService.detectProjectCharacteristics(projectPath);
      
      const reason = projectDetectionService.getModeRecommendationReason(characteristics);
      logger?.verbose(`Project characteristics: ${reason}, suggested mode: ${characteristics.suggestedMode}`);
      
      return characteristics;
    } catch (error) {
      logger?.error('Failed to get project characteristics:', error instanceof Error ? error : undefined);
      throw error;
    }
  });

  // Update session commit mode settings
  ipcMain.handle('commit-mode:update-session-settings', async (
    _event: IpcMainInvokeEvent,
    sessionId: string,
    settings: CommitModeSettings
  ): Promise<void> => {
    try {
      logger?.verbose(`Updating commit mode settings for session ${sessionId}`);
      
      // Store settings as JSON in the database
      const settingsJson = JSON.stringify(settings);
      
      db.updateSession(sessionId, {
        commit_mode: settings.mode,
        commit_mode_settings: settingsJson
      });
      
      // Verify the update was successful by reading back from DB
      const verifySession = db.getSession(sessionId);
      if (verifySession) {
        logger?.verbose(`Verified session update - commit_mode: ${verifySession.commit_mode}, settings: ${verifySession.commit_mode_settings}`);
      }
      
      // Send a minimal update event directly to the renderer with the new values
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow && !mainWindow.isDestroyed()) {
        const sessionUpdate = {
          id: sessionId,
          commitMode: settings.mode,
          commitModeSettings: settingsJson
        };
        
        mainWindow.webContents.send('session:updated', sessionUpdate);
      }
    } catch (error) {
      logger?.error('Failed to update session commit mode settings:', error instanceof Error ? error : undefined);
      throw error;
    }
  });

  // Update project default commit mode settings
  ipcMain.handle('commit-mode:update-project-settings', async (
    _event: IpcMainInvokeEvent,
    projectId: number,
    commitMode: 'structured' | 'checkpoint' | 'disabled',
    structuredPromptTemplate?: string,
    checkpointPrefix?: string
  ): Promise<void> => {
    try {
      logger?.verbose(`Updating default commit mode settings for project ${projectId}`);
      
      db.updateProject(projectId, {
        commit_mode: commitMode,
        commit_structured_prompt_template: structuredPromptTemplate,
        commit_checkpoint_prefix: checkpointPrefix
      });
      
      logger?.verbose(`Updated project ${projectId} default commit mode to: ${commitMode}`);
    } catch (error) {
      logger?.error('Failed to update project commit mode settings:', error instanceof Error ? error : undefined);
      throw error;
    }
  });

  // Get commit mode warning for checkpoint mode
  ipcMain.handle('commit-mode:check-checkpoint-warning', async (
    _event: IpcMainInvokeEvent,
    worktreePath: string
  ): Promise<{ shouldWarn: boolean; reason?: string }> => {
    try {
      return await commitManager.shouldWarnAboutCheckpointMode(worktreePath);
    } catch (error) {
      logger?.error('Failed to check checkpoint warning:', error instanceof Error ? error : undefined);
      return { shouldWarn: false };
    }
  });

  // Finalize session (squash commits, etc.)
  ipcMain.handle('commit-mode:finalize-session', async (
    _event: IpcMainInvokeEvent,
    sessionId: string,
    options: FinalizeSessionOptions
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      logger?.verbose(`Finalizing session ${sessionId}`);
      
      const session = db.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      const project = db.getProject(session.project_id!);
      if (!project) {
        throw new Error('Project not found');
      }
      
      const result = await commitManager.finalizeSession(
        sessionId,
        session.worktree_path,
        project.path, // Using project path as main branch for now
        options
      );
      
      if (result.success) {
        logger?.verbose(`Successfully finalized session ${sessionId}`);
      } else {
        logger?.error(`Failed to finalize session ${sessionId}: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      logger?.error('Failed to finalize session:', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Get prompt enhancement for structured mode
  ipcMain.handle('commit-mode:get-prompt-enhancement', (
    _event: IpcMainInvokeEvent,
    settings: CommitModeSettings
  ): string => {
    return commitManager.getPromptEnhancement(settings);
  });
}
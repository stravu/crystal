import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { projectDetectionService } from '../services/projectDetection';
import { commitManager } from '../services/commitManager';
import {
  validateCommitModeSettings,
  validateFinalizeSessionOptions,
  sanitizeCommitModeSettings,
} from '../utils/commitModeValidation';
import type { ProjectCharacteristics, CommitModeSettings, FinalizeSessionOptions } from '../../../shared/types';
import type { DatabaseService } from '../database/database';
import type { Logger } from '../utils/logger';

export function registerCommitModeHandlers(db: DatabaseService, logger?: Logger): void {
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
      
      // SECURITY: Validate settings before processing
      const validation = validateCommitModeSettings(settings);
      if (!validation.isValid) {
        const errorMsg = `Invalid commit mode settings: ${validation.errors.join(', ')}`;
        logger?.error(errorMsg);
        throw new Error(errorMsg);
      }

      // SECURITY: Sanitize settings to remove any potentially malicious data
      const sanitizedSettings = sanitizeCommitModeSettings(settings);
      
      // Store sanitized settings as JSON in the database
      const settingsJson = JSON.stringify(sanitizedSettings);
      db.updateSession(sessionId, {
        commit_mode: sanitizedSettings.mode,
        commit_mode_settings: settingsJson
      });
      
      logger?.verbose(`Updated session ${sessionId} to mode: ${sanitizedSettings.mode}`);
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
    checkpointPrefix?: string,
    allowClaudeTools?: boolean
  ): Promise<void> => {
    try {
      logger?.verbose(`Updating default commit mode settings for project ${projectId}`);
      
      // SECURITY: Validate project settings before storing
      const settings: CommitModeSettings = {
        mode: commitMode,
        structuredPromptTemplate,
        checkpointPrefix,
        allowClaudeTools
      };

      const validation = validateCommitModeSettings(settings);
      if (!validation.isValid) {
        const errorMsg = `Invalid project commit mode settings: ${validation.errors.join(', ')}`;
        logger?.error(errorMsg);
        throw new Error(errorMsg);
      }

      // SECURITY: Sanitize settings before database storage
      const sanitizedSettings = sanitizeCommitModeSettings(settings);
      
      db.updateProject(projectId, {
        commit_mode: sanitizedSettings.mode,
        commit_structured_prompt_template: sanitizedSettings.structuredPromptTemplate,
        commit_checkpoint_prefix: sanitizedSettings.checkpointPrefix,
        commit_allow_claude_tools: sanitizedSettings.allowClaudeTools
      });
      
      logger?.verbose(`Updated project ${projectId} default commit mode to: ${sanitizedSettings.mode}`);
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
      
      // SECURITY: Validate finalize options before processing
      const validation = validateFinalizeSessionOptions(options);
      if (!validation.isValid) {
        const errorMsg = `Invalid finalize session options: ${validation.errors.join(', ')}`;
        logger?.error(errorMsg);
        return {
          success: false,
          error: errorMsg
        };
      }
      
      const session = db.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      const project = db.getProject(session.project_id!);
      if (!project) {
        throw new Error('Project not found');
      }
      
      // Options are already validated by validateFinalizeSessionOptions
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
    // SECURITY: Validate settings before processing
    const validation = validateCommitModeSettings(settings);
    if (!validation.isValid) {
      logger?.error(`Invalid commit mode settings in prompt enhancement: ${validation.errors.join(', ')}`);
      return ''; // Return empty string for invalid settings
    }

    const sanitizedSettings = sanitizeCommitModeSettings(settings);
    return commitManager.getPromptEnhancement(sanitizedSettings);
  });
}
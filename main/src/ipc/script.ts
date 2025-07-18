import { IpcMain } from 'electron';
import type { AppServices } from './types';

export function registerScriptHandlers(ipcMain: IpcMain, { sessionManager }: AppServices): void {
  // Script execution handlers
  ipcMain.handle('sessions:has-run-script', async (_event, sessionId: string) => {
    try {
      const runScript = sessionManager.getProjectRunScript(sessionId);
      return { success: true, data: !!runScript };
    } catch (error) {
      console.error('Failed to check run script:', error);
      return { success: false, error: 'Failed to check run script' };
    }
  });

  ipcMain.handle('sessions:get-running-session', async () => {
    try {
      const runningSessionId = sessionManager.getCurrentRunningSessionId();
      return { success: true, data: runningSessionId };
    } catch (error) {
      console.error('Failed to get running session:', error);
      return { success: false, error: 'Failed to get running session' };
    }
  });

  ipcMain.handle('sessions:run-script', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      const commands = sessionManager.getProjectRunScript(sessionId);
      if (!commands) {
        return { success: false, error: 'No run script configured for this project' };
      }

      await sessionManager.runScript(sessionId, commands, session.worktreePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to run script:', error);
      return { success: false, error: 'Failed to run script' };
    }
  });

  ipcMain.handle('sessions:stop-script', async () => {
    try {
      await sessionManager.stopRunningScript();
      return { success: true };
    } catch (error) {
      console.error('Failed to stop script:', error);
      return { success: false, error: 'Failed to stop script' };
    }
  });

  ipcMain.handle('sessions:run-terminal-command', async (_event, sessionId: string, command: string) => {
    try {
      await sessionManager.runTerminalCommand(sessionId, command);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to run terminal command';
      
      // Don't log error for archived sessions - this is expected
      if (!errorMessage.includes('archived session')) {
        console.error('Failed to run terminal command:', error);
      }
      
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sessions:send-terminal-input', async (_event, sessionId: string, data: string) => {
    try {
      await sessionManager.sendTerminalInput(sessionId, data);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send terminal input';
      
      // Don't log error for archived sessions - this is expected
      if (!errorMessage.includes('archived session')) {
        console.error('Failed to send terminal input:', error);
      }
      
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sessions:pre-create-terminal', async (_event, sessionId: string) => {
    try {
      await sessionManager.preCreateTerminalSession(sessionId);
      return { success: true };
    } catch (error) {
      console.error('Failed to pre-create terminal session:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to pre-create terminal session' };
    }
  });

  ipcMain.handle('sessions:resize-terminal', async (_event, sessionId: string, cols: number, rows: number) => {
    try {
      sessionManager.resizeTerminal(sessionId, cols, rows);
      return { success: true };
    } catch (error) {
      console.error('Failed to resize terminal:', error);
      return { success: false, error: 'Failed to resize terminal' };
    }
  });

  ipcMain.handle('sessions:open-ide', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      const project = sessionManager.getProjectForSession(sessionId);
      if (!project || !project.open_ide_command) {
        return { success: false, error: 'No IDE command configured for this project' };
      }

      // Execute the IDE command in the worktree directory
      const { exec } = require('child_process');
      exec(project.open_ide_command, { cwd: session.worktreePath }, (error: Error | null) => {
        if (error) {
          console.error('Failed to open IDE:', error);
        } else {
          console.log('Successfully opened IDE for session:', sessionId);
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to open IDE:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open IDE' };
    }
  });
} 
import { IpcMain } from 'electron';
import type { AppServices } from './types';
import { getShellPath, findExecutableInPath } from '../utils/shellPath';
import { logsManager } from '../services/panels/logPanel/logsManager';
import { panelManager } from '../services/panelManager';
import { ExecException } from 'child_process';
import { scriptExecutionTracker } from '../services/scriptExecutionTracker';

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

      // Check if there's already a running script (any type) and stop it
      const runningScript = scriptExecutionTracker.getRunningScript();
      if (runningScript) {
        console.log(`[Script] Stopping currently running ${runningScript.type} script for ${runningScript.type}:${runningScript.id} before starting new script for session ${sessionId}`);

        // Mark the old script as closing
        scriptExecutionTracker.markClosing(runningScript.type, runningScript.id);

        // Stop the script based on its type
        if (runningScript.type === 'session') {
          console.log('[Script] Stopping session script via logs panel');
          // Find and stop the logs panel for this session
          const panels = await panelManager.getPanelsForSession(runningScript.id as string);
          const logsPanel = panels?.find((p: { type: string }) => p.type === 'logs');
          if (logsPanel) {
            console.log('[Script] Found logs panel, stopping:', logsPanel.id);
            await logsManager.stopScript(logsPanel.id);
          } else {
            console.log('[Script] No logs panel found, calling sessionManager.stopRunningScript');
            await sessionManager.stopRunningScript();
          }
          // Ensure tracker is updated
          scriptExecutionTracker.stop('session', runningScript.id);
          console.log('[Script] Session script stopped and tracker updated');
        } else if (runningScript.type === 'project') {
          // Stop project script through logs panel
          if (runningScript.sessionId) {
            const panels = await panelManager.getPanelsForSession(runningScript.sessionId);
            const logsPanel = panels?.find((p: { type: string }) => p.type === 'logs');
            if (logsPanel) {
              await logsManager.stopScript(logsPanel.id);
            }
          }
          // Mark as stopped
          scriptExecutionTracker.stop('project', runningScript.id);
        }
      }

      console.log(`[Script] Starting new script for session ${sessionId}`);

      // Use logs panel instead of old script running mechanism
      const commandString = commands.join(' && ');
      await logsManager.runScript(sessionId, commandString, session.worktreePath);

      console.log(`[Script] Script started successfully for session ${sessionId}`);

      // Track this session script as running
      scriptExecutionTracker.start('session', sessionId);

      return { success: true };
    } catch (error) {
      console.error('Failed to run script:', error);

      // Clear running state on error
      scriptExecutionTracker.stop('session', sessionId);

      return { success: false, error: 'Failed to run script' };
    }
  });

  ipcMain.handle('sessions:stop-script', async (_event, sessionId?: string) => {
    try {
      // If sessionId provided, stop that session's logs panel
      // Otherwise stop the old running script (for backward compatibility)
      if (sessionId) {
        const panels = await panelManager.getPanelsForSession(sessionId);
        const logsPanel = panels?.find((p: { type: string }) => p.type === 'logs');
        if (logsPanel) {
          await logsManager.stopScript(logsPanel.id);
        }
      } else {
        // Get running script info before stopping
        const runningScript = scriptExecutionTracker.getRunningScript();

        console.log('[Script] Stopping script (no sessionId provided), running script:', runningScript);

        // If it's a session script, stop the logs panel process (critical!)
        if (runningScript && runningScript.type === 'session') {
          console.log('[Script] Finding logs panel for session:', runningScript.id);
          const panels = await panelManager.getPanelsForSession(runningScript.id as string);
          const logsPanel = panels?.find((p: { type: string }) => p.type === 'logs');
          if (logsPanel) {
            console.log('[Script] Stopping logs panel:', logsPanel.id);
            await logsManager.stopScript(logsPanel.id);
            console.log('[Script] Logs panel stopped successfully');
          } else {
            console.log('[Script] No logs panel found for session');
          }
        }

        // Also call old mechanism for backward compatibility
        await sessionManager.stopRunningScript();

        // Ensure tracker is updated even if sessionManager's internal update fails
        if (runningScript && runningScript.type === 'session') {
          console.log('[Script] Updating tracker to stopped state for session:', runningScript.id);
          scriptExecutionTracker.stop('session', runningScript.id);
        }

        console.log('[Script] Stop script completed');
      }
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
      
      // Get enhanced shell PATH for packaged apps
      const shellPath = getShellPath();
      
      console.log(`[IDE] Opening IDE with command: ${project.open_ide_command}`);
      console.log(`[IDE] Working directory: ${session.worktreePath}`);
      console.log(`[IDE] Using PATH: ${shellPath.split(':').slice(0, 5).join(':')}...`);
      
      // Wrap exec in a Promise to wait for completion
      return new Promise((resolve) => {
        exec(
          project.open_ide_command,
          {
            cwd: session.worktreePath,
            shell: true,
            env: {
              ...process.env,
              PATH: shellPath  // Use enhanced PATH that includes user's shell PATH
            }
          },
          (error: ExecException | null, stdout: string, stderr: string) => {
            if (error) {
              console.error('Failed to open IDE:', error);
              console.error('stdout:', stdout);
              console.error('stderr:', stderr);
              
              let errorMessage = 'Failed to open IDE';
              
              // Provide more specific error messages
              if (error.code === 127 || stderr.includes('command not found')) {
                // Try to extract just the command name (e.g., "code" from "code .")
                const commandParts = project.open_ide_command!.trim().split(/\s+/);
                const commandName = commandParts[0];
                
                // Try to find the executable in PATH
                const foundPath = findExecutableInPath(commandName);
                
                if (foundPath) {
                  errorMessage = `IDE command not found: ${project.open_ide_command}.\n\nThe command '${commandName}' was found at: ${foundPath}\n\nTry updating your project settings to use the full path:\n${foundPath} .`;
                } else {
                  errorMessage = `IDE command not found: ${project.open_ide_command}.\n\nMake sure the command is in your PATH or use a full path.\n\nFor VS Code, try: /Applications/Visual\\ Studio\\ Code.app/Contents/Resources/app/bin/code .`;
                }
              } else if (error.code) {
                errorMessage = `IDE command failed with exit code ${error.code}: ${stderr || error.message}`;
              } else {
                errorMessage = `Failed to open IDE: ${error.message}`;
              }
              
              resolve({ success: false, error: errorMessage });
            } else {
              console.log('Successfully opened IDE for session:', sessionId);
              if (stdout) console.log('IDE command output:', stdout);
              resolve({ success: true });
            }
          }
        );
      });
    } catch (error) {
      console.error('Failed to open IDE:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to open IDE' };
    }
  });

  // Logs panel specific handlers
  ipcMain.handle('logs:runScript', async (_event, sessionId: string, command: string, cwd: string) => {
    try {
      await logsManager.runScript(sessionId, command, cwd);
      return { success: true };
    } catch (error) {
      console.error('Failed to run script in logs panel:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to run script' };
    }
  });

  ipcMain.handle('logs:stopScript', async (_event, panelId: string) => {
    try {
      await logsManager.stopScript(panelId);
      return { success: true };
    } catch (error) {
      console.error('Failed to stop script in logs panel:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to stop script' };
    }
  });

  ipcMain.handle('logs:isRunning', async (_event, sessionId: string) => {
    try {
      const isRunning = await logsManager.isRunning(sessionId);
      return { success: true, data: isRunning };
    } catch (error) {
      console.error('Failed to check if script is running:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to check script status' };
    }
  });
} 
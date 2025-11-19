import { IpcMain } from 'electron';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import type { AppServices } from './types';

const NIMBALYST_PATH = '/Applications/Nimbalyst.app/Contents/MacOS/Nimbalyst';

export function registerNimbalystHandlers(ipcMain: IpcMain, services: AppServices): void {
  // Check if Nimbalyst is installed
  ipcMain.handle('nimbalyst:check-installed', () => {
    try {
      const isInstalled = existsSync(NIMBALYST_PATH);
      return { success: true, data: isInstalled };
    } catch (error) {
      console.error('Error checking Nimbalyst installation:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to check Nimbalyst installation' };
    }
  });

  // Open a worktree in Nimbalyst
  ipcMain.handle('nimbalyst:open-worktree', async (_event, worktreePath: string) => {
    try {
      // Check if Nimbalyst is installed
      if (!existsSync(NIMBALYST_PATH)) {
        return {
          success: false,
          error: 'Nimbalyst is not installed. Please download it from https://nimbalyst.com/'
        };
      }

      // Check if worktree path exists
      if (!existsSync(worktreePath)) {
        return {
          success: false,
          error: `Worktree path does not exist: ${worktreePath}`
        };
      }

      // Spawn Nimbalyst with the worktree path and git-worktree filter
      const args = ['--workspace', worktreePath, '--filter', 'git-worktree'];
      console.log('[Nimbalyst] Opening with command:', NIMBALYST_PATH, args.join(' '));
      console.log('[Nimbalyst] Full args array:', JSON.stringify(args));

      const child = spawn(NIMBALYST_PATH, args, {
        detached: true,
        stdio: 'ignore'
      });

      // Unref the child process so it can continue running independently
      child.unref();

      console.log('[Nimbalyst] Process spawned successfully for worktree:', worktreePath);

      return { success: true };
    } catch (error) {
      console.error('Error opening worktree in Nimbalyst:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open worktree in Nimbalyst'
      };
    }
  });
}

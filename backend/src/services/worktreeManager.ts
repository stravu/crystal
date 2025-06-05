import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { mkdir } from 'fs/promises';

const execAsync = promisify(exec);

export class WorktreeManager {
  private baseDir: string;
  private mainRepoPath: string;

  constructor(mainRepoPath: string, worktreesBaseDir: string = 'worktrees') {
    this.mainRepoPath = mainRepoPath;
    this.baseDir = join(mainRepoPath, worktreesBaseDir);
  }

  async initialize(): Promise<void> {
    try {
      await mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create worktrees directory:', error);
    }
  }

  async createWorktree(name: string, branch?: string): Promise<string> {
    const worktreePath = join(this.baseDir, name);
    const branchName = branch || name;

    try {
      // Clean up any existing worktree directory first
      try {
        await execAsync(`cd "${this.mainRepoPath}" && git worktree remove "${worktreePath}" --force 2>/dev/null || true`);
      } catch {
        // Ignore cleanup errors
      }

      // Check if branch already exists
      const checkBranchCmd = `cd "${this.mainRepoPath}" && git show-ref --verify --quiet refs/heads/${branchName}`;
      let branchExists = false;
      try {
        await execAsync(checkBranchCmd);
        branchExists = true;
      } catch {
        // Branch doesn't exist, will create it
      }

      if (branchExists) {
        // Use existing branch
        await execAsync(`cd "${this.mainRepoPath}" && git worktree add "${worktreePath}" ${branchName}`);
      } else {
        // Create new branch from current HEAD and add worktree
        await execAsync(`cd "${this.mainRepoPath}" && git worktree add -b ${branchName} "${worktreePath}"`);
      }
      
      return worktreePath;
    } catch (error) {
      throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeWorktree(name: string): Promise<void> {
    const worktreePath = join(this.baseDir, name);
    
    try {
      await execAsync(`cd ${this.mainRepoPath} && git worktree remove "${worktreePath}" --force`);
    } catch (error: any) {
      const errorMessage = error.stderr || error.stdout || error.message || String(error);
      
      // If the worktree is not found, that's okay - it might have been manually deleted
      if (errorMessage.includes('is not a working tree') || 
          errorMessage.includes('does not exist') ||
          errorMessage.includes('No such file or directory')) {
        console.log(`Worktree ${worktreePath} already removed or doesn't exist, skipping...`);
        return;
      }
      
      // For other errors, still throw
      throw new Error(`Failed to remove worktree: ${errorMessage}`);
    }
  }

  async listWorktrees(): Promise<Array<{ path: string; branch: string }>> {
    try {
      const { stdout } = await execAsync(`cd ${this.mainRepoPath} && git worktree list --porcelain`);
      
      const worktrees: Array<{ path: string; branch: string }> = [];
      const lines = stdout.split('\n');
      
      let currentWorktree: { path?: string; branch?: string } = {};
      
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path && currentWorktree.branch) {
            worktrees.push({ 
              path: currentWorktree.path, 
              branch: currentWorktree.branch 
            });
          }
          currentWorktree = { path: line.substring(9) };
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
        }
      }
      
      if (currentWorktree.path && currentWorktree.branch) {
        worktrees.push({ 
          path: currentWorktree.path, 
          branch: currentWorktree.branch 
        });
      }
      
      return worktrees;
    } catch (error) {
      throw new Error(`Failed to list worktrees: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
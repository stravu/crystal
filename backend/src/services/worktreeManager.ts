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
      const checkBranchCmd = `cd ${this.mainRepoPath} && git show-ref --verify --quiet refs/heads/${branchName}`;
      try {
        await execAsync(checkBranchCmd);
      } catch {
        await execAsync(`cd ${this.mainRepoPath} && git branch ${branchName}`);
      }

      await execAsync(`cd ${this.mainRepoPath} && git worktree add "${worktreePath}" ${branchName}`);
      
      return worktreePath;
    } catch (error) {
      throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeWorktree(name: string): Promise<void> {
    const worktreePath = join(this.baseDir, name);
    
    try {
      await execAsync(`cd ${this.mainRepoPath} && git worktree remove "${worktreePath}" --force`);
    } catch (error) {
      throw new Error(`Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`);
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
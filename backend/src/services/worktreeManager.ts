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

  async getFileChanges(worktreePath1: string, worktreePath2: string): Promise<Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>> {
    try {
      // Use git diff to compare the two worktrees by comparing their working directories
      const { stdout } = await execAsync(`cd "${worktreePath1}" && git diff --name-status "${worktreePath2}"`);
      
      const changes: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }> = [];
      const lines = stdout.trim().split('\n').filter(line => line.length > 0);
      
      for (const line of lines) {
        const [statusChar, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t'); // Handle paths with tabs
        
        let status: 'added' | 'modified' | 'deleted';
        switch (statusChar) {
          case 'A':
            status = 'added';
            break;
          case 'M':
            status = 'modified';
            break;
          case 'D':
            status = 'deleted';
            break;
          default:
            status = 'modified'; // Default for other status codes
        }
        
        changes.push({ path, status });
      }
      
      return changes;
    } catch (error) {
      // If git diff fails, return empty array (no changes)
      return [];
    }
  }

  async getFileDiff(worktreePath1: string, worktreePath2: string, filePath: string): Promise<string> {
    try {
      // Get diff for a specific file between two worktrees
      const { stdout } = await execAsync(`cd "${worktreePath1}" && git diff --no-index "${worktreePath2}/${filePath}" "${filePath}" || true`);
      return stdout;
    } catch (error) {
      // If file doesn't exist in one or both locations, try different approaches
      try {
        const { stdout } = await execAsync(`cd "${this.mainRepoPath}" && git diff --no-index "${worktreePath1}/${filePath}" "${worktreePath2}/${filePath}" || true`);
        return stdout;
      } catch {
        return `Error: Could not generate diff for ${filePath}`;
      }
    }
  }
}
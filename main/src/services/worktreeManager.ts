import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { mkdir } from 'fs/promises';

const execAsync = promisify(exec);

export class WorktreeManager {
  private projectsCache: Map<string, { baseDir: string }> = new Map();

  constructor() {
    // No longer initialized with a single repo path
  }

  private getProjectPaths(projectPath: string) {
    if (!this.projectsCache.has(projectPath)) {
      this.projectsCache.set(projectPath, {
        baseDir: join(projectPath, 'worktrees')
      });
    }
    return this.projectsCache.get(projectPath)!;
  }

  async initializeProject(projectPath: string): Promise<void> {
    const { baseDir } = this.getProjectPaths(projectPath);
    try {
      await mkdir(baseDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create worktrees directory:', error);
    }
  }

  async createWorktree(projectPath: string, name: string, branch?: string): Promise<string> {
    console.log(`[WorktreeManager] Creating worktree: ${name} in project: ${projectPath}`);
    
    const { baseDir } = this.getProjectPaths(projectPath);
    const worktreePath = join(baseDir, name);
    const branchName = branch || name;
    
    console.log(`[WorktreeManager] Worktree path: ${worktreePath}, branch: ${branchName}`);

    try {
      // Clean up any existing worktree directory first
      console.log(`[WorktreeManager] Cleaning up any existing worktree...`);
      try {
        await execAsync(`cd "${projectPath}" && git worktree remove "${worktreePath}" --force 2>/dev/null || true`);
      } catch {
        // Ignore cleanup errors
      }

      // Check if the repository has any commits
      let hasCommits = false;
      try {
        await execAsync(`cd "${projectPath}" && git rev-parse HEAD`);
        hasCommits = true;
      } catch (error) {
        // Repository has no commits yet, create initial commit
        const addCmd = `cd "${projectPath}" && git add -A || true`;
        const commitCmd = `cd "${projectPath}" && git commit -m "Initial commit" --allow-empty`;
        await execAsync(addCmd);
        await execAsync(commitCmd);
        hasCommits = true;
      }

      // Check if branch already exists
      console.log(`[WorktreeManager] Checking if branch ${branchName} exists...`);
      const checkBranchCmd = `cd "${projectPath}" && git show-ref --verify --quiet refs/heads/${branchName}`;
      let branchExists = false;
      try {
        await execAsync(checkBranchCmd);
        branchExists = true;
        console.log(`[WorktreeManager] Branch ${branchName} already exists`);
      } catch {
        console.log(`[WorktreeManager] Branch ${branchName} does not exist, will create it`);
        // Branch doesn't exist, will create it
      }

      if (branchExists) {
        // Use existing branch
        console.log(`[WorktreeManager] Adding worktree with existing branch...`);
        await execAsync(`cd "${projectPath}" && git worktree add "${worktreePath}" ${branchName}`);
      } else {
        // Create new branch from current HEAD and add worktree
        console.log(`[WorktreeManager] Creating new branch and adding worktree...`);
        await execAsync(`cd "${projectPath}" && git worktree add -b ${branchName} "${worktreePath}"`);
      }
      
      console.log(`[WorktreeManager] Worktree created successfully at: ${worktreePath}`);
      return worktreePath;
    } catch (error) {
      console.error(`[WorktreeManager] Failed to create worktree:`, error);
      throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeWorktree(projectPath: string, name: string): Promise<void> {
    const { baseDir } = this.getProjectPaths(projectPath);
    const worktreePath = join(baseDir, name);
    
    try {
      await execAsync(`cd ${projectPath} && git worktree remove "${worktreePath}" --force`);
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

  async listWorktrees(projectPath: string): Promise<Array<{ path: string; branch: string }>> {
    try {
      const { stdout } = await execAsync(`cd ${projectPath} && git worktree list --porcelain`);
      
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
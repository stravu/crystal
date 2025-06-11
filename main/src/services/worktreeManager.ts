import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { getShellPath } from '../utils/shellPath';

const execAsync = promisify(exec);

// Wrapper for execAsync that includes enhanced PATH
async function execWithShellPath(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string }> {
  const shellPath = getShellPath();
  return execAsync(command, {
    ...options,
    env: {
      ...process.env,
      PATH: shellPath
    }
  });
}

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

  async createWorktree(projectPath: string, name: string, branch?: string): Promise<{ worktreePath: string }> {
    console.log(`[WorktreeManager] Creating worktree: ${name} in project: ${projectPath}`);
    
    const { baseDir } = this.getProjectPaths(projectPath);
    const worktreePath = join(baseDir, name);
    const branchName = branch || name;
    
    console.log(`[WorktreeManager] Worktree path: ${worktreePath}, branch: ${branchName}`);

    try {
      // First check if this is a git repository
      let isGitRepo = false;
      try {
        await execWithShellPath(`git rev-parse --is-inside-work-tree`, { cwd: projectPath });
        isGitRepo = true;
        console.log(`[WorktreeManager] Directory is a git repository`);
      } catch (error) {
        console.log(`[WorktreeManager] Directory is not a git repository, initializing...`);
        // Initialize git repository
        await execWithShellPath(`git init`, { cwd: projectPath });
        console.log(`[WorktreeManager] Git repository initialized`);
      }

      // Clean up any existing worktree directory first
      console.log(`[WorktreeManager] Cleaning up any existing worktree...`);
      try {
        // Use cross-platform approach without shell redirection
        try {
          await execWithShellPath(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
        } catch {
          // Ignore cleanup errors
        }
      } catch {
        // Ignore cleanup errors
      }

      // Check if the repository has any commits
      let hasCommits = false;
      try {
        await execWithShellPath(`git rev-parse HEAD`, { cwd: projectPath });
        hasCommits = true;
      } catch (error) {
        // Repository has no commits yet, create initial commit
        console.log(`[WorktreeManager] No commits found, creating initial commit...`);
        // Use cross-platform approach without shell operators
        try {
          await execWithShellPath(`git add -A`, { cwd: projectPath });
        } catch {
          // Ignore add errors (no files to add)
        }
        await execWithShellPath(`git commit -m "Initial commit" --allow-empty`, { cwd: projectPath });
        hasCommits = true;
        console.log(`[WorktreeManager] Initial commit created`);
      }

      // Check if branch already exists
      console.log(`[WorktreeManager] Checking if branch ${branchName} exists...`);
      const checkBranchCmd = `git show-ref --verify --quiet refs/heads/${branchName}`;
      let branchExists = false;
      try {
        await execWithShellPath(checkBranchCmd, { cwd: projectPath });
        branchExists = true;
        console.log(`[WorktreeManager] Branch ${branchName} already exists`);
      } catch {
        console.log(`[WorktreeManager] Branch ${branchName} does not exist, will create it`);
        // Branch doesn't exist, will create it
      }

      if (branchExists) {
        // Use existing branch
        console.log(`[WorktreeManager] Adding worktree with existing branch...`);
        await execWithShellPath(`git worktree add "${worktreePath}" ${branchName}`, { cwd: projectPath });
      } else {
        // Create new branch from current HEAD and add worktree
        console.log(`[WorktreeManager] Creating new branch and adding worktree...`);
        await execWithShellPath(`git worktree add -b ${branchName} "${worktreePath}"`, { cwd: projectPath });
      }
      
      console.log(`[WorktreeManager] Worktree created successfully at: ${worktreePath}`);
      
      return { worktreePath };
    } catch (error) {
      console.error(`[WorktreeManager] Failed to create worktree:`, error);
      throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeWorktree(projectPath: string, name: string): Promise<void> {
    const { baseDir } = this.getProjectPaths(projectPath);
    const worktreePath = join(baseDir, name);
    
    try {
      await execWithShellPath(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
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
      const { stdout } = await execWithShellPath(`git worktree list --porcelain`, { cwd: projectPath });
      
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

  async detectMainBranch(projectPath: string): Promise<string> {
    try {
      // Try to get the default branch from remote first
      try {
        // Use cross-platform approach
        let remoteHead = '';
        try {
          const result = await execWithShellPath(`git symbolic-ref refs/remotes/origin/HEAD`, { cwd: projectPath });
          remoteHead = result.stdout;
        } catch {
          // Remote HEAD not available
          remoteHead = '';
        }
        if (remoteHead.trim()) {
          const mainBranch = remoteHead.trim().replace('refs/remotes/origin/', '');
          console.log(`[WorktreeManager] Detected main branch from remote: ${mainBranch}`);
          return mainBranch;
        }
      } catch {
        // Remote HEAD not available, continue with other methods
      }

      // Try to get current branch
      try {
        // Use cross-platform approach
        let currentBranch = '';
        try {
          const result = await execWithShellPath(`git branch --show-current`, { cwd: projectPath });
          currentBranch = result.stdout;
        } catch {
          // Current branch not available
          currentBranch = '';
        }
        if (currentBranch.trim()) {
          console.log(`[WorktreeManager] Using current branch as main: ${currentBranch.trim()}`);
          return currentBranch.trim();
        }
      } catch {
        // Current branch not available
      }

      // Try common main branch names
      const commonNames = ['main', 'master', 'develop', 'dev'];
      for (const branchName of commonNames) {
        try {
          await execWithShellPath(`git show-ref --verify --quiet refs/heads/${branchName}`, { cwd: projectPath });
          console.log(`[WorktreeManager] Found common main branch: ${branchName}`);
          return branchName;
        } catch {
          // Branch doesn't exist, try next
        }
      }

      // Fallback to 'main' as default
      console.log(`[WorktreeManager] No main branch detected, defaulting to 'main'`);
      return 'main';
    } catch (error) {
      console.error(`[WorktreeManager] Error detecting main branch:`, error);
      return 'main';
    }
  }

  async hasChangesToRebase(worktreePath: string, mainBranch: string): Promise<boolean> {
    try {
      // Check if main branch has commits that the current branch doesn't have
      // Use cross-platform approach
      let stdout = '0';
      try {
        const result = await execWithShellPath(`git rev-list --count HEAD..${mainBranch}`, { cwd: worktreePath });
        stdout = result.stdout;
      } catch {
        // Error checking, assume no changes
        stdout = '0';
      }
      const commitCount = parseInt(stdout.trim());
      return commitCount > 0;
    } catch (error) {
      console.error(`[WorktreeManager] Error checking for changes to rebase:`, error);
      return false;
    }
  }

  async rebaseMainIntoWorktree(worktreePath: string, mainBranch: string): Promise<void> {
    const executedCommands: string[] = [];
    let lastOutput = '';
    
    try {
      console.log(`[WorktreeManager] Rebasing ${mainBranch} into worktree: ${worktreePath}`);
      
      // First, fetch the latest changes from the main branch
      let command = `git fetch origin ${mainBranch}`;
      executedCommands.push(`${command} (in ${worktreePath})`);
      try {
        const fetchResult = await execWithShellPath(command, { cwd: worktreePath });
        lastOutput = fetchResult.stdout || fetchResult.stderr || '';
        console.log(`[WorktreeManager] Fetched latest ${mainBranch}`);
      } catch (fetchError: any) {
        // Fetch might fail if there's no remote, continue anyway
        console.log(`[WorktreeManager] Fetch failed (might not have remote), continuing...`);
        lastOutput = fetchError.stderr || fetchError.stdout || '';
      }
      
      // Rebase the current worktree branch onto main
      command = `git rebase ${mainBranch}`;
      executedCommands.push(`${command} (in ${worktreePath})`);
      const rebaseResult = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = rebaseResult.stdout || rebaseResult.stderr || '';
      
      console.log(`[WorktreeManager] Successfully rebased ${mainBranch} into worktree`);
    } catch (error: any) {
      console.error(`[WorktreeManager] Failed to rebase ${mainBranch} into worktree:`, error);
      
      // Create detailed error with git command output
      const gitError = new Error(`Failed to rebase ${mainBranch} into worktree`) as any;
      gitError.gitCommand = executedCommands.join(' && ');
      gitError.gitOutput = error.stderr || error.stdout || lastOutput || error.message || '';
      gitError.workingDirectory = worktreePath;
      gitError.originalError = error;
      
      throw gitError;
    }
  }

  async squashAndRebaseWorktreeToMain(projectPath: string, worktreePath: string, mainBranch: string, commitMessage: string): Promise<void> {
    const executedCommands: string[] = [];
    let lastOutput = '';
    
    try {
      console.log(`[WorktreeManager] Squashing and rebasing worktree to ${mainBranch}: ${worktreePath}`);
      
      // Get current branch name in worktree
      let command = `git branch --show-current`;
      executedCommands.push(`git branch --show-current (in ${worktreePath})`);
      const { stdout: currentBranch, stderr: stderr1 } = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = currentBranch || stderr1 || '';
      const branchName = currentBranch.trim();
      console.log(`[WorktreeManager] Current branch: ${branchName}`);
      
      // Get the base commit (where the worktree branch diverged from main)
      command = `git merge-base ${mainBranch} HEAD`;
      executedCommands.push(`git merge-base ${mainBranch} HEAD (in ${worktreePath})`);
      const { stdout: baseCommit, stderr: stderr2 } = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = baseCommit || stderr2 || '';
      const base = baseCommit.trim();
      console.log(`[WorktreeManager] Base commit: ${base}`);
      
      // Check if there are any changes to squash
      command = `git log --oneline ${base}..HEAD`;
      const { stdout: commits } = await execWithShellPath(command, { cwd: worktreePath });
      if (!commits.trim()) {
        throw new Error(`No commits to squash. The branch is already up to date with ${mainBranch}.`);
      }
      console.log(`[WorktreeManager] Commits to squash:\n${commits}`);
      
      // Squash all commits since base into one
      command = `git reset --soft ${base}`;
      executedCommands.push(`git reset --soft ${base} (in ${worktreePath})`);
      const resetResult = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = resetResult.stdout || resetResult.stderr || '';
      console.log(`[WorktreeManager] Reset to base commit`);
      
      // Properly escape commit message for cross-platform compatibility
      const escapedMessage = commitMessage.replace(/"/g, '\\"');
      command = `git commit -m "${escapedMessage}"`;
      executedCommands.push(`git commit -m "..." (in ${worktreePath})`);
      const commitResult = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = commitResult.stdout || commitResult.stderr || '';
      console.log(`[WorktreeManager] Created squashed commit`);
      
      // Switch to main branch in the main repository
      command = `git checkout ${mainBranch}`;
      executedCommands.push(`git checkout ${mainBranch} (in ${projectPath})`);
      const checkoutResult = await execWithShellPath(command, { cwd: projectPath });
      lastOutput = checkoutResult.stdout || checkoutResult.stderr || '';
      console.log(`[WorktreeManager] Switched to ${mainBranch} in main repository`);
      
      // Rebase the squashed commit onto main
      command = `git rebase ${branchName}`;
      executedCommands.push(`git rebase ${branchName} (in ${projectPath})`);
      const rebaseResult = await execWithShellPath(command, { cwd: projectPath });
      lastOutput = rebaseResult.stdout || rebaseResult.stderr || '';
      console.log(`[WorktreeManager] Successfully rebased ${branchName} onto ${mainBranch}`);
      
      console.log(`[WorktreeManager] Successfully squashed and rebased worktree to ${mainBranch}`);
    } catch (error: any) {
      console.error(`[WorktreeManager] Failed to squash and rebase worktree to ${mainBranch}:`, error);
      
      // Create detailed error with git command output
      const gitError = new Error(`Failed to squash and rebase worktree to ${mainBranch}`) as any;
      gitError.gitCommands = executedCommands;
      gitError.gitOutput = error.stderr || error.stdout || lastOutput || error.message || '';
      gitError.workingDirectory = worktreePath;
      gitError.projectPath = projectPath;
      gitError.originalError = error;
      
      throw gitError;
    }
  }

  generateRebaseCommands(mainBranch: string): string[] {
    return [
      `git rebase ${mainBranch}`
    ];
  }

  generateSquashCommands(mainBranch: string, branchName: string): string[] {
    return [
      `git merge-base ${mainBranch} HEAD`,
      `git reset --soft <base-commit>`,
      `git commit -m "Squashed commit message"`,
      `git checkout ${mainBranch}`,
      `git rebase ${branchName}`
    ];
  }
}
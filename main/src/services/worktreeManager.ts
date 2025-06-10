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

  async createWorktree(projectPath: string, name: string, branch?: string, buildScript?: string): Promise<{ worktreePath: string; buildOutput: Array<{ type: string; data: string; timestamp: Date }> }> {
    console.log(`[WorktreeManager] Creating worktree: ${name} in project: ${projectPath}`);
    console.log(`[WorktreeManager] Received buildScript parameter:`, buildScript);
    
    const { baseDir } = this.getProjectPaths(projectPath);
    const worktreePath = join(baseDir, name);
    const branchName = branch || name;
    
    console.log(`[WorktreeManager] Worktree path: ${worktreePath}, branch: ${branchName}`);

    try {
      // First check if this is a git repository
      let isGitRepo = false;
      try {
        await execWithShellPath(`cd "${projectPath}" && git rev-parse --is-inside-work-tree`);
        isGitRepo = true;
        console.log(`[WorktreeManager] Directory is a git repository`);
      } catch (error) {
        console.log(`[WorktreeManager] Directory is not a git repository, initializing...`);
        // Initialize git repository
        await execWithShellPath(`cd "${projectPath}" && git init`);
        console.log(`[WorktreeManager] Git repository initialized`);
      }

      // Clean up any existing worktree directory first
      console.log(`[WorktreeManager] Cleaning up any existing worktree...`);
      try {
        await execWithShellPath(`cd "${projectPath}" && git worktree remove "${worktreePath}" --force 2>/dev/null || true`);
      } catch {
        // Ignore cleanup errors
      }

      // Check if the repository has any commits
      let hasCommits = false;
      try {
        await execWithShellPath(`cd "${projectPath}" && git rev-parse HEAD`);
        hasCommits = true;
      } catch (error) {
        // Repository has no commits yet, create initial commit
        console.log(`[WorktreeManager] No commits found, creating initial commit...`);
        const addCmd = `cd "${projectPath}" && git add -A || true`;
        const commitCmd = `cd "${projectPath}" && git commit -m "Initial commit" --allow-empty`;
        await execWithShellPath(addCmd);
        await execWithShellPath(commitCmd);
        hasCommits = true;
        console.log(`[WorktreeManager] Initial commit created`);
      }

      // Check if branch already exists
      console.log(`[WorktreeManager] Checking if branch ${branchName} exists...`);
      const checkBranchCmd = `cd "${projectPath}" && git show-ref --verify --quiet refs/heads/${branchName}`;
      let branchExists = false;
      try {
        await execWithShellPath(checkBranchCmd);
        branchExists = true;
        console.log(`[WorktreeManager] Branch ${branchName} already exists`);
      } catch {
        console.log(`[WorktreeManager] Branch ${branchName} does not exist, will create it`);
        // Branch doesn't exist, will create it
      }

      if (branchExists) {
        // Use existing branch
        console.log(`[WorktreeManager] Adding worktree with existing branch...`);
        await execWithShellPath(`cd "${projectPath}" && git worktree add "${worktreePath}" ${branchName}`);
      } else {
        // Create new branch from current HEAD and add worktree
        console.log(`[WorktreeManager] Creating new branch and adding worktree...`);
        await execWithShellPath(`cd "${projectPath}" && git worktree add -b ${branchName} "${worktreePath}"`);
      }
      
      console.log(`[WorktreeManager] Worktree created successfully at: ${worktreePath}`);
      
      const buildOutput: Array<{ type: string; data: string; timestamp: Date }> = [];
      
      // Run build script if provided
      if (buildScript) {
        console.log(`[WorktreeManager] Running build script...`);
        console.log(`[WorktreeManager] Build script content:`, buildScript);
        try {
          // Split build script into individual commands and run them sequentially
          const commands = buildScript.split('\n').filter(cmd => cmd.trim());
          
          for (const command of commands) {
            if (command.trim()) {
              console.log(`[WorktreeManager] Executing: ${command}`);
              
              // Add command to output
              buildOutput.push({
                type: 'stdout',
                data: `\x1b[1m\x1b[34m$ ${command}\x1b[0m\n`,
                timestamp: new Date()
              });
              
              const { stdout, stderr } = await execWithShellPath(`cd "${worktreePath}" && ${command}`);
              
              if (stdout) {
                console.log(`[WorktreeManager] Output:`, stdout);
                buildOutput.push({
                  type: 'stdout',
                  data: stdout,
                  timestamp: new Date()
                });
              }
              if (stderr) {
                console.log(`[WorktreeManager] Warning:`, stderr);
                buildOutput.push({
                  type: 'stderr',
                  data: stderr,
                  timestamp: new Date()
                });
              }
            }
          }
          
          console.log(`[WorktreeManager] Build script completed successfully`);
        } catch (error: any) {
          console.error(`[WorktreeManager] Build script failed:`, error);
          // Don't throw - we still want to create the session even if build fails
          console.warn(`[WorktreeManager] Continuing despite build script failure`);
        }
      }
      
      return { worktreePath, buildOutput };
    } catch (error) {
      console.error(`[WorktreeManager] Failed to create worktree:`, error);
      throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeWorktree(projectPath: string, name: string): Promise<void> {
    const { baseDir } = this.getProjectPaths(projectPath);
    const worktreePath = join(baseDir, name);
    
    try {
      await execWithShellPath(`cd ${projectPath} && git worktree remove "${worktreePath}" --force`);
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
      const { stdout } = await execWithShellPath(`cd ${projectPath} && git worktree list --porcelain`);
      
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
        const { stdout: remoteHead } = await execWithShellPath(`cd "${projectPath}" && git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || true`);
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
        const { stdout: currentBranch } = await execWithShellPath(`cd "${projectPath}" && git branch --show-current 2>/dev/null || true`);
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
          await execWithShellPath(`cd "${projectPath}" && git show-ref --verify --quiet refs/heads/${branchName}`);
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
      const { stdout } = await execWithShellPath(`cd "${worktreePath}" && git rev-list --count HEAD..${mainBranch} 2>/dev/null || echo "0"`);
      const commitCount = parseInt(stdout.trim());
      return commitCount > 0;
    } catch (error) {
      console.error(`[WorktreeManager] Error checking for changes to rebase:`, error);
      return false;
    }
  }

  async rebaseMainIntoWorktree(worktreePath: string, mainBranch: string): Promise<void> {
    try {
      console.log(`[WorktreeManager] Rebasing ${mainBranch} into worktree: ${worktreePath}`);
      
      // Rebase the current worktree branch onto main
      await execWithShellPath(`cd "${worktreePath}" && git rebase ${mainBranch}`);
      
      console.log(`[WorktreeManager] Successfully rebased ${mainBranch} into worktree`);
    } catch (error: any) {
      console.error(`[WorktreeManager] Failed to rebase ${mainBranch} into worktree:`, error);
      
      // Create detailed error with git command output
      const gitError = new Error(`Failed to rebase ${mainBranch} into worktree`) as any;
      gitError.gitCommand = `git rebase ${mainBranch}`;
      gitError.gitOutput = error.stderr || error.stdout || error.message || '';
      gitError.workingDirectory = worktreePath;
      gitError.originalError = error;
      
      throw gitError;
    }
  }

  async squashAndRebaseWorktreeToMain(projectPath: string, worktreePath: string, mainBranch: string, commitMessage: string): Promise<void> {
    const executedCommands: string[] = [];
    
    try {
      console.log(`[WorktreeManager] Squashing and rebasing worktree to ${mainBranch}: ${worktreePath}`);
      
      // Get current branch name in worktree
      let command = `git branch --show-current`;
      executedCommands.push(`cd "${worktreePath}" && ${command}`);
      const { stdout: currentBranch } = await execWithShellPath(`cd "${worktreePath}" && ${command}`);
      const branchName = currentBranch.trim();
      
      // Get the base commit (where the worktree branch diverged from main)
      command = `git merge-base ${mainBranch} HEAD`;
      executedCommands.push(`cd "${worktreePath}" && ${command}`);
      const { stdout: baseCommit } = await execWithShellPath(`cd "${worktreePath}" && ${command}`);
      const base = baseCommit.trim();
      
      // Squash all commits since base into one
      command = `git reset --soft ${base}`;
      executedCommands.push(`cd "${worktreePath}" && ${command}`);
      await execWithShellPath(`cd "${worktreePath}" && ${command}`);
      
      command = `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`;
      executedCommands.push(`cd "${worktreePath}" && ${command}`);
      await execWithShellPath(`cd "${worktreePath}" && ${command}`);
      
      // Switch to main branch in the main repository
      command = `git checkout ${mainBranch}`;
      executedCommands.push(`cd "${projectPath}" && ${command}`);
      await execWithShellPath(`cd "${projectPath}" && ${command}`);
      
      // Rebase the squashed commit onto main
      command = `git rebase ${branchName}`;
      executedCommands.push(`cd "${projectPath}" && ${command}`);
      await execWithShellPath(`cd "${projectPath}" && ${command}`);
      
      console.log(`[WorktreeManager] Successfully squashed and rebased worktree to ${mainBranch}`);
    } catch (error: any) {
      console.error(`[WorktreeManager] Failed to squash and rebase worktree to ${mainBranch}:`, error);
      
      // Create detailed error with git command output
      const gitError = new Error(`Failed to squash and rebase worktree to ${mainBranch}`) as any;
      gitError.gitCommands = executedCommands;
      gitError.gitOutput = error.stderr || error.stdout || error.message || '';
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
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { mkdir, rename as fsRename } from 'fs/promises';
import { existsSync } from 'fs';
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

  private getProjectPaths(projectPath: string, worktreeFolder?: string) {
    const cacheKey = `${projectPath}:${worktreeFolder || 'worktrees'}`;
    if (!this.projectsCache.has(cacheKey)) {
      const folderName = worktreeFolder || 'worktrees';
      let baseDir: string;
      
      // Check if worktreeFolder is an absolute path
      if (worktreeFolder && (worktreeFolder.startsWith('/') || worktreeFolder.includes(':'))) {
        baseDir = worktreeFolder;
      } else {
        baseDir = join(projectPath, folderName);
      }
      
      this.projectsCache.set(cacheKey, { baseDir });
    }
    return this.projectsCache.get(cacheKey)!;
  }

  async initializeProject(projectPath: string, worktreeFolder?: string): Promise<void> {
    const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder);
    try {
      await mkdir(baseDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create worktrees directory:', error);
    }
  }

  async createWorktree(projectPath: string, name: string, branch?: string, baseBranch?: string, worktreeFolder?: string): Promise<{ worktreePath: string; baseCommit: string; baseBranch: string }> {
    console.log(`[WorktreeManager] Creating worktree: ${name} in project: ${projectPath}`);
    
    const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder);
    const worktreePath = join(baseDir, name);
    const branchName = branch || name;
    
    console.log(`[WorktreeManager] Worktree path: ${worktreePath}, branch: ${branchName}, base branch: ${baseBranch || 'HEAD'}`);

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

      // Capture the base commit before creating worktree
      let baseCommit: string;
      let actualBaseBranch: string;
      
      if (branchExists) {
        // Use existing branch
        console.log(`[WorktreeManager] Adding worktree with existing branch...`);
        await execWithShellPath(`git worktree add "${worktreePath}" ${branchName}`, { cwd: projectPath });
        
        // Get the commit this branch is based on
        baseCommit = (await execWithShellPath(`git rev-parse ${branchName}`, { cwd: projectPath })).stdout.trim();
        actualBaseBranch = branchName;
      } else {
        // Create new branch from specified base branch (or current HEAD if not specified)
        const baseRef = baseBranch || 'HEAD';
        actualBaseBranch = baseBranch || 'HEAD';
        console.log(`[WorktreeManager] Creating new branch from ${baseRef} and adding worktree...`);
        
        // Verify that the base branch exists if specified
        if (baseBranch) {
          try {
            await execWithShellPath(`git show-ref --verify --quiet refs/heads/${baseBranch}`, { cwd: projectPath });
            console.log(`[WorktreeManager] Base branch ${baseBranch} exists`);
          } catch {
            throw new Error(`Base branch '${baseBranch}' does not exist`);
          }
        }
        
        // Capture the base commit before creating the worktree
        baseCommit = (await execWithShellPath(`git rev-parse ${baseRef}`, { cwd: projectPath })).stdout.trim();
        console.log(`[WorktreeManager] Base commit: ${baseCommit}`);
        
        await execWithShellPath(`git worktree add -b ${branchName} "${worktreePath}" ${baseRef}`, { cwd: projectPath });
      }
      
      console.log(`[WorktreeManager] Worktree created successfully at: ${worktreePath}`);
      
      return { worktreePath, baseCommit, baseBranch: actualBaseBranch };
    } catch (error) {
      console.error(`[WorktreeManager] Failed to create worktree:`, error);
      throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async removeWorktree(projectPath: string, name: string, worktreeFolder?: string): Promise<void> {
    const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder);
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

  async listWorktrees(projectPath: string): Promise<Array<{ path: string; branch: string; name?: string }>> {
    try {
      const { stdout } = await execWithShellPath(`git worktree list --porcelain`, { cwd: projectPath });
      
      const worktrees: Array<{ path: string; branch: string; name?: string }> = [];
      const lines = stdout.split('\n');
      
      let currentWorktree: { path?: string; branch?: string } = {};
      
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path && currentWorktree.branch) {
            // Extract name from path (remove trailing slashes first)
            const name = currentWorktree.path.replace(/[\\\/]+$/, '').split(/[\\\/]/).pop();
            worktrees.push({ 
              path: currentWorktree.path, 
              branch: currentWorktree.branch,
              name
            });
          }
          currentWorktree = { path: line.substring(9) };
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring(7).replace('refs/heads/', '');
        }
      }
      
      if (currentWorktree.path && currentWorktree.branch) {
        // Extract name from path (remove trailing slashes first)
        const name = currentWorktree.path.replace(/[\\\/]+$/, '').split(/[\\\/]/).pop();
        worktrees.push({ 
          path: currentWorktree.path, 
          branch: currentWorktree.branch,
          name
        });
      }
      
      return worktrees;
    } catch (error) {
      throw new Error(`Failed to list worktrees: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listBranches(projectPath: string): Promise<Array<{ name: string; isCurrent: boolean; hasWorktree: boolean }>> {
    try {
      // Get all local branches
      const { stdout: branchOutput } = await execWithShellPath(`git branch`, { cwd: projectPath });
      
      // Get all worktrees to identify which branches have worktrees
      const worktrees = await this.listWorktrees(projectPath);
      const worktreeBranches = new Set(worktrees.map(w => w.branch));
      
      const branches: Array<{ name: string; isCurrent: boolean; hasWorktree: boolean }> = [];
      const lines = branchOutput.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const isCurrent = line.startsWith('*');
        // Remove leading *, +, and spaces. The + indicates uncommitted changes
        const name = line.replace(/^[\*\+]?\s*[\+]?\s*/, '').trim();
        if (name) {
          branches.push({ 
            name, 
            isCurrent,
            hasWorktree: worktreeBranches.has(name)
          });
        }
      }
      
      // Sort branches: worktree branches first, then the rest
      branches.sort((a, b) => {
        if (a.hasWorktree && !b.hasWorktree) return -1;
        if (!a.hasWorktree && b.hasWorktree) return 1;
        // Within each group, sort alphabetically
        return a.name.localeCompare(b.name);
      });
      
      return branches;
    } catch (error) {
      console.error(`[WorktreeManager] Error listing branches:`, error);
      return [];
    }
  }

  async getProjectMainBranch(projectPath: string): Promise<string> {
    console.log(`[WorktreeManager] getProjectMainBranch called with path: ${projectPath}`);
    
    try {
      // ONLY check the current branch in the project root directory
      const currentBranchResult = await execWithShellPath(`git branch --show-current`, { cwd: projectPath });
      const currentBranch = currentBranchResult.stdout.trim();
      console.log(`[WorktreeManager] Current branch in project directory: ${currentBranch}`);
      
      if (currentBranch) {
        return currentBranch;
      }
      
      // Throw error if we're in detached HEAD state
      throw new Error(`Cannot determine main branch: repository at ${projectPath} is in detached HEAD state`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('detached HEAD')) {
        throw error;
      }
      throw new Error(`Failed to get main branch for project at ${projectPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Deprecated: Use getProjectMainBranch instead
  async detectMainBranch(projectPath: string): Promise<string> {
    console.warn('[WorktreeManager] detectMainBranch is deprecated, use getProjectMainBranch instead');
    return await this.getProjectMainBranch(projectPath);
  }

  // Deprecated: Use getProjectMainBranch instead
  async getEffectiveMainBranch(project: { path: string; main_branch?: string }): Promise<string> {
    console.warn('[WorktreeManager] getEffectiveMainBranch is deprecated, use getProjectMainBranch instead');
    return await this.getProjectMainBranch(project.path);
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
      
      // Rebase the current worktree branch onto local main branch
      const command = `git rebase ${mainBranch}`;
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

  async abortRebase(worktreePath: string): Promise<void> {
    try {
      console.log(`[WorktreeManager] Aborting rebase in worktree: ${worktreePath}`);
      
      // Check if we're in the middle of a rebase
      const statusCommand = `git status --porcelain=v1`;
      const { stdout: statusOut } = await execWithShellPath(statusCommand, { cwd: worktreePath });
      
      // Abort the rebase
      const command = `git rebase --abort`;
      const { stdout, stderr } = await execWithShellPath(command, { cwd: worktreePath });
      
      if (stderr && !stderr.includes('No rebase in progress')) {
        throw new Error(`Failed to abort rebase: ${stderr}`);
      }
      
      console.log(`[WorktreeManager] Successfully aborted rebase`);
    } catch (error: any) {
      console.error(`[WorktreeManager] Error aborting rebase:`, error);
      throw new Error(`Failed to abort rebase: ${error.message}`);
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

  async rebaseWorktreeToMain(projectPath: string, worktreePath: string, mainBranch: string): Promise<void> {
    const executedCommands: string[] = [];
    let lastOutput = '';
    
    try {
      console.log(`[WorktreeManager] Rebasing worktree to ${mainBranch} (without squashing): ${worktreePath}`);
      
      // Get current branch name in worktree
      let command = `git branch --show-current`;
      executedCommands.push(`git branch --show-current (in ${worktreePath})`);
      const { stdout: currentBranch, stderr: stderr1 } = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = currentBranch || stderr1 || '';
      const branchName = currentBranch.trim();
      console.log(`[WorktreeManager] Current branch: ${branchName}`);
      
      // Check if there are any changes to rebase
      command = `git log --oneline ${mainBranch}..HEAD`;
      const { stdout: commits } = await execWithShellPath(command, { cwd: worktreePath });
      if (!commits.trim()) {
        throw new Error(`No commits to rebase. The branch is already up to date with ${mainBranch}.`);
      }
      console.log(`[WorktreeManager] Commits to rebase:\n${commits}`);
      
      // Switch to main branch in the main repository
      command = `git checkout ${mainBranch}`;
      executedCommands.push(`git checkout ${mainBranch} (in ${projectPath})`);
      const checkoutResult = await execWithShellPath(command, { cwd: projectPath });
      lastOutput = checkoutResult.stdout || checkoutResult.stderr || '';
      console.log(`[WorktreeManager] Switched to ${mainBranch} in main repository`);
      
      // Rebase the branch onto main (preserving all commits)
      command = `git rebase ${branchName}`;
      executedCommands.push(`git rebase ${branchName} (in ${projectPath})`);
      const rebaseResult = await execWithShellPath(command, { cwd: projectPath });
      lastOutput = rebaseResult.stdout || rebaseResult.stderr || '';
      console.log(`[WorktreeManager] Successfully rebased ${branchName} onto ${mainBranch}`);
      
      console.log(`[WorktreeManager] Successfully rebased worktree to ${mainBranch} (without squashing)`);
    } catch (error: any) {
      console.error(`[WorktreeManager] Failed to rebase worktree to ${mainBranch}:`, error);
      
      // Create detailed error with git command output
      const gitError = new Error(`Failed to rebase worktree to ${mainBranch}`) as any;
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

  async gitPull(worktreePath: string): Promise<{ output: string }> {
    const currentDir = process.cwd();
    
    try {
      process.chdir(worktreePath);
      
      // Run git pull
      const { stdout, stderr } = await execWithShellPath('git pull');
      const output = stdout || stderr || 'Pull completed successfully';
      
      return { output };
    } catch (error: any) {
      // Create enhanced error with git details
      const gitError = new Error(error.message || 'Git pull failed') as any;
      gitError.gitOutput = error.stderr || error.stdout || error.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    } finally {
      process.chdir(currentDir);
    }
  }

  async gitPush(worktreePath: string): Promise<{ output: string }> {
    const currentDir = process.cwd();
    
    try {
      process.chdir(worktreePath);
      
      // Run git push
      const { stdout, stderr } = await execWithShellPath('git push');
      const output = stdout || stderr || 'Push completed successfully';
      
      return { output };
    } catch (error: any) {
      // Create enhanced error with git details
      const gitError = new Error(error.message || 'Git push failed') as any;
      gitError.gitOutput = error.stderr || error.stdout || error.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    } finally {
      process.chdir(currentDir);
    }
  }

  async getLastCommits(worktreePath: string, count: number = 20): Promise<any[]> {
    const currentDir = process.cwd();
    
    try {
      process.chdir(worktreePath);
      
      // Get the last N commits with stats
      const { stdout } = await execWithShellPath(
        `git log -${count} --pretty=format:'%H|%s|%ai' --shortstat`
      );
      
      // Parse the output
      const commits: any[] = [];
      const lines = stdout.split('\n');
      let i = 0;
      
      while (i < lines.length) {
        const commitLine = lines[i];
        if (!commitLine || !commitLine.includes('|')) {
          i++;
          continue;
        }
        
        const [hash, message, date] = commitLine.split('|');
        const commit: any = {
          hash: hash.trim(),
          message: message.trim(),
          date: date.trim()
        };
        
        // Check if next line contains stats
        if (i + 1 < lines.length && lines[i + 1].trim()) {
          const statsLine = lines[i + 1].trim();
          const statsMatch = statsLine.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
          
          if (statsMatch) {
            commit.filesChanged = parseInt(statsMatch[1]) || 0;
            commit.additions = parseInt(statsMatch[2]) || 0;
            commit.deletions = parseInt(statsMatch[3]) || 0;
            i++; // Skip the stats line
          }
        }
        
        commits.push(commit);
        i++;
      }
      
      return commits;
    } catch (error: any) {
      // Create enhanced error with git details
      const gitError = new Error(error.message || 'Failed to get commits') as any;
      gitError.gitOutput = error.stderr || error.stdout || error.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    } finally {
      process.chdir(currentDir);
    }
  }

  async renameWorktree(projectPath: string, oldWorktreeName: string, newWorktreeName: string): Promise<{ worktreePath: string; branchName: string }> {
    try {
      console.log(`[WorktreeManager] Renaming worktree from ${oldWorktreeName} to ${newWorktreeName} for project ${projectPath}`);
      
      // Validate new name doesn't conflict
      const worktrees = await this.listWorktrees(projectPath);
      const existingWorktree = worktrees.find(w => w.name === newWorktreeName);
      if (existingWorktree) {
        throw new Error(`Worktree with name '${newWorktreeName}' already exists`);
      }
      
      // Get current worktree info
      const currentWorktree = worktrees.find(w => w.name === oldWorktreeName);
      if (!currentWorktree) {
        throw new Error(`Worktree '${oldWorktreeName}' not found`);
      }
      
      const oldPath = currentWorktree.path;
      
      // Calculate the worktrees base directory
      // We need to find the base worktrees directory, not just use dirname
      // If oldPath is /path/to/worktrees/@feature/name, we want /path/to/worktrees
      let worktreesBaseDir;
      
      // Check if this is a nested structure (like @feature/name)
      if (oldWorktreeName.includes('/')) {
        // For nested structures, go up two levels from the old path
        worktreesBaseDir = dirname(dirname(oldPath));
      } else {
        // For flat structures, go up one level
        worktreesBaseDir = dirname(oldPath);
      }
      
      const newPath = join(worktreesBaseDir, newWorktreeName);
      
      console.log(`[WorktreeManager] Path calculation:`, {
        oldPath,
        worktreesBaseDir,
        newWorktreeName,
        newPath
      });
      
      // Validate paths
      if (!worktreesBaseDir || worktreesBaseDir === oldPath) {
        throw new Error(`Invalid worktrees base directory calculation: ${worktreesBaseDir}`);
      }
      
      if (newPath === oldPath) {
        throw new Error(`New path is the same as old path: ${newPath}`);
      }
      
      // Check if new path would conflict with existing directories
      if (existsSync(newPath)) {
        throw new Error(`Target directory already exists: ${newPath}`);
      }
      
      const oldBranchName = currentWorktree.branch || oldWorktreeName;
      const newBranchName = newWorktreeName;
      
      // Move the worktree directory
      try {
        // Try using git worktree move (available in git >= 2.17)
        const moveResult = await execWithShellPath(
          `git worktree move "${oldPath}" "${newPath}"`,
          { cwd: projectPath }
        );
        console.log('[WorktreeManager] Worktree moved successfully:', moveResult.stdout);
      } catch (moveError) {
        // Fallback for older git versions - manual move
        console.log('[WorktreeManager] git worktree move failed, trying manual move:', moveError);
        
        // First, prune any broken worktrees
        await execWithShellPath('git worktree prune', { cwd: projectPath });
        
        // Move the directory
        await fsRename(oldPath, newPath);
        
        // Remove the old worktree reference
        await execWithShellPath(`git worktree remove --force "${oldPath}"`, { cwd: projectPath }).catch((removeError) => {
          // Log removal errors for debugging, but don't fail the operation
          console.error(`[WorktreeManager] Failed to remove old worktree path "${oldPath}":`, removeError);
          // Ignore errors if already removed - the rename succeeded which is the main goal
        });
        
        // Re-add the worktree at the new location
        await execWithShellPath(`git worktree add "${newPath}" "${oldBranchName}"`, { cwd: projectPath });
      }
      
      // Rename the branch
      try {
        // Change to the worktree directory to rename the branch
        const renameBranchResult = await execWithShellPath(
          `git branch -m "${oldBranchName}" "${newBranchName}"`,
          { cwd: newPath }
        );
        console.log('[WorktreeManager] Branch renamed successfully:', renameBranchResult.stdout);
      } catch (branchError) {
        console.error('[WorktreeManager] Failed to rename branch:', branchError);
        // Try from the main repository
        await execWithShellPath(
          `git branch -m "${oldBranchName}" "${newBranchName}"`,
          { cwd: projectPath }
        );
      }
      
      console.log(`[WorktreeManager] Successfully renamed worktree from ${oldWorktreeName} to ${newWorktreeName}`);
      
      return {
        worktreePath: newPath,
        branchName: newBranchName
      };
    } catch (error) {
      console.error('[WorktreeManager] Error renaming worktree:', error);
      throw error;
    }
  }
}
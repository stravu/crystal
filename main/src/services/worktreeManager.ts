import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { getShellPath } from '../utils/shellPath';
import { withLock } from '../utils/mutex';

// Interface for raw commit data
interface RawCommitData {
  hash: string;
  message: string;
  date: string | Date;
  author?: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}

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
    return await withLock(`worktree-create-${projectPath}-${name}`, async () => {
      
      const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder);
      const worktreePath = join(baseDir, name);
      const branchName = branch || name;
    

    try {
      // First check if this is a git repository
      let isGitRepo = false;
      try {
        await execWithShellPath(`git rev-parse --is-inside-work-tree`, { cwd: projectPath });
        isGitRepo = true;
      } catch (error) {
        // Initialize git repository
        await execWithShellPath(`git init`, { cwd: projectPath });
      }

      // Clean up any existing worktree directory first
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
        // Use cross-platform approach without shell operators
        try {
          await execWithShellPath(`git add -A`, { cwd: projectPath });
        } catch {
          // Ignore add errors (no files to add)
        }
        await execWithShellPath(`git commit -m "Initial commit" --allow-empty`, { cwd: projectPath });
        hasCommits = true;
      }

      // Check if branch already exists
      const checkBranchCmd = `git show-ref --verify --quiet refs/heads/${branchName}`;
      let branchExists = false;
      try {
        await execWithShellPath(checkBranchCmd, { cwd: projectPath });
        branchExists = true;
      } catch {
        // Branch doesn't exist, will create it
      }

      // Capture the base commit before creating worktree
      let baseCommit: string;
      let actualBaseBranch: string;
      
      if (branchExists) {
        // Use existing branch
        await execWithShellPath(`git worktree add "${worktreePath}" ${branchName}`, { cwd: projectPath });
        
        // Get the commit this branch is based on
        baseCommit = (await execWithShellPath(`git rev-parse ${branchName}`, { cwd: projectPath })).stdout.trim();
        actualBaseBranch = branchName;
      } else {
        // Create new branch from specified base branch (or current HEAD if not specified)
        const baseRef = baseBranch || 'HEAD';
        actualBaseBranch = baseBranch || 'HEAD';
        
        // Verify that the base branch exists if specified
        if (baseBranch) {
          try {
            await execWithShellPath(`git show-ref --verify --quiet refs/heads/${baseBranch}`, { cwd: projectPath });
          } catch {
            throw new Error(`Base branch '${baseBranch}' does not exist`);
          }
        }
        
        // Capture the base commit before creating the worktree
        baseCommit = (await execWithShellPath(`git rev-parse ${baseRef}`, { cwd: projectPath })).stdout.trim();
        
        await execWithShellPath(`git worktree add -b ${branchName} "${worktreePath}" ${baseRef}`, { cwd: projectPath });
      }
      
      console.log(`[WorktreeManager] Worktree created successfully at: ${worktreePath}`);
      
      return { worktreePath, baseCommit, baseBranch: actualBaseBranch };
      } catch (error) {
        console.error(`[WorktreeManager] Failed to create worktree:`, error);
        throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  async removeWorktree(projectPath: string, name: string, worktreeFolder?: string): Promise<void> {
    return await withLock(`worktree-remove-${projectPath}-${name}`, async () => {
      const { baseDir } = this.getProjectPaths(projectPath, worktreeFolder);
      const worktreePath = join(baseDir, name);
      
      try {
        await execWithShellPath(`git worktree remove "${worktreePath}" --force`, { cwd: projectPath });
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        const errorMessage = err.stderr || err.stdout || err.message || String(err);
        
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
    });
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
    
    try {
      // ONLY check the current branch in the project root directory
      const currentBranchResult = await execWithShellPath(`git branch --show-current`, { cwd: projectPath });
      const currentBranch = currentBranchResult.stdout.trim();
      
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

  async checkForRebaseConflicts(worktreePath: string, mainBranch: string): Promise<{
    hasConflicts: boolean;
    conflictingFiles?: string[];
    conflictingCommits?: { ours: string[]; theirs: string[] };
    canAutoMerge?: boolean;
  }> {
    try {
      
      // First check if there are any changes to rebase
      const hasChanges = await this.hasChangesToRebase(worktreePath, mainBranch);
      if (!hasChanges) {
        return { hasConflicts: false, canAutoMerge: true };
      }

      // Get the merge base
      const { stdout: mergeBase } = await execWithShellPath(
        `git merge-base HEAD ${mainBranch}`,
        { cwd: worktreePath }
      );
      const base = mergeBase.trim();

      // Try a dry-run merge to detect conflicts
      // We use merge-tree to check for conflicts without modifying the working tree
      try {
        const { stdout: mergeTreeOutput } = await execWithShellPath(
          `git merge-tree ${base} HEAD ${mainBranch}`,
          { cwd: worktreePath }
        );
        
        // Parse merge-tree output for conflicts
        const conflictMarkers = mergeTreeOutput.match(/<<<<<<< /g);
        const hasConflicts = conflictMarkers && conflictMarkers.length > 0;
        
        if (hasConflicts) {
          // Get list of files that would conflict
          const { stdout: diffOutput } = await execWithShellPath(
            `git diff --name-only ${base}...HEAD`,
            { cwd: worktreePath }
          );
          const ourFiles = diffOutput.trim().split('\n').filter(f => f);
          
          const { stdout: theirDiffOutput } = await execWithShellPath(
            `git diff --name-only ${base}...${mainBranch}`,
            { cwd: worktreePath }
          );
          const theirFiles = theirDiffOutput.trim().split('\n').filter(f => f);
          
          // Find files modified in both branches
          const conflictingFiles = ourFiles.filter(f => theirFiles.includes(f));
          
          // Get commit info for better error reporting
          const { stdout: ourCommits } = await execWithShellPath(
            `git log --oneline ${base}..HEAD`,
            { cwd: worktreePath }
          );
          const { stdout: theirCommits } = await execWithShellPath(
            `git log --oneline ${base}..${mainBranch}`,
            { cwd: worktreePath }
          );
          
          console.log(`[WorktreeManager] Found conflicts in files: ${conflictingFiles.join(', ')}`);
          
          return {
            hasConflicts: true,
            conflictingFiles,
            conflictingCommits: {
              ours: ourCommits.trim().split('\n').filter(c => c),
              theirs: theirCommits.trim().split('\n').filter(c => c)
            },
            canAutoMerge: false
          };
        }
        
        return { hasConflicts: false, canAutoMerge: true };
        
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        // If merge-tree is not available (older git), fall back to checking modified files
        console.log(`[WorktreeManager] merge-tree not available, using fallback conflict detection`);
        
        // Get files changed in both branches
        const { stdout: diffOutput } = await execWithShellPath(
          `git diff --name-only ${base}...HEAD`,
          { cwd: worktreePath }
        );
        const ourFiles = diffOutput.trim().split('\n').filter(f => f);
        
        const { stdout: theirDiffOutput } = await execWithShellPath(
          `git diff --name-only ${base}...${mainBranch}`,
          { cwd: worktreePath }
        );
        const theirFiles = theirDiffOutput.trim().split('\n').filter(f => f);
        
        // Find files modified in both branches (potential conflicts)
        const conflictingFiles = ourFiles.filter(f => theirFiles.includes(f));
        
        if (conflictingFiles.length > 0) {
          // Get commit info
          const { stdout: ourCommits } = await execWithShellPath(
            `git log --oneline ${base}..HEAD`,
            { cwd: worktreePath }
          );
          const { stdout: theirCommits } = await execWithShellPath(
            `git log --oneline ${base}..${mainBranch}`,
            { cwd: worktreePath }
          );
          
          console.log(`[WorktreeManager] Potential conflicts in files: ${conflictingFiles.join(', ')}`);
          
          return {
            hasConflicts: true,
            conflictingFiles,
            conflictingCommits: {
              ours: ourCommits.trim().split('\n').filter(c => c),
              theirs: theirCommits.trim().split('\n').filter(c => c)
            },
            canAutoMerge: false
          };
        }
        
        return { hasConflicts: false, canAutoMerge: true };
      }
    } catch (error: unknown) {
      console.error(`[WorktreeManager] Error checking for rebase conflicts:`, error);
      // On error, return unknown status
      return { 
        hasConflicts: false, 
        canAutoMerge: false 
      };
    }
  }

  async rebaseMainIntoWorktree(worktreePath: string, mainBranch: string): Promise<void> {
    return await withLock(`git-rebase-${worktreePath}`, async () => {
      const executedCommands: string[] = [];
      let lastOutput = '';
      
      try {
        
        // Rebase the current worktree branch onto local main branch
        const command = `git rebase ${mainBranch}`;
        executedCommands.push(`${command} (in ${worktreePath})`);
        const rebaseResult = await execWithShellPath(command, { cwd: worktreePath });
        lastOutput = rebaseResult.stdout || rebaseResult.stderr || '';
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        console.error(`[WorktreeManager] Failed to rebase ${mainBranch} into worktree:`, err);
        
        // Create detailed error with git command output
        const gitError = new Error(`Failed to rebase ${mainBranch} into worktree`) as Error & {
          gitCommand?: string;
          gitOutput?: string;
          workingDirectory?: string;
          originalError?: Error;
        };
        gitError.gitCommand = executedCommands.join(' && ');
        gitError.gitOutput = err.stderr || err.stdout || lastOutput || err.message || '';
        gitError.workingDirectory = worktreePath;
        gitError.originalError = err;
        
        throw gitError;
      }
    });
  }

  async abortRebase(worktreePath: string): Promise<void> {
    try {
      // Check if we're in the middle of a rebase
      const statusCommand = `git status --porcelain=v1`;
      const { stdout: statusOut } = await execWithShellPath(statusCommand, { cwd: worktreePath });
      
      // Abort the rebase
      const command = `git rebase --abort`;
      const { stdout, stderr } = await execWithShellPath(command, { cwd: worktreePath });
      
      if (stderr && !stderr.includes('No rebase in progress')) {
        throw new Error(`Failed to abort rebase: ${stderr}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[WorktreeManager] Error aborting rebase:`, err);
      throw new Error(`Failed to abort rebase: ${err.message}`);
    }
  }

  async squashAndRebaseWorktreeToMain(projectPath: string, worktreePath: string, mainBranch: string, commitMessage: string): Promise<void> {
    return await withLock(`git-squash-rebase-${worktreePath}`, async () => {
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
      
      // Get the base commit (where the worktree branch diverged from main)
      command = `git merge-base ${mainBranch} HEAD`;
      executedCommands.push(`git merge-base ${mainBranch} HEAD (in ${worktreePath})`);
      const { stdout: baseCommit, stderr: stderr2 } = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = baseCommit || stderr2 || '';
      const base = baseCommit.trim();
      
      // Check if there are any changes to squash
      command = `git log --oneline ${base}..HEAD`;
      const { stdout: commits } = await execWithShellPath(command, { cwd: worktreePath });
      if (!commits.trim()) {
        throw new Error(`No commits to squash. The branch is already up to date with ${mainBranch}.`);
      }
      
      // Squash all commits since base into one
      command = `git reset --soft ${base}`;
      executedCommands.push(`git reset --soft ${base} (in ${worktreePath})`);
      const resetResult = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = resetResult.stdout || resetResult.stderr || '';
      
      // Properly escape commit message for cross-platform compatibility
      const escapedMessage = commitMessage.replace(/"/g, '\\"');
      command = `git commit -m "${escapedMessage}"`;
      executedCommands.push(`git commit -m "..." (in ${worktreePath})`);
      const commitResult = await execWithShellPath(command, { cwd: worktreePath });
      lastOutput = commitResult.stdout || commitResult.stderr || '';
      
      // Switch to main branch in the main repository
      command = `git checkout ${mainBranch}`;
      executedCommands.push(`git checkout ${mainBranch} (in ${projectPath})`);
      const checkoutResult = await execWithShellPath(command, { cwd: projectPath });
      lastOutput = checkoutResult.stdout || checkoutResult.stderr || '';
      
      // Rebase the squashed commit onto main
      command = `git rebase ${branchName}`;
      executedCommands.push(`git rebase ${branchName} (in ${projectPath})`);
      const rebaseResult = await execWithShellPath(command, { cwd: projectPath });
      lastOutput = rebaseResult.stdout || rebaseResult.stderr || '';
      console.log(`[WorktreeManager] Successfully rebased ${branchName} onto ${mainBranch}`);
      
      console.log(`[WorktreeManager] Successfully squashed and rebased worktree to ${mainBranch}`);
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      console.error(`[WorktreeManager] Failed to squash and rebase worktree to ${mainBranch}:`, err);
      
      // Create detailed error with git command output
      const gitError = new Error(`Failed to squash and rebase worktree to ${mainBranch}`) as Error & {
        gitCommands?: string[];
        gitOutput?: string;
        workingDirectory?: string;
        projectPath?: string;
        originalError?: Error;
      };
      gitError.gitCommands = executedCommands;
      gitError.gitOutput = err.stderr || err.stdout || lastOutput || err.message || '';
      gitError.workingDirectory = worktreePath;
      gitError.projectPath = projectPath;
      gitError.originalError = err;
      
      throw gitError;
      }
    });
  }

  async rebaseWorktreeToMain(projectPath: string, worktreePath: string, mainBranch: string): Promise<void> {
    return await withLock(`git-rebase-worktree-${worktreePath}`, async () => {
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
        
        // Check if there are any changes to rebase
        command = `git log --oneline ${mainBranch}..HEAD`;
        const { stdout: commits } = await execWithShellPath(command, { cwd: worktreePath });
        if (!commits.trim()) {
          throw new Error(`No commits to rebase. The branch is already up to date with ${mainBranch}.`);
        }
        
        // Switch to main branch in the main repository
        command = `git checkout ${mainBranch}`;
        executedCommands.push(`git checkout ${mainBranch} (in ${projectPath})`);
        const checkoutResult = await execWithShellPath(command, { cwd: projectPath });
        lastOutput = checkoutResult.stdout || checkoutResult.stderr || '';
        
        // Rebase the branch onto main (preserving all commits)
        command = `git rebase ${branchName}`;
        executedCommands.push(`git rebase ${branchName} (in ${projectPath})`);
        const rebaseResult = await execWithShellPath(command, { cwd: projectPath });
        lastOutput = rebaseResult.stdout || rebaseResult.stderr || '';
        console.log(`[WorktreeManager] Successfully rebased ${branchName} onto ${mainBranch}`);
        
        console.log(`[WorktreeManager] Successfully rebased worktree to ${mainBranch} (without squashing)`);
      } catch (error: unknown) {
        const err = error as Error & { stderr?: string; stdout?: string };
        console.error(`[WorktreeManager] Failed to rebase worktree to ${mainBranch}:`, err);
        
        // Create detailed error with git command output
        const gitError = new Error(`Failed to rebase worktree to ${mainBranch}`) as Error & {
          gitCommands?: string[];
          gitOutput?: string;
          workingDirectory?: string;
          projectPath?: string;
          originalError?: Error;
        };
        gitError.gitCommands = executedCommands;
        gitError.gitOutput = err.stderr || err.stdout || lastOutput || err.message || '';
        gitError.workingDirectory = worktreePath;
        gitError.projectPath = projectPath;
        gitError.originalError = err;
        
        throw gitError;
      }
    });
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
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      // Create enhanced error with git details
      const gitError = new Error(err.message || 'Git pull failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
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
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      // Create enhanced error with git details
      const gitError = new Error(err.message || 'Git push failed') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    } finally {
      process.chdir(currentDir);
    }
  }

  async getLastCommits(worktreePath: string, count: number = 20): Promise<RawCommitData[]> {
    const currentDir = process.cwd();

    try {
      process.chdir(worktreePath);
      
      // Get the last N commits with stats
      const { stdout } = await execWithShellPath(
        `git log -${count} --pretty=format:'%H|%s|%ai|%an' --shortstat`
      );
      
      // Parse the output
      const commits: RawCommitData[] = [];
      const lines = stdout.split('\n');
      let i = 0;
      
      while (i < lines.length) {
        const commitLine = lines[i];
        if (!commitLine || !commitLine.includes('|')) {
          i++;
          continue;
        }
        
        const parts = commitLine.split('|');
        const hash = parts.shift() || '';
        const author = (parts.pop() || '').trim();
        const date = (parts.pop() || '').trim();
        const message = parts.join('|');

        const commit: RawCommitData = {
          hash: hash.trim(),
          message: message.trim(),
          date,
          author: author || 'Unknown'
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
    } catch (error: unknown) {
      const err = error as Error & { stderr?: string; stdout?: string };
      // Create enhanced error with git details
      const gitError = new Error(err.message || 'Failed to get commits') as Error & {
        gitOutput?: string;
        workingDirectory?: string;
      };
      gitError.gitOutput = err.stderr || err.stdout || err.message || '';
      gitError.workingDirectory = worktreePath;
      throw gitError;
    } finally {
      process.chdir(currentDir);
    }
  }

  async getOriginBranch(worktreePath: string, branch: string): Promise<string | null> {
    const currentDir = process.cwd();

    try {
      process.chdir(worktreePath);
      await execWithShellPath(`git rev-parse --verify origin/${branch}`);
      return `origin/${branch}`;
    } catch {
      return null;
    } finally {
      process.chdir(currentDir);
    }
  }
}

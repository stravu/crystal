import { execSync } from '../utils/commandExecutor';

/**
 * Optimized git commands using plumbing (low-level) commands
 * These are generally faster than porcelain commands like `git status`
 */

export interface GitIndexStatus {
  hasModified: boolean;
  hasStaged: boolean;
  hasUntracked: boolean;
  hasConflicts: boolean;
}

/**
 * Fast check if working directory has any changes using git plumbing commands
 * Much faster than running full `git status --porcelain`
 */
export function fastCheckWorkingDirectory(cwd: string): GitIndexStatus {
  const result: GitIndexStatus = {
    hasModified: false,
    hasStaged: false,
    hasUntracked: false,
    hasConflicts: false
  };

  try {
    // 1. Refresh the index first (very fast, updates git's cache)
    try {
      execSync('git update-index --refresh --ignore-submodules', { cwd });
    } catch {
      // Some files may have been modified, that's ok
    }

    // 2. Check for unstaged changes (modified files in working directory)
    try {
      execSync('git diff-files --quiet --ignore-submodules', { cwd });
    } catch {
      result.hasModified = true;
    }

    // 3. Check for staged changes (in index)
    try {
      execSync('git diff-index --cached --quiet HEAD --ignore-submodules', { cwd });
    } catch {
      result.hasStaged = true;
    }

    // 4. Check for untracked files (more efficient than ls-files for just checking existence)
    const untrackedCheck = execSync(
      'git ls-files --others --exclude-standard --directory --no-empty-directory', 
      { cwd }
    ).toString().trim();
    
    if (untrackedCheck) {
      result.hasUntracked = true;
    }

    // 5. Check for merge conflicts
    const conflictCheck = execSync('git diff --name-only --diff-filter=U', { cwd })
      .toString().trim();
    
    if (conflictCheck) {
      result.hasConflicts = true;
    }

    return result;
  } catch (error) {
    // If any unexpected error, return safe defaults
    return {
      hasModified: true,
      hasStaged: true,
      hasUntracked: true,
      hasConflicts: false
    };
  }
}

/**
 * Get count of commits ahead/behind using rev-list (faster than rev-parse)
 */
export function fastGetAheadBehind(cwd: string, baseBranch: string): { ahead: number; behind: number } {
  try {
    const result = execSync(`git rev-list --left-right --count ${baseBranch}...HEAD`, { cwd })
      .toString().trim();
    
    const [behind, ahead] = result.split('\t').map(n => parseInt(n, 10));
    return {
      ahead: ahead || 0,
      behind: behind || 0
    };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

/**
 * Get statistics about changes (additions/deletions) efficiently
 */
export function fastGetDiffStats(cwd: string): { additions: number; deletions: number; filesChanged: number } {
  try {
    // Use numstat for machine-readable output (faster to parse)
    const result = execSync('git diff --numstat', { cwd }).toString().trim();
    
    if (!result) {
      return { additions: 0, deletions: 0, filesChanged: 0 };
    }
    
    const lines = result.split('\n');
    let additions = 0;
    let deletions = 0;
    
    for (const line of lines) {
      const [added, deleted] = line.split('\t');
      if (added !== '-') additions += parseInt(added, 10);
      if (deleted !== '-') deletions += parseInt(deleted, 10);
    }
    
    return {
      additions,
      deletions,
      filesChanged: lines.length
    };
  } catch {
    return { additions: 0, deletions: 0, filesChanged: 0 };
  }
}

/**
 * Check if a specific path has been modified (useful for targeted checks)
 */
export function isPathModified(cwd: string, path: string): boolean {
  try {
    execSync(`git diff-files --quiet --ignore-submodules -- "${path}"`, { cwd });
    return false;
  } catch {
    return true;
  }
}

/**
 * Get current branch name efficiently
 */
export function getCurrentBranch(cwd: string): string | null {
  try {
    return execSync('git symbolic-ref --short HEAD', { cwd }).toString().trim();
  } catch {
    // Might be in detached HEAD state
    try {
      return execSync('git rev-parse --short HEAD', { cwd }).toString().trim();
    } catch {
      return null;
    }
  }
}

/**
 * Check if repository is in the middle of a rebase
 */
export function isRebasing(cwd: string): boolean {
  try {
    // Check for rebase directories
    execSync('test -d .git/rebase-merge || test -d .git/rebase-apply', { cwd });
    return true;
  } catch {
    return false;
  }
}
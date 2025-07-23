/**
 * Utility functions for working with git worktrees
 */

/**
 * Extract worktree name from the current working directory path
 * Returns the worktree name if running in a worktree, undefined if in main repository
 */
export function getCurrentWorktreeName(cwd: string): string | undefined {
  try {
    // Match worktrees directory followed by worktree name
    // Handles both Unix (/) and Windows (\) path separators
    // For paths like "worktrees/feature/dev-mode-worktree-label", captures "feature/dev-mode-worktree-label"
    const worktreeMatch = cwd.match(/worktrees[\/\\](.+)/);
    return worktreeMatch ? worktreeMatch[1] : undefined;
  } catch (error) {
    console.log('Could not extract worktree name:', error);
    return undefined;
  }
}
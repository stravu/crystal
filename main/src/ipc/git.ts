import { IpcMain } from 'electron';
import type { AppServices } from './types';
import { execSync } from '../utils/commandExecutor';
import { buildGitCommitCommand, escapeShellArg } from '../utils/shellEscape';
import { panelManager } from '../services/panelManager';
import { mainWindow } from '../index';
import { panelEventBus } from '../services/panelEventBus';
import { PanelEventType, ToolPanelType, PanelEvent } from '../../../shared/types/panels';
import type { Session } from '../types/session';
import type { GitCommit } from '../services/gitDiffManager';
import type { ExecException } from 'child_process';

// Extended type for git system virtual panels
type SystemPanelType = ToolPanelType | 'git';

// Interface for custom git errors that contain additional context
interface GitError extends Error {
  gitCommands?: string[];
  gitOutput?: string;
  workingDirectory?: string;
  projectPath?: string;
  originalError?: Error;
}

// Interface for process errors that have stdout/stderr properties
interface ProcessError {
  stdout?: string;
  stderr?: string;
  message?: string;
}

// Interface for generic error objects with git-related properties
interface ErrorWithGitContext {
  gitCommand?: string;
  gitCommands?: string[];
  gitOutput?: string;
  workingDirectory?: string;
  originalError?: Error;
  [key: string]: unknown;
}

// Interface for raw commit data from worktreeManager
interface RawCommitData {
  hash: string;
  message: string;
  date: string | Date;
  author?: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}


export function registerGitHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { sessionManager, gitDiffManager, worktreeManager, claudeCodeManager, gitStatusManager, databaseService } = services;

  // Helper function to emit git operation events to all sessions in a project
  const emitGitOperationToProject = (sessionId: string, eventType: PanelEventType, message: string, details?: Record<string, unknown>) => {
    try {
      const session = sessionManager.getSession(sessionId);
      if (!session) return;
      
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) return;
      
      // Create a virtual event as if it came from the git system
      const event = {
        type: eventType,
        source: {
          panelId: 'git-system', // Special panel ID for git operations
          panelType: 'git' as SystemPanelType, // Virtual panel type
          sessionId: sessionId // The session that triggered the operation
        },
        data: {
          message,
          triggeringSessionId: sessionId,
          triggeringSessionName: session.name,
          projectId: project.id,
          ...details
        },
        timestamp: new Date().toISOString()
      };
      
      // Emit the event once to the panel event bus
      // All Claude panels that have subscribed will receive it
      panelEventBus.emitPanelEvent(event as PanelEvent);

      // Also forward to renderer so UI components listening for window 'panel:event' receive it
      try {
        if (mainWindow) {
          mainWindow.webContents.send('panel:event', event);
        }
      } catch (ipcError) {
        console.error('[Git] Failed to forward git operation event to renderer:', ipcError);
      }
    } catch (error) {
      console.error('[Git] Failed to emit git operation event:', error);
    }
  };

  // Helper function to refresh git status after operations that only affect one session
  const refreshGitStatusForSession = async (sessionId: string, isUserInitiated = false) => {
    try {
      await gitStatusManager.refreshSessionGitStatus(sessionId, isUserInitiated);
    } catch (error) {
      // Git status refresh failures are logged by GitStatusManager
    }
  };

  // Helper function to refresh git status for all sessions in a project (e.g. after updating main)
  const refreshGitStatusForProject = async (projectId: number) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      const projectSessions = sessions.filter(s => s.projectId === projectId && !s.archived && s.status !== 'error');
      
      // Refresh all sessions in parallel
      await Promise.all(projectSessions.map(session => 
        gitStatusManager.refreshSessionGitStatus(session.id, false).catch(() => {
          // Individual failures are logged by GitStatusManager
        })
      ));
    } catch (error) {
      // Project-level refresh failures are rare and will be logged by GitStatusManager
    }
  };

  const getSessionCommitHistory = async (
    session: Session,
    limit: number = 50
  ): Promise<{
    commits: GitCommit[];
    mainBranch: string;
    comparisonBranch: string;
    historySource: 'remote' | 'local' | 'branch';
    limitReached: boolean;
  }> => {
    if (!session.worktreePath) {
      throw new Error('Session has no worktree path');
    }

    const project = sessionManager.getProjectForSession(session.id);
    if (!project?.path) {
      throw new Error('Project path not found for session');
    }

    const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
    let comparisonBranch = mainBranch;
    let historySource: 'remote' | 'local' | 'branch' = 'branch';
    let useFallback = false;

    if (session.isMainRepo) {
      const originBranch = await worktreeManager.getOriginBranch(session.worktreePath, mainBranch);
      if (originBranch) {
        comparisonBranch = originBranch;
        historySource = 'remote';
      } else {
        historySource = 'local';
        comparisonBranch = mainBranch;
        useFallback = true;
      }
    }

    let commits: GitCommit[] = [];

    if (!useFallback) {
      try {
        commits = gitDiffManager.getCommitHistory(session.worktreePath, limit, comparisonBranch);
      } catch (error) {
        if (session.isMainRepo) {
          console.warn(`[IPC:git] Falling back to local commit history for session ${session.id}:`, error);
          useFallback = true;
          historySource = 'local';
          comparisonBranch = mainBranch;
        } else {
          throw error;
        }
      }
    }

    if (useFallback) {
      const fallbackLimit = limit;
      const fallbackCommits = await worktreeManager.getLastCommits(session.worktreePath, fallbackLimit);
      commits = fallbackCommits.map((commit: RawCommitData) => ({
        hash: commit.hash,
        message: commit.message,
        date: new Date(commit.date),
        author: commit.author || 'Unknown',
        stats: {
          additions: commit.additions || 0,
          deletions: commit.deletions || 0,
          filesChanged: commit.filesChanged || 0
        }
      }));
    }

    if (!session.isMainRepo) {
      historySource = 'branch';
    }

    const limitReached = commits.length === limit;

    return {
      commits,
      mainBranch,
      comparisonBranch,
      historySource,
      limitReached
    };
  };

  ipcMain.handle('sessions:get-executions', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      const { commits, comparisonBranch, historySource, limitReached } = await getSessionCommitHistory(session, 50);

      // Transform git commits to execution format expected by frontend
      const executions = commits.map((commit, index) => ({
        id: index + 1, // 1-based index for commits
        session_id: sessionId,
        execution_sequence: index + 1,
        after_commit_hash: commit.hash,
        commit_message: commit.message,
        timestamp: commit.date.toISOString(),
        stats_additions: commit.stats.additions,
        stats_deletions: commit.stats.deletions,
        stats_files_changed: commit.stats.filesChanged,
        author: commit.author,
        comparison_branch: comparisonBranch,
        history_source: historySource,
        history_limit_reached: limitReached
      }));

      // Check for uncommitted changes
      const hasUncommittedChanges = gitDiffManager.hasChanges(session.worktreePath);
      if (hasUncommittedChanges) {
        // Get stats for uncommitted changes
        const uncommittedDiff = await gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
        
        // Add uncommitted changes as execution with id 0
        executions.unshift({
          id: 0,
          session_id: sessionId,
          execution_sequence: 0,
          after_commit_hash: 'UNCOMMITTED',
          commit_message: 'Uncommitted changes',
          timestamp: new Date().toISOString(),
          stats_additions: uncommittedDiff.stats.additions,
          stats_deletions: uncommittedDiff.stats.deletions,
          stats_files_changed: uncommittedDiff.stats.filesChanged,
          author: 'You',
          comparison_branch: comparisonBranch,
          history_source: historySource,
          history_limit_reached: limitReached
        });
      }

      return { success: true, data: executions };
    } catch (error) {
      console.error('Failed to get executions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get executions';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sessions:get-execution-diff', async (_event, sessionId: string, executionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      const { commits } = await getSessionCommitHistory(session, 50);
      const executionIndex = parseInt(executionId) - 1;

      if (executionIndex < 0 || executionIndex >= commits.length) {
        return { success: false, error: 'Invalid execution ID' };
      }

      // Get diff for the specific commit
      const commit = commits[executionIndex];
      const diff = gitDiffManager.getCommitDiff(session.worktreePath, commit.hash);
      return { success: true, data: diff };
    } catch (error) {
      console.error('Failed to get execution diff:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get execution diff';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sessions:git-commit', async (_event, sessionId: string, message: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      // Check if there are any changes to commit
      const status = execSync('git status --porcelain', { 
        cwd: session.worktreePath,
        encoding: 'utf-8'
      }).trim();

      if (!status) {
        return { success: false, error: 'No changes to commit' };
      }

      // Stage all changes
      execSync('git add -A', { cwd: session.worktreePath });

      // Create the commit with Crystal's signature using safe escaping
      const commitCommand = buildGitCommitCommand(message);

      try {
        execSync(commitCommand, { 
          cwd: session.worktreePath
        });
        
        // Refresh git status for this session after commit
        await refreshGitStatusForSession(sessionId);
        
        return { success: true };
      } catch (commitError: unknown) {
        // Check if it's a pre-commit hook failure
        if ((commitError && typeof commitError === 'object' && 'stdout' in commitError && (commitError as ProcessError).stdout?.includes('pre-commit')) || (commitError && typeof commitError === 'object' && 'stderr' in commitError && (commitError as ProcessError).stderr?.includes('pre-commit'))) {
          return { success: false, error: 'Pre-commit hooks failed. Please fix the issues and try again.' };
        }
        throw commitError;
      }
    } catch (error: unknown) {
      console.error('Failed to commit changes:', error);
      const errorMessage = (error instanceof Error ? error.message : '') || (error && typeof error === 'object' && 'stderr' in error ? (error as ProcessError).stderr : '') || 'Failed to commit changes';
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sessions:git-diff', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }
      
      // Check if session is archived - worktree won't exist
      if (session.archived) {
        return { success: false, error: 'Cannot access git diff for archived session' };
      }

      const diff = await gitDiffManager.getGitDiff(session.worktreePath);
      return { success: true, data: diff };
    } catch (error) {
      // Don't log errors for expected failures
      const errorMessage = error instanceof Error ? error.message : 'Failed to get git diff';
      if (!errorMessage.includes('archived session')) {
        console.error('Failed to get git diff:', error);
      }
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sessions:get-combined-diff', async (_event, sessionId: string, executionIds?: number[]) => {
    try {
      // Get session to find worktree path
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      // Handle uncommitted changes request
      if (executionIds && executionIds.length === 1 && executionIds[0] === 0) {
        // Verify the worktree exists and has uncommitted changes
        try {
          const status = execSync('git status --porcelain', { 
            cwd: session.worktreePath, 
            encoding: 'utf8' 
          });
        } catch (error) {
          console.error('Error checking git status:', error);
        }
        
        const uncommittedDiff = await gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
        return { success: true, data: uncommittedDiff };
      }

      const { commits, comparisonBranch, historySource } = await getSessionCommitHistory(session, 50);

      if (!commits.length) {
        return {
          success: true,
          data: {
            diff: '',
            stats: { additions: 0, deletions: 0, filesChanged: 0 },
            changedFiles: []
          }
        };
      }

      // If we have a range selection (2 IDs), use git diff between them
      if (executionIds && executionIds.length === 2) {
        const sortedIds = [...executionIds].sort((a, b) => a - b);

        // Handle range that includes uncommitted changes
        if (sortedIds[0] === 0 || sortedIds[1] === 0) {
          // If uncommitted is in the range, get diff from the other commit to working directory
          const commitId = sortedIds[0] === 0 ? sortedIds[1] : sortedIds[0];
          const commitIndex = commitId - 1;

          if (commitIndex >= 0 && commitIndex < commits.length) {
            const fromCommit = commits[commitIndex];
            // Get diff from commit to working directory (includes uncommitted changes)
            const diff = execSync(
              `git diff ${fromCommit.hash}`,
              { cwd: session.worktreePath, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
            );

            const stats = gitDiffManager.parseDiffStats(
              execSync(`git diff --stat ${fromCommit.hash}`, { cwd: session.worktreePath, encoding: 'utf8' })
            );

            const changedFiles = execSync(
              `git diff --name-only ${fromCommit.hash}`,
              { cwd: session.worktreePath, encoding: 'utf8' }
            ).trim().split('\n').filter(Boolean);

            return {
              success: true,
              data: {
                diff,
                stats,
                changedFiles,
                beforeHash: fromCommit.hash,
                afterHash: 'UNCOMMITTED'
              }
            };
          }
        }

        // For regular commit ranges, we want to show all changes introduced by the selected commits
        // - Commits are stored newest first (index 0 = newest)
        // - User selects from older to newer visually
        // - We need to go back one commit before the older selection to show all changes
        const newerIndex = sortedIds[0] - 1;   // Lower ID = newer commit
        const olderIndex = sortedIds[1] - 1;   // Higher ID = older commit

        if (newerIndex >= 0 && newerIndex < commits.length && olderIndex >= 0 && olderIndex < commits.length) {
          const newerCommit = commits[newerIndex]; // Newer commit
          const olderCommit = commits[olderIndex]; // Older commit

          // To show all changes introduced by the selected commits, we diff from
          // the parent of the older commit to the newer commit
          let fromCommitHash: string;

          try {
            // Try to get the parent of the older commit
            const parentHash = execSync(`git rev-parse ${olderCommit.hash}^`, {
              cwd: session.worktreePath,
              encoding: 'utf8'
            }).trim();
            fromCommitHash = parentHash;
          } catch (error) {
            // If there's no parent (initial commit), use git's empty tree hash
            fromCommitHash = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
          }

          // Use git diff to show all changes from before the range to the newest selected commit
          const diff = await gitDiffManager.captureCommitDiff(
            session.worktreePath,
            fromCommitHash,
            newerCommit.hash
          );
          return { success: true, data: diff };
        }
      }

      // If no specific execution IDs are provided, get all diffs including uncommitted changes
      if (!executionIds || executionIds.length === 0) {
        if (commits.length === 0) {
          // No commits, but there might be uncommitted changes
          const uncommittedDiff = await gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
          return { success: true, data: uncommittedDiff };
        }

        // For a single commit, show changes from before the commit to working directory
        if (commits.length === 1) {
          let fromCommitHash: string;
          try {
            // Try to get the parent of the commit
            fromCommitHash = execSync(`git rev-parse ${commits[0].hash}^`, {
              cwd: session.worktreePath,
              encoding: 'utf8'
            }).trim();
          } catch (error) {
            // If there's no parent (initial commit), use git's empty tree hash
            fromCommitHash = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
          }

          // Get diff from parent to working directory (includes the commit and any uncommitted changes)
          const diff = execSync(
            `git diff ${fromCommitHash}`,
            { cwd: session.worktreePath, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
          );
          
          const stats = gitDiffManager.parseDiffStats(
            execSync(`git diff --stat ${fromCommitHash}`, { cwd: session.worktreePath, encoding: 'utf8' })
          );
          
          const changedFiles = execSync(
            `git diff --name-only ${fromCommitHash}`,
            { cwd: session.worktreePath, encoding: 'utf8' }
          ).trim().split('\n').filter(f => f);

          return { 
            success: true, 
            data: {
              diff,
              stats,
              changedFiles
            }
          };
        }

        // For multiple commits, get diff from parent of first commit to working directory (all changes including uncommitted)
        const firstCommit = commits[commits.length - 1]; // Oldest commit
        let fromCommitHash: string;

        try {
          // Try to get the parent of the first commit
          fromCommitHash = execSync(`git rev-parse ${firstCommit.hash}^`, {
            cwd: session.worktreePath,
            encoding: 'utf8'
          }).trim();
        } catch (error) {
          // If there's no parent (initial commit), use git's empty tree hash
          fromCommitHash = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
        }

        // Get diff from the parent of first commit to working directory (includes uncommitted changes)
        const diff = execSync(
          `git diff ${fromCommitHash}`,
          { cwd: session.worktreePath, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
        );
        
        const stats = gitDiffManager.parseDiffStats(
          execSync(`git diff --stat ${fromCommitHash}`, { cwd: session.worktreePath, encoding: 'utf8' })
        );
        
        const changedFiles = execSync(
          `git diff --name-only ${fromCommitHash}`,
          { cwd: session.worktreePath, encoding: 'utf8' }
        ).trim().split('\n').filter(f => f);

        return { 
          success: true, 
          data: {
            diff,
            stats,
            changedFiles
          }
        };
      }

      // For multiple individual selections, we need to create a range from first to last
      if (executionIds.length > 2) {
        const sortedIds = [...executionIds].sort((a, b) => a - b);
        const firstId = sortedIds[sortedIds.length - 1]; // Highest ID = oldest commit
        const lastId = sortedIds[0]; // Lowest ID = newest commit

        const fromIndex = firstId - 1;
        const toIndex = lastId - 1;

        if (fromIndex >= 0 && fromIndex < commits.length && toIndex >= 0 && toIndex < commits.length) {
          const fromCommit = commits[fromIndex]; // Oldest selected
          const toCommit = commits[toIndex]; // Newest selected

          const diff = await gitDiffManager.captureCommitDiff(
            session.worktreePath,
            fromCommit.hash,
            toCommit.hash
          );
          return { success: true, data: diff };
        }
      }

      // Single commit selection (but not uncommitted changes)
      if (executionIds.length === 1 && executionIds[0] !== 0) {
        const commitIndex = executionIds[0] - 1;
        if (commitIndex >= 0 && commitIndex < commits.length) {
          const commit = commits[commitIndex];
          const diff = gitDiffManager.getCommitDiff(session.worktreePath, commit.hash);
          return { success: true, data: diff };
        }
      }

      // Fallback to empty diff
      return {
        success: true,
        data: {
          diff: '',
          stats: { additions: 0, deletions: 0, filesChanged: 0 },
          changedFiles: []
        }
      };
    } catch (error) {
      console.error('Failed to get combined diff:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to get combined diff';
      return { success: false, error: errorMessage };
    }
  });

  // Git rebase operations
  ipcMain.handle('sessions:check-rebase-conflicts', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the project to find the main branch
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        return { success: false, error: 'Project not found for session' };
      }

      // Always get the current branch from the project directory
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
      
      // Check for conflicts
      const conflictInfo = await worktreeManager.checkForRebaseConflicts(session.worktreePath, mainBranch);
      
      return { 
        success: true, 
        data: conflictInfo 
      };
    } catch (error: unknown) {
      console.error(`[IPC:git] Failed to check for rebase conflicts:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check for rebase conflicts'
      };
    }
  });

  ipcMain.handle('sessions:rebase-main-into-worktree', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the project to find the main branch
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        return { success: false, error: 'Project not found for session' };
      }

      // Get the main branch from the project directory's current branch
      const mainBranch = await Promise.race([
        worktreeManager.getProjectMainBranch(project.path),
        new Promise((_, reject) => setTimeout(() => reject(new Error('getProjectMainBranch timeout')), 30000))
      ]) as string;

      // Check for conflicts before attempting rebase
      const conflictCheck = await worktreeManager.checkForRebaseConflicts(session.worktreePath, mainBranch);
      
      if (conflictCheck.hasConflicts) {
        
        // Build detailed error message
        let errorMessage = `Rebase would result in conflicts. Cannot proceed automatically.\n\n`;
        
        if (conflictCheck.conflictingFiles && conflictCheck.conflictingFiles.length > 0) {
          errorMessage += `Conflicting files:\n`;
          conflictCheck.conflictingFiles.forEach(file => {
            errorMessage += `  • ${file}\n`;
          });
          errorMessage += '\n';
        }
        
        if (conflictCheck.conflictingCommits) {
          if (conflictCheck.conflictingCommits.ours.length > 0) {
            errorMessage += `Your commits:\n`;
            conflictCheck.conflictingCommits.ours.slice(0, 5).forEach(commit => {
              errorMessage += `  ${commit}\n`;
            });
            if (conflictCheck.conflictingCommits.ours.length > 5) {
              errorMessage += `  ... and ${conflictCheck.conflictingCommits.ours.length - 5} more\n`;
            }
            errorMessage += '\n';
          }
          
          if (conflictCheck.conflictingCommits.theirs.length > 0) {
            errorMessage += `Incoming commits from ${mainBranch}:\n`;
            conflictCheck.conflictingCommits.theirs.slice(0, 5).forEach(commit => {
              errorMessage += `  ${commit}\n`;
            });
            if (conflictCheck.conflictingCommits.theirs.length > 5) {
              errorMessage += `  ... and ${conflictCheck.conflictingCommits.theirs.length - 5} more\n`;
            }
          }
        }
        
        // Emit git operation failed event for conflict detection
        const conflictMessage = `✗ Rebase aborted: Conflicts detected\n\n${errorMessage}`;
        emitGitOperationToProject(sessionId, 'git:operation_failed', conflictMessage, {
          operation: 'rebase_from_main',
          mainBranch,
          hasConflicts: true,
          conflictingFiles: conflictCheck.conflictingFiles
        });
        
        // Return detailed conflict information
        return {
          success: false,
          error: 'Rebase would result in conflicts',
          gitError: {
            command: `git rebase ${mainBranch}`,
            output: errorMessage,
            workingDirectory: session.worktreePath,
            hasConflicts: true,
            conflictingFiles: conflictCheck.conflictingFiles,
            conflictingCommits: conflictCheck.conflictingCommits
          }
        };
      }

      // Emit git operation started event to all sessions in project
      const startMessage = `🔄 GIT OPERATION\nRebasing from ${mainBranch}...`;
      emitGitOperationToProject(sessionId, 'git:operation_started', startMessage, {
        operation: 'rebase_from_main',
        mainBranch
      });

      await Promise.race([
        worktreeManager.rebaseMainIntoWorktree(session.worktreePath, mainBranch),
        new Promise((_, reject) => setTimeout(() => reject(new Error('rebaseMainIntoWorktree timeout')), 120000))
      ]);

      // Emit git operation completed event to all sessions in project
      const successMessage = `✓ Successfully rebased ${mainBranch} into worktree`;
      emitGitOperationToProject(sessionId, 'git:operation_completed', successMessage, {
        operation: 'rebase_from_main',
        mainBranch
      });

      // Update git status directly after rebasing from main (more efficient than refresh)
      // Don't let this block the response - run it in background
      gitStatusManager.updateGitStatusAfterRebase(sessionId, 'from_main').catch(error => {
        console.error(`[IPC:git] Failed to update git status for session ${sessionId}:`, error);
      });

      return { success: true, data: { message: `Successfully rebased ${mainBranch} into worktree` } };
    } catch (error: unknown) {
      console.error(`[IPC:git] Failed to rebase main into worktree for session ${sessionId}:`, error);

      // Emit git operation failed event
      const errorMessage = `✗ Rebase failed: ${error instanceof Error ? error.message : 'Unknown error'}` +
                          (error && typeof error === 'object' && 'gitOutput' in error && (error as GitError).gitOutput ? `\n\nGit output:\n${(error as GitError).gitOutput}` : '');
      
      // Don't let this block the error response either
      try {
        emitGitOperationToProject(sessionId, 'git:operation_failed', errorMessage, {
          operation: 'rebase_from_main',
          error: error instanceof Error ? error.message : String(error),
          gitOutput: error && typeof error === 'object' && 'gitOutput' in error ? (error as GitError).gitOutput : undefined
        });
      } catch (outputError) {
        console.error(`[IPC:git] Failed to emit git error event for session ${sessionId}:`, outputError);
      }

      // Pass detailed git error information to frontend
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rebase main into worktree',
        gitError: {
          command: error && typeof error === 'object' && 'gitCommand' in error ? (error as ErrorWithGitContext).gitCommand : undefined,
          output: error && typeof error === 'object' && 'gitOutput' in error ? (error as ErrorWithGitContext).gitOutput : (error instanceof Error ? error.message : String(error)),
          workingDirectory: error && typeof error === 'object' && 'workingDirectory' in error ? (error as ErrorWithGitContext).workingDirectory : undefined,
          originalError: error && typeof error === 'object' && 'originalError' in error ? (error as ErrorWithGitContext).originalError?.message : undefined
        }
      };
    }
  });

  ipcMain.handle('sessions:abort-rebase-and-use-claude', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the project to find the main branch
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        return { success: false, error: 'Project not found for session' };
      }

      // Get the main branch from the project directory's current branch
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);

      // Check if we're actually in a rebase state (could have been pre-detected conflicts)
      // Try to abort any existing rebase, but don't fail if there isn't one
      try {
        const statusOutput = execSync('git status --porcelain=v1', { cwd: session.worktreePath }).toString();
        if (statusOutput.includes('rebase')) {
          await worktreeManager.abortRebase(session.worktreePath);
          
          // Emit git operation event about aborting the rebase
          const abortMessage = `🔄 GIT OPERATION\nAborted rebase successfully`;
          emitGitOperationToProject(sessionId, 'git:operation_completed', abortMessage, {
            operation: 'abort_rebase'
          });
        }
      } catch (abortError: unknown) {
        // Not in a rebase state or already clean - that's fine
      }

      // Create a new Claude panel to handle the rebase and conflicts
      const prompt = `Please rebase the local ${mainBranch} branch (not origin/${mainBranch}) into this branch and resolve all conflicts`;
      
      try {
        // Create a new Claude panel
        const panel = await panelManager.createPanel({
          sessionId: sessionId,
          type: 'claude',
          title: 'Claude - Resolve Conflicts'
        });
        
        // Get the claudePanelManager from the claudePanel module
        const { claudePanelManager } = require('./claudePanel');
        
        // Register the panel with the Claude panel manager
        claudePanelManager.registerPanel(panel.id, sessionId, panel.state.customState);
        
        // Start Claude in the new panel with the rebase prompt
        await claudePanelManager.startPanel(
          panel.id,
          session.worktreePath,
          prompt,
          session.permissionMode,
          session.model
        );
        
        // Add message to session output
        const message = `🤖 CLAUDE CODE\nCreated new Claude panel to handle rebase and resolve conflicts\nPrompt: ${prompt}`;
        sessionManager.addSessionOutput(sessionId, {
          type: 'stdout',
          data: message,
          timestamp: new Date()
        });
        
        return { 
          success: true, 
          data: { 
            message: 'Claude Code panel created to handle rebase and resolve conflicts',
            panelId: panel.id
          } 
        };
      } catch (error: unknown) {
        console.error('[IPC:git] Failed to create Claude panel:', error);
        console.error('[IPC:git] Error details:', {
          sessionId,
          worktreePath: session.worktreePath,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        });
        
        // Provide more specific error messages
        let errorMessage = 'Failed to create Claude panel';
        if (error instanceof Error && error.message?.includes('API key')) {
          errorMessage = 'Failed to create Claude panel: API key not configured';
        } else if (error instanceof Error && error.message?.includes('not found')) {
          errorMessage = 'Failed to create Claude panel: Session or worktree not found';
        } else if (error instanceof Error && error.message) {
          errorMessage = `Failed to create Claude panel: ${error.message}`;
        }
        
        return { success: false, error: errorMessage };
      }
    } catch (error: unknown) {
      console.error('[IPC:git] Failed to abort rebase and use Claude:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to abort rebase and use Claude'
      };
    }
  });

  ipcMain.handle('sessions:squash-and-rebase-to-main', async (_event, sessionId: string, commitMessage: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the project to find the main branch and project path
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        return { success: false, error: 'Project not found for session' };
      }

      // Get the effective main branch (override or auto-detected)
      const mainBranch = await Promise.race([
        worktreeManager.getProjectMainBranch(project.path),
        new Promise((_, reject) => setTimeout(() => reject(new Error('getProjectMainBranch timeout')), 30000))
      ]) as string;

      // Emit git operation started event to all sessions in project
      const startMessage = `🔄 GIT OPERATION\nSquashing commits and merging to ${mainBranch}...\nCommit message: ${commitMessage.split('\n')[0]}${commitMessage.includes('\n') ? '...' : ''}`;
      emitGitOperationToProject(sessionId, 'git:operation_started', startMessage, {
        operation: 'squash_and_merge',
        mainBranch,
        commitMessage: commitMessage.split('\n')[0]
      });

      await Promise.race([
        worktreeManager.squashAndMergeWorktreeToMain(project.path, session.worktreePath, mainBranch, commitMessage),
        new Promise((_, reject) => setTimeout(() => reject(new Error('squashAndMergeWorktreeToMain timeout')), 180000))
      ]);

      // Emit git operation completed event to all sessions in project
      const successMessage = `✓ Successfully squashed and merged worktree to ${mainBranch}`;
      emitGitOperationToProject(sessionId, 'git:operation_completed', successMessage, {
        operation: 'squash_and_merge',
        mainBranch
      });

      // Update git status for ALL sessions in the project since main was updated
      // Wait for this to complete before returning so UI sees the updated status immediately
      if (session.projectId !== undefined) {
        try {
          await gitStatusManager.updateProjectGitStatusAfterMainUpdate(session.projectId, sessionId);
        } catch (error) {
          console.error(`[IPC:git] Failed to update git status for project ${session.projectId}:`, error);
          // Continue even if status update fails - the merge succeeded
        }
      }

      return { success: true, data: { message: `Successfully squashed and merged worktree to ${mainBranch}` } };
    } catch (error: unknown) {
      console.error(`[IPC:git] Failed to squash and merge worktree to main for session ${sessionId}:`, error);

      // Emit git operation failed event
      const errorMessage = `✗ Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}` +
                          (error && typeof error === 'object' && 'gitOutput' in error && (error as GitError).gitOutput ? `\n\nGit output:\n${(error as GitError).gitOutput}` : '');

      // Don't let this block the error response either
      try {
        emitGitOperationToProject(sessionId, 'git:operation_failed', errorMessage, {
          operation: 'squash_and_merge',
          error: error instanceof Error ? error.message : String(error),
          gitOutput: error && typeof error === 'object' && 'gitOutput' in error ? (error as GitError).gitOutput : undefined
        });
      } catch (outputError) {
        console.error(`[IPC:git] Failed to emit git error event for session ${sessionId}:`, outputError);
      }

      // Pass detailed git error information to frontend
      const gitError = error as GitError;
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to squash and merge worktree to main',
        gitError: {
          commands: gitError.gitCommands,
          output: gitError.gitOutput || (error instanceof Error ? error.message : String(error)),
          workingDirectory: gitError.workingDirectory,
          projectPath: gitError.projectPath,
          originalError: gitError.originalError?.message
        }
      };
    }
  });

  ipcMain.handle('sessions:rebase-to-main', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the project to find the main branch and project path
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        return { success: false, error: 'Project not found for session' };
      }

      // Get the effective main branch (override or auto-detected)
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);

      // Emit git operation started event to all sessions in project
      const startMessage = `🔄 GIT OPERATION\nMerging to ${mainBranch} (preserving all commits)...`;
      emitGitOperationToProject(sessionId, 'git:operation_started', startMessage, {
        operation: 'merge_to_main',
        mainBranch
      });

      await worktreeManager.mergeWorktreeToMain(project.path, session.worktreePath, mainBranch);

      // Emit git operation completed event to all sessions in project
      const successMessage = `✓ Successfully merged worktree to ${mainBranch}`;
      emitGitOperationToProject(sessionId, 'git:operation_completed', successMessage, {
        operation: 'merge_to_main',
        mainBranch
      });
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      // Update git status for ALL sessions in the project since main was updated
      // Wait for this to complete before returning so UI sees the updated status immediately
      if (session.projectId !== undefined) {
        try {
          await gitStatusManager.updateProjectGitStatusAfterMainUpdate(session.projectId, sessionId);
        } catch (error) {
          console.error(`[IPC:git] Failed to update git status for project ${session.projectId}:`, error);
          // Continue even if status update fails - the merge succeeded
        }
      }

      return { success: true, data: { message: `Successfully merged worktree to ${mainBranch}` } };
    } catch (error: unknown) {
      console.error('Failed to merge worktree to main:', error);

      const gitError = error as GitError;

      // Add error message to session output
      const errorMessage = `✗ Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}` +
                          (gitError.gitOutput ? `\n\nGit output:\n${gitError.gitOutput}` : '');
      sessionManager.addSessionOutput(sessionId, {
        type: 'stderr',
        data: errorMessage,
        timestamp: new Date()
      });
      // Pass detailed git error information to frontend
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to merge worktree to main',
        gitError: {
          commands: gitError.gitCommands,
          output: gitError.gitOutput || (error instanceof Error ? error.message : String(error)),
          workingDirectory: gitError.workingDirectory,
          projectPath: gitError.projectPath,
          originalError: gitError.originalError?.message
        }
      };
    }
  });

  // Git pull/push operations for main repo sessions
  ipcMain.handle('sessions:git-pull', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Emit git operation started event to all sessions in project
      const startMessage = `🔄 GIT OPERATION\nPulling latest changes from remote...`;
      emitGitOperationToProject(sessionId, 'git:operation_started', startMessage, {
        operation: 'pull'
      });

      // Run git pull
      const result = await worktreeManager.gitPull(session.worktreePath);

      // Emit git operation completed event to all sessions in project
      const successMessage = `✓ Successfully pulled latest changes` +
                            (result.output ? `\n\nGit output:\n${result.output}` : '');
      emitGitOperationToProject(sessionId, 'git:operation_completed', successMessage, {
        operation: 'pull',
        output: result.output
      });

      // Check if this is a main repo session pulling main branch updates
      if (session.isMainRepo && session.projectId !== undefined) {
        // If pulling to main repo, all worktrees might be affected
        await refreshGitStatusForProject(session.projectId);
      } else {
        // If pulling to a worktree, only this session is affected
        await refreshGitStatusForSession(sessionId);
      }

      return { success: true, data: result };
    } catch (error: unknown) {
      console.error('Failed to pull from remote:', error);

      // Emit git operation failed event
      const gitError = error as GitError;
      
      const errorMessage = `✗ Pull failed: ${error instanceof Error ? error.message : 'Unknown error'}` +
                          (gitError.gitOutput ? `\n\nGit output:\n${gitError.gitOutput}` : '');
      emitGitOperationToProject(sessionId, 'git:operation_failed', errorMessage, {
        operation: 'pull',
        error: error instanceof Error ? error.message : String(error),
        gitOutput: gitError.gitOutput
      });

      // Check if it's a merge conflict
      if ((error instanceof Error && error.message?.includes('CONFLICT')) || (gitError.gitOutput?.includes('CONFLICT'))) {
        return {
          success: false,
          error: 'Merge conflicts detected. Please resolve conflicts manually or ask Claude to help.',
          isMergeConflict: true,
          gitError: {
            output: gitError.gitOutput || (error instanceof Error ? error.message : String(error)),
            workingDirectory: gitError.workingDirectory || ''
          }
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pull from remote',
        gitError: {
          output: gitError.gitOutput || (error instanceof Error ? error.message : String(error)),
          workingDirectory: gitError.workingDirectory || ''
        }
      };
    }
  });

  ipcMain.handle('sessions:git-push', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Emit git operation started event to all sessions in project
      const startMessage = `🔄 GIT OPERATION\nPushing changes to remote...`;
      emitGitOperationToProject(sessionId, 'git:operation_started', startMessage, {
        operation: 'push'
      });

      // Run git push
      const result = await worktreeManager.gitPush(session.worktreePath);

      // Emit git operation completed event to all sessions in project
      const successMessage = `✓ Successfully pushed changes to remote` +
                            (result.output ? `\n\nGit output:\n${result.output}` : '');
      emitGitOperationToProject(sessionId, 'git:operation_completed', successMessage, {
        operation: 'push',
        output: result.output
      });
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      // Check if this is a main repo session pushing to main branch
      if (session.isMainRepo && session.projectId !== undefined) {
        // If pushing from main repo, all worktrees might be affected
        await refreshGitStatusForProject(session.projectId);
      } else {
        // If pushing from a worktree, only this session is affected
        await refreshGitStatusForSession(sessionId);
      }

      return { success: true, data: result };
    } catch (error: unknown) {
      console.error('Failed to push to remote:', error);

      const gitError = error as GitError;
      
      // Emit git operation failed event
      const errorMessage = `✗ Push failed: ${error instanceof Error ? error.message : 'Unknown error'}` +
                          (gitError.gitOutput ? `\n\nGit output:\n${gitError.gitOutput}` : '');
      emitGitOperationToProject(sessionId, 'git:operation_failed', errorMessage, {
        operation: 'push',
        error: error instanceof Error ? error.message : String(error),
        gitOutput: gitError.gitOutput
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to push to remote',
        gitError: {
          output: gitError.gitOutput || (error instanceof Error ? error.message : String(error)),
          workingDirectory: gitError.workingDirectory || ''
        }
      };
    }
  });

  ipcMain.handle('sessions:get-last-commits', async (_event, sessionId: string, count: number = 50) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the last N commits from the repository
      const commits = await worktreeManager.getLastCommits(session.worktreePath, count);
      const limitReached = commits.length === count;

      // Transform commits to match ExecutionDiff format
      const executionDiffs = commits.map((commit, index) => ({
        id: index + 1,
        session_id: sessionId,
        commit_message: commit.message,
        execution_sequence: index + 1,
        stats_additions: commit.additions || 0,
        stats_deletions: commit.deletions || 0,
        stats_files_changed: commit.filesChanged || 0,
        commit_hash: commit.hash,
        timestamp: commit.date,
        author: commit.author || 'Unknown',
        history_limit_reached: limitReached
      }));

      return { success: true, data: executionDiffs };
    } catch (error: unknown) {
      console.error('Failed to get last commits:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get last commits'
      };
    }
  });

  // Git operation helpers
  ipcMain.handle('sessions:has-changes-to-rebase', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        return { success: false, error: 'Project not found for session' };
      }

      // Get the effective main branch (override or auto-detected)
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
      const hasChanges = await worktreeManager.hasChangesToRebase(session.worktreePath, mainBranch);

      return { success: true, data: hasChanges };
    } catch (error) {
      console.error('Failed to check for changes to rebase:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to check for changes to rebase' };
    }
  });

  ipcMain.handle('sessions:get-git-commands', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }
      
      // Check if session is archived - worktree won't exist
      if (session.archived) {
        return { success: false, error: 'Cannot access git commands for archived session' };
      }

      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        return { success: false, error: 'Project not found for session' };
      }

      // Get the effective main branch (override or auto-detected)
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);

      // Get current branch name
      const currentBranch = execSync('git branch --show-current', { 
        cwd: session.worktreePath,
        encoding: 'utf8' 
      }).trim();

      const originBranch = session.isMainRepo
        ? await worktreeManager.getOriginBranch(session.worktreePath, mainBranch)
        : null;

      const rebaseCommands = worktreeManager.generateRebaseCommands(mainBranch);
      const squashCommands = worktreeManager.generateSquashCommands(mainBranch, currentBranch);
      const mergeCommands = worktreeManager.generateMergeCommands(mainBranch, currentBranch);

      return {
        success: true,
        data: {
          rebaseCommands,
          squashCommands,
          mergeCommands,
          mainBranch,
          originBranch: originBranch || undefined,
          currentBranch
        }
      };
    } catch (error) {
      // Don't log errors for expected failures
      const errorMessage = error instanceof Error ? error.message : 'Failed to get git commands';
      if (!errorMessage.includes('archived session')) {
        console.error('Failed to get git commands:', error);
      }
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sessions:get-git-status', async (_event, sessionId: string, nonBlocking?: boolean, isInitialLoad?: boolean) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      if (session.archived) {
        return { success: false, error: 'Cannot get git status for archived session' };
      }

      // For initial loads, use the queued approach to prevent UI lock
      if (isInitialLoad) {
        const cachedStatus = await gitStatusManager.queueInitialLoad(sessionId);
        return { 
          success: true, 
          gitStatus: cachedStatus,
          backgroundRefresh: true 
        };
      }

      // If nonBlocking is true, start refresh in background and return immediately
      if (nonBlocking) {
        // Start the refresh in background
        setImmediate(() => {
          gitStatusManager.refreshSessionGitStatus(sessionId, true).catch(error => {
            console.error(`[Git] Background git status refresh failed for session ${sessionId}:`, error);
          });
        });
        
        // Return the cached status if available, or indicate background refresh started
        const cachedStatus = await gitStatusManager.getGitStatus(sessionId);
        return { 
          success: true, 
          gitStatus: cachedStatus,
          backgroundRefresh: true 
        };
      } else {
        // Use refreshSessionGitStatus with user-initiated flag
        // This is called when user clicks on a session, so show loading state
        const gitStatus = await gitStatusManager.refreshSessionGitStatus(sessionId, true);
        return { success: true, gitStatus };
      }
    } catch (error) {
      console.error('Error getting git status:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('git:cancel-status-for-project', async (_event, projectId: number) => {
    try {
      // Get all sessions for the project
      const sessions = await sessionManager.getAllSessions();
      const projectSessions = sessions.filter(s => s.projectId === projectId && !s.archived);
      
      // Cancel git status operations for all project sessions
      const sessionIds = projectSessions.map(s => s.id);
      gitStatusManager.cancelMultipleGitStatus(sessionIds);
      
      return { success: true };
    } catch (error) {
      console.error('Error cancelling git status:', error);
      return { success: false, error: (error as Error).message };
    }
  });
} 

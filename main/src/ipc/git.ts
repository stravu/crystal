import { IpcMain } from 'electron';
import type { AppServices } from './types';
import { execSync } from '../utils/commandExecutor';
import { buildGitCommitCommand, escapeShellArg } from '../utils/shellEscape';

export function registerGitHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { sessionManager, gitDiffManager, worktreeManager, claudeCodeManager } = services;

  ipcMain.handle('sessions:get-executions', async (_event, sessionId: string) => {
    try {
      // Get session to find worktree path
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      // Get git commit history from the worktree
      const project = sessionManager.getProjectForSession(sessionId);
      // Get the main branch from the project directory's current branch
      if (!project?.path) {
        throw new Error('Project path not found for session');
      }
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
      
      console.log(`[IPC:git] Getting commits for session ${sessionId}`);
      console.log(`[IPC:git] Project path: ${project?.path || 'not found'}`);
      console.log(`[IPC:git] Using main branch: ${mainBranch}`);
      
      const commits = gitDiffManager.getCommitHistory(session.worktreePath, 50, mainBranch);

      // Check for uncommitted changes
      const uncommittedDiff = await gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
      const hasUncommittedChanges = uncommittedDiff.stats.filesChanged > 0;

      // Transform commits to execution diff format for compatibility
      const executions: any[] = commits.map((commit, index) => ({
        id: index + 1,
        session_id: sessionId,
        prompt_text: commit.message,
        execution_sequence: index + 1,
        git_diff: null, // Will be loaded on demand
        files_changed: [],
        stats_additions: commit.stats.additions,
        stats_deletions: commit.stats.deletions,
        stats_files_changed: commit.stats.filesChanged,
        before_commit_hash: `${commit.hash}~1`,
        after_commit_hash: commit.hash,
        timestamp: commit.date.toISOString()
      }));

      // Add uncommitted changes as the first item if they exist
      if (hasUncommittedChanges) {
        executions.unshift({
          id: 0, // Special ID for uncommitted changes
          session_id: sessionId,
          prompt_text: 'Uncommitted changes',
          execution_sequence: 0,
          git_diff: null,
          files_changed: uncommittedDiff.changedFiles || [],
          stats_additions: uncommittedDiff.stats.additions,
          stats_deletions: uncommittedDiff.stats.deletions,
          stats_files_changed: uncommittedDiff.stats.filesChanged,
          before_commit_hash: commits.length > 0 ? commits[0].hash : 'HEAD',
          after_commit_hash: 'UNCOMMITTED',
          timestamp: new Date().toISOString()
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

      // Get git commit history
      const project = sessionManager.getProjectForSession(sessionId);
      // Get the main branch from the project directory's current branch
      if (!project?.path) {
        throw new Error('Project path not found for session');
      }
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
      const commits = gitDiffManager.getCommitHistory(session.worktreePath, 50, mainBranch);
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
        
        // TODO: Emit event to update UI when event manager is available
        // For now, just return success
        
        return { success: true };
      } catch (commitError: any) {
        // Check if it's a pre-commit hook failure
        if (commitError.stdout?.includes('pre-commit') || commitError.stderr?.includes('pre-commit')) {
          return { success: false, error: 'Pre-commit hooks failed. Please fix the issues and try again.' };
        }
        throw commitError;
      }
    } catch (error: any) {
      console.error('Failed to commit changes:', error);
      const errorMessage = error.message || error.stderr || 'Failed to commit changes';
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
    console.log('[IPC] sessions:get-combined-diff called with:', {
      sessionId,
      executionIds,
      executionIdsLength: executionIds?.length,
      firstExecutionId: executionIds?.[0]
    });
    
    try {
      // Get session to find worktree path
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      // Handle uncommitted changes request
      if (executionIds && executionIds.length === 1 && executionIds[0] === 0) {
        console.log('Handling uncommitted changes request for session:', sessionId);
        console.log('Session worktree path:', session.worktreePath);
        
        // Verify the worktree exists and has uncommitted changes
        try {
          const status = execSync('git status --porcelain', { 
            cwd: session.worktreePath, 
            encoding: 'utf8' 
          });
          console.log('Git status before getting diff:', status || '(no changes)');
        } catch (error) {
          console.error('Error checking git status:', error);
        }
        
        const uncommittedDiff = await gitDiffManager.captureWorkingDirectoryDiff(session.worktreePath);
        console.log('Uncommitted diff result:', {
          hasDiff: !!uncommittedDiff.diff,
          diffLength: uncommittedDiff.diff?.length,
          stats: uncommittedDiff.stats,
          changedFiles: uncommittedDiff.changedFiles
        });
        return { success: true, data: uncommittedDiff };
      }

      // Get git commit history
      const project = sessionManager.getProjectForSession(sessionId);
      // Get the main branch from the project directory's current branch
      if (!project?.path) {
        throw new Error('Project path not found for session');
      }
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
      const commits = gitDiffManager.getCommitHistory(session.worktreePath, 50, mainBranch);

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
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);

      // Add message to session output about starting the rebase
      const timestamp = new Date().toLocaleTimeString();
      const startMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 🔄 GIT OPERATION \x1b[0m\r\n` +
                          `\x1b[1m\x1b[94mRebasing from ${mainBranch}...\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      await worktreeManager.rebaseMainIntoWorktree(session.worktreePath, mainBranch);

      // Add success message to session output
      const successMessage = `\x1b[32m✓ Successfully rebased ${mainBranch} into worktree\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      return { success: true, data: { message: `Successfully rebased ${mainBranch} into worktree` } };
    } catch (error: any) {
      console.error('Failed to rebase main into worktree:', error);

      // Add error message to session output
      const errorMessage = `\x1b[31m✗ Rebase failed: ${error.message || 'Unknown error'}\x1b[0m\r\n` +
                          (error.gitOutput ? `\r\n\x1b[90mGit output:\x1b[0m\r\n${error.gitOutput}\r\n` : '') +
                          `\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stderr',
        data: errorMessage,
        timestamp: new Date()
      });
      // Pass detailed git error information to frontend
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rebase main into worktree',
        gitError: {
          command: error.gitCommand,
          output: error.gitOutput,
          workingDirectory: error.workingDirectory,
          originalError: error.originalError?.message
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

      // First, abort the rebase
      try {
        await worktreeManager.abortRebase(session.worktreePath);

        // Add message to session output about aborting the rebase
        const timestamp = new Date().toLocaleTimeString();
        const abortMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 🔄 GIT OPERATION \x1b[0m\r\n` +
                            `\x1b[1m\x1b[94mAborted rebase successfully\x1b[0m\r\n\r\n`;
        sessionManager.addSessionOutput(sessionId, {
          type: 'stdout',
          data: abortMessage,
          timestamp: new Date()
        });
      } catch (abortError: any) {
        console.error('Failed to abort rebase:', abortError);
        // Continue anyway - the user might have already resolved it
      }

      // Send the prompt to Claude Code to handle the rebase
      const prompt = `Please rebase the local ${mainBranch} branch (not origin/${mainBranch}) into this branch and resolve all conflicts`;

      // Check if session is waiting for input or stopped
      const currentSession = await sessionManager.getSession(sessionId);
      if (!currentSession) {
        return { success: false, error: 'Session not found' };
      }

      if (currentSession.status === 'waiting' || currentSession.status === 'running') {
        // Session is already running, just send the input
        const userInputDisplay = `> ${prompt.trim()}\n`;
        await sessionManager.addSessionOutput(sessionId, {
          type: 'stdout',
          data: userInputDisplay,
          timestamp: new Date()
        });

        claudeCodeManager.sendInput(sessionId, prompt + '\n');
        return { success: true, data: { message: 'Sent rebase prompt to Claude Code' } };
      } else {
        // Session is stopped, need to continue the conversation
        try {
          // Get conversation history
          const conversationHistory = sessionManager.getConversationMessages(sessionId);

          // Update session status to initializing
          sessionManager.updateSession(sessionId, {
            status: 'initializing',
            run_started_at: null
          });

          // Add the prompt to conversation
          if (prompt) {
            sessionManager.continueConversation(sessionId, prompt);
          }

          // Continue the session with proper worktree path
          await claudeCodeManager.continueSession(sessionId, session.worktreePath, prompt, conversationHistory);

          return { success: true, data: { message: 'Rebase aborted and Claude Code prompted to handle conflicts' } };
        } catch (error: any) {
          console.error('Failed to continue session:', error);
          return { success: false, error: 'Failed to continue Claude Code session' };
        }
      }
    } catch (error: any) {
      console.error('Failed to abort rebase and use Claude:', error);
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
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);

      // Add message to session output about starting the squash and rebase
      const timestamp = new Date().toLocaleTimeString();
      const startMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 🔄 GIT OPERATION \x1b[0m\r\n` +
                          `\x1b[1m\x1b[94mSquashing commits and rebasing to ${mainBranch}...\x1b[0m\r\n` +
                          `\x1b[90mCommit message: ${commitMessage.split('\n')[0]}${commitMessage.includes('\n') ? '...' : ''}\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      await worktreeManager.squashAndRebaseWorktreeToMain(project.path, session.worktreePath, mainBranch, commitMessage);

      // Add success message to session output
      const successMessage = `\x1b[32m✓ Successfully squashed and rebased worktree to ${mainBranch}\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      return { success: true, data: { message: `Successfully squashed and rebased worktree to ${mainBranch}` } };
    } catch (error: any) {
      console.error('Failed to squash and rebase worktree to main:', error);

      // Add error message to session output
      const errorMessage = `\x1b[31m✗ Squash and rebase failed: ${error.message || 'Unknown error'}\x1b[0m\r\n` +
                          (error.gitOutput ? `\r\n\x1b[90mGit output:\x1b[0m\r\n${error.gitOutput}\r\n` : '') +
                          `\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stderr',
        data: errorMessage,
        timestamp: new Date()
      });
      // Pass detailed git error information to frontend
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to squash and rebase worktree to main',
        gitError: {
          commands: error.gitCommands,
          output: error.gitOutput,
          workingDirectory: error.workingDirectory,
          projectPath: error.projectPath,
          originalError: error.originalError?.message
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

      // Add message to session output about starting the rebase
      const timestamp = new Date().toLocaleTimeString();
      const startMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 🔄 GIT OPERATION \x1b[0m\r\n` +
                          `\x1b[1m\x1b[94mRebasing to ${mainBranch} (preserving all commits)...\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      await worktreeManager.rebaseWorktreeToMain(project.path, session.worktreePath, mainBranch);

      // Add success message to session output
      const successMessage = `\x1b[32m✓ Successfully rebased worktree to ${mainBranch}\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      return { success: true, data: { message: `Successfully rebased worktree to ${mainBranch}` } };
    } catch (error: any) {
      console.error('Failed to rebase worktree to main:', error);

      // Add error message to session output
      const errorMessage = `\x1b[31m✗ Rebase failed: ${error.message || 'Unknown error'}\x1b[0m\r\n` +
                          (error.gitOutput ? `\r\n\x1b[90mGit output:\x1b[0m\r\n${error.gitOutput}\r\n` : '') +
                          `\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stderr',
        data: errorMessage,
        timestamp: new Date()
      });
      // Pass detailed git error information to frontend
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rebase worktree to main',
        gitError: {
          commands: error.gitCommands,
          output: error.gitOutput,
          workingDirectory: error.workingDirectory,
          projectPath: error.projectPath,
          originalError: error.originalError?.message
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

      // Add message to session output about starting the pull
      const timestamp = new Date().toLocaleTimeString();
      const startMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 🔄 GIT OPERATION \x1b[0m\r\n` +
                          `\x1b[1m\x1b[94mPulling latest changes from remote...\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      // Run git pull
      const result = await worktreeManager.gitPull(session.worktreePath);

      // Add success message to session output
      const successMessage = `\x1b[32m✓ Successfully pulled latest changes\x1b[0m\r\n` +
                            (result.output ? `\r\n\x1b[90mGit output:\x1b[0m\r\n${result.output}\r\n` : '') +
                            `\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      return { success: true, data: result };
    } catch (error: any) {
      console.error('Failed to pull from remote:', error);

      // Add error message to session output
      const errorMessage = `\x1b[31m✗ Pull failed: ${error.message || 'Unknown error'}\x1b[0m\r\n` +
                          (error.gitOutput ? `\r\n\x1b[90mGit output:\x1b[0m\r\n${error.gitOutput}\r\n` : '') +
                          `\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stderr',
        data: errorMessage,
        timestamp: new Date()
      });

      // Check if it's a merge conflict
      if (error.message?.includes('CONFLICT') || error.gitOutput?.includes('CONFLICT')) {
        return {
          success: false,
          error: 'Merge conflicts detected. Please resolve conflicts manually or ask Claude to help.',
          isMergeConflict: true,
          gitError: {
            output: error.gitOutput || error.message,
            workingDirectory: error.workingDirectory || ''
          }
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to pull from remote',
        gitError: {
          output: error.gitOutput || error.message,
          workingDirectory: error.workingDirectory || ''
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

      // Add message to session output about starting the push
      const timestamp = new Date().toLocaleTimeString();
      const startMessage = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 🔄 GIT OPERATION \x1b[0m\r\n` +
                          `\x1b[1m\x1b[94mPushing changes to remote...\x1b[0m\r\n\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      // Run git push
      const result = await worktreeManager.gitPush(session.worktreePath);

      // Add success message to session output
      const successMessage = `\x1b[32m✓ Successfully pushed changes to remote\x1b[0m\r\n` +
                            (result.output ? `\r\n\x1b[90mGit output:\x1b[0m\r\n${result.output}\r\n` : '') +
                            `\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      return { success: true, data: result };
    } catch (error: any) {
      console.error('Failed to push to remote:', error);

      // Add error message to session output
      const errorMessage = `\x1b[31m✗ Push failed: ${error.message || 'Unknown error'}\x1b[0m\r\n` +
                          (error.gitOutput ? `\r\n\x1b[90mGit output:\x1b[0m\r\n${error.gitOutput}\r\n` : '') +
                          `\r\n`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stderr',
        data: errorMessage,
        timestamp: new Date()
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to push to remote',
        gitError: {
          output: error.gitOutput || error.message,
          workingDirectory: error.workingDirectory || ''
        }
      };
    }
  });

  ipcMain.handle('sessions:get-last-commits', async (_event, sessionId: string, count: number = 20) => {
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

      // Transform commits to match ExecutionDiff format
      const executionDiffs = commits.map((commit, index) => ({
        id: index + 1,
        session_id: sessionId,
        prompt_text: commit.message,
        execution_sequence: commits.length - index,
        stats_additions: commit.additions || 0,
        stats_deletions: commit.deletions || 0,
        stats_files_changed: commit.filesChanged || 0,
        after_commit_hash: commit.hash,
        timestamp: commit.date
      }));

      return { success: true, data: executionDiffs };
    } catch (error: any) {
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

      const rebaseCommands = worktreeManager.generateRebaseCommands(mainBranch);
      const squashCommands = worktreeManager.generateSquashCommands(mainBranch, currentBranch);

      return {
        success: true,
        data: {
          rebaseCommands,
          squashCommands,
          mainBranch,
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
} 
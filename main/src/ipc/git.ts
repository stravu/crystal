import { IpcMain } from 'electron';
import type { AppServices } from './types';
import { execSync } from '../utils/commandExecutor';
import { buildGitCommitCommand, escapeShellArg } from '../utils/shellEscape';

export function registerGitHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { sessionManager, gitDiffManager, worktreeManager, claudeCodeManager, gitStatusManager, databaseService } = services;

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

  ipcMain.handle('sessions:get-executions', async (_event, sessionId: string) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      // Get project and main branch
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project?.path) {
        throw new Error('Project path not found for session');
      }
      const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
      
      // Get git commit history
      const commits = gitDiffManager.getCommitHistory(session.worktreePath, 50, mainBranch);
      
      console.log(`[IPC:git] Getting git commits for session ${sessionId}`);
      console.log(`[IPC:git] Found ${commits.length} commits`);

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
        author: commit.author
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
          author: 'You'
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
        
        // Refresh git status for this session after commit
        await refreshGitStatusForSession(sessionId);
        
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
    console.log(`[IPC:git] Starting rebase-main-into-worktree for session ${sessionId}`);
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        console.log(`[IPC:git] Session ${sessionId} not found`);
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        console.log(`[IPC:git] Session ${sessionId} has no worktree path`);
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the project to find the main branch
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        console.log(`[IPC:git] Project not found for session ${sessionId}`);
        return { success: false, error: 'Project not found for session' };
      }

      console.log(`[IPC:git] Getting main branch for project at ${project.path}`);
      // Get the main branch from the project directory's current branch
      const mainBranch = await Promise.race([
        worktreeManager.getProjectMainBranch(project.path),
        new Promise((_, reject) => setTimeout(() => reject(new Error('getProjectMainBranch timeout')), 30000))
      ]) as string;
      console.log(`[IPC:git] Main branch: ${mainBranch}`);

      // Add message to session output about starting the rebase
      const startMessage = `🔄 GIT OPERATION\nRebasing from ${mainBranch}...`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      console.log(`[IPC:git] Starting rebase operation for session ${sessionId}`);
      await Promise.race([
        worktreeManager.rebaseMainIntoWorktree(session.worktreePath, mainBranch),
        new Promise((_, reject) => setTimeout(() => reject(new Error('rebaseMainIntoWorktree timeout')), 120000))
      ]);
      console.log(`[IPC:git] Rebase operation completed for session ${sessionId}`);

      // Add success message to session output
      const successMessage = `✓ Successfully rebased ${mainBranch} into worktree`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      console.log(`[IPC:git] Refreshing git status for session ${sessionId}`);
      // Refresh git status for this session after rebasing from main
      // Don't let this block the response - run it in background
      refreshGitStatusForSession(sessionId).catch(error => {
        console.error(`[IPC:git] Failed to refresh git status for session ${sessionId}:`, error);
      });

      console.log(`[IPC:git] Rebase operation successful for session ${sessionId}`);
      return { success: true, data: { message: `Successfully rebased ${mainBranch} into worktree` } };
    } catch (error: any) {
      console.error(`[IPC:git] Failed to rebase main into worktree for session ${sessionId}:`, error);

      // Add error message to session output
      const errorMessage = `✗ Rebase failed: ${error.message || 'Unknown error'}` +
                          (error.gitOutput ? `\n\nGit output:\n${error.gitOutput}` : '');
      
      // Don't let this block the error response either
      try {
        sessionManager.addSessionOutput(sessionId, {
          type: 'stderr',
          data: errorMessage,
          timestamp: new Date()
        });
      } catch (outputError) {
        console.error(`[IPC:git] Failed to add error output to session ${sessionId}:`, outputError);
      }

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
        const abortMessage = `🔄 GIT OPERATION\nAborted rebase successfully`;
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
    console.log(`[IPC:git] Starting squash-and-rebase-to-main for session ${sessionId}`);
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session) {
        console.log(`[IPC:git] Session ${sessionId} not found`);
        return { success: false, error: 'Session not found' };
      }

      if (!session.worktreePath) {
        console.log(`[IPC:git] Session ${sessionId} has no worktree path`);
        return { success: false, error: 'Session has no worktree path' };
      }

      // Get the project to find the main branch and project path
      const project = sessionManager.getProjectForSession(sessionId);
      if (!project) {
        console.log(`[IPC:git] Project not found for session ${sessionId}`);
        return { success: false, error: 'Project not found for session' };
      }

      console.log(`[IPC:git] Getting main branch for project at ${project.path}`);
      // Get the effective main branch (override or auto-detected)
      const mainBranch = await Promise.race([
        worktreeManager.getProjectMainBranch(project.path),
        new Promise((_, reject) => setTimeout(() => reject(new Error('getProjectMainBranch timeout')), 30000))
      ]) as string;
      console.log(`[IPC:git] Main branch: ${mainBranch}`);

      // Add message to session output about starting the squash and rebase
      const startMessage = `🔄 GIT OPERATION\nSquashing commits and rebasing to ${mainBranch}...\nCommit message: ${commitMessage.split('\n')[0]}${commitMessage.includes('\n') ? '...' : ''}`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      console.log(`[IPC:git] Starting squash and rebase operation for session ${sessionId}`);
      await Promise.race([
        worktreeManager.squashAndRebaseWorktreeToMain(project.path, session.worktreePath, mainBranch, commitMessage),
        new Promise((_, reject) => setTimeout(() => reject(new Error('squashAndRebaseWorktreeToMain timeout')), 180000))
      ]);
      console.log(`[IPC:git] Squash and rebase operation completed for session ${sessionId}`);

      // Add success message to session output
      const successMessage = `✓ Successfully squashed and rebased worktree to ${mainBranch}`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      console.log(`[IPC:git] Refreshing git status for project ${session.projectId}`);
      // Refresh git status for ALL sessions in the project since main was updated
      // Don't let this block the response - run it in background
      if (session.projectId !== undefined) {
        refreshGitStatusForProject(session.projectId).catch(error => {
          console.error(`[IPC:git] Failed to refresh git status for project ${session.projectId}:`, error);
        });
      }
      
      console.log(`[IPC:git] Squash and rebase operation successful for session ${sessionId}`);
      return { success: true, data: { message: `Successfully squashed and rebased worktree to ${mainBranch}` } };
    } catch (error: any) {
      console.error(`[IPC:git] Failed to squash and rebase worktree to main for session ${sessionId}:`, error);

      // Add error message to session output
      const errorMessage = `✗ Squash and rebase failed: ${error.message || 'Unknown error'}` +
                          (error.gitOutput ? `\n\nGit output:\n${error.gitOutput}` : '');
      
      // Don't let this block the error response either
      try {
        sessionManager.addSessionOutput(sessionId, {
          type: 'stderr',
          data: errorMessage,
          timestamp: new Date()
        });
      } catch (outputError) {
        console.error(`[IPC:git] Failed to add error output to session ${sessionId}:`, outputError);
      }

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
      const startMessage = `🔄 GIT OPERATION\nRebasing to ${mainBranch} (preserving all commits)...`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      await worktreeManager.rebaseWorktreeToMain(project.path, session.worktreePath, mainBranch);

      // Add success message to session output
      const successMessage = `✓ Successfully rebased worktree to ${mainBranch}`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
      });

      return { success: true, data: { message: `Successfully rebased worktree to ${mainBranch}` } };
    } catch (error: any) {
      console.error('Failed to rebase worktree to main:', error);

      // Add error message to session output
      const errorMessage = `✗ Rebase failed: ${error.message || 'Unknown error'}` +
                          (error.gitOutput ? `\n\nGit output:\n${error.gitOutput}` : '');
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
      const startMessage = `🔄 GIT OPERATION\nPulling latest changes from remote...`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      // Run git pull
      const result = await worktreeManager.gitPull(session.worktreePath);

      // Add success message to session output
      const successMessage = `✓ Successfully pulled latest changes` +
                            (result.output ? `\n\nGit output:\n${result.output}` : '');
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: successMessage,
        timestamp: new Date()
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
    } catch (error: any) {
      console.error('Failed to pull from remote:', error);

      // Add error message to session output
      const errorMessage = `✗ Pull failed: ${error.message || 'Unknown error'}` +
                          (error.gitOutput ? `\n\nGit output:\n${error.gitOutput}` : '');
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
      const startMessage = `🔄 GIT OPERATION\nPushing changes to remote...`;
      sessionManager.addSessionOutput(sessionId, {
        type: 'stdout',
        data: startMessage,
        timestamp: new Date()
      });

      // Run git push
      const result = await worktreeManager.gitPush(session.worktreePath);

      // Add success message to session output
      const successMessage = `✓ Successfully pushed changes to remote` +
                            (result.output ? `\n\nGit output:\n${result.output}` : '');
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
    } catch (error: any) {
      console.error('Failed to push to remote:', error);

      // Add error message to session output
      const errorMessage = `✗ Push failed: ${error.message || 'Unknown error'}` +
                          (error.gitOutput ? `\n\nGit output:\n${error.gitOutput}` : '');
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
        commit_message: commit.message,
        execution_sequence: index + 1,
        stats_additions: commit.additions || 0,
        stats_deletions: commit.deletions || 0,
        stats_files_changed: commit.filesChanged || 0,
        commit_hash: commit.hash,
        timestamp: commit.date,
        author: commit.author || 'Unknown'
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

  ipcMain.handle('sessions:get-git-status', async (_event, sessionId: string, nonBlocking?: boolean) => {
    try {
      const session = await sessionManager.getSession(sessionId);
      if (!session || !session.worktreePath) {
        return { success: false, error: 'Session or worktree path not found' };
      }

      if (session.archived) {
        return { success: false, error: 'Cannot get git status for archived session' };
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
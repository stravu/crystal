import type { BrowserWindow } from 'electron';
import { execSync } from './utils/commandExecutor';
import type { AppServices } from './ipc/types';
import type { VersionInfo } from './services/versionChecker';

export function setupEventListeners(services: AppServices, getMainWindow: () => BrowserWindow | null): void {
  const {
    sessionManager,
    claudeCodeManager,
    executionTracker,
    runCommandManager,
    gitDiffManager,
    gitStatusManager,
    worktreeManager
  } = services;

  // Listen to sessionManager events and broadcast to renderer
  sessionManager.on('session-created', (session) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('session:created', session);
      } catch (error) {
        console.error('[Main] Failed to send session:created event:', error);
      }
    }
  });

  sessionManager.on('session-updated', (session) => {
    console.log(`[Main] session-updated event received for ${session.id} with status ${session.status}`);
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      console.log(`[Main] Sending session:updated to renderer for ${session.id}`);
      try {
        mw.webContents.send('session:updated', session);
      } catch (error) {
        console.error('[Main] Failed to send session:updated event:', error);
      }
    } else {
      console.error(`[Main] Cannot send session:updated - mainWindow is ${mw ? 'destroyed' : 'null'}`);
    }
  });

  sessionManager.on('session-deleted', (session) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('session:deleted', session);
      } catch (error) {
        console.error('[Main] Failed to send session:deleted event:', error);
      }
    }
  });

  sessionManager.on('sessions-loaded', (sessions) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('sessions:loaded', sessions);
      } catch (error) {
        console.error('[Main] Failed to send sessions:loaded event:', error);
      }
    }
  });

  sessionManager.on('zombie-processes-detected', (data) => {
    console.error('[Main] Zombie processes detected:', data);
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('zombie-processes-detected', data);
      } catch (error) {
        console.error('[Main] Failed to send zombie-processes-detected event:', error);
      }
    }
  });

  sessionManager.on('session-output', (output) => {
    const mw = getMainWindow();
    if (mw) {
      mw.webContents.send('session:output', output);
    }
  });

  sessionManager.on('session-output-available', (info) => {
    const mw = getMainWindow();
    if (mw) {
      mw.webContents.send('session:output-available', info);
    }
  });

  // Listen for project update events from sessionManager (since it extends EventEmitter)
  sessionManager.on('project:updated', (project: any) => {
    console.log(`[Main] Project updated: ${project.id}`);
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('project:updated', project);
    }
  });

  // Listen to claudeCodeManager events
  claudeCodeManager.on('output', async (output: any) => {
    // Save raw output to database (including JSON)
    sessionManager.addSessionOutput(output.sessionId, {
      type: output.type,
      data: output.data,
      timestamp: output.timestamp
    });

    // Check if Claude is waiting for user input
    if (output.type === 'json' && output.data.type === 'prompt') {
      console.log(`[Main] Claude is waiting for user input in session ${output.sessionId}`);
      await sessionManager.updateSession(output.sessionId, { status: 'waiting' });
    }

    // Check if Claude has completed (when it sends a result message)
    if (output.type === 'json' && output.data.type === 'system' && output.data.subtype === 'result') {
      console.log(`[Main] Claude completed task in session ${output.sessionId}`);
      // Don't update status here - let the exit handler determine if it should be completed_unviewed
    }

    // Send real-time updates to renderer
    const mw = getMainWindow();
    if (mw) {
      // Always send the output as-is, without formatting
      // JSON messages will be formatted when loaded from the database via sessions:get-output
      // This prevents duplicate formatted messages in the Output view
      mw.webContents.send('session:output', output);
    }
  });

  claudeCodeManager.on('spawned', async ({ sessionId }: { sessionId: string }) => {
    console.log(`[Main] Claude Code spawned for session ${sessionId}, updating status to 'running'`);

    // Add a small delay to ensure the session is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));

    await sessionManager.updateSession(sessionId, {
      status: 'running',
      run_started_at: 'CURRENT_TIMESTAMP'
    });

    // Verify the update was successful
    const updatedSession = await sessionManager.getSession(sessionId);
    console.log(`[Main] Session ${sessionId} status after update: ${updatedSession?.status}`);

    // Start execution tracking
    try {
      const session = await sessionManager.getSession(sessionId);
      if (session && session.worktreePath) {
        // Get the latest prompt from prompt markers or use the session prompt
        const promptMarkers = sessionManager.getPromptMarkers(sessionId);
        const latestPrompt = promptMarkers.length > 0
          ? promptMarkers[promptMarkers.length - 1].prompt_text
          : session.prompt;

        await executionTracker.startExecution(sessionId, session.worktreePath, undefined, latestPrompt);

        // NOTE: Run commands are NOT started automatically when Claude spawns
        // They should only run when the user clicks the play button
      }
    } catch (error) {
      console.error(`Failed to start execution tracking for session ${sessionId}:`, error);
    }
  });

  claudeCodeManager.on('exit', async ({ sessionId, exitCode, signal }: { sessionId: string; exitCode: number; signal: string }) => {
    console.log(`[Main] Claude Code exited for session ${sessionId} with code ${exitCode}, signal ${signal}`);
    await sessionManager.setSessionExitCode(sessionId, exitCode);
    
    // Get the current session to check its current status
    const session = sessionManager.getSession(sessionId);
    if (session) {
      // Only update to 'stopped' if the session hasn't already been marked as completed
      const dbSession = sessionManager.getDbSession(sessionId);
      if (dbSession && dbSession.status !== 'completed') {
        console.log(`[Main] Updating session ${sessionId} status to 'stopped'`);
        await sessionManager.updateSession(sessionId, { status: 'stopped' });
      } else {
        console.log(`[Main] Session ${sessionId} already marked as completed, preserving status`);
        // Trigger a re-conversion to ensure the UI gets the correct status
        const updatedSession = sessionManager.getSession(sessionId);
        if (updatedSession) {
          console.log(`[Main] Session ${sessionId} final status: ${updatedSession.status}`);
        }
      }
    }

    // Stop run commands
    try {
      await runCommandManager.stopRunCommands(sessionId);
    } catch (error) {
      console.error(`Failed to stop run commands for session ${sessionId}:`, error);
    }

    // End execution tracking
    try {
      if (executionTracker.isTracking(sessionId)) {
        await executionTracker.endExecution(sessionId);
      }
    } catch (error) {
      console.error(`Failed to end execution tracking for session ${sessionId}:`, error);
    }

    // Add commit information when session ends
    try {
      const session = sessionManager.getSession(sessionId);
      if (session && session.worktreePath) {
        const timestamp = new Date().toLocaleTimeString();
        let commitInfo = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[44m\x1b[37m 📊 SESSION SUMMARY \x1b[0m\r\n\r\n`;

        // Check for uncommitted changes
        const statusOutput = execSync('git status --porcelain', {
          cwd: session.worktreePath,
          encoding: 'utf8'
        }).trim();

        if (statusOutput) {
          const uncommittedFiles = statusOutput.split('\n').length;
          commitInfo += `\x1b[1m\x1b[33m⚠️  Uncommitted Changes:\x1b[0m ${uncommittedFiles} file${uncommittedFiles > 1 ? 's' : ''}\r\n`;

          // Show first few uncommitted files
          const filesToShow = statusOutput.split('\n').slice(0, 5);
          filesToShow.forEach(file => {
            const [status, ...nameParts] = file.trim().split(/\s+/);
            const fileName = nameParts.join(' ');
            commitInfo += `   \x1b[2m${status}\x1b[0m ${fileName}\r\n`;
          });

          if (uncommittedFiles > 5) {
            commitInfo += `   \x1b[2m... and ${uncommittedFiles - 5} more\x1b[0m\r\n`;
          }
          commitInfo += '\r\n';
        }

        // Get commit history for this branch
        const project = sessionManager.getProjectForSession(session.id);
        if (!project?.path) {
          throw new Error('Project path not found for session');
        }
        const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
        
        console.log(`[Events] Getting commits for session summary`);
        console.log(`[Events] Project path: ${project?.path || 'not found'}`);
        console.log(`[Events] Using main branch: ${mainBranch}`);
        
        let commits: any[] = [];
        try {
          commits = gitDiffManager.getCommitHistory(session.worktreePath, 10, mainBranch);
          console.log(`[Events] getCommitHistory returned ${commits.length} commits`);
        } catch (error) {
          console.error(`[Events] Error getting commit history:`, error);
          // If there's an error, try without specifying main branch (get all commits)
          try {
            const fallbackCommand = `git log --format="%H|%s|%ai|%an" --numstat -n 10`;
            console.log(`[Events] Trying fallback command: ${fallbackCommand}`);
            const logOutput = execSync(fallbackCommand, { cwd: session.worktreePath, encoding: 'utf8' });
            console.log(`[Events] Fallback command output: ${logOutput.substring(0, 200)}...`);
          } catch (fallbackError) {
            console.error(`[Events] Fallback also failed:`, fallbackError);
          }
        }

        if (commits.length > 0) {
          commitInfo += `\x1b[1m\x1b[32m📝 Commits in this session:\x1b[0m\r\n`;
          commits.forEach((commit, index) => {
            const shortHash = commit.hash.substring(0, 7);
            const date = commit.date.toLocaleString();
            const stats = commit.stats;
            commitInfo += `\r\n  \x1b[1m${index + 1}.\x1b[0m \x1b[33m${shortHash}\x1b[0m - ${commit.message}\r\n`;
            commitInfo += `     \x1b[2mby ${commit.author} on ${date}\x1b[0m\r\n`;
            if (stats.filesChanged > 0) {
              commitInfo += `     \x1b[32m+${stats.additions}\x1b[0m \x1b[31m-${stats.deletions}\x1b[0m (${stats.filesChanged} file${stats.filesChanged > 1 ? 's' : ''})\r\n`;
            }
          });
        } else if (!statusOutput) {
          commitInfo += `\x1b[2mNo commits were made in this session.\x1b[0m\r\n`;
        }

        commitInfo += `\r\n\x1b[2m─────────────────────────────────────────\x1b[0m\r\n`;

        // Add this summary to the session output
        sessionManager.addSessionOutput(sessionId, {
          type: 'stdout',
          data: commitInfo,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error(`Failed to generate session summary for ${sessionId}:`, error);
    }
  });

  claudeCodeManager.on('error', async ({ sessionId, error }: { sessionId: string; error: string }) => {
    console.log(`Session ${sessionId} encountered an error: ${error}`);
    await sessionManager.updateSession(sessionId, { status: 'error', error });

    // Stop run commands on error
    try {
      await runCommandManager.stopRunCommands(sessionId);
    } catch (stopError) {
      console.error(`Failed to stop run commands for session ${sessionId}:`, stopError);
    }

    // Cancel execution tracking on error
    try {
      if (executionTracker.isTracking(sessionId)) {
        executionTracker.cancelExecution(sessionId);
      }
    } catch (trackingError) {
      console.error(`Failed to cancel execution tracking for session ${sessionId}:`, trackingError);
    }

    // Add commit information when session errors
    try {
      const session = sessionManager.getSession(sessionId);
      if (session && session.worktreePath) {
        const timestamp = new Date().toLocaleTimeString();
        let commitInfo = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[41m\x1b[37m 📊 SESSION SUMMARY (ERROR) \x1b[0m\r\n\r\n`;

        // Check for uncommitted changes
        const statusOutput = execSync('git status --porcelain', {
          cwd: session.worktreePath,
          encoding: 'utf8'
        }).trim();

        if (statusOutput) {
          const uncommittedFiles = statusOutput.split('\n').length;
          commitInfo += `\x1b[1m\x1b[33m⚠️  Uncommitted Changes:\x1b[0m ${uncommittedFiles} file${uncommittedFiles > 1 ? 's' : ''}\r\n`;

          // Show first few uncommitted files
          const filesToShow = statusOutput.split('\n').slice(0, 5);
          filesToShow.forEach(file => {
            const [status, ...nameParts] = file.trim().split(/\s+/);
            const fileName = nameParts.join(' ');
            commitInfo += `   \x1b[2m${status}\x1b[0m ${fileName}\r\n`;
          });

          if (uncommittedFiles > 5) {
            commitInfo += `   \x1b[2m... and ${uncommittedFiles - 5} more\x1b[0m\r\n`;
          }
          commitInfo += '\r\n';
        }

        // Get commit history for this branch
        const project = sessionManager.getProjectForSession(session.id);
        if (!project?.path) {
          throw new Error('Project path not found for session');
        }
        const mainBranch = await worktreeManager.getProjectMainBranch(project.path);
        
        console.log(`[Events] Getting commits for session summary`);
        console.log(`[Events] Project path: ${project?.path || 'not found'}`);
        console.log(`[Events] Using main branch: ${mainBranch}`);
        
        let commits: any[] = [];
        try {
          commits = gitDiffManager.getCommitHistory(session.worktreePath, 10, mainBranch);
          console.log(`[Events] getCommitHistory returned ${commits.length} commits`);
        } catch (error) {
          console.error(`[Events] Error getting commit history:`, error);
          // If there's an error, try without specifying main branch (get all commits)
          try {
            const fallbackCommand = `git log --format="%H|%s|%ai|%an" --numstat -n 10`;
            console.log(`[Events] Trying fallback command: ${fallbackCommand}`);
            const logOutput = execSync(fallbackCommand, { cwd: session.worktreePath, encoding: 'utf8' });
            console.log(`[Events] Fallback command output: ${logOutput.substring(0, 200)}...`);
          } catch (fallbackError) {
            console.error(`[Events] Fallback also failed:`, fallbackError);
          }
        }

        if (commits.length > 0) {
          commitInfo += `\x1b[1m\x1b[32m📝 Commits before error:\x1b[0m\r\n`;
          commits.forEach((commit, index) => {
            const shortHash = commit.hash.substring(0, 7);
            const date = commit.date.toLocaleString();
            const stats = commit.stats;
            commitInfo += `\r\n  \x1b[1m${index + 1}.\x1b[0m \x1b[33m${shortHash}\x1b[0m - ${commit.message}\r\n`;
            commitInfo += `     \x1b[2mby ${commit.author} on ${date}\x1b[0m\r\n`;
            if (stats.filesChanged > 0) {
              commitInfo += `     \x1b[32m+${stats.additions}\x1b[0m \x1b[31m-${stats.deletions}\x1b[0m (${stats.filesChanged} file${stats.filesChanged > 1 ? 's' : ''})\r\n`;
            }
          });
        } else if (!statusOutput) {
          commitInfo += `\x1b[2mNo commits were made before the error.\x1b[0m\r\n`;
        }

        commitInfo += `\r\n\x1b[2m─────────────────────────────────────────\x1b[0m\r\n`;

        // Add this summary to the session output
        sessionManager.addSessionOutput(sessionId, {
          type: 'stdout',
          data: commitInfo,
          timestamp: new Date()
        });
      }
    } catch (summaryError) {
      console.error(`Failed to generate session summary for ${sessionId}:`, summaryError);
    }
  });

  // Listen to script output events
  sessionManager.on('script-output', (output) => {
    // Broadcast script output to renderer
    const mw = getMainWindow();
    if (mw) {
      mw.webContents.send('script:output', output);
    }
  });

  // Listen to run command manager events
  runCommandManager.on('output', (output) => {
    // Store run command output with the session's script output
    if (output.sessionId && output.data) {
      sessionManager.addScriptOutput(output.sessionId, output.data);
    }
  });

  runCommandManager.on('error', (error) => {
    console.error(`Run command error for session ${error.sessionId}:`, error.error);
    // Add error to script output
    if (error.sessionId) {
      sessionManager.addScriptOutput(error.sessionId, `\n[Error] ${error.displayName}: ${error.error}\n`);
    }
  });

  runCommandManager.on('exit', (info) => {
    console.log(`Run command exited: ${info.displayName}, exitCode: ${info.exitCode}`);
    // Add exit info to script output
    if (info.sessionId && info.exitCode !== 0) {
      sessionManager.addScriptOutput(info.sessionId, `\n[Exit] ${info.displayName} exited with code ${info.exitCode}\n`);
    }
  });

  runCommandManager.on('zombie-processes-detected', (data) => {
    console.error('[Main] Zombie processes detected from run command:', data);
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('zombie-processes-detected', data);
    }
  });

  // Listen for version update events
  process.on('version-update-available', (versionInfo: VersionInfo) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      // Only send to renderer for custom dialog - no native dialogs
      mw.webContents.send('version:update-available', versionInfo);
    }
  });

  // Listen to gitStatusManager events and broadcast to renderer
  gitStatusManager.on('git-status-updated', (sessionId: string, gitStatus: any) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('git-status-updated', { sessionId, gitStatus });
      } catch (error) {
        console.error('[Main] Failed to send git-status-updated event:', error);
      }
    }
  });
} 
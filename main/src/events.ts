import type { BrowserWindow } from 'electron';
import { execSync } from './utils/commandExecutor';
import type { AppServices } from './ipc/types';
import type { VersionInfo } from './services/versionChecker';
import { addSessionLog } from './ipc/logs';
import { getCodexModelConfig } from '../../shared/types/models';
import { panelManager } from './services/panelManager';
import type { ToolPanel, CodexPanelState, ClaudePanelState } from '../../shared/types/panels';
import { 
  validateSessionExists, 
  validateEventContext, 
  validatePanelEventContext,
  logValidationFailure 
} from './utils/sessionValidation';
import type { AbstractCliManager } from './services/panels/cli/AbstractCliManager';
import type { GitCommit } from './services/gitDiffManager';
import type { Project } from './database/models';
import type { GitStatus } from './types/session';

export function setupEventListeners(services: AppServices, getMainWindow: () => BrowserWindow | null): void {
  const {
    sessionManager,
    claudeCodeManager,
    executionTracker,
    runCommandManager,
    gitDiffManager,
    gitStatusManager,
    worktreeManager,
    archiveProgressManager,
    databaseService,
    logger
  } = services;

  let codexCliManager: AbstractCliManager | undefined;
  try {
    const { codexManager: resolvedCodexManager } = require('./ipc/codexPanel');
    codexCliManager = resolvedCodexManager;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    (logger || console).warn?.(`[Main] Unable to load Codex manager for lifecycle events: ${message}`);
  }

  const attachProcessLifecycleHandlers = (
    manager: AbstractCliManager | undefined,
    tool: 'claude' | 'codex'
  ) => {
    if (!manager) {
      if (tool === 'codex') {
        (logger || console).warn?.('[Main] Codex manager not available; skipping lifecycle handlers');
      }
      return;
    }

    const toolLabel = tool === 'claude' ? 'Claude Code' : 'Codex';

    manager.on('spawned', async ({ panelId, sessionId }: { panelId?: string; sessionId: string }) => {
      const validation = panelId
        ? validatePanelEventContext({ panelId, sessionId }, panelId, sessionId)
        : validateEventContext({ sessionId }, sessionId);

      if (!validation.valid) {
        logValidationFailure(`${toolLabel} spawned event`, validation);
        return;
      }


      await new Promise(resolve => setTimeout(resolve, 100));

      await sessionManager.updateSession(sessionId, {
        status: 'running',
        run_started_at: 'CURRENT_TIMESTAMP'
      });

      const updatedSession = await sessionManager.getSession(sessionId);

      try {
        const session = await sessionManager.getSession(sessionId);
        if (session && session.worktreePath) {
          const panels = panelManager.getPanelsForSession(sessionId);
          const targetPanels = panels.filter((p: ToolPanel) => p.type === tool);

          let promptMarkers;
          if (targetPanels.length > 0 && typeof sessionManager.getPanelPromptMarkers === 'function') {
            promptMarkers = sessionManager.getPanelPromptMarkers(targetPanels[0].id);
          } else {
            promptMarkers = sessionManager.getPromptMarkers(sessionId);
          }

          const latestPrompt = promptMarkers.length > 0
            ? promptMarkers[promptMarkers.length - 1].prompt_text
            : session.prompt;

          await executionTracker.startExecution(sessionId, session.worktreePath, undefined, latestPrompt);
          // NOTE: Run commands are not started automatically; user must trigger them explicitly.
        }
      } catch (error) {
        console.error(`Failed to start execution tracking for session ${sessionId}:`, error);
      }
    });

    manager.on('exit', async ({ panelId, sessionId, exitCode, signal }: { panelId?: string; sessionId: string; exitCode: number | null; signal: number | null | string }) => {
      const validation = panelId
        ? validatePanelEventContext({ panelId, sessionId }, panelId, sessionId)
        : validateEventContext({ sessionId }, sessionId);

      if (!validation.valid) {
        logValidationFailure(`${toolLabel} exit event`, validation);
        return;
      }

      const signalText = signal === null || signal === undefined ? 'null' : String(signal);

      if (exitCode !== null && exitCode !== undefined) {
        await sessionManager.setSessionExitCode(sessionId, exitCode);
      }

      const session = sessionManager.getSession(sessionId);
      if (session) {
        const dbSession = sessionManager.getDbSession(sessionId);
        if (dbSession && dbSession.status !== 'completed') {
          await sessionManager.updateSession(sessionId, { status: 'stopped' });
        }
      }

      try {
        await runCommandManager.stopRunCommands(sessionId);
      } catch (error) {
        console.error(`Failed to stop run commands for session ${sessionId}:`, error);
      }

      try {
        if (executionTracker.isTracking(sessionId)) {
          await executionTracker.endExecution(sessionId);
        }
      } catch (error) {
        console.error(`Failed to end execution tracking for session ${sessionId}:`, error);
      }
    });
  };

  attachProcessLifecycleHandlers(claudeCodeManager, 'claude');
  attachProcessLifecycleHandlers(codexCliManager, 'codex');

  // Listen to sessionManager events and broadcast to renderer
  sessionManager.on('session-created', async (session) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('session:created', session);
      } catch (error) {
        console.error('[Main] Failed to send session:created event:', error);
      }
    }
    
    // Auto-create AI panel for sessions with prompts
    if (session.prompt && typeof session.prompt === 'string' && session.prompt.trim().length > 0) {
      // Decide whether to create a Codex or Claude panel based on the explicit tool type when available
      const inferredToolType: 'claude' | 'codex' | 'none' = session.toolType
        ? session.toolType
        : (session.model && getCodexModelConfig(session.model)) ? 'codex' : 'claude';

      if (inferredToolType === 'none') {
        // Skip panel creation for sessions with no tool configured
      } else {
        const panelType = inferredToolType === 'codex' ? 'codex' : 'claude';
        const panelTitle = inferredToolType === 'codex' ? 'Codex' : 'Claude';

        try {
          // Prepare initial custom state for the panel
          let customState: CodexPanelState | ClaudePanelState | undefined = undefined;
          if (panelType === 'codex') {
            const codexConfig = session.codexConfig || {};
            customState = {
              codexConfig: {
                model: codexConfig.model || 'auto',
                thinkingLevel: codexConfig.thinkingLevel || 'medium',
                sandboxMode: codexConfig.sandboxMode || 'workspace-write',
                webSearch: codexConfig.webSearch || false
              },
              modelProvider: codexConfig.modelProvider || 'openai',
              approvalPolicy: codexConfig.approvalPolicy || 'auto',
              sandboxMode: codexConfig.sandboxMode || 'workspace-write',
              webSearch: codexConfig.webSearch || false
            };
          } else if (panelType === 'claude') {
            const claudeConfig = session.claudeConfig || {};
            customState = {
              permissionMode: claudeConfig.permissionMode || 'ignore',
              model: claudeConfig.model || 'auto'
            };
          }
          
          const panel = await panelManager.createPanel({
            sessionId: session.id,
            type: panelType,
            title: panelTitle,
            initialState: customState
          });
          
          // Ensure the panel is set as active
          await panelManager.setActivePanel(session.id, panel.id);
          
          // For Codex panels, also save the config to the settings column for persistence
          if (panelType === 'codex' && customState && 'codexConfig' in customState && customState.codexConfig) {
            databaseService.updatePanelSettings(panel.id, customState.codexConfig);
          }

          // For Claude panels, also save the config to the settings column for persistence
          if (panelType === 'claude' && customState && 'model' in customState) {
            const claudeState = customState as ClaudePanelState;
            databaseService.updatePanelSettings(panel.id, {
              model: claudeState.model,
              permissionMode: claudeState.permissionMode
            });
          }

          // Register with the appropriate panel manager
          try {
            if (panelType === 'codex') {
              const { codexPanelManager } = require('./ipc/codexPanel');
              if (codexPanelManager) {
                codexPanelManager.registerPanel(panel.id, session.id, panel.state.customState);
              } else {
                console.warn('[Events] CodexPanelManager not initialized yet; panel will register later');
              }
            } else {
              const { claudePanelManager } = require('./ipc/claudePanel');
              if (claudePanelManager) {
                claudePanelManager.registerPanel(panel.id, session.id, panel.state.customState);
              } else {
                console.warn('[Events] ClaudePanelManager not initialized yet; panel will register later');
              }
            }
          } catch (err) {
            console.error(`[Events] Failed to register ${panelType} panel with its manager:`, err);
          }
        } catch (error) {
          console.error(`[Events] Failed to auto-create ${panelType} panel for session ${session.id}:`, error);
        }
      }
    }
    
    // Refresh git status for newly created session (non-blocking for UI responsiveness)
    if (session.id && !session.archived) {
      // Add a small delay for newly created sessions to prevent overwhelming git operations
      // when multiple sessions are created rapidly
      setTimeout(() => {
        gitStatusManager.refreshSessionGitStatus(session.id, false).catch(error => {
          console.error(`[Main] Failed to refresh git status for new session ${session.id}:`, error);
        });
      }, 1000); // 1 second delay to allow session creation UI to complete
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
    // Validate the output has valid session context
    const validation = validateEventContext(output);
    if (!validation.valid) {
      logValidationFailure('session-output event', validation);
      return; // Don't broadcast invalid events
    }

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

  // Listen for new prompts being added to panels
  sessionManager.on('panel-prompt-added', (data) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('panel:prompt-added', data);
      } catch (error) {
        console.error('[Main] Failed to send panel:prompt-added:', error);
      }
    }
  });

  // Listen for assistant responses being added to panels
  sessionManager.on('panel-response-added', (data) => {
    console.log('[Events] Received panel-response-added event for panel:', data.panelId);
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        console.log('[Events] Sending panel:response-added to renderer for panel:', data.panelId);
        mw.webContents.send('panel:response-added', data);
      } catch (error) {
        console.error('[Main] Failed to send panel:response-added:', error);
      }
    }
  });

  // Listen for project update events from sessionManager (since it extends EventEmitter)
  sessionManager.on('project:updated', (project: Project) => {
    console.log(`[Main] Project updated: ${project.id}`);
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      mw.webContents.send('project:updated', project);
    }
  });

  // Listen to claudeCodeManager events
  claudeCodeManager.on('output', async (output: { 
    panelId: string; 
    sessionId: string; 
    type: 'json' | 'stdout' | 'stderr'; 
    data: unknown; 
    timestamp: Date 
  }) => {
    // Validate the output has valid context
    const validation = output.panelId 
      ? validatePanelEventContext(output, output.panelId, output.sessionId)
      : validateEventContext(output, output.sessionId);

    if (!validation.valid) {
      logValidationFailure('claudeCodeManager output event', validation);
      return; // Don't process invalid events
    }

    // Persist output: let ClaudePanelManager handle panel-based storage to avoid duplicates
    if (!output.panelId) {
      console.log(`[Events] Saving Claude output for session ${output.sessionId} (legacy mode)`);
      
      sessionManager.addSessionOutput(output.sessionId, {
        type: output.type,
        data: output.data,
        timestamp: output.timestamp
      });
    }

    // Check if Claude is waiting for user input
    if (output.type === 'json' && typeof output.data === 'object' && output.data && 'type' in output.data && output.data.type === 'prompt') {
      console.log(`[Main] Claude is waiting for user input in session ${output.sessionId}`);
      await sessionManager.updateSession(output.sessionId, { status: 'waiting' });
    }

    // Check if Claude has completed (when it sends a result message)
    if (output.type === 'json' && typeof output.data === 'object' && output.data && 'type' in output.data && output.data.type === 'system' && 'subtype' in output.data && output.data.subtype === 'result') {
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

  claudeCodeManager.on('spawned', async ({ panelId, sessionId }: { panelId?: string; sessionId: string }) => {
    // Validate the event context
    const validation = panelId 
      ? validatePanelEventContext({ panelId, sessionId }, panelId, sessionId)
      : validateEventContext({ sessionId }, sessionId);

    if (!validation.valid) {
      logValidationFailure('claudeCodeManager spawned event', validation);
      return; // Don't process invalid events
    }


    // Add a small delay to ensure the session is fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));

    await sessionManager.updateSession(sessionId, {
      status: 'running',
      run_started_at: 'CURRENT_TIMESTAMP'
    });

    // Verify the update was successful
    const updatedSession = await sessionManager.getSession(sessionId);

    // Start execution tracking
    try {
      const session = await sessionManager.getSession(sessionId);
      if (session && session.worktreePath) {
        // MIGRATION FIX: Get the latest prompt from prompt markers or use the session prompt
        // Check if session has Claude panels and use appropriate method
        const eventsPanels = panelManager.getPanelsForSession(sessionId);
        const eventsClaudePanels = eventsPanels.filter((p: ToolPanel) => p.type === 'claude');
        
        let promptMarkers;
        if (eventsClaudePanels.length > 0 && sessionManager.getPanelPromptMarkers) {
          // Use panel-based method for migrated sessions
          promptMarkers = sessionManager.getPanelPromptMarkers(eventsClaudePanels[0].id);
        } else {
          // Use session-based method for non-migrated sessions
          promptMarkers = sessionManager.getPromptMarkers(sessionId);
        }
        
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

  claudeCodeManager.on('exit', async ({ panelId, sessionId, exitCode, signal }: { panelId?: string; sessionId: string; exitCode: number; signal: string }) => {
    const validation = panelId
      ? validatePanelEventContext({ panelId, sessionId }, panelId, sessionId)
      : validateEventContext({ sessionId }, sessionId);

    if (!validation.valid) {
      logValidationFailure('claudeCodeManager exit event', validation);
      return;
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
        
        // Verbose commit logging removed - details are in error cases if needed
        
        let commits: GitCommit[] = [];
        try {
          commits = gitDiffManager.getCommitHistory(session.worktreePath, 10, mainBranch);
          // Commit count logging removed - shown in session summary
        } catch (error) {
          console.error(`[Events] Error getting commit history:`, error);
          // If there's an error, try without specifying main branch (get all commits)
          try {
            const fallbackCommand = `git log --format="%H|%s|%ai|%an" --numstat -n 10`;
            const logOutput = execSync(fallbackCommand, { cwd: session.worktreePath, encoding: 'utf8' });
            // Fallback output logging removed - only errors are logged
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

    // Refresh git status after Claude exits, as it may have made commits
    try {
      await gitStatusManager.refreshSessionGitStatus(sessionId);
    } catch (error) {
      console.error(`Failed to refresh git status for session ${sessionId} after exit:`, error);
    }
  });

  claudeCodeManager.on('error', async ({ panelId, sessionId, error }: { panelId?: string; sessionId: string; error: string }) => {
    // Validate the event context
    const validation = panelId 
      ? validatePanelEventContext({ panelId, sessionId }, panelId, sessionId)
      : validateEventContext({ sessionId }, sessionId);

    if (!validation.valid) {
      logValidationFailure('claudeCodeManager error event', validation);
      return; // Don't process invalid events
    }

    if (panelId) {
      console.log(`Panel ${panelId} (session ${sessionId}) encountered an error: ${error}`);
    } else {
      console.log(`Session ${sessionId} encountered an error: ${error}`);
    }
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
        
        // Verbose commit logging removed - details are in error cases if needed
        
        let commits: GitCommit[] = [];
        try {
          commits = gitDiffManager.getCommitHistory(session.worktreePath, 10, mainBranch);
          // Commit count logging removed - shown in session summary
        } catch (error) {
          console.error(`[Events] Error getting commit history:`, error);
          // If there's an error, try without specifying main branch (get all commits)
          try {
            const fallbackCommand = `git log --format="%H|%s|%ai|%an" --numstat -n 10`;
            const logOutput = execSync(fallbackCommand, { cwd: session.worktreePath, encoding: 'utf8' });
            // Fallback output logging removed - only errors are logged
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

  // Listen to terminal output events (independent terminal, not run scripts)
  sessionManager.on('terminal-output', (output) => {
    // Broadcast terminal output to renderer
    const mw = getMainWindow();
    if (mw) {
      mw.webContents.send('terminal:output', output);
    }
  });

  // Listen to run command manager events (these should go to logs, not terminal)
  runCommandManager.on('output', (output) => {
    // Send run command output to logs
    if (output.sessionId && output.data) {
      // Split by lines and add to logs
      const lines = output.data.split('\n').filter((line: string) => line.trim());
      lines.forEach((line: string) => {
        addSessionLog(output.sessionId, 'info', line, 'RunCommand');
      });
    }
  });

  runCommandManager.on('error', (error) => {
    console.error(`Run command error for session ${error.sessionId}:`, error.error);
    // Add error to logs
    if (error.sessionId) {
      addSessionLog(error.sessionId, 'error', `${error.displayName}: ${error.error}`, 'RunCommand');
    }
  });

  runCommandManager.on('exit', (info) => {
    console.log(`Run command exited: ${info.displayName}, exitCode: ${info.exitCode}`);
    // Add exit info to logs
    if (info.sessionId && info.exitCode !== 0) {
      addSessionLog(info.sessionId, 'warn', `${info.displayName} exited with code ${info.exitCode}`, 'RunCommand');
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
  // Only broadcast for active sessions or recent updates to reduce EventEmitter load
  gitStatusManager.on('git-status-updated', (sessionId: string, gitStatus: GitStatus) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('git-status-updated', { sessionId, gitStatus });
      } catch (error) {
        console.error('[Main] Failed to send git-status-updated event:', error);
      }
    }
  });

  // Listen for git status loading events
  gitStatusManager.on('git-status-loading', (sessionId: string) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) {
      try {
        mw.webContents.send('git-status-loading', { sessionId });
      } catch (error) {
        console.error('[Main] Failed to send git-status-loading event:', error);
      }
    }
  });

  // Listen for archive progress events
  if (archiveProgressManager) {
    archiveProgressManager.on('archive-progress', (progress) => {
      const mw = getMainWindow();
      if (mw && !mw.isDestroyed()) {
        try {
          mw.webContents.send('archive:progress', progress);
        } catch (error) {
          console.error('[Main] Failed to send archive:progress event:', error);
        }
      }
    });
  }
} 

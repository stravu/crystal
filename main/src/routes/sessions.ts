import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Server as SocketIOServer } from 'socket.io';
import type { CreateSessionRequest } from '../types/session';
import type { SessionManager } from '../services/sessionManager';
import type { WorktreeManager } from '../services/worktreeManager';
import type { ClaudeCodeManager } from '../services/claudeCodeManager';
import type { GitDiffManager } from '../services/gitDiffManager';
import type { ExecutionTracker } from '../services/executionTracker';
import type { TaskQueue } from '../services/taskQueue';
import { formatJsonForOutputEnhanced } from '../utils/toolFormatter';

const execAsync = promisify(exec);

interface SessionRoutesOptions {
  sessionManager: SessionManager;
  worktreeManager: WorktreeManager;
  claudeCodeManager: ClaudeCodeManager;
  gitDiffManager: GitDiffManager;
  executionTracker: ExecutionTracker;
  taskQueue: TaskQueue;
  io: SocketIOServer;
}

export function setupSessionRoutes(app: Router, options: SessionRoutesOptions): void {
  const {
    sessionManager,
    worktreeManager,
    claudeCodeManager,
    gitDiffManager,
    executionTracker,
    taskQueue,
    io
  } = options;

  // Get all sessions
  app.get('/api/sessions', async (_req: Request, res: Response) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      res.json(sessions);
    } catch (error) {
      console.error('Failed to get sessions:', error);
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  // Get session by ID
  app.get('/api/sessions/:id', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json(session);
    } catch (error) {
      console.error('Failed to get session:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  // Create new session(s)
  app.post('/api/sessions', async (req: Request<{}, {}, CreateSessionRequest>, res: Response) => {
    console.log('[SessionRoutes] Received session creation request:', req.body);
    
    try {
      const { prompt, worktreeTemplate, count = 1 } = req.body;
      console.log(`[SessionRoutes] Creating ${count} session(s) with prompt: "${prompt}", template: "${worktreeTemplate}"`);

      if (count > 1) {
        // Create multiple sessions
        console.log('[SessionRoutes] Creating multiple sessions...');
        const jobs = await taskQueue.createMultipleSessions(prompt || '', worktreeTemplate || '', count);
        console.log(`[SessionRoutes] Created ${jobs.length} jobs:`, jobs.map(j => j.id));
        res.json({ message: `Creating ${count} sessions`, jobIds: jobs.map(j => j.id?.toString() || '') });
      } else {
        // Create single session
        console.log('[SessionRoutes] Creating single session...');
        const job = await taskQueue.createSession({ prompt: prompt || '', worktreeTemplate: worktreeTemplate || '' });
        console.log('[SessionRoutes] Created job:', job.id);
        res.json({ message: 'Creating session', jobId: job.id?.toString() || '' });
      }
    } catch (error) {
      console.error('[SessionRoutes] Failed to create session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // Delete (archive) session
  app.delete('/api/sessions/:id', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Stop the Claude process if running
      await claudeCodeManager.stopSession(req.params.id);

      // Archive the session
      await sessionManager.archiveSession(req.params.id);

      // Clean up the worktree
      if (session.worktreePath) {
        // Get the project for this session
        const dbSession = await sessionManager.getDbSession(req.params.id);
        if (dbSession?.project_id) {
          const project = await sessionManager.getProjectById(dbSession.project_id);
          if (project) {
            const worktreeName = session.worktreePath.split('/').pop();
            if (worktreeName) {
              await worktreeManager.removeWorktree(project.path, worktreeName);
            }
          }
        }
      }

      io.emit('session:deleted', { sessionId: req.params.id });
      res.json({ message: 'Session archived' });
    } catch (error) {
      console.error('Failed to delete session:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // Send input to session
  app.post('/api/sessions/:id/input', async (req: Request, res: Response) => {
    try {
      const { input } = req.body;
      const job = await taskQueue.sendInput(req.params.id, input);
      res.json({ message: 'Input queued', jobId: job.id });
    } catch (error) {
      console.error('Failed to send input:', error);
      res.status(500).json({ error: 'Failed to send input' });
    }
  });

  // Continue conversation
  app.post('/api/sessions/:id/continue', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      const job = await taskQueue.continueSession(req.params.id, prompt);
      res.json({ message: 'Continuing conversation', jobId: job.id });
    } catch (error) {
      console.error('Failed to continue conversation:', error);
      res.status(500).json({ error: 'Failed to continue conversation' });
    }
  });

  // Get session output
  app.get('/api/sessions/:id/output', async (req: Request, res: Response) => {
    try {
      const output = await sessionManager.getSessionOutput(req.params.id);
      res.json(output);
    } catch (error) {
      console.error('Failed to get session output:', error);
      res.status(500).json({ error: 'Failed to get session output' });
    }
  });

  // Get conversation messages
  app.get('/api/sessions/:id/conversation', async (req: Request, res: Response) => {
    try {
      const messages = await sessionManager.getConversationMessages(req.params.id);
      const formattedMessages = messages.map(msg => ({
        ...msg,
        formattedContent: formatJsonForOutputEnhanced(msg.content)
      }));
      res.json(formattedMessages);
    } catch (error) {
      console.error('Failed to get conversation messages:', error);
      res.status(500).json({ error: 'Failed to get conversation messages' });
    }
  });

  // Mark session as viewed
  app.post('/api/sessions/:id/view', async (req: Request, res: Response) => {
    try {
      await sessionManager.markSessionAsViewed(req.params.id);
      res.json({ message: 'Session marked as viewed' });
    } catch (error) {
      console.error('Failed to mark session as viewed:', error);
      res.status(500).json({ error: 'Failed to mark session as viewed' });
    }
  });

  // Get execution diffs
  app.get('/api/sessions/:id/executions', async (req: Request, res: Response) => {
    try {
      const diffs = await executionTracker.getExecutionDiffs(req.params.id);
      res.json(diffs);
    } catch (error) {
      console.error('Failed to get execution diffs:', error);
      res.status(500).json({ error: 'Failed to get execution diffs' });
    }
  });

  // Get specific execution diff
  app.get('/api/sessions/:id/executions/:executionId/diff', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const executionId = parseInt(req.params.executionId);
      if (isNaN(executionId)) {
        res.status(400).json({ error: 'Invalid execution ID' });
        return;
      }

      const execution = await sessionManager.getExecutionDiff(executionId);
      if (!execution || execution.session_id !== req.params.id) {
        res.status(404).json({ error: 'Execution not found' });
        return;
      }

      res.json(execution);
    } catch (error) {
      console.error('Failed to get execution diff:', error);
      res.status(500).json({ error: 'Failed to get execution diff' });
    }
  });

  // Create git commits
  app.post('/api/sessions/:id/git/commit', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session || !session.worktreePath) {
        res.status(404).json({ error: 'Session or worktree not found' });
        return;
      }

      const { message } = req.body;
      await execAsync(`git add -A && git commit -m "${message}"`, {
        cwd: session.worktreePath
      });

      res.json({ message: 'Commit created successfully' });
    } catch (error) {
      console.error('Failed to create commit:', error);
      res.status(500).json({ error: 'Failed to create commit' });
    }
  });

  // Get git diff
  app.get('/api/sessions/:id/git/diff', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session || !session.worktreePath) {
        res.status(404).json({ error: 'Session or worktree not found' });
        return;
      }

      const diff = await gitDiffManager.getGitDiff(session.worktreePath);
      res.json(diff);
    } catch (error) {
      console.error('Failed to get git diff:', error);
      res.status(500).json({ error: 'Failed to get git diff' });
    }
  });

  // Run scripts
  app.post('/api/sessions/:id/run/:script', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session || !session.worktreePath) {
        res.status(404).json({ error: 'Session or worktree not found' });
        return;
      }

      const script = req.params.script;
      const { stdout, stderr } = await execAsync(`npm run ${script}`, {
        cwd: session.worktreePath
      });

      res.json({ stdout, stderr });
    } catch (error: any) {
      console.error('Failed to run script:', error);
      res.status(500).json({ 
        error: 'Failed to run script',
        stdout: error.stdout,
        stderr: error.stderr
      });
    }
  });

  // Get currently running session
  app.get('/api/sessions/running-session', (_req: Request, res: Response) => {
    res.json({ sessionId: null });
  });

  // Stop running script
  app.post('/api/sessions/stop-script', (_req: Request, res: Response) => {
    sessionManager.stopRunningScript();
    res.json({ success: true });
  });

  // Check if session has run script
  app.get('/api/sessions/:id/has-run-script', async (req: Request, res: Response) => {
    try {
      const commands = sessionManager.getProjectRunScript(req.params.id);
      res.json({ hasRunScript: commands !== null && commands.length > 0 });
    } catch (error) {
      console.error('Failed to check run script:', error);
      res.status(500).json({ error: 'Failed to check run script' });
    }
  });

  // Run script for a session
  app.post('/api/sessions/:id/run-script', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session || !session.worktreePath) {
        res.status(404).json({ error: 'Session or worktree not found' });
        return;
      }

      // Get project-specific run script
      const projectCommands = sessionManager.getProjectRunScript(req.params.id);
      if (!projectCommands || projectCommands.length === 0) {
        res.status(400).json({ error: 'No run script configured for this project' });
        return;
      }

      // Run the project-specific commands
      sessionManager.runScript(req.params.id, projectCommands, session.worktreePath);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to run script:', error);
      res.status(500).json({ error: 'Failed to run script' });
    }
  });

  // Stop session
  app.post('/api/sessions/:id/stop', async (req: Request, res: Response) => {
    try {
      await claudeCodeManager.stopSession(req.params.id);
      await sessionManager.updateSession(req.params.id, { status: 'stopped' });
      res.json({ message: 'Session stopped' });
    } catch (error) {
      console.error('Failed to stop session:', error);
      res.status(500).json({ error: 'Failed to stop session' });
    }
  });

  // Get combined diff for session (from execution history)
  app.get('/api/sessions/:id/combined-diff', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      console.log(`[Sessions] Getting combined diff for session ${req.params.id}`);
      
      // Get combined diff from execution tracker (stored diffs)
      const combinedDiff = await executionTracker.getCombinedDiff(req.params.id);
      
      console.log(`[Sessions] Combined diff result:`, {
        diffLength: combinedDiff.diff?.length || 0,
        stats: combinedDiff.stats,
        changedFiles: combinedDiff.changedFiles?.length || 0
      });
      
      res.json(combinedDiff);
    } catch (error) {
      console.error('Failed to get combined diff:', error);
      res.status(500).json({ error: 'Failed to get combined diff' });
    }
  });

  // Get combined diff for selected executions
  app.post('/api/sessions/:id/combined-diff', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const { executionIds } = req.body;
      if (!Array.isArray(executionIds) || !executionIds.every(id => typeof id === 'number')) {
        res.status(400).json({ error: 'Invalid execution IDs array' });
        return;
      }

      const combinedDiff = await executionTracker.getCombinedDiff(req.params.id, executionIds);
      res.json(combinedDiff);
    } catch (error) {
      console.error('Failed to get combined diff for selected executions:', error);
      res.status(500).json({ error: 'Failed to get combined diff' });
    }
  });

  // Get prompts for session
  app.get('/api/sessions/:id/prompts', async (req: Request, res: Response) => {
    try {
      const prompts = await sessionManager.getSessionPrompts(req.params.id);
      res.json(prompts);
    } catch (error) {
      console.error('Failed to get session prompts:', error);
      res.status(500).json({ error: 'Failed to get session prompts' });
    }
  });

  // Merge main branch to worktree
  app.post('/api/sessions/:id/merge-main-to-worktree', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session || !session.worktreePath) {
        res.status(404).json({ error: 'Session or worktree not found' });
        return;
      }

      // Get the main branch name from git config
      const { stdout: mainBranch } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD | sed "s@^refs/remotes/origin/@@"', {
        cwd: session.worktreePath
      });

      const branch = mainBranch.trim() || 'main';
      
      // Merge main into worktree
      const { stdout, stderr } = await execAsync(`git merge origin/${branch}`, {
        cwd: session.worktreePath
      });

      res.json({ message: 'Merge completed', stdout, stderr });
    } catch (error: any) {
      console.error('Failed to merge main to worktree:', error);
      res.status(500).json({ 
        error: 'Failed to merge main to worktree',
        stdout: error.stdout,
        stderr: error.stderr
      });
    }
  });

  // Merge worktree to main branch
  app.post('/api/sessions/:id/merge-worktree-to-main', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session || !session.worktreePath) {
        res.status(404).json({ error: 'Session or worktree not found' });
        return;
      }

      // Get the project for this session
      const dbSession = await sessionManager.getDbSession(req.params.id);
      if (!dbSession?.project_id) {
        res.status(404).json({ error: 'Project not found for session' });
        return;
      }

      const project = await sessionManager.getProjectById(dbSession.project_id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Get current branch name in worktree
      const { stdout: currentBranch } = await execAsync('git branch --show-current', {
        cwd: session.worktreePath
      });

      // Get the main branch name
      const { stdout: mainBranch } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD | sed "s@^refs/remotes/origin/@@"', {
        cwd: project.path
      });

      const branch = mainBranch.trim() || 'main';
      const worktreeBranch = currentBranch.trim();

      // Switch to main branch in the main repository
      await execAsync(`git checkout ${branch}`, { cwd: project.path });
      
      // Merge the worktree branch
      const { stdout, stderr } = await execAsync(`git merge ${worktreeBranch}`, {
        cwd: project.path
      });

      res.json({ message: 'Merge completed', stdout, stderr });
    } catch (error: any) {
      console.error('Failed to merge worktree to main:', error);
      res.status(500).json({ 
        error: 'Failed to merge worktree to main',
        stdout: error.stdout,
        stderr: error.stderr
      });
    }
  });
}
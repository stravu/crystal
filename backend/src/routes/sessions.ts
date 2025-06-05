import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CreateSessionRequest } from '../types/session.js';
import { SessionManager } from '../services/sessionManager.js';
import { WorktreeManager } from '../services/worktreeManager.js';
import { ClaudeCodeManager } from '../services/claudeCodeManager.js';
import { WorktreeNameGenerator } from '../services/worktreeNameGenerator.js';
import type { ExecutionTracker } from '../services/executionTracker.js';
import type { Logger } from '../utils/logger.js';
import { formatJsonForOutputEnhanced } from '../utils/toolFormatter.js';

const execAsync = promisify(exec);

export function createSessionRouter(
  sessionManager: SessionManager,
  getWorktreeManager: () => WorktreeManager,
  claudeCodeManager: ClaudeCodeManager,
  worktreeNameGenerator: WorktreeNameGenerator,
  logger?: Logger,
  getGitRepoPath?: () => string,
  executionTracker?: ExecutionTracker
): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const sessions = await sessionManager.getAllSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  router.get('/:id/output', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const outputs = await sessionManager.getSessionOutputs(req.params.id, limit);
      
      // Transform JSON messages to output format on the fly
      const transformedOutputs = outputs.map(output => {
        if (output.type === 'json') {
          // Generate output format from JSON using enhanced formatter
          const outputText = formatJsonForOutputEnhanced(output.data, getGitRepoPath?.());
          if (outputText) {
            // Return both the JSON and a generated output version
            return [
              output, // Keep the JSON message for Messages view
              {
                ...output,
                type: 'stdout' as const,
                data: outputText
              }
            ];
          }
          return [output]; // If no output format, just return JSON
        }
        return [output]; // Non-JSON outputs pass through
      }).flat();
      
      res.json(transformedOutputs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get session outputs' });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { prompt, worktreeTemplate, count = 1 }: CreateSessionRequest = req.body;

      if (!prompt) {
        logger?.warn('Session creation failed: missing prompt');
        return res.status(400).json({ error: 'Prompt is required' });
      }

      logger?.info(`Creating ${count} session(s) with auto-generated names`);
      const sessions = [];

      for (let i = 0; i < count; i++) {
        // Generate a unique worktree name using the prompt
        let name: string;
        if (worktreeTemplate) {
          // Use provided template if available
          name = count > 1 ? `${worktreeTemplate}-${i + 1}` : worktreeTemplate;
        } else {
          // Auto-generate name using GPT-4.1
          name = await worktreeNameGenerator.generateUniqueWorktreeName(prompt);
          // If multiple sessions, add counter
          if (count > 1) {
            name = `${name}-${i + 1}`;
          }
        }
        
        logger?.verbose(`Creating session ${name}...`);
        
        const worktreePath = await getWorktreeManager().createWorktree(name);
        logger?.verbose(`Worktree created at: ${worktreePath}`);
        
        const session = await sessionManager.createSession(name, worktreePath, prompt, name);
        logger?.verbose(`Session ${session.id} created`);
        
        // Store the initial prompt in conversation history
        await sessionManager.addConversationMessage(session.id, 'user', prompt);
        
        // Add the initial prompt as a prompt marker so it shows in navigation
        await sessionManager.addInitialPromptMarker(session.id, prompt);
        
        // Add the initial prompt to output so it's visible
        const timestamp = new Date().toLocaleTimeString();
        const initialPromptDisplay = `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[32m👤 Initial Prompt\x1b[0m\r\n` +
                                     `\x1b[37m${prompt}\x1b[0m\r\n\r\n`;
        await sessionManager.addSessionOutput(session.id, {
          type: 'stdout',
          data: initialPromptDisplay,
          timestamp: new Date()
        });
        
        await sessionManager.updateSession(session.id, { status: 'ready' });
        logger?.verbose(`Session ${session.id} marked as ready`);
        
        await claudeCodeManager.spawnClaudeCode(session.id, worktreePath, prompt);
        
        sessions.push(session);
      }

      logger?.info(`Successfully created ${sessions.length} session(s)`);
      res.status(201).json(sessions);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error('Error creating session', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to create session', 
        details: errorMessage 
      });
    }
  });

  router.post('/:id/input', async (req: Request, res: Response) => {
    try {
      const { input } = req.body;
      
      if (!input) {
        return res.status(400).json({ error: 'Input is required' });
      }

      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Store user input in session outputs for persistence and emit via WebSocket
      const userInputDisplay = `> ${input.trim()}\n`;
      await sessionManager.addSessionOutput(req.params.id, {
        type: 'stdout',
        data: userInputDisplay,
        timestamp: new Date()
      });

      claudeCodeManager.sendInput(req.params.id, input);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error sending input:', error);
      res.status(500).json({ 
        error: 'Failed to send input', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.post('/:id/continue', async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Store continuation message in session outputs for persistence and emit via WebSocket
      const userInputDisplay = `\n--- New Message ---\n> ${message.trim()}\n`;
      await sessionManager.addSessionOutput(req.params.id, {
        type: 'stdout',
        data: userInputDisplay,
        timestamp: new Date()
      });

      await sessionManager.continueConversation(req.params.id, message);
      
      res.json({ success: true });
    } catch (error) {
      logger?.error('Error continuing conversation:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to continue conversation', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.get('/:id/conversation', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const messages = await sessionManager.getConversationMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      logger?.error('Error getting conversation history:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get conversation history', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.get('/:id/prompts', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const markers = await sessionManager.getPromptMarkers(req.params.id);
      res.json(markers);
    } catch (error) {
      logger?.error('Error getting prompt markers:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get prompt markers', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.post('/:id/stop', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      claudeCodeManager.killProcess(req.params.id);
      await sessionManager.updateSession(req.params.id, { status: 'stopped' });
      
      res.json({ success: true });
    } catch (error) {
      logger?.error('Error stopping session:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to stop session', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Kill the process if it's running
      try {
        claudeCodeManager.killProcess(req.params.id);
      } catch (error) {
        console.error('Error killing process:', error);
        // Continue with deletion even if process killing fails
      }
      
      // Try to remove the worktree
      try {
        await getWorktreeManager().removeWorktree(session.name);
      } catch (error) {
        console.error('Error removing worktree:', error);
        // Continue with archiving even if worktree removal fails
        // The WorktreeManager already handles missing worktrees gracefully
      }
      
      // Archive the session - this should always happen
      await sessionManager.archiveSession(req.params.id);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({ 
        error: 'Failed to delete session', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Execution diff endpoints
  router.get('/:id/executions', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const executions = await sessionManager.getExecutionDiffs(req.params.id);
      res.json(executions);
    } catch (error) {
      logger?.error('Error getting execution diffs:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get execution diffs', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.get('/:id/executions/:executionId/diff', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const executionId = parseInt(req.params.executionId);
      if (isNaN(executionId)) {
        return res.status(400).json({ error: 'Invalid execution ID' });
      }

      const execution = await sessionManager.getExecutionDiff(executionId);
      if (!execution || execution.session_id !== req.params.id) {
        return res.status(404).json({ error: 'Execution not found' });
      }

      res.json(execution);
    } catch (error) {
      logger?.error('Error getting execution diff:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get execution diff', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.get('/:id/combined-diff', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (!executionTracker) {
        return res.status(503).json({ error: 'Execution tracking not available' });
      }

      const combinedDiff = await executionTracker.getCombinedDiff(req.params.id);
      res.json(combinedDiff);
    } catch (error) {
      logger?.error('Error getting combined diff:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get combined diff', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.post('/:id/combined-diff', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const { executionIds } = req.body;
      if (!Array.isArray(executionIds) || !executionIds.every(id => typeof id === 'number')) {
        return res.status(400).json({ error: 'Invalid execution IDs array' });
      }

      if (!executionTracker) {
        return res.status(503).json({ error: 'Execution tracking not available' });
      }

      const combinedDiff = await executionTracker.getCombinedDiff(req.params.id, executionIds);
      res.json(combinedDiff);
    } catch (error) {
      logger?.error('Error getting combined diff for selected executions:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get combined diff', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Merge main branch into session worktree
  router.post('/:id/merge-main-to-worktree', async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
      // Get session to find worktree path
      const session = await sessionManager.getSession(id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // First, fetch the latest changes from origin
      try {
        await execAsync(`cd "${session.worktreePath}" && git fetch origin main`);
      } catch (fetchError) {
        console.error('Error fetching from origin:', fetchError);
        // Continue anyway - might work with local main
      }
      
      // Execute git merge command in the worktree
      try {
        const { stdout, stderr } = await execAsync(`cd "${session.worktreePath}" && git merge origin/main || git merge main`);
        
        // Check if merge was successful
        if (stdout.includes('Already up to date')) {
          return res.json({ success: true, message: 'Already up to date with main branch' });
        }
        
        res.json({ success: true, message: 'Successfully merged main branch' });
      } catch (mergeError: any) {
        // Check if it's a merge conflict
        const errorMessage = mergeError.stderr || mergeError.stdout || mergeError.message;
        
        if (errorMessage.includes('CONFLICT')) {
          // Get conflict details
          try {
            const { stdout: statusOutput } = await execAsync(`cd "${session.worktreePath}" && git status --porcelain`);
            const conflictFiles = statusOutput
              .split('\n')
              .filter(line => line.startsWith('UU '))
              .map(line => line.substring(3).trim());
            
            return res.status(409).json({ 
              error: 'Merge conflict detected', 
              conflictFiles,
              message: `Merge conflict in ${conflictFiles.length} file(s). Please resolve conflicts manually.`
            });
          } catch {
            return res.status(409).json({ 
              error: 'Merge conflict detected. Please resolve conflicts manually.' 
            });
          }
        }
        
        // Other git errors
        return res.status(400).json({ 
          error: errorMessage || 'Failed to merge main branch' 
        });
      }
    } catch (error) {
      console.error('Error merging main branch:', error);
      res.status(500).json({ error: 'Failed to merge main branch' });
    }
  });

  // Merge session worktree into main branch (using rebase to avoid merge commits)
  router.post('/:id/merge-worktree-to-main', async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
      // Get session to find worktree path
      const session = await sessionManager.getSession(id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Get the worktree branch name
      const { stdout: worktreeBranch } = await execAsync(`cd "${session.worktreePath}" && git branch --show-current`);
      const worktreeBranchName = worktreeBranch.trim();
      
      try {
        // Check if there are uncommitted changes in the worktree
        const { stdout: worktreeStatus } = await execAsync(`cd "${session.worktreePath}" && git status --porcelain`);
        if (worktreeStatus.trim()) {
          return res.status(400).json({ 
            error: 'Worktree has uncommitted changes. Please commit or stash changes first.' 
          });
        }
        
        // Fetch latest changes from origin
        await execAsync(`cd "${session.worktreePath}" && git fetch origin main`);
        
        // First, rebase the worktree branch onto latest main
        try {
          await execAsync(`cd "${session.worktreePath}" && git rebase origin/main`);
        } catch (rebaseError: any) {
          const errorMessage = rebaseError.stderr || rebaseError.stdout || rebaseError.message;
          
          if (errorMessage.includes('CONFLICT')) {
            // Abort the rebase
            await execAsync(`cd "${session.worktreePath}" && git rebase --abort`).catch(() => {});
            
            return res.status(409).json({ 
              error: 'Rebase conflict detected. Please resolve conflicts manually or merge main into your worktree first.' 
            });
          }
          
          throw rebaseError;
        }
        
        // Now switch to main repo and do a fast-forward merge
        const gitRepoPath = getGitRepoPath ? getGitRepoPath() : process.cwd();
        
        // Ensure we're on main branch
        const { stdout: currentBranch } = await execAsync(`cd "${gitRepoPath}" && git branch --show-current`);
        const branch = currentBranch.trim();
        
        if (branch !== 'main' && branch !== 'master') {
          return res.status(400).json({ 
            error: `Main repository is on branch '${branch}', not 'main'. Please switch to main branch first.` 
          });
        }
        
        // Pull latest main
        await execAsync(`cd "${gitRepoPath}" && git pull origin main --ff-only`);
        
        // Do a fast-forward only merge
        try {
          const { stdout } = await execAsync(`cd "${gitRepoPath}" && git merge "${worktreeBranchName}" --ff-only`);
          
          if (stdout.includes('Already up to date')) {
            return res.json({ success: true, message: 'Already up to date - no changes to merge' });
          }
          
          res.json({ success: true, message: 'Successfully merged worktree into main branch (fast-forward)' });
        } catch (mergeError: any) {
          const errorMessage = mergeError.stderr || mergeError.stdout || mergeError.message;
          
          if (errorMessage.includes('Not possible to fast-forward')) {
            return res.status(400).json({ 
              error: 'Cannot fast-forward merge. The worktree branch has diverged from main. Please rebase your worktree branch first.' 
            });
          }
          
          return res.status(400).json({ 
            error: errorMessage || 'Failed to merge worktree into main branch' 
          });
        }
      } catch (error: any) {
        // Other git errors
        return res.status(400).json({ 
          error: error.message || 'Failed to merge worktree into main branch' 
        });
      }
    } catch (error) {
      console.error('Error merging worktree to main:', error);
      res.status(500).json({ error: 'Failed to merge worktree to main branch' });
    }
  });

  return router;
}
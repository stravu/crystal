import { Router, Request, Response } from 'express';
import type { CreateSessionRequest } from '../types/session.js';
import { SessionManager } from '../services/sessionManager.js';
import { WorktreeManager } from '../services/worktreeManager.js';
import { ClaudeCodeManager } from '../services/claudeCodeManager.js';
import type { Logger } from '../utils/logger.js';
import { formatJsonForTerminal } from '../utils/formatters.js';

export function createSessionRouter(
  sessionManager: SessionManager,
  getWorktreeManager: () => WorktreeManager,
  claudeCodeManager: ClaudeCodeManager,
  logger?: Logger
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
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
      
      // Transform JSON messages to terminal format on the fly
      const transformedOutputs = outputs.map(output => {
        if (output.type === 'json') {
          // Generate terminal format from JSON
          const terminalText = formatJsonForTerminal(output.data);
          if (terminalText) {
            // Return both the JSON and a generated terminal version
            return [
              output, // Keep the JSON message for Messages view
              {
                ...output,
                type: 'stdout' as const,
                data: terminalText
              }
            ];
          }
          return [output]; // If no terminal format, just return JSON
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

      if (!prompt || !worktreeTemplate) {
        logger?.warn('Session creation failed: missing prompt or worktree template');
        return res.status(400).json({ error: 'Prompt and worktreeTemplate are required' });
      }

      logger?.info(`Creating ${count} session(s) with template: ${worktreeTemplate}`);
      const sessions = [];

      for (let i = 0; i < count; i++) {
        const name = count > 1 ? `${worktreeTemplate}-${i + 1}` : worktreeTemplate;
        
        logger?.verbose(`Creating session ${name}...`);
        
        const worktreePath = await getWorktreeManager().createWorktree(name);
        logger?.verbose(`Worktree created at: ${worktreePath}`);
        
        const session = await sessionManager.createSession(name, worktreePath, prompt, name);
        logger?.verbose(`Session ${session.id} created`);
        
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

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      claudeCodeManager.killProcess(req.params.id);
      
      // Use the stored worktree name from the database
      await getWorktreeManager().removeWorktree(session.name);
      
      await sessionManager.deleteSession(req.params.id);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({ 
        error: 'Failed to delete session', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  return router;
}
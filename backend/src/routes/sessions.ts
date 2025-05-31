import { Router, Request, Response } from 'express';
import type { CreateSessionRequest } from '../types/session.js';
import { SessionManager } from '../services/sessionManager.js';
import { WorktreeManager } from '../services/worktreeManager.js';
import { ClaudeCodeManager } from '../services/claudeCodeManager.js';

export function createSessionRouter(
  sessionManager: SessionManager,
  getWorktreeManager: () => WorktreeManager,
  claudeCodeManager: ClaudeCodeManager
): Router {
  const router = Router();

  router.get('/', (req: Request, res: Response) => {
    const sessions = sessionManager.getAllSessions();
    res.json(sessions);
  });

  router.get('/:id', (req: Request, res: Response) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { prompt, worktreeTemplate, count = 1 }: CreateSessionRequest = req.body;

      if (!prompt || !worktreeTemplate) {
        return res.status(400).json({ error: 'Prompt and worktreeTemplate are required' });
      }

      const sessions = [];

      for (let i = 0; i < count; i++) {
        const name = count > 1 ? `${worktreeTemplate}-${i + 1}` : worktreeTemplate;
        
        const worktreePath = await getWorktreeManager().createWorktree(name);
        
        const session = sessionManager.createSession(name, worktreePath, prompt);
        
        sessionManager.updateSession(session.id, { status: 'ready' });
        
        await claudeCodeManager.spawnClaudeCode(session.id, worktreePath, prompt);
        
        sessionManager.updateSession(session.id, { status: 'running' });
        
        sessions.push(session);
      }

      res.status(201).json(sessions);
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({ 
        error: 'Failed to create session', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.post('/:id/input', (req: Request, res: Response) => {
    try {
      const { input } = req.body;
      
      if (!input) {
        return res.status(400).json({ error: 'Input is required' });
      }

      const session = sessionManager.getSession(req.params.id);
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
      const session = sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      claudeCodeManager.killProcess(req.params.id);
      
      const worktreeName = session.worktreePath.split('/').pop();
      if (worktreeName) {
        await getWorktreeManager().removeWorktree(worktreeName);
      }
      
      sessionManager.deleteSession(req.params.id);
      
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
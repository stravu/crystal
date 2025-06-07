import { Router, Request, Response } from 'express';
import { SessionManager } from '../services/sessionManager';
import type { Logger } from '../utils/logger';

export function createPromptsRouter(
  sessionManager: SessionManager,
  logger?: Logger
): Router {
  const router = Router();

  router.get('/history', async (_req: Request, res: Response): Promise<void> => {
    try {
      const promptHistory = await sessionManager.getPromptHistory();
      res.json(promptHistory);
    } catch (error) {
      logger?.error('Error getting prompt history:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get prompt history', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  return router;
}
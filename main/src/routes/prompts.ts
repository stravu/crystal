import { Router, Request, Response } from 'express';
import type { SessionManager } from '../services/sessionManager';

interface PromptsRoutesOptions {
  sessionManager: SessionManager;
}

export function setupPromptRoutes(app: Router, options: PromptsRoutesOptions): void {
  const { sessionManager } = options;

  // Get prompt history
  app.get('/api/prompts', async (_req: Request, res: Response) => {
    try {
      const prompts = await sessionManager.getPromptHistory();
      res.json(prompts);
    } catch (error) {
      console.error('Failed to get prompt history:', error);
      res.status(500).json({ error: 'Failed to get prompt history' });
    }
  });
}
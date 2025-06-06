import { Router, Request, Response } from 'express';
import type { UpdateConfigRequest } from '../types/config.js';
import { ConfigManager } from '../services/configManager.js';
import { existsSync } from 'fs';
import { join } from 'path';

export function createConfigRouter(configManager: ConfigManager): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const config = configManager.getConfig();
    res.json(config);
  });

  router.put('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { gitRepoPath }: UpdateConfigRequest = req.body;

      if (gitRepoPath) {
        // Validate that the path exists and is a git repository
        if (!existsSync(gitRepoPath)) {
          res.status(400).json({ error: 'Path does not exist' });
          return;
        }

        if (!existsSync(join(gitRepoPath, '.git'))) {
          res.status(400).json({ error: 'Path is not a git repository' });
          return;
        }
      }

      const updatedConfig = await configManager.updateConfig(req.body);
      res.json(updatedConfig);
    } catch (error) {
      console.error('Error updating config:', error);
      res.status(500).json({ 
        error: 'Failed to update configuration', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  return router;
}
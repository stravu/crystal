import { Router, Request, Response } from 'express';
import type { ConfigManager } from '../services/configManager';
import type { UpdateConfigRequest } from '../types/config';

interface ConfigRoutesOptions {
  configManager: ConfigManager;
}

export function setupConfigRoutes(app: Router, options: ConfigRoutesOptions): void {
  const { configManager } = options;

  // Get config
  app.get('/api/config', (_req: Request, res: Response) => {
    try {
      const config = configManager.getConfig();
      res.json(config);
    } catch (error) {
      console.error('Failed to get config:', error);
      res.status(500).json({ error: 'Failed to get config' });
    }
  });

  // Update config
  app.post('/api/config', (req: Request<{}, {}, UpdateConfigRequest>, res: Response) => {
    try {
      const updatedConfig = configManager.updateConfig(req.body);
      res.json(updatedConfig);
    } catch (error) {
      console.error('Failed to update config:', error);
      res.status(500).json({ error: 'Failed to update config' });
    }
  });
}
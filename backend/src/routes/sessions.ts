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
        
        // Store the initial prompt in conversation history
        await sessionManager.addConversationMessage(session.id, 'user', prompt);
        
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

  router.get('/:id/diff/:compareId', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      const compareSession = await sessionManager.getSession(req.params.compareId);
      
      if (!session || !compareSession) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const worktreeManager = getWorktreeManager();
      const fileChanges = await worktreeManager.getFileChanges(session.worktreePath, compareSession.worktreePath);
      
      res.json({ files: fileChanges });
    } catch (error) {
      logger?.error('Error getting session diff:', error instanceof Error ? error : undefined);
      res.status(500).json({ 
        error: 'Failed to get session diff', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  router.get('/:id/diff/:compareId/file', async (req: Request, res: Response) => {
    try {
      const session = await sessionManager.getSession(req.params.id);
      const compareSession = await sessionManager.getSession(req.params.compareId);
      
      if (!session || !compareSession) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
      }

      const worktreeManager = getWorktreeManager();
      const diff = await worktreeManager.getFileDiff(session.worktreePath, compareSession.worktreePath, filePath);
      
      res.text(diff);
    } catch (error) {
      logger?.error('Error getting file diff:', error instanceof Error ? error : undefined);
      res.status(500).text('Error loading diff');
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

  return router;
}
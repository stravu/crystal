import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Project } from '../database/models';
import type { DatabaseService } from '../database/database';
import type { SessionManager } from '../services/sessionManager';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

export function createProjectsRouter(databaseService: DatabaseService, sessionManager: SessionManager): Router {
  const router = Router();

  // Get all projects
  router.get('/', (req: Request, res: Response) => {
    try {
      const projects = databaseService.getAllProjects();
      res.json(projects);
    } catch (error) {
      console.error('Error fetching projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  // Get active project
  router.get('/active', (req: Request, res: Response) => {
    try {
      const project = databaseService.getActiveProject();
      if (!project) {
        res.status(404).json({ error: 'No active project' });
        return;
      }
      res.json(project);
    } catch (error) {
      console.error('Error fetching active project:', error);
      res.status(500).json({ error: 'Failed to fetch active project' });
    }
  });

  // Get project by ID
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const project = databaseService.getProject(parseInt(req.params.id));
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json(project);
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // Create new project
  router.post('/', (req: Request, res: Response) => {
    try {
      const { name, path, systemPrompt, runScript } = req.body;
    
      if (!name || !path) {
        res.status(400).json({ error: 'Name and path are required' });
        return;
      }

      // Check if project with this path already exists
      const existingProject = databaseService.getProjectByPath(path);
      if (existingProject) {
        res.status(400).json({ error: 'Project with this path already exists' });
        return;
      }

      // Create directory if it doesn't exist
      if (!existsSync(path)) {
        try {
          mkdirSync(path, { recursive: true });
          console.log(`Created project directory: ${path}`);
        } catch (error) {
          console.error('Error creating project directory:', error);
          res.status(500).json({ error: 'Failed to create project directory' });
          return;
        }
      }

      // Check if directory is a git repository
      const gitDir = join(path, '.git');
      if (!existsSync(gitDir)) {
        try {
          execSync('git init', { cwd: path });
          console.log(`Initialized git repository in: ${path}`);
        } catch (error) {
          console.error('Error initializing git repository:', error);
          res.status(500).json({ error: 'Failed to initialize git repository' });
          return;
        }
      }

      const project = databaseService.createProject(name, path, systemPrompt, runScript);
      
      // If this is the first project, make it active
      const allProjects = databaseService.getAllProjects();
      if (allProjects.length === 1) {
        databaseService.setActiveProject(project.id);
      }

      res.json(project);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // Update project
  router.put('/:id', (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const updates = req.body as Partial<Omit<Project, 'id' | 'created_at'>>;
      
      const project = databaseService.updateProject(projectId, updates);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      
      res.json(project);
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // Set active project
  router.post('/:id/activate', (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      const project = databaseService.setActiveProject(projectId);
      
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Update session manager with new active project
      sessionManager.setActiveProject(project);
      
      res.json(project);
    } catch (error) {
      console.error('Error activating project:', error);
      res.status(500).json({ error: 'Failed to activate project' });
    }
  });

  // Delete project
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      
      // Check if project has sessions
      const sessions = databaseService.getAllSessions(projectId);
      if (sessions.length > 0) {
        res.status(400).json({ 
          error: 'Cannot delete project with existing sessions',
          sessionCount: sessions.length 
        });
        return;
      }

      const success = databaseService.deleteProject(projectId);
      if (!success) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting project:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  return router;
}
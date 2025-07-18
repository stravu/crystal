import { IpcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import type { AppServices } from './types';
import type { Session } from '../types/session';

interface FileReadRequest {
  sessionId: string;
  filePath: string;
}

interface FileWriteRequest {
  sessionId: string;
  filePath: string;
  content: string;
}

interface FilePathRequest {
  sessionId: string;
  filePath: string;
}

interface FileListRequest {
  sessionId: string;
  path?: string;
}

interface FileDeleteRequest {
  sessionId: string;
  filePath: string;
}

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
}

interface FileSearchRequest {
  sessionId?: string;
  projectId?: number;
  pattern: string;
  limit?: number;
}

export function registerFileHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { sessionManager, databaseService } = services;

  // Read file contents from a session's worktree
  ipcMain.handle('file:read', async (_, request: FileReadRequest) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      // Ensure the file path is relative and safe
      const normalizedPath = path.normalize(request.filePath);
      if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
        throw new Error('Invalid file path');
      }

      const fullPath = path.join(session.worktreePath, normalizedPath);
      
      // Verify the file is within the worktree
      // First resolve the worktree path to handle symlinks
      const resolvedWorktreePath = await fs.realpath(session.worktreePath).catch(() => session.worktreePath);
      
      // For the file path, we need to handle the case where the file might not exist yet
      let resolvedFilePath: string;
      try {
        resolvedFilePath = await fs.realpath(fullPath);
      } catch (err) {
        // File doesn't exist, check if its directory is within the worktree
        const dirPath = path.dirname(fullPath);
        try {
          const resolvedDirPath = await fs.realpath(dirPath);
          if (!resolvedDirPath.startsWith(resolvedWorktreePath)) {
            throw new Error('File path is outside worktree');
          }
          // File doesn't exist but directory is valid
          resolvedFilePath = fullPath;
        } catch {
          // Directory doesn't exist either, just use the full path for validation
          resolvedFilePath = fullPath;
        }
      }
      
      // Check if the resolved path is within the worktree
      if (!resolvedFilePath.startsWith(resolvedWorktreePath) && !fullPath.startsWith(session.worktreePath)) {
        throw new Error('File path is outside worktree');
      }

      const content = await fs.readFile(resolvedFilePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      console.error('Error reading file:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Write file contents to a session's worktree
  ipcMain.handle('file:write', async (_, request: FileWriteRequest) => {
    try {
      // Removed verbose logging of file:write requests to reduce console noise during auto-save
      
      if (!request.filePath) {
        throw new Error('File path is required');
      }
      
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      // Note: mainBranch detection removed as it wasn't being used in this function
      // If needed in the future, use worktreeManager.detectMainBranch(session.worktreePath)

      if (!session.worktreePath) {
        throw new Error(`Session worktree path is undefined for session: ${request.sessionId}`);
      }

      // Ensure the file path is relative and safe
      const normalizedPath = path.normalize(request.filePath);
      if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
        throw new Error('Invalid file path');
      }

      const fullPath = path.join(session.worktreePath, normalizedPath);
      
      // Verify the file is within the worktree
      const dirPath = path.dirname(fullPath);
      
      // Try to resolve both paths to handle symlinks properly
      let resolvedDirPath = dirPath;
      let resolvedWorktreePath = session.worktreePath;
      
      try {
        // Resolve the worktree path first
        resolvedWorktreePath = await fs.realpath(session.worktreePath);
        
        // Try to resolve the directory path
        try {
          resolvedDirPath = await fs.realpath(dirPath);
        } catch (err) {
          // Directory might not exist yet, that's OK
          // Use the full path's parent that should exist
          const parentPath = path.dirname(dirPath);
          try {
            const resolvedParent = await fs.realpath(parentPath);
            resolvedDirPath = path.join(resolvedParent, path.basename(dirPath));
          } catch {
            // Even parent doesn't exist, just use the original path
            resolvedDirPath = dirPath;
          }
        }
      } catch (err) {
        console.error('Error resolving paths:', err);
        // If we can't resolve paths, just use the original ones
      }
      
      // Check if the path is within the worktree (using resolved paths)
      if (!resolvedDirPath.startsWith(resolvedWorktreePath) && !dirPath.startsWith(session.worktreePath)) {
        throw new Error('File path is outside worktree');
      }

      // Create directory if it doesn't exist
      await fs.mkdir(dirPath, { recursive: true });

      // Write the file
      await fs.writeFile(fullPath, request.content, 'utf-8');
      
      return { success: true };
    } catch (error) {
      console.error('Error writing file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Get the full path for a file in a session's worktree
  ipcMain.handle('file:getPath', async (_, request: FilePathRequest) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      // Ensure the file path is relative and safe
      const normalizedPath = path.normalize(request.filePath);
      if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
        throw new Error('Invalid file path');
      }

      const fullPath = path.join(session.worktreePath, normalizedPath);
      return { success: true, path: fullPath };
    } catch (error) {
      console.error('Error getting file path:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Commit changes in a session's worktree
  ipcMain.handle('git:commit', async (_, request: { sessionId: string; message: string }) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      if (!request.message || !request.message.trim()) {
        throw new Error('Commit message is required');
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        // Stage all changes
        await execAsync('git add -A', { cwd: session.worktreePath });

        // Create the commit with Crystal signature
        const commitMessage = `${request.message}

🤖 Generated with [Crystal](https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1)

Co-Authored-By: Crystal <noreply@stravu.com>`;

        // Use a here document to handle multi-line commit messages
        const command = `git commit -m "$(cat <<'EOF'
${commitMessage}
EOF
)"`;

        await execAsync(command, { cwd: session.worktreePath });

        return { success: true };
      } catch (error: any) {
        // Check if it's a pre-commit hook failure
        if (error.message?.includes('pre-commit hook')) {
          // Try to commit again in case the pre-commit hook made changes
          try {
            await execAsync('git add -A', { cwd: session.worktreePath });
            const command = `git commit -m "$(cat <<'EOF'
${request.message}

🤖 Generated with [Crystal](https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1)

Co-Authored-By: Crystal <noreply@stravu.com>
EOF
)"`;
            await execAsync(command, { cwd: session.worktreePath });
            return { success: true };
          } catch (retryError: any) {
            throw new Error(`Git commit failed: ${retryError.message || retryError}`);
          }
        }
        throw new Error(`Git commit failed: ${error.message || error}`);
      }
    } catch (error) {
      console.error('Error committing changes:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Revert a specific commit
  ipcMain.handle('git:revert', async (_, request: { sessionId: string; commitHash: string }) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      if (!request.commitHash) {
        throw new Error('Commit hash is required');
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        // Create a revert commit
        const command = `git revert ${request.commitHash} --no-edit`;
        await execAsync(command, { cwd: session.worktreePath });

        return { success: true };
      } catch (error: any) {
        throw new Error(`Git revert failed: ${error.message || error}`);
      }
    } catch (error) {
      console.error('Error reverting commit:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Restore all uncommitted changes
  ipcMain.handle('git:restore', async (_, request: { sessionId: string }) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        // Reset all changes to the last commit
        await execAsync('git reset --hard HEAD', { cwd: session.worktreePath });
        
        // Clean untracked files
        await execAsync('git clean -fd', { cwd: session.worktreePath });

        return { success: true };
      } catch (error: any) {
        throw new Error(`Git restore failed: ${error.message || error}`);
      }
    } catch (error) {
      console.error('Error restoring changes:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Read file contents at a specific git revision
  ipcMain.handle('file:readAtRevision', async (_, request: { sessionId: string; filePath: string; revision?: string }) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      // Ensure the file path is relative and safe
      const normalizedPath = path.normalize(request.filePath);
      if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
        throw new Error('Invalid file path');
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        // Default to HEAD if no revision specified
        const revision = request.revision || 'HEAD';
        
        // Use git show to get file content at specific revision
        const { stdout } = await execAsync(
          `git show ${revision}:${normalizedPath}`,
          { 
            cwd: session.worktreePath,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
          }
        );

        return { success: true, content: stdout };
      } catch (error: any) {
        // If file doesn't exist at that revision, return empty content
        if (error.message?.includes('does not exist') || error.message?.includes('bad file')) {
          return { success: true, content: '' };
        }
        throw new Error(`Failed to read file at revision: ${error.message || error}`);
      }
    } catch (error) {
      console.error('Error reading file at revision:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // List files and directories in a session's worktree
  ipcMain.handle('file:list', async (_, request: FileListRequest) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }
      
      // Check if session is archived - worktree won't exist
      if (session.archived) {
        return { success: false, error: 'Cannot list files for archived session' };
      }

      // Use the provided path or default to root
      const relativePath = request.path || '';
      
      // Ensure the path is relative and safe
      if (relativePath) {
        const normalizedPath = path.normalize(relativePath);
        if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
          throw new Error('Invalid path');
        }
      }

      const targetPath = relativePath ? path.join(session.worktreePath, relativePath) : session.worktreePath;
      
      // Read directory contents
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      
      // Process each entry
      const files: FileItem[] = await Promise.all(
        entries
          .filter(entry => entry.name !== '.git') // Exclude .git directory only
          .map(async (entry) => {
            const fullPath = path.join(targetPath, entry.name);
            const relativePath = path.relative(session.worktreePath, fullPath);
            
            try {
              const stats = await fs.stat(fullPath);
              return {
                name: entry.name,
                path: relativePath,
                isDirectory: entry.isDirectory(),
                size: entry.isFile() ? stats.size : undefined,
                modified: stats.mtime
              };
            } catch (error) {
              // Handle broken symlinks or inaccessible files
              return {
                name: entry.name,
                path: relativePath,
                isDirectory: entry.isDirectory()
              };
            }
          })
      );

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
          return a.name.localeCompare(b.name);
        }
        return a.isDirectory ? -1 : 1;
      });

      return { success: true, files };
    } catch (error) {
      console.error('Error listing files:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Delete a file from a session's worktree
  ipcMain.handle('file:delete', async (_, request: FileDeleteRequest) => {
    try {
      const session = sessionManager.getSession(request.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${request.sessionId}`);
      }

      // Ensure the file path is relative and safe
      const normalizedPath = path.normalize(request.filePath);
      if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
        throw new Error('Invalid file path');
      }

      const fullPath = path.join(session.worktreePath, normalizedPath);
      
      // Verify the file is within the worktree
      // First resolve the worktree path to handle symlinks
      const resolvedWorktreePath = await fs.realpath(session.worktreePath).catch(() => session.worktreePath);
      
      // Check if the file exists and resolve its path
      let resolvedFilePath: string;
      try {
        resolvedFilePath = await fs.realpath(fullPath);
      } catch (err) {
        // File doesn't exist
        throw new Error(`File not found: ${normalizedPath}`);
      }
      
      // Check if the resolved path is within the worktree
      if (!resolvedFilePath.startsWith(resolvedWorktreePath)) {
        throw new Error('File path is outside worktree');
      }

      // Check if it's a directory or file
      const stats = await fs.stat(resolvedFilePath);
      
      if (stats.isDirectory()) {
        // For directories, use rm with recursive option
        await fs.rm(resolvedFilePath, { recursive: true, force: true });
      } else {
        // For files, use unlink
        await fs.unlink(resolvedFilePath);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

  // Search for files matching a pattern
  ipcMain.handle('file:search', async (_, request: FileSearchRequest) => {
    try {
      // Determine the search directory
      let searchDirectory: string;
      
      if (request.sessionId) {
        const session = sessionManager.getSession(request.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${request.sessionId}`);
        }
        searchDirectory = session.worktreePath;
      } else if (request.projectId) {
        const project = databaseService.getProject(request.projectId);
        if (!project) {
          throw new Error(`Project not found: ${request.projectId}`);
        }
        searchDirectory = project.path;
      } else {
        throw new Error('Either sessionId or projectId must be provided');
      }

      // Normalize the pattern for searching
      const searchPattern = request.pattern.replace(/^@/, '').toLowerCase();
      
      // If the pattern contains a path separator, search from that path
      const pathParts = searchPattern.split(/[/\\]/);
      const searchDir = pathParts.length > 1 
        ? path.join(searchDirectory, ...pathParts.slice(0, -1))
        : searchDirectory;
      const filePattern = pathParts[pathParts.length - 1] || '';
      
      // Check if searchDir exists
      try {
        await fs.access(searchDir);
      } catch {
        return { success: true, files: [] };
      }

      // Use glob to find matching files
      const globPattern = filePattern ? `**/*${filePattern}*` : '**/*';
      const files = await glob(globPattern, {
        cwd: searchDir,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        nodir: false,
        dot: true,
        absolute: false,
        maxDepth: 5
      });

      // Convert to relative paths from the original directory
      const results = await Promise.all(
        files.map(async (file) => {
          const fullPath = path.join(searchDir, file);
          const relativePath = path.relative(searchDirectory, fullPath);
          
          try {
            const stats = await fs.stat(fullPath);
            return {
              path: relativePath,
              isDirectory: stats.isDirectory(),
              name: path.basename(file)
            };
          } catch {
            return null;
          }
        })
      );

      // Filter out null results and apply pattern matching
      const filteredResults = results
        .filter((file): file is NonNullable<typeof file> => file !== null)
        .filter(file => {
          // Filter by the full search pattern
          return file.path.toLowerCase().includes(searchPattern);
        })
        .sort((a, b) => {
          // Sort directories first, then by path
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.path.localeCompare(b.path);
        })
        .slice(0, request.limit || 50);

      return { success: true, files: filteredResults };
    } catch (error) {
      console.error('Error searching files:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        files: []
      };
    }
  });
}
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getShellPath, findExecutableInPath } from './shellPath';

const execAsync = promisify(exec);

/**
 * Get augmented PATH that includes common installation directories
 */
export function getAugmentedPath(): string {
  const platform = os.platform();
  const homeDir = os.homedir();
  const pathSeparator = platform === 'win32' ? ';' : ':';
  
  // Start with existing PATH
  const paths = (process.env.PATH || '').split(pathSeparator);
  
  // Add common installation paths based on platform
  const additionalPaths: string[] = [];
  
  if (platform === 'darwin') { // macOS
    additionalPaths.push(
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      path.join(homeDir, '.local', 'bin'),
      path.join(homeDir, 'bin'),
      // npm/yarn global installs
      '/usr/local/lib/node_modules/.bin',
      path.join(homeDir, '.npm-global', 'bin'),
      path.join(homeDir, '.yarn', 'bin'),
      // nvm paths
      path.join(homeDir, '.nvm', 'versions', 'node', '*', 'bin')
    );
  } else if (platform === 'linux') {
    additionalPaths.push(
      '/usr/local/bin',
      path.join(homeDir, '.local', 'bin'),
      path.join(homeDir, 'bin'),
      '/snap/bin',
      // npm/yarn global installs
      '/usr/local/lib/node_modules/.bin',
      path.join(homeDir, '.npm-global', 'bin'),
      path.join(homeDir, '.yarn', 'bin')
    );
  } else if (platform === 'win32') {
    additionalPaths.push(
      'C:\\Program Files\\Claude',
      'C:\\Program Files (x86)\\Claude',
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'Claude'),
      path.join(homeDir, 'AppData', 'Roaming', 'npm'),
      path.join(homeDir, '.yarn', 'bin')
    );
  }
  
  // Add paths that exist and aren't already in PATH
  for (const additionalPath of additionalPaths) {
    // Handle glob patterns like nvm paths
    if (additionalPath.includes('*')) {
      const baseDir = path.dirname(additionalPath.split('*')[0]);
      if (fs.existsSync(baseDir)) {
        try {
          // Find actual node version directories
          const entries = fs.readdirSync(baseDir);
          for (const entry of entries) {
            const fullPath = path.join(baseDir, entry, 'bin');
            if (fs.existsSync(fullPath) && !paths.includes(fullPath)) {
              paths.push(fullPath);
            }
          }
        } catch (e) {
          // Ignore errors reading directories
        }
      }
    } else if (fs.existsSync(additionalPath) && !paths.includes(additionalPath)) {
      paths.push(additionalPath);
    }
  }
  
  return paths.join(pathSeparator);
}

/**
 * Find the claude executable in common locations
 */
export async function findClaudeExecutable(): Promise<string | null> {
  const platform = os.platform();
  const executableName = platform === 'win32' ? 'claude.exe' : 'claude';
  const augmentedPath = getAugmentedPath();
  const paths = augmentedPath.split(platform === 'win32' ? ';' : ':');
  
  for (const dir of paths) {
    const claudePath = path.join(dir, executableName);
    try {
      await fs.promises.access(claudePath, fs.constants.X_OK);
      return claudePath;
    } catch {
      // Continue searching
    }
  }
  
  return null;
}

export async function testClaudeCodeAvailability(): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
  try {
    // Get the user's shell PATH
    const shellPath = getShellPath();
    
    // Try to find claude in the shell PATH
    const claudePath = findExecutableInPath('claude');
    
    if (!claudePath) {
      return { 
        available: false, 
        error: 'Claude Code CLI not found in PATH. Please ensure claude is installed and in your PATH.' 
      };
    }
    
    // Try to get version using the shell PATH
    try {
      const env = { ...process.env, PATH: shellPath };
      const { stdout } = await execAsync(`${claudePath} --version`, { timeout: 5000, env });
      return { available: true, version: stdout.trim(), path: claudePath };
    } catch (versionError) {
      // Command exists but version failed - might still work
      return { available: true, error: 'Could not get version info', path: claudePath };
    }
  } catch (error) {
    return { 
      available: false, 
      error: error instanceof Error ? error.message : 'Unknown error checking Claude Code availability' 
    };
  }
}

export async function testClaudeCodeInDirectory(directory: string): Promise<{ success: boolean; error?: string; output?: string }> {
  try {
    // Use the same enhanced shell PATH that build scripts use
    const shellPath = getShellPath();
    const env = { ...process.env, PATH: shellPath };
    
    const { stdout, stderr } = await execAsync('claude --help', { 
      cwd: directory,
      timeout: 10000,
      env
    });
    return { success: true, output: stdout + stderr };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error testing Claude Code in directory',
      output: error instanceof Error && 'stdout' in error ? String((error as any).stdout) + String((error as any).stderr) : undefined
    };
  }
}
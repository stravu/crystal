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

export async function testClaudeCodeAvailability(customClaudePath?: string): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
  console.log('[ClaudeTest] Testing Claude Code availability...');
  console.log(`[ClaudeTest] Platform: ${os.platform()}`);
  
  try {
    // Get the user's shell PATH
    const shellPath = getShellPath();
    console.log(`[ClaudeTest] Using shell PATH with ${shellPath.split(os.platform() === 'win32' ? ';' : ':').length} entries`);
    
    // Use custom path if provided, otherwise try to find claude in the shell PATH
    let claudePath: string | null = null;
    
    if (customClaudePath) {
      console.log(`[ClaudeTest] Using custom Claude path: ${customClaudePath}`);
      // Verify the custom path exists and is executable
      try {
        await fs.promises.access(customClaudePath, fs.constants.X_OK);
        claudePath = customClaudePath;
      } catch (error) {
        console.error(`[ClaudeTest] Custom Claude path is not accessible or not executable: ${customClaudePath}`);
        return { 
          available: false, 
          error: `Custom Claude path is not valid or not executable: ${customClaudePath}` 
        };
      }
    } else {
      claudePath = findExecutableInPath('claude');
    }
    
    if (!claudePath) {
      console.error('[ClaudeTest] Claude executable not found in PATH');
      console.error(`[ClaudeTest] Searched PATH: ${shellPath.substring(0, 500)}...`);
      
      // Also check if claude might be in common locations not in PATH
      console.log('[ClaudeTest] Checking common installation locations...');
      const fallbackPath = await findClaudeExecutable();
      if (fallbackPath) {
        console.log(`[ClaudeTest] Found Claude at ${fallbackPath} (not in PATH)`);
        console.error('[ClaudeTest] Claude is installed but not in PATH. Add it to your PATH environment variable.');
      }
      
      return { 
        available: false, 
        error: 'Claude Code CLI not found in PATH. Please ensure claude is installed and in your PATH.' 
      };
    }
    
    console.log(`[ClaudeTest] Found Claude at: ${claudePath}`);
    
    // Try to get version using the shell PATH
    try {
      const env = { ...process.env, PATH: shellPath };
      const timeout = os.platform() === 'linux' ? 2000 : 5000;  // Shorter timeout for Linux
      console.log(`[ClaudeTest] Running '${claudePath} --version' with timeout ${timeout}ms...`);
      const { stdout } = await execAsync(`${claudePath} --version`, { timeout, env });
      const version = stdout.trim();
      console.log(`[ClaudeTest] Claude version: ${version}`);
      return { available: true, version, path: claudePath };
    } catch (versionError) {
      // Command exists but version failed - might still work
      console.warn(`[ClaudeTest] Version check failed: ${versionError instanceof Error ? versionError.message : versionError}`);
      console.warn('[ClaudeTest] Claude found but version check failed - it might still work');
      return { available: true, error: 'Could not get version info', path: claudePath };
    }
  } catch (error) {
    console.error(`[ClaudeTest] ERROR: Unexpected error during availability check: ${error}`);
    console.error(`[ClaudeTest] Error details: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    return { 
      available: false, 
      error: error instanceof Error ? error.message : 'Unknown error checking Claude Code availability' 
    };
  }
}

export async function testClaudeCodeInDirectory(directory: string, customClaudePath?: string): Promise<{ success: boolean; error?: string; output?: string }> {
  console.log(`[ClaudeTest] Testing Claude in directory: ${directory}`);
  
  try {
    // Use the same enhanced shell PATH that build scripts use
    const shellPath = getShellPath();
    const env = { ...process.env, PATH: shellPath };
    const timeout = os.platform() === 'linux' ? 3000 : 10000;  // Shorter timeout for Linux
    
    // Use custom path if provided, otherwise use 'claude' which will be found in PATH
    const claudeCommand = customClaudePath || 'claude';
    
    console.log(`[ClaudeTest] Running '${claudeCommand} --help' in ${directory} with timeout ${timeout}ms...`);
    const { stdout, stderr } = await execAsync(`"${claudeCommand}" --help`, { 
      cwd: directory,
      timeout,
      env
    });
    console.log('[ClaudeTest] Directory test successful');
    return { success: true, output: stdout + stderr };
  } catch (error) {
    console.error(`[ClaudeTest] Directory test failed: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && 'code' in error) {
      console.error(`[ClaudeTest] Error code: ${(error as NodeJS.ErrnoException).code}`);
    }
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error testing Claude Code in directory',
      output: error instanceof Error && 'stdout' in error ? String((error as Error & {stdout?: string; stderr?: string}).stdout || '') + String((error as Error & {stdout?: string; stderr?: string}).stderr || '') : undefined
    };
  }
}
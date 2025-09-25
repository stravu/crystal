import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ShellDetector } from './shellDetector';

// Try to import app from electron (might not be available in all contexts)
let app: typeof import('electron').app | undefined;
try {
  app = require('electron').app;
} catch {
  // Electron not available (e.g., in worker threads)
  app = undefined;
}

// Try to get config manager for additional paths
let getAdditionalPaths: () => string[] = () => [];
try {
  // Lazy import to avoid circular dependencies
  const getConfigManager = () => {
    try {
      const { configManager } = require('../services/configManager');
      return configManager;
    } catch {
      return null;
    }
  };
  
  getAdditionalPaths = () => {
    const configManager = getConfigManager();
    if (configManager) {
      const config = configManager.getConfig();
      return config?.additionalPaths || [];
    }
    return [];
  };
} catch {
  // ConfigManager not available
}

let cachedPath: string | null = null;
let isFirstCall: boolean = true;

/**
 * Get the path separator for the current platform
 */
function getPathSeparator(): string {
  return process.platform === 'win32' ? ';' : ':';
}

/**
 * Get the user's shell PATH by executing their shell
 */
export function getShellPath(): string {
  // In packaged apps, always refresh PATH on first call to avoid cached restricted PATH
  if (cachedPath && !isFirstCall) {
    console.log('[ShellPath] Using cached PATH');
    return cachedPath;
  }
  isFirstCall = false;

  console.log('[ShellPath] Starting PATH detection...');
  console.log(`[ShellPath] Platform: ${process.platform}`);
  console.log(`[ShellPath] Current process PATH: ${process.env.PATH ? process.env.PATH.substring(0, 200) + '...' : 'not set'}`);
  console.log(`[ShellPath] Shell environment: ${process.env.SHELL || 'not set'}`);
  console.log(`[ShellPath] Home directory: ${os.homedir()}`);

  const isWindows = process.platform === 'win32';
  const pathSep = getPathSeparator();

  try {
    let shellPath: string;
    
    if (isWindows) {
      // On Windows, use cmd.exe to get PATH
      console.log('Getting Windows PATH using cmd.exe');
      
      shellPath = execSync('echo %PATH%', {
        encoding: 'utf8',
        timeout: 5000,
        shell: 'cmd.exe'
      }).trim();
      
      // Also try to get PATH from PowerShell for more complete results
      try {
        const psPath = execSync('powershell -Command "$env:PATH"', {
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        
        if (psPath) {
          // Combine both paths
          const combinedPaths = new Set([
            ...shellPath.split(pathSep),
            ...psPath.split(pathSep)
          ]);
          shellPath = Array.from(combinedPaths).filter(p => p).join(pathSep);
        }
      } catch {
        // PowerShell might not be available, continue with cmd.exe result
      }
    } else {
      // Unix/macOS logic - use ShellDetector to get the actual shell
      const shellInfo = ShellDetector.getDefaultShell();
      const shell = shellInfo.path;
      const isLinux = process.platform === 'linux';
      
      console.log(`[ShellPath] Detected shell: ${shell} (${shellInfo.name})`);
      
      // For Linux, avoid slow interactive shell startup
      // Use non-interactive mode for better performance
      const shellCommand = isLinux 
        ? `${shell} -c 'echo $PATH'`  // Fast non-interactive mode for Linux
        : `${shell} -l -i -c 'echo $PATH'`;  // Keep login shell for macOS
      
      console.log(`[ShellPath] Unix/Linux PATH detection - Shell: ${shell}, isLinux: ${isLinux}`);
      console.log(`[ShellPath] Shell command: ${shellCommand}`);
      
      // Execute the command to get the PATH
      // For packaged apps, ALWAYS use login shell to get the user's real PATH
      const isPackaged = process.env.NODE_ENV === 'production' || 'pkg' in process || app?.isPackaged;
      
      if (isPackaged) {
        console.log('Running in packaged app, using login shell to get full PATH...');
        
        // Use minimal base PATH - just enough to find the shell
        const minimalPath = '/usr/bin:/bin';
        
        // Use login shell to load user's full environment
        try {
          // First try with explicit sourcing of shell config files
          let sourceCommand = '';
          const homeDir = os.homedir();
          
          if (shell.includes('zsh')) {
            // For zsh, source the standard config files
            sourceCommand = `source /etc/zprofile 2>/dev/null || true; ` +
                           `source ${homeDir}/.zprofile 2>/dev/null || true; ` +
                           `source /etc/zshrc 2>/dev/null || true; ` +
                           `source ${homeDir}/.zshrc 2>/dev/null || true; `;
          } else if (shell.includes('bash')) {
            // For bash, source the standard config files
            sourceCommand = `source /etc/profile 2>/dev/null || true; ` +
                           `source ${homeDir}/.bash_profile 2>/dev/null || true; ` +
                           `source ${homeDir}/.bashrc 2>/dev/null || true; `;
          }
          
          const fullCommand = `${shell} -c '${sourceCommand}echo $PATH'`;
          console.log('Executing shell command to get PATH:', fullCommand);
          
          shellPath = execSync(fullCommand, {
            encoding: 'utf8',
            timeout: isLinux ? 3000 : 10000,  // Shorter timeout for Linux
            env: { 
              PATH: minimalPath,
              SHELL: shell,
              USER: os.userInfo().username,
              HOME: homeDir,
              // Add ZDOTDIR for zsh users who might have custom config location
              ZDOTDIR: process.env.ZDOTDIR || homeDir
            }
          }).trim();
          console.log('Successfully loaded user PATH from shell config files');
        } catch (error) {
          console.error('Failed to load PATH from shell config:', error);
          
          // Try the standard login shell approach
          try {
            shellPath = execSync(shellCommand, {
              encoding: 'utf8',
              timeout: isLinux ? 3000 : 10000,  // Shorter timeout for Linux
              env: { 
                PATH: minimalPath,
                SHELL: shell,
                USER: os.userInfo().username,
                HOME: os.homedir()
              }
            }).trim();
            console.log('Loaded PATH using login shell flags');
          } catch (loginError) {
            console.error('Failed to load PATH from login shell:', loginError);
            // Fallback to current PATH + common locations
            shellPath = process.env.PATH || '';
          }
        }
      } else {
        // In development, try faster approach first
        try {
          shellPath = execSync(`${shell} -c 'echo $PATH'`, {
            encoding: 'utf8',
            timeout: 2000,
            env: process.env
          }).trim();
          console.log(`[ShellPath] Quick PATH retrieval succeeded`);
        } catch (quickError) {
          console.log(`[ShellPath] Quick PATH retrieval failed: ${quickError instanceof Error ? quickError.message : quickError}`);
          console.log(`[ShellPath] Falling back to login shell approach...`);
          shellPath = execSync(shellCommand, {
            encoding: 'utf8',
            timeout: isLinux ? 3000 : 10000,  // Shorter timeout for Linux
            env: process.env
          }).trim();
          console.log(`[ShellPath] Login shell PATH retrieval succeeded`);
        }
      }
    }
    
    console.log(`[ShellPath] Retrieved shell PATH (${shellPath.split(pathSep).length} entries): ${shellPath.substring(0, 200)}...`);
    
    // Combine with current process PATH to ensure we don't lose anything
    const currentPath = process.env.PATH || '';
    console.log(`[ShellPath] Current process PATH has ${currentPath.split(pathSep).length} entries`);
    
    // Also include npm global bin directories
    const additionalPaths: string[] = [];
    const isLinux = process.platform === 'linux';
    
    // Skip npm/yarn checks on Linux for better performance (they're usually in PATH already)
    if (!isLinux) {
      console.log(`[ShellPath] Checking for npm/yarn global paths (non-Linux)...`);
      // Try to get npm global bin directory
      try {
        const npmBin = execSync('npm bin -g', { 
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        if (npmBin) additionalPaths.push(npmBin);
      } catch {
        // Ignore npm bin errors
      }
      
      // Try to get yarn global bin directory
      try {
        const yarnBin = execSync('yarn global bin', { 
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        if (yarnBin) additionalPaths.push(yarnBin);
      } catch {
        // Ignore yarn bin errors
      }
    }
    
    if (isWindows) {
      // Windows-specific paths
      additionalPaths.push(
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
        path.join(os.homedir(), 'AppData', 'Local', 'Yarn', 'bin'),
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'bin'),
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Git', 'cmd'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'bin'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Git', 'cmd')
      );
      
      // Check for nvm-windows
      const nvmHome = process.env.NVM_HOME;
      if (nvmHome && fs.existsSync(nvmHome)) {
        additionalPaths.push(nvmHome);
      }
      
      // Check for nvm-windows symlink
      const nvmSymlink = process.env.NVM_SYMLINK;
      if (nvmSymlink && fs.existsSync(nvmSymlink)) {
        additionalPaths.push(nvmSymlink);
      }
    } else {
      // Unix/macOS-specific paths
      additionalPaths.push(
        path.join(os.homedir(), '.yarn', 'bin'),
        path.join(os.homedir(), '.config', 'yarn', 'global', 'node_modules', '.bin')
      );
      
      // Linux-specific common paths
      if (isLinux) {
        const commonLinuxPaths = [
          '/usr/local/bin',
          '/snap/bin',
          path.join(os.homedir(), '.local', 'bin'),
          path.join(os.homedir(), 'bin'),
          '/usr/bin',
          '/bin',
          '/usr/sbin',
          '/sbin'
        ];
        
        // Only add Linux paths that exist and aren't already in PATH
        const existingPaths = new Set([...shellPath.split(pathSep), ...currentPath.split(pathSep)]);
        commonLinuxPaths.forEach(linuxPath => {
          if (!existingPaths.has(linuxPath) && fs.existsSync(linuxPath)) {
            additionalPaths.push(linuxPath);
          }
        });
      }
      
      // Check for nvm directories - look for all versions
      const nvmDir = path.join(os.homedir(), '.nvm/versions/node');
      if (fs.existsSync(nvmDir)) {
        try {
          const versions = fs.readdirSync(nvmDir);
          versions.forEach(version => {
            const binPath = path.join(nvmDir, version, 'bin');
            if (fs.existsSync(binPath)) {
              additionalPaths.push(binPath);
            }
          });
        } catch {
          // Ignore nvm directory read errors
        }
      }
    }
    
    // Add user-configured additional paths
    const userAdditionalPaths = getAdditionalPaths();
    if (userAdditionalPaths.length > 0) {
      console.log(`[ShellPath] Adding ${userAdditionalPaths.length} user-configured paths`);
      // Expand ~ to home directory and Windows environment variables
      const expandedUserPaths = userAdditionalPaths.map(p => {
        // Expand tilde for Unix/macOS
        if (p.startsWith('~')) {
          return path.join(os.homedir(), p.slice(1));
        }
        
        // Expand Windows environment variables like %USERPROFILE%
        if (isWindows && p.includes('%')) {
          return p.replace(/%([^%]+)%/g, (match, envVar) => {
            return process.env[envVar] || match;
          });
        }
        
        return p;
      });
      additionalPaths.push(...expandedUserPaths);
    }
    
    const combinedPaths = new Set([
      ...shellPath.split(pathSep),
      ...currentPath.split(pathSep),
      ...additionalPaths
    ]);
    
    cachedPath = Array.from(combinedPaths).filter(p => p).join(pathSep);
    const pathEntries = cachedPath.split(pathSep);
    console.log(`[ShellPath] Final combined PATH has ${pathEntries.length} entries`);
    console.log(`[ShellPath] Added ${additionalPaths.length} additional paths`);
    console.log(`[ShellPath] First few PATH entries: ${pathEntries.slice(0, 5).join(', ')}`);
    console.log(`[ShellPath] PATH loading completed successfully`);
    
    return cachedPath;
  } catch (error) {
    console.error('[ShellPath] ERROR: Failed to get shell PATH:', error);
    console.error(`[ShellPath] Error details: ${error instanceof Error ? error.stack : 'No stack trace available'}`);
    
    if (!isWindows) {
      // Try alternative method: read shell config files directly (Unix/macOS only)
      console.log('[ShellPath] Attempting fallback: reading shell config files directly...');
      try {
        const homeDir = os.homedir();
        const shellConfigPaths = [
          path.join(homeDir, '.zshrc'),
          path.join(homeDir, '.bashrc'),
          path.join(homeDir, '.bash_profile'),
          path.join(homeDir, '.profile'),
          path.join(homeDir, '.zprofile')
        ];
        
        console.log(`[ShellPath] Checking shell config files: ${shellConfigPaths.join(', ')}`);
        let extractedPaths: string[] = [];
        
        for (const configPath of shellConfigPaths) {
          if (fs.existsSync(configPath)) {
            console.log(`[ShellPath] Reading config file: ${configPath}`);
            const content = fs.readFileSync(configPath, 'utf8');
            // Look for PATH exports
            const pathMatches = content.match(/export\s+PATH=["']?([^"'\n]+)["']?/gm);
            if (pathMatches) {
              console.log(`[ShellPath] Found ${pathMatches.length} PATH exports in ${configPath}`);
              pathMatches.forEach(match => {
                const pathValue = match.replace(/export\s+PATH=["']?/, '').replace(/["']?$/, '');
                // Expand $PATH references
                if (pathValue.includes('$PATH')) {
                  extractedPaths.push(pathValue.replace(/\$PATH/g, process.env.PATH || ''));
                } else {
                  extractedPaths.push(pathValue);
                }
              });
            }
          }
        }
        
        if (extractedPaths.length > 0) {
          console.log(`[ShellPath] Found ${extractedPaths.length} PATH entries from config files`);
          const combinedPaths = new Set(extractedPaths.join(pathSep).split(pathSep).filter(p => p));
          cachedPath = Array.from(combinedPaths).join(pathSep);
          console.log(`[ShellPath] Fallback successful - PATH has ${cachedPath.split(pathSep).length} entries`);
          return cachedPath;
        } else {
          console.log('[ShellPath] No PATH entries found in config files');
        }
      } catch (configError) {
        console.error('[ShellPath] ERROR: Failed to read shell config files:', configError);
        console.error(`[ShellPath] Config error details: ${configError instanceof Error ? configError.stack : 'No stack trace'}`);
      }
    }
    
    // Final fallback to process PATH
    const fallbackPath = isWindows 
      ? process.env.PATH || 'C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem'
      : process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin';
    
    console.error(`[ShellPath] CRITICAL: Using final fallback PATH`);
    console.error(`[ShellPath] Fallback PATH: ${fallbackPath}`);
    console.error(`[ShellPath] This may indicate a serious PATH loading issue on ${process.platform}`);
    
    return fallbackPath;
  }
}

/**
 * Clear the cached PATH (useful for development/testing and config changes)
 */
export function clearShellPathCache(): void {
  cachedPath = null;
  console.log('[ShellPath] PATH cache cleared - will be rebuilt on next access');
}

/**
 * Find an executable in the shell PATH
 */
export function findExecutableInPath(executable: string): string | null {
  console.log(`[ShellPath] Finding executable: ${executable}`);
  const shellPath = getShellPath();
  const pathSep = getPathSeparator();
  const paths = shellPath.split(pathSep);
  const isWindows = process.platform === 'win32';
  
  console.log(`[ShellPath] Searching in ${paths.length} PATH directories`);
  
  // On Windows, executables might have .exe, .cmd, or .bat extensions
  const executableNames = isWindows 
    ? [executable, `${executable}.exe`, `${executable}.cmd`, `${executable}.bat`]
    : [executable];
  
  let searchedPaths = 0;
  for (const dir of paths) {
    for (const execName of executableNames) {
      const fullPath = path.join(dir, execName);
      searchedPaths++;
      try {
        if (isWindows) {
          // On Windows, check if file exists
          fs.accessSync(fullPath, fs.constants.F_OK);
          console.log(`[ShellPath] Found executable at: ${fullPath}`);
          return fullPath;
        } else {
          // On Unix, check if the executable exists and is executable
          execSync(`test -x "${fullPath}"`, { stdio: 'ignore' });
          console.log(`[ShellPath] Found executable at: ${fullPath}`);
          return fullPath;
        }
      } catch {
        // Not found in this directory
      }
    }
  }
  
  console.error(`[ShellPath] Executable '${executable}' not found after searching ${searchedPaths} paths`);
  console.error(`[ShellPath] First few paths searched: ${paths.slice(0, 5).join(', ')}`);
  return null;
}
import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// Try to import app from electron (might not be available in all contexts)
let app: any;
try {
  app = require('electron').app;
} catch {
  // Electron not available (e.g., in worker threads)
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
    return cachedPath;
  }
  isFirstCall = false;

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
      // Unix/macOS logic
      const shell = process.env.SHELL || '/bin/bash';
      
      // Execute the shell to get the PATH
      // Use -l for login shell to ensure all PATH modifications are loaded
      // Use -i for interactive shell to load .bashrc/.zshrc
      const shellCommand = `${shell} -l -i -c 'echo $PATH'`;
      
      console.log('Getting shell PATH using command:', shellCommand);
      
      // Execute the command to get the PATH
      // For packaged apps, ALWAYS use login shell to get the user's real PATH
      const isPackaged = process.env.NODE_ENV === 'production' || (process as any).pkg || app?.isPackaged;
      
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
            timeout: 10000,
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
              timeout: 10000,
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
        } catch (quickError) {
          console.log('Quick PATH retrieval failed, trying with login shell...');
          shellPath = execSync(shellCommand, {
            encoding: 'utf8',
            timeout: 10000,
            env: process.env
          }).trim();
        }
      }
    }
    
    console.log('Shell PATH result:', shellPath);
    
    // Combine with current process PATH to ensure we don't lose anything
    const currentPath = process.env.PATH || '';
    
    // Also include npm global bin directories
    const additionalPaths: string[] = [];
    
    // Try to get npm global bin directory
    try {
      const npmBin = execSync('npm bin -g', { encoding: 'utf8' }).trim();
      if (npmBin) additionalPaths.push(npmBin);
    } catch {
      // Ignore npm bin errors
    }
    
    // Try to get yarn global bin directory
    try {
      const yarnBin = execSync('yarn global bin', { encoding: 'utf8' }).trim();
      if (yarnBin) additionalPaths.push(yarnBin);
    } catch {
      // Ignore yarn bin errors
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
    
    const combinedPaths = new Set([
      ...shellPath.split(pathSep),
      ...currentPath.split(pathSep),
      ...additionalPaths
    ]);
    
    cachedPath = Array.from(combinedPaths).filter(p => p).join(pathSep);
    console.log('Shell PATH loaded:', cachedPath);
    
    return cachedPath;
  } catch (error) {
    console.error('Failed to get shell PATH:', error);
    
    if (!isWindows) {
      // Try alternative method: read shell config files directly (Unix/macOS only)
      try {
        const homeDir = os.homedir();
        const shellConfigPaths = [
          path.join(homeDir, '.zshrc'),
          path.join(homeDir, '.bashrc'),
          path.join(homeDir, '.bash_profile'),
          path.join(homeDir, '.profile'),
          path.join(homeDir, '.zprofile')
        ];
        
        let extractedPaths: string[] = [];
        
        for (const configPath of shellConfigPaths) {
          if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            // Look for PATH exports
            const pathMatches = content.match(/export\s+PATH=["']?([^"'\n]+)["']?/gm);
            if (pathMatches) {
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
          console.log('Found PATH in shell config files');
          const combinedPaths = new Set(extractedPaths.join(pathSep).split(pathSep).filter(p => p));
          cachedPath = Array.from(combinedPaths).join(pathSep);
          return cachedPath;
        }
      } catch (configError) {
        console.error('Failed to read shell config files:', configError);
      }
    }
    
    // Final fallback to process PATH
    if (isWindows) {
      return process.env.PATH || 'C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem';
    } else {
      return process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin';
    }
  }
}

/**
 * Clear the cached PATH (useful for development/testing)
 */
export function clearShellPathCache(): void {
  cachedPath = null;
}

/**
 * Find an executable in the shell PATH
 */
export function findExecutableInPath(executable: string): string | null {
  const shellPath = getShellPath();
  const pathSep = getPathSeparator();
  const paths = shellPath.split(pathSep);
  const isWindows = process.platform === 'win32';
  
  // On Windows, executables might have .exe, .cmd, or .bat extensions
  const executableNames = isWindows 
    ? [executable, `${executable}.exe`, `${executable}.cmd`, `${executable}.bat`]
    : [executable];
  
  for (const dir of paths) {
    for (const execName of executableNames) {
      const fullPath = path.join(dir, execName);
      try {
        if (isWindows) {
          // On Windows, check if file exists
          fs.accessSync(fullPath, fs.constants.F_OK);
          return fullPath;
        } else {
          // On Unix, check if the executable exists and is executable
          execSync(`test -x "${fullPath}"`, { stdio: 'ignore' });
          return fullPath;
        }
      } catch {
        // Not found in this directory
      }
    }
  }
  
  return null;
}
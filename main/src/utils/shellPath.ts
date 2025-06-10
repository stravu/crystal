import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let cachedPath: string | null = null;

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
  if (cachedPath) {
    return cachedPath;
  }

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
      shellPath = execSync(shellCommand, {
        encoding: 'utf8',
        timeout: 5000,
        // Important: In packaged Electron apps, we need to ensure we're not inheriting a restricted PATH
        env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin' }
      }).trim();
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
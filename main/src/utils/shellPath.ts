import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

let cachedPath: string | null = null;

/**
 * Get the user's shell PATH by executing their shell
 */
export function getShellPath(): string {
  if (cachedPath) {
    return cachedPath;
  }

  try {
    // Determine the user's shell
    const shell = process.env.SHELL || '/bin/bash';
    
    // Execute the shell to get the PATH
    // Use -l for login shell to ensure all PATH modifications are loaded
    const shellCommand = `${shell} -l -c 'echo $PATH'`;
    
    // Execute the command to get the PATH
    const shellPath = execSync(shellCommand, {
      encoding: 'utf8',
      timeout: 5000
    }).trim();
    
    // Combine with current process PATH to ensure we don't lose anything
    const currentPath = process.env.PATH || '';
    
    // Also include npm global bin directories
    const additionalPaths: string[] = [];
    
    // Try to get npm global bin directory
    try {
      const npmBin = execSync('npm bin -g', { encoding: 'utf8' }).trim();
      if (npmBin) additionalPaths.push(npmBin);
    } catch {}
    
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
      } catch {}
    }
    
    const combinedPaths = new Set([
      ...shellPath.split(':'),
      ...currentPath.split(':'),
      ...additionalPaths
    ]);
    
    cachedPath = Array.from(combinedPaths).filter(p => p).join(':');
    console.log('Shell PATH loaded:', cachedPath);
    
    return cachedPath;
  } catch (error) {
    console.error('Failed to get shell PATH:', error);
    // Fallback to process PATH
    return process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin';
  }
}

/**
 * Find an executable in the shell PATH
 */
export function findExecutableInPath(executable: string): string | null {
  const shellPath = getShellPath();
  const paths = shellPath.split(':');
  
  for (const dir of paths) {
    const fullPath = path.join(dir, executable);
    try {
      // Check if the executable exists and is executable
      execSync(`test -x "${fullPath}"`, { stdio: 'ignore' });
      return fullPath;
    } catch {
      // Not found in this directory
    }
  }
  
  return null;
}
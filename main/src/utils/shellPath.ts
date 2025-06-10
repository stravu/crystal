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
    // Use -i for interactive shell to load .bashrc/.zshrc
    const shellCommand = `${shell} -l -i -c 'echo $PATH'`;
    
    console.log('Getting shell PATH using command:', shellCommand);
    
    // Execute the command to get the PATH
    const shellPath = execSync(shellCommand, {
      encoding: 'utf8',
      timeout: 5000,
      // Important: In packaged Electron apps, we need to ensure we're not inheriting a restricted PATH
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin' }
    }).trim();
    
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
    
    // Add common yarn paths
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
    
    // Try alternative method: read shell config files directly
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
        const combinedPaths = new Set(extractedPaths.join(':').split(':').filter(p => p));
        cachedPath = Array.from(combinedPaths).join(':');
        return cachedPath;
      }
    } catch (configError) {
      console.error('Failed to read shell config files:', configError);
    }
    
    // Final fallback to process PATH
    return process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin';
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
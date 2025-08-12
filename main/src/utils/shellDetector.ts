import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

interface ShellInfo {
  path: string;
  name: string;
  args?: string[];
}

/**
 * Detects the user's default shell in a robust, cross-platform way
 */
export class ShellDetector {
  /**
   * Get the user's default shell
   * @param forceRefresh Ignored - kept for compatibility
   * @returns Shell information including path and name
   */
  static getDefaultShell(forceRefresh = false): ShellInfo {
    return this.detectShell();
  }

  private static detectShell(): ShellInfo {
    const platform = process.platform;

    if (platform === 'win32') {
      return this.detectWindowsShell();
    } else {
      return this.detectUnixShell();
    }
  }

  private static detectWindowsShell(): ShellInfo {
    // First try PowerShell Core (pwsh.exe) - the modern PowerShell
    const pwshPaths = [
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PowerShell', '6', 'pwsh.exe'),
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Program Files\\PowerShell\\6\\pwsh.exe'
    ];
    
    for (const pwshPath of pwshPaths) {
      if (fs.existsSync(pwshPath)) {
        return { path: pwshPath, name: 'pwsh' };
      }
    }
    
    // Fall back to Windows PowerShell if Core isn't installed
    const powershellPath = path.join(
      process.env.SYSTEMROOT || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    
    if (fs.existsSync(powershellPath)) {
      return { path: powershellPath, name: 'powershell' };
    }
    
    // Last resort: cmd.exe
    const cmdPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'cmd.exe');
    return { path: cmdPath, name: 'cmd' };
  }

  private static detectUnixShell(): ShellInfo {
    // First, try the SHELL environment variable
    const envShell = process.env.SHELL;
    if (envShell && fs.existsSync(envShell)) {
      const name = path.basename(envShell);
      return { path: envShell, name, args: this.getShellArgs(name) };
    }

    // On macOS, try to get the default shell from Directory Services
    if (process.platform === 'darwin') {
      try {
        const username = os.userInfo().username;
        const result = execSync(`dscl . -read /Users/${username} UserShell`, { encoding: 'utf8' });
        const match = result.match(/UserShell:\s*(.+)/);
        if (match && match[1]) {
          const shellPath = match[1].trim();
          if (fs.existsSync(shellPath)) {
            const name = path.basename(shellPath);
            return { path: shellPath, name, args: this.getShellArgs(name) };
          }
        }
      } catch (error) {
        // Ignore errors and continue with fallback detection
      }
    }

    // Try to read from /etc/passwd
    try {
      const username = os.userInfo().username;
      const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
      const userLine = passwdContent.split('\n').find(line => line.startsWith(`${username}:`));
      if (userLine) {
        const parts = userLine.split(':');
        const shellPath = parts[6];
        if (shellPath && fs.existsSync(shellPath)) {
          const name = path.basename(shellPath);
          return { path: shellPath, name, args: this.getShellArgs(name) };
        }
      }
    } catch (error) {
      // Ignore errors and continue with fallback detection
    }

    // Try common shell paths in order of preference
    const commonShells = [
      '/usr/local/bin/zsh',
      '/bin/zsh',
      '/usr/bin/zsh',
      '/usr/local/bin/fish',
      '/usr/bin/fish',
      '/usr/local/bin/bash',
      '/bin/bash',
      '/usr/bin/bash',
      '/bin/sh',
      '/usr/bin/sh'
    ];

    for (const shellPath of commonShells) {
      if (fs.existsSync(shellPath)) {
        const name = path.basename(shellPath);
        return { path: shellPath, name, args: this.getShellArgs(name) };
      }
    }

    // Last resort - use sh
    return { path: '/bin/sh', name: 'sh', args: ['-i'] };
  }

  private static findExecutable(name: string): string | null {
    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter);

    for (const dir of pathDirs) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) {
        try {
          // On Windows, fs.constants.X_OK doesn't work properly
          // Just check if the file exists
          if (process.platform === 'win32') {
            fs.accessSync(fullPath, fs.constants.F_OK);
            return fullPath;
          } else {
            fs.accessSync(fullPath, fs.constants.X_OK);
            return fullPath;
          }
        } catch {
          // Not accessible, continue searching
        }
      }
    }

    return null;
  }

  private static getShellArgs(shellName: string): string[] {
    // Return appropriate arguments for interactive shell sessions
    switch (shellName) {
      case 'bash':
      case 'sh':
      case 'zsh':
      case 'fish':
        return ['-i']; // Interactive mode
      case 'pwsh':
      case 'powershell':
        return ['-NoExit']; // Keep PowerShell open
      default:
        return [];
    }
  }

  /**
   * Get shell-specific command execution arguments
   * @param command The command to execute
   * @returns Array of arguments to pass to spawn/exec
   */
  static getShellCommandArgs(command: string): { shell: string; args: string[] } {
    const shellInfo = this.getDefaultShell();
    
    switch (shellInfo.name) {
      case 'cmd':
        return { shell: shellInfo.path, args: ['/c', command] };
      case 'powershell':
      case 'pwsh':
        return { shell: shellInfo.path, args: ['-Command', command] };
      default:
        // Unix shells
        return { shell: shellInfo.path, args: ['-c', command] };
    }
  }

  /**
   * Check if a shell exists at the given path
   * @param shellPath Path to the shell executable
   * @returns true if the shell exists and is executable
   */
  static isShellAvailable(shellPath: string): boolean {
    try {
      // On Windows, fs.constants.X_OK doesn't work properly
      // Just check if the file exists
      if (process.platform === 'win32') {
        fs.accessSync(shellPath, fs.constants.F_OK);
      } else {
        fs.accessSync(shellPath, fs.constants.X_OK);
      }
      return true;
    } catch {
      return false;
    }
  }
}
import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { getShellPath } from '../utils/shellPath';
import { ShellDetector } from '../utils/shellDetector';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

interface TerminalSession {
  pty: pty.IPty;
  sessionId: string;
  cwd: string;
}

export class TerminalSessionManager extends EventEmitter {
  private terminalSessions: Map<string, TerminalSession> = new Map();
  
  constructor() {
    super();
    // Increase max listeners to prevent warnings when many components listen to events
    this.setMaxListeners(50);
  }

  async createTerminalSession(sessionId: string, worktreePath: string): Promise<void> {
    // Check if session already exists
    if (this.terminalSessions.has(sessionId)) {
      console.log(`Terminal session ${sessionId} already exists, skipping creation`);
      return;
    }

    // For Linux, use the current PATH to avoid slow shell detection
    const isLinux = process.platform === 'linux';
    const shellPath = isLinux ? (process.env.PATH || '') : getShellPath();
    
    // Get the user's default shell
    const shellInfo = ShellDetector.getDefaultShell();
    console.log(`Using shell: ${shellInfo.path} (${shellInfo.name})`);
    
    // Create a new PTY instance with proper terminal settings
    const ptyProcess = pty.spawn(shellInfo.path, shellInfo.args || [], {
      name: 'xterm-256color',  // Better terminal emulation
      cwd: worktreePath,
      cols: 80,
      rows: 24,
      env: {
        ...process.env,
        PATH: shellPath,
        WORKTREE_PATH: worktreePath,
        TERM: 'xterm-256color',  // Ensure TERM is set for color support
        COLORTERM: 'truecolor',  // Enable 24-bit color
        LANG: process.env.LANG || 'en_US.UTF-8',  // Set locale for proper character handling
      },
    });

    // Store the session
    this.terminalSessions.set(sessionId, {
      pty: ptyProcess,
      sessionId,
      cwd: worktreePath,
    });

    // Handle data from the PTY
    ptyProcess.onData((data: string) => {
      this.emit('terminal-output', { sessionId, data, type: 'stdout' });
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      console.log(`Terminal session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      this.terminalSessions.delete(sessionId);
    });

    // Send a newline to trigger the shell prompt to appear
    // This ensures the terminal shows output immediately when opened
    setTimeout(() => {
      ptyProcess.write('\r');
    }, 50);
  }

  sendCommand(sessionId: string, command: string): void {
    const session = this.terminalSessions.get(sessionId);
    if (!session) {
      throw new Error('Terminal session not found');
    }

    // Send the command to the PTY
    session.pty.write(command + '\r');
  }

  sendInput(sessionId: string, data: string): void {
    const session = this.terminalSessions.get(sessionId);
    if (!session) {
      throw new Error('Terminal session not found');
    }

    // Send raw input directly to the PTY without modification
    session.pty.write(data);
  }

  resizeTerminal(sessionId: string, cols: number, rows: number): void {
    const session = this.terminalSessions.get(sessionId);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  async closeTerminalSession(sessionId: string): Promise<void> {
    const session = this.terminalSessions.get(sessionId);
    if (session) {
      try {
        const pid = session.pty.pid;
        console.log(`Closing terminal session ${sessionId} with PID ${pid}`);
        
        // Kill the process tree to ensure all child processes are terminated
        if (pid) {
          const success = await this.killProcessTree(pid);
          if (!success) {
            // Emit warning about zombie processes
            this.emit('zombie-processes-detected', {
              sessionId,
              message: `Warning: Some child processes could not be terminated. Check system process list.`
            });
          }
        }
        
        // Also try to kill via pty interface as fallback
        try {
          session.pty.kill();
        } catch (error) {
          // PTY might already be dead
        }
      } catch (error) {
        console.warn(`Error killing terminal session ${sessionId}:`, error);
      }
      this.terminalSessions.delete(sessionId);
    }
  }

  hasSession(sessionId: string): boolean {
    return this.terminalSessions.has(sessionId);
  }

  async cleanup(): Promise<void> {
    // Close all terminal sessions
    const closePromises = [];
    for (const sessionId of this.terminalSessions.keys()) {
      closePromises.push(this.closeTerminalSession(sessionId));
    }
    await Promise.all(closePromises);
  }

  /**
   * Get all descendant PIDs of a parent process recursively
   * This is critical for ensuring all child processes are killed
   */
  private getAllDescendantPids(parentPid: number): number[] {
    const descendants: number[] = [];
    const platform = os.platform();
    
    try {
      if (platform === 'win32') {
        // Windows: Use WMIC to get child processes
        const result = require('child_process').execSync(
          `wmic process where (ParentProcessId=${parentPid}) get ProcessId`,
          { encoding: 'utf8' }
        );
        
        const lines = result.split('\n').filter((line: string) => line.trim());
        for (let i = 1; i < lines.length; i++) { // Skip header
          const pid = parseInt(lines[i].trim());
          if (!isNaN(pid) && pid !== parentPid) {
            descendants.push(pid);
            // Recursively get children of this process
            descendants.push(...this.getAllDescendantPids(pid));
          }
        }
      } else {
        // Unix/Linux/macOS: Use ps command
        const result = require('child_process').execSync(
          `ps -o pid= --ppid ${parentPid} 2>/dev/null || true`,
          { encoding: 'utf8' }
        );
        
        const pids = result.split('\n')
          .map((line: string) => parseInt(line.trim()))
          .filter((pid: number) => !isNaN(pid) && pid !== parentPid);
        
        for (const pid of pids) {
          descendants.push(pid);
          // Recursively get children of this process
          descendants.push(...this.getAllDescendantPids(pid));
        }
      }
    } catch (error) {
      console.warn(`Error getting descendant PIDs for ${parentPid}:`, error);
    }
    
    // Remove duplicates
    return [...new Set(descendants)];
  }

  /**
   * Kill a process and all its descendants
   * Returns true if successful, false if zombie processes remain
   */
  private async killProcessTree(pid: number): Promise<boolean> {
    const platform = os.platform();
    const execAsync = promisify(exec);
    
    // First, get all descendant PIDs before we start killing
    const descendantPids = this.getAllDescendantPids(pid);
    console.log(`Found ${descendantPids.length} descendant processes for PID ${pid}: ${descendantPids.join(', ')}`);
    
    let success = true;
    
    try {
      if (platform === 'win32') {
        // On Windows, use taskkill to terminate the process tree
        try {
          await execAsync(`taskkill /F /T /PID ${pid}`);
          console.log(`Successfully killed Windows process tree ${pid}`);
        } catch (error) {
          console.warn(`Error killing Windows process tree: ${error}`);
          // Fallback: kill descendants individually
          for (const childPid of descendantPids) {
            try {
              await execAsync(`taskkill /F /PID ${childPid}`);
            } catch (e) {
              // Process might already be dead
            }
          }
        }
      } else {
        // On Unix-like systems (macOS, Linux)
        // First, try SIGTERM for graceful shutdown
        try {
          process.kill(pid, 'SIGTERM');
        } catch (error) {
          console.warn('SIGTERM failed:', error);
        }
        
        // Kill the entire process group using negative PID
        // First, find the actual process group ID
        let pgid = pid;
        try {
          const pgidResult = await execAsync(`ps -o pgid= -p ${pid} 2>/dev/null || echo ""`);
          const foundPgid = parseInt(pgidResult.stdout.trim());
          if (!isNaN(foundPgid)) {
            pgid = foundPgid;
            console.log(`Process ${pid} is in process group ${pgid}`);
          }
        } catch (error) {
          // Use original PID as fallback
        }
        
        try {
          await execAsync(`kill -TERM -${pgid}`);
          console.log(`Sent SIGTERM to process group ${pgid}`);
        } catch (error) {
          console.warn(`Error sending SIGTERM to process group: ${error}`);
        }
        
        // Give processes 10 seconds to clean up gracefully
        console.log(`Waiting 10 seconds for graceful shutdown of terminal process ${pid}...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Now forcefully kill the main process
        try {
          process.kill(pid, 'SIGKILL');
        } catch (error) {
          // Process might already be dead
        }
        
        // Kill the process group with SIGKILL
        try {
          await execAsync(`kill -9 -${pgid}`);
          console.log(`Sent SIGKILL to process group ${pgid}`);
        } catch (error) {
          console.warn(`Error sending SIGKILL to process group: ${error}`);
        }
        
        // Kill all known descendants individually to be sure
        for (const childPid of descendantPids) {
          try {
            await execAsync(`kill -9 ${childPid}`);
            console.log(`Killed descendant process ${childPid}`);
          } catch (error) {
            console.log(`Process ${childPid} already terminated`);
          }
        }
        
        // Final cleanup attempt using pkill
        try {
          await execAsync(`pkill -9 -P ${pid}`);
        } catch (error) {
          // Ignore errors - processes might already be dead
        }
      }
      
      // Verify all processes are actually dead
      await new Promise(resolve => setTimeout(resolve, 500));
      const remainingPids = this.getAllDescendantPids(pid);
      
      if (remainingPids.length > 0) {
        console.error(`WARNING: ${remainingPids.length} zombie processes remain: ${remainingPids.join(', ')}`);
        success = false;
        
        // Emit error event so UI can show warning
        this.emit('zombie-processes-detected', {
          sessionId: null,
          pids: remainingPids,
          message: `Failed to terminate ${remainingPids.length} child processes. Please manually kill PIDs: ${remainingPids.join(', ')}`
        });
      }
    } catch (error) {
      console.error('Error in killProcessTree:', error);
      success = false;
    }
    
    return success;
  }
}
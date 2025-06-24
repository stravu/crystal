import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { getShellPath } from '../utils/shellPath';

interface TerminalSession {
  pty: pty.IPty;
  sessionId: string;
  cwd: string;
}

export class TerminalSessionManager extends EventEmitter {
  private terminalSessions: Map<string, TerminalSession> = new Map();
  
  constructor() {
    super();
  }

  async createTerminalSession(sessionId: string, worktreePath: string): Promise<void> {
    // Clean up any existing session
    this.closeTerminalSession(sessionId);

    // Platform-specific shell and PATH handling
    const isWindows = process.platform === 'win32';
    const isLinux = process.platform === 'linux';
    
    let shell: string;
    let shellPath: string;
    
    if (isWindows) {
      // On Windows, prefer PowerShell but fall back to cmd.exe
      shell = process.env.COMSPEC || 'cmd.exe';
      shellPath = getShellPath();
    } else if (isLinux) {
      // For Linux, use current PATH to avoid slow shell detection
      shell = process.env.SHELL || '/bin/bash';
      shellPath = process.env.PATH || '';
    } else {
      // macOS and other Unix-like systems
      shell = process.env.SHELL || '/bin/bash';
      shellPath = getShellPath();
    }
    
    // Create a new PTY instance
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cwd: worktreePath,
      env: {
        ...process.env,
        PATH: shellPath,
        WORKTREE_PATH: worktreePath,
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
  }

  sendCommand(sessionId: string, command: string): void {
    const session = this.terminalSessions.get(sessionId);
    if (!session) {
      throw new Error('Terminal session not found');
    }

    // Send the command to the PTY
    session.pty.write(command + '\r');
  }

  resizeTerminal(sessionId: string, cols: number, rows: number): void {
    const session = this.terminalSessions.get(sessionId);
    if (session) {
      session.pty.resize(cols, rows);
    }
  }

  closeTerminalSession(sessionId: string): void {
    const session = this.terminalSessions.get(sessionId);
    if (session) {
      try {
        session.pty.kill();
      } catch (error) {
        console.warn(`Error killing terminal session ${sessionId}:`, error);
      }
      this.terminalSessions.delete(sessionId);
    }
  }

  hasSession(sessionId: string): boolean {
    return this.terminalSessions.has(sessionId);
  }

  cleanup(): void {
    // Close all terminal sessions
    for (const sessionId of this.terminalSessions.keys()) {
      this.closeTerminalSession(sessionId);
    }
  }
}
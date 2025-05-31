import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as pty from 'node-pty';

interface ClaudeCodeProcess {
  process: pty.IPty;
  sessionId: string;
  worktreePath: string;
}

export class ClaudeCodeManager extends EventEmitter {
  private processes: Map<string, ClaudeCodeProcess> = new Map();

  constructor() {
    super();
  }

  async spawnClaudeCode(sessionId: string, worktreePath: string, prompt: string): Promise<void> {
    try {
      const ptyProcess = pty.spawn('claude-code', ['--prompt', prompt], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: worktreePath,
        env: process.env as { [key: string]: string }
      });

      const claudeProcess: ClaudeCodeProcess = {
        process: ptyProcess,
        sessionId,
        worktreePath
      };

      this.processes.set(sessionId, claudeProcess);

      ptyProcess.onData((data: string) => {
        this.emit('output', {
          sessionId,
          type: 'stdout',
          data,
          timestamp: new Date()
        });
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        this.emit('exit', {
          sessionId,
          exitCode,
          signal
        });
        this.processes.delete(sessionId);
      });

      this.emit('spawned', { sessionId });
    } catch (error) {
      this.emit('error', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  sendInput(sessionId: string, input: string): void {
    const claudeProcess = this.processes.get(sessionId);
    if (!claudeProcess) {
      throw new Error(`No Claude Code process found for session ${sessionId}`);
    }

    claudeProcess.process.write(input);
  }

  killProcess(sessionId: string): void {
    const claudeProcess = this.processes.get(sessionId);
    if (!claudeProcess) {
      return;
    }

    claudeProcess.process.kill();
    this.processes.delete(sessionId);
  }

  getProcess(sessionId: string): ClaudeCodeProcess | undefined {
    return this.processes.get(sessionId);
  }

  getAllProcesses(): string[] {
    return Array.from(this.processes.keys());
  }
}
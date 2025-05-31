import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { Logger } from '../utils/logger.js';

interface ClaudeCodeProcess {
  process: pty.IPty;
  sessionId: string;
  worktreePath: string;
}

export class ClaudeCodeManager extends EventEmitter {
  private processes: Map<string, ClaudeCodeProcess> = new Map();

  constructor(private logger?: Logger) {
    super();
  }

  async spawnClaudeCode(sessionId: string, worktreePath: string, prompt: string): Promise<void> {
    try {
      this.logger?.verbose(`Spawning Claude Code for session ${sessionId} in ${worktreePath}`);
      this.logger?.verbose(`Command: claude-code --prompt "${prompt}"`);
      
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
      this.logger?.verbose(`Claude Code process created for session ${sessionId}`);

      ptyProcess.onData((data: string) => {
        this.logger?.verbose(`Output from session ${sessionId}: ${data.substring(0, 100)}...`);
        this.emit('output', {
          sessionId,
          type: 'stdout',
          data,
          timestamp: new Date()
        });
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        this.logger?.info(`Claude Code process exited for session ${sessionId}. Exit code: ${exitCode}, Signal: ${signal}`);
        this.emit('exit', {
          sessionId,
          exitCode,
          signal
        });
        this.processes.delete(sessionId);
      });

      this.emit('spawned', { sessionId });
      this.logger?.info(`Claude Code spawned successfully for session ${sessionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to spawn Claude Code for session ${sessionId}`, error instanceof Error ? error : undefined);
      
      this.emit('error', {
        sessionId,
        error: errorMessage
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
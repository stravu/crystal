import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import type { Logger } from '../utils/logger.js';
import { testClaudeCodeAvailability, testClaudeCodeInDirectory } from '../utils/claudeCodeTest.js';

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
      this.logger?.verbose(`Spawning Claude for session ${sessionId} in ${worktreePath}`);
      this.logger?.verbose(`Command: claude -p "${prompt}"`);
      this.logger?.verbose(`Working directory: ${worktreePath}`);
      
      // Test if claude-code command exists and works
      const availability = await testClaudeCodeAvailability();
      if (!availability.available) {
        this.logger?.error(`Claude Code not available: ${availability.error}`);
        throw new Error(`Claude Code CLI not available: ${availability.error}`);
      }
      this.logger?.verbose(`Claude found: ${availability.version || 'version unknown'}`);
      
      // Test claude in the target directory
      const directoryTest = await testClaudeCodeInDirectory(worktreePath);
      if (!directoryTest.success) {
        this.logger?.error(`Claude test failed in directory ${worktreePath}: ${directoryTest.error}`);
        if (directoryTest.output) {
          this.logger?.error(`Claude output: ${directoryTest.output}`);
        }
      } else {
        this.logger?.verbose(`Claude works in target directory`);
      }
      
      const ptyProcess = pty.spawn('claude', ['-p', prompt, '--verbose'], {
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

      let hasReceivedOutput = false;
      let lastOutput = '';

      ptyProcess.onData((data: string) => {
        hasReceivedOutput = true;
        lastOutput += data;
        this.logger?.verbose(`Output from session ${sessionId}: ${data.substring(0, 200)}`);
        this.emit('output', {
          sessionId,
          type: 'stdout',
          data,
          timestamp: new Date()
        });
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        if (exitCode !== 0) {
          this.logger?.error(`Claude process failed for session ${sessionId}. Exit code: ${exitCode}, Signal: ${signal}`);
          if (!hasReceivedOutput) {
            this.logger?.error(`No output received from Claude. This might indicate a startup failure.`);
          } else {
            this.logger?.error(`Last output from Claude: ${lastOutput.substring(-500)}`);
          }
        } else {
          this.logger?.info(`Claude process exited normally for session ${sessionId}`);
        }
        
        this.emit('exit', {
          sessionId,
          exitCode,
          signal
        });
        this.processes.delete(sessionId);
      });

      this.emit('spawned', { sessionId });
      this.logger?.info(`Claude spawned successfully for session ${sessionId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to spawn Claude for session ${sessionId}`, error instanceof Error ? error : undefined);
      
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
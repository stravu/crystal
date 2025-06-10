import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import type { Logger } from '../utils/logger';
import type { DatabaseService } from '../database/database';
import type { ProjectRunCommand } from '../database/models';

interface RunProcess {
  process: pty.IPty;
  command: ProjectRunCommand;
  sessionId: string;
}

export class RunCommandManager extends EventEmitter {
  private processes: Map<string, RunProcess[]> = new Map();

  constructor(
    private databaseService: DatabaseService,
    private logger?: Logger
  ) {
    super();
  }

  async startRunCommands(sessionId: string, projectId: number, worktreePath: string): Promise<void> {
    try {
      // Get all run commands for the project
      const runCommands = this.databaseService.getProjectRunCommands(projectId);
      
      if (runCommands.length === 0) {
        this.logger?.info(`No run commands configured for project ${projectId}`);
        return;
      }

      this.logger?.info(`Starting ${runCommands.length} run commands for session ${sessionId}`);
      
      const processes: RunProcess[] = [];

      for (const command of runCommands) {
        try {
          this.logger?.verbose(`Starting run command: ${command.display_name || command.command}`);
          
          const ptyProcess = pty.spawn('/bin/sh', ['-c', command.command], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: worktreePath,
            env: process.env as { [key: string]: string }
          });

          const runProcess: RunProcess = {
            process: ptyProcess,
            command,
            sessionId
          };

          processes.push(runProcess);

          // Handle output from the run command
          ptyProcess.onData((data: string) => {
            this.emit('output', {
              sessionId,
              commandId: command.id,
              displayName: command.display_name || command.command,
              type: 'stdout',
              data,
              timestamp: new Date()
            });
          });

          ptyProcess.onExit(({ exitCode, signal }) => {
            this.logger?.info(`Run command exited: ${command.display_name || command.command}, exitCode: ${exitCode}, signal: ${signal}`);
            
            this.emit('exit', {
              sessionId,
              commandId: command.id,
              displayName: command.display_name || command.command,
              exitCode,
              signal
            });

            // Remove from processes array
            const sessionProcesses = this.processes.get(sessionId);
            if (sessionProcesses) {
              const index = sessionProcesses.indexOf(runProcess);
              if (index > -1) {
                sessionProcesses.splice(index, 1);
              }
            }
          });

          this.logger?.info(`Started run command successfully: ${command.display_name || command.command}`);
        } catch (error) {
          this.logger?.error(`Failed to start run command: ${command.display_name || command.command}`, error as Error);
          this.emit('error', {
            sessionId,
            commandId: command.id,
            displayName: command.display_name || command.command,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      this.processes.set(sessionId, processes);
      this.logger?.info(`All run commands started for session ${sessionId}`);
    } catch (error) {
      this.logger?.error(`Failed to start run commands for session ${sessionId}`, error as Error);
      throw error;
    }
  }

  stopRunCommands(sessionId: string): void {
    const processes = this.processes.get(sessionId);
    if (!processes || processes.length === 0) {
      return;
    }

    this.logger?.info(`Stopping ${processes.length} run commands for session ${sessionId}`);

    for (const runProcess of processes) {
      try {
        runProcess.process.kill();
        this.logger?.verbose(`Killed run command: ${runProcess.command.display_name || runProcess.command.command}`);
      } catch (error) {
        this.logger?.error(`Failed to kill run command: ${runProcess.command.display_name || runProcess.command.command}`, error as Error);
      }
    }

    this.processes.delete(sessionId);
  }

  stopAllRunCommands(): void {
    for (const [sessionId, processes] of this.processes) {
      this.stopRunCommands(sessionId);
    }
  }
}
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
        this.logger?.info(`No RUN commands configured for project ${projectId}`);
        return;
      }

      this.logger?.info(`Starting ${runCommands.length} RUN commands sequentially for session ${sessionId}`);
      
      const processes: RunProcess[] = [];

      // Execute commands sequentially
      for (let i = 0; i < runCommands.length; i++) {
        const command = runCommands[i];
        
        try {
          this.logger?.verbose(`Starting RUN command ${i + 1}/${runCommands.length}: ${command.display_name || command.command}`);
          
          // Create environment with WORKTREE_PATH
          const env = Object.assign({}, process.env, {
            WORKTREE_PATH: worktreePath
          });
          
          
          // For debugging, let's prepend the environment variable to the command
          const commandWithEnv = `export WORKTREE_PATH="${worktreePath}" && ${command.command}`;
          
          // Spawn the shell process
          const ptyProcess = pty.spawn('/bin/sh', ['-c', commandWithEnv], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: worktreePath,
            env: process.env as any
          });

          const runProcess: RunProcess = {
            process: ptyProcess,
            command,
            sessionId
          };

          // Store the process immediately so it can be stopped if needed
          const currentProcesses = this.processes.get(sessionId) || [];
          currentProcesses.push(runProcess);
          this.processes.set(sessionId, currentProcesses);

          // Wait for this command to complete before starting the next one
          await new Promise<void>((resolve, reject) => {
            let hasExited = false;

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
              hasExited = true;
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

              // Only continue to next command if this one succeeded
              if (exitCode === 0) {
                resolve();
              } else {
                reject(new Error(`Command failed with exit code ${exitCode}`));
              }
            });
          });

          this.logger?.info(`Completed run command successfully: ${command.display_name || command.command}`);
        } catch (error) {
          this.logger?.error(`Failed to run command: ${command.display_name || command.command}`, error as Error);
          this.emit('error', {
            sessionId,
            commandId: command.id,
            displayName: command.display_name || command.command,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // Stop execution of subsequent commands if one fails
          break;
        }
      }

      this.logger?.info(`Finished running commands for session ${sessionId}`);
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
        // Kill the entire process group to ensure all child processes are terminated
        // This is important when commands use & to run multiple processes
        const pid = runProcess.process.pid;
        if (pid) {
          // On Unix-like systems, use negative PID to kill the process group
          process.kill(-pid, 'SIGTERM');
          this.logger?.verbose(`Killed process group for run command: ${runProcess.command.display_name || runProcess.command.command}`);
        } else {
          // Fallback to regular kill if PID is not available
          runProcess.process.kill();
          this.logger?.verbose(`Killed run command: ${runProcess.command.display_name || runProcess.command.command}`);
        }
      } catch (error) {
        // If process group kill fails, try regular kill
        try {
          runProcess.process.kill();
          this.logger?.verbose(`Killed run command (fallback): ${runProcess.command.display_name || runProcess.command.command}`);
        } catch (fallbackError) {
          this.logger?.error(`Failed to kill run command: ${runProcess.command.display_name || runProcess.command.command}`, error as Error);
        }
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
import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import type { Logger } from '../utils/logger';
import type { DatabaseService } from '../database/database';
import type { ProjectRunCommand } from '../database/models';
import { getShellPath } from '../utils/shellPath';

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
          
          // Split command by newlines to execute each line sequentially
          const commandLines = command.command.split('\n').filter(line => line.trim());
          
          for (let j = 0; j < commandLines.length; j++) {
            const commandLine = commandLines[j].trim();
            if (!commandLine) continue;
            
            this.logger?.verbose(`Executing line ${j + 1}/${commandLines.length} of command ${i + 1}: ${commandLine}`);
            
            // Create environment with WORKTREE_PATH and enhanced PATH
            const shellPath = getShellPath();
            const env = {
              ...process.env,
              WORKTREE_PATH: worktreePath,
              PATH: shellPath
            } as { [key: string]: string };
            
            // Log environment details for debugging
            if (j === 0) {
              this.logger?.verbose(`Setting WORKTREE_PATH to: ${worktreePath}`);
              this.logger?.verbose(`Enhanced PATH: ${shellPath}`);
              this.logger?.verbose(`Env WORKTREE_PATH check: ${env.WORKTREE_PATH}`);
            }
            
            // Determine shell and command format based on platform
            const isWindows = process.platform === 'win32';
            let shell: string;
            let shellArgs: string[];
            let commandWithEnv: string;
            
            if (isWindows) {
              // Use cmd.exe on Windows
              shell = process.env.COMSPEC || 'cmd.exe';
              // Windows command format: set VAR=value && command
              const escapedWorktreePath = worktreePath.replace(/"/g, '""');
              commandWithEnv = `set WORKTREE_PATH="${escapedWorktreePath}" && ${commandLine}`;
              shellArgs = ['/c', commandWithEnv];
            } else {
              // Unix/macOS
              const escapedWorktreePath = worktreePath.replace(/'/g, "'\"'\"'");
              const userShell = process.env.SHELL || '/bin/bash';
              shell = userShell;
              commandWithEnv = `export WORKTREE_PATH='${escapedWorktreePath}' && ${commandLine}`;
              shellArgs = ['-c', commandWithEnv];
            }
            
            this.logger?.verbose(`Using shell: ${shell}`);
            this.logger?.verbose(`Full command: ${commandWithEnv}`);
            
            // Spawn the shell process with the enhanced environment
            const ptyProcess = pty.spawn(shell, shellArgs, {
              name: 'xterm-color',
              cols: 80,
              rows: 30,
              cwd: worktreePath,
              env: env
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

            // Wait for this command line to complete before starting the next one
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
                this.logger?.info(`Command line exited: ${commandLine}, exitCode: ${exitCode}, signal: ${signal}`);
                
                // Only emit exit event for the last line of a command
                if (j === commandLines.length - 1) {
                  this.emit('exit', {
                    sessionId,
                    commandId: command.id,
                    displayName: command.display_name || command.command,
                    exitCode,
                    signal
                  });
                }

                // Remove from processes array
                const sessionProcesses = this.processes.get(sessionId);
                if (sessionProcesses) {
                  const index = sessionProcesses.indexOf(runProcess);
                  if (index > -1) {
                    sessionProcesses.splice(index, 1);
                  }
                }

                // Only continue to next command line if this one succeeded
                if (exitCode === 0) {
                  resolve();
                } else {
                  reject(new Error(`Command line failed with exit code ${exitCode}: ${commandLine}`));
                }
              });
            });

            this.logger?.verbose(`Completed command line successfully: ${commandLine}`);
          }

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
          if (process.platform === 'win32') {
            // On Windows, use taskkill to kill the process tree
            try {
              require('child_process').execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
              this.logger?.verbose(`Killed process tree for run command: ${runProcess.command.display_name || runProcess.command.command}`);
            } catch {
              // Fallback to regular kill if taskkill fails
              runProcess.process.kill();
              this.logger?.verbose(`Killed run command (fallback): ${runProcess.command.display_name || runProcess.command.command}`);
            }
          } else {
            // On Unix-like systems, use negative PID to kill the process group
            try {
              process.kill(-pid, 'SIGTERM');
              this.logger?.verbose(`Killed process group for run command: ${runProcess.command.display_name || runProcess.command.command}`);
            } catch {
              // Fallback to regular kill if process group kill fails
              runProcess.process.kill();
              this.logger?.verbose(`Killed run command (fallback): ${runProcess.command.display_name || runProcess.command.command}`);
            }
          }
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
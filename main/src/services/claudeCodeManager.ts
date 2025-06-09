import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import type { Logger } from '../utils/logger';
import { testClaudeCodeAvailability, testClaudeCodeInDirectory, getAugmentedPath } from '../utils/claudeCodeTest';
import type { ConfigManager } from './configManager';
import { getShellPath, findExecutableInPath } from '../utils/shellPath';

interface ClaudeCodeProcess {
  process: pty.IPty;
  sessionId: string;
  worktreePath: string;
}

export class ClaudeCodeManager extends EventEmitter {
  private processes: Map<string, ClaudeCodeProcess> = new Map();

  constructor(private sessionManager: any, private logger?: Logger, private configManager?: ConfigManager) {
    super();
  }

  async spawnClaudeCode(sessionId: string, worktreePath: string, prompt: string, conversationHistory?: string[], isResume: boolean = false): Promise<void> {
    try {
      this.logger?.verbose(`Spawning Claude for session ${sessionId} in ${worktreePath}`);
      this.logger?.verbose(`Command: claude -p "${prompt}"`);
      this.logger?.verbose(`Working directory: ${worktreePath}`);
      
      // Get both global and project-specific system prompts
      const dbSession = this.sessionManager.getDbSession(sessionId);
      let systemPromptParts: string[] = [];
      
      // Add global system prompt first
      const globalPrompt = this.configManager?.getSystemPromptAppend();
      if (globalPrompt) {
        systemPromptParts.push(globalPrompt);
      }
      
      // Add project-specific system prompt
      if (dbSession?.project_id) {
        const project = this.sessionManager.getProjectById(dbSession.project_id);
        if (project?.system_prompt) {
          systemPromptParts.push(project.system_prompt);
        }
      }
      
      // Combine prompts with double newline separator
      const systemPromptAppend = systemPromptParts.length > 0 
        ? systemPromptParts.join('\n\n') 
        : undefined;
      
      // Test if claude-code command exists and works
      const availability = await testClaudeCodeAvailability();
      if (!availability.available) {
        this.logger?.error(`Claude Code not available: ${availability.error}`);
        this.logger?.error(`Current PATH: ${process.env.PATH}`);
        this.logger?.error(`Augmented PATH will be: ${getAugmentedPath()}`);
        throw new Error(`Claude Code CLI not available: ${availability.error}`);
      }
      this.logger?.verbose(`Claude found: ${availability.version || 'version unknown'}`);
      if (availability.path) {
        this.logger?.verbose(`Claude executable path: ${availability.path}`);
      }
      
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
      
      // Build the command arguments
      const args = ['--dangerously-skip-permissions', '--verbose', '--output-format', 'stream-json'];
      
      if (isResume) {
        // Get Claude's session ID if available
        const claudeSessionId = this.sessionManager.getClaudeSessionId(sessionId);
        
        if (claudeSessionId) {
          // Use --resume flag with Claude's actual session ID
          args.push('--resume', claudeSessionId);
          console.log(`[ClaudeCodeManager] Resuming Claude session ${claudeSessionId} for Crystal session ${sessionId}`);
        } else {
          // Fall back to --resume without ID (will resume most recent)
          args.push('--resume');
          console.log(`[ClaudeCodeManager] No Claude session ID found for Crystal session ${sessionId}, resuming most recent session`);
        }
        
        // If a new prompt is provided, add it
        if (prompt && prompt.trim()) {
          args.push('-p', prompt);
        }
      } else {
        // Initial prompt for new session
        let finalPrompt = prompt;
        if (systemPromptAppend) {
          // Append the system prompt to the user's prompt
          finalPrompt = `${prompt}\n\n${systemPromptAppend}`;
        }
        args.push('-p', finalPrompt);
      }

      if (!pty) {
        throw new Error('node-pty not available');
      }
      
      // Log the full command being executed
      const fullCommand = `claude ${args.join(' ')}`;
      console.log(`[ClaudeCodeManager] Executing Claude Code command in worktree ${worktreePath}: ${fullCommand}`);
      
      // Get the user's shell PATH to ensure we have access to all their tools
      const shellPath = getShellPath();
      const env = {
        ...process.env,
        PATH: shellPath
      } as { [key: string]: string };
      
      // Use custom claude path if configured, otherwise find it in PATH
      let claudeCommand = this.configManager?.getConfig()?.claudeExecutablePath;
      if (!claudeCommand) {
        const foundPath = findExecutableInPath('claude');
        if (!foundPath) {
          throw new Error('Claude Code CLI not found in PATH. Please ensure claude is installed and in your PATH.');
        }
        claudeCommand = foundPath;
      }
      
      const ptyProcess = pty.spawn(claudeCommand, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: worktreePath,
        env
      });

      const claudeProcess: ClaudeCodeProcess = {
        process: ptyProcess,
        sessionId,
        worktreePath
      };

      this.processes.set(sessionId, claudeProcess);
      this.logger?.verbose(`Claude Code process created for session ${sessionId}`);
      
      // Emit spawned event to update session status
      this.emit('spawned', { sessionId });

      let hasReceivedOutput = false;
      let lastOutput = '';
      let buffer = '';

      ptyProcess.onData((data: string) => {
        hasReceivedOutput = true;
        lastOutput += data;
        buffer += data;
        
        // Process complete JSON lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const jsonMessage = JSON.parse(line.trim());
              this.logger?.verbose(`JSON message from session ${sessionId}: ${JSON.stringify(jsonMessage)}`);
              
              // Emit JSON message only - terminal formatting will be done on the fly
              this.emit('output', {
                sessionId,
                type: 'json',
                data: jsonMessage,
                timestamp: new Date()
              });
            } catch (error) {
              // If not valid JSON, treat as regular output
              this.logger?.verbose(`Raw output from session ${sessionId}: ${line.substring(0, 200)}`);
              this.emit('output', {
                sessionId,
                type: 'stdout',
                data: line,
                timestamp: new Date()
              });
            }
          }
        }
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

  async restartSessionWithHistory(sessionId: string, worktreePath: string, initialPrompt: string, conversationHistory: string[]): Promise<void> {
    // Kill existing process if it exists
    this.killProcess(sessionId);
    
    // Restart with conversation history
    await this.spawnClaudeCode(sessionId, worktreePath, initialPrompt, conversationHistory);
  }

  isSessionRunning(sessionId: string): boolean {
    return this.processes.has(sessionId);
  }

  async startSession(sessionId: string, worktreePath: string, prompt: string): Promise<void> {
    return this.spawnClaudeCode(sessionId, worktreePath, prompt);
  }

  async continueSession(sessionId: string, worktreePath: string, prompt: string, conversationHistory: any[]): Promise<void> {
    // Kill any existing process for this session first
    if (this.processes.has(sessionId)) {
      this.killProcess(sessionId);
    }
    
    // For continuing a session, we use the --resume flag
    // The conversationHistory parameter is kept for compatibility but not used with --resume
    return this.spawnClaudeCode(sessionId, worktreePath, prompt, [], true);
  }

  async stopSession(sessionId: string): Promise<void> {
    this.killProcess(sessionId);
  }
}
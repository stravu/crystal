import { ChildProcess } from 'child_process';
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
      
      const ptyProcess = pty.spawn('claude', ['-p', prompt, '--dangerously-skip-permissions', '--verbose', '--output-format', 'stream-json'], {
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
              
              // Emit JSON message for Messages view
              this.emit('output', {
                sessionId,
                type: 'json',
                data: jsonMessage,
                timestamp: new Date()
              });
              
              // Also emit formatted text for Terminal view
              const formattedText = this.formatJsonForTerminal(jsonMessage);
              if (formattedText) {
                this.emit('output', {
                  sessionId,
                  type: 'stdout',
                  data: formattedText,
                  timestamp: new Date()
                });
              }
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

  private formatJsonForTerminal(jsonMessage: any): string {
    const timestamp = new Date().toLocaleTimeString();
    
    if (jsonMessage.type === 'system') {
      if (jsonMessage.subtype === 'init') {
        return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m🚀 Claude Code Session Started\x1b[0m\r\n` +
               `\x1b[90m  Session ID: ${jsonMessage.session_id}\x1b[0m\r\n` +
               `\x1b[90m  Available tools: ${jsonMessage.tools?.join(', ') || 'none'}\x1b[0m\r\n\r\n`;
      } else if (jsonMessage.subtype === 'result') {
        const duration = jsonMessage.duration_ms ? `${jsonMessage.duration_ms}ms` : 'unknown';
        const cost = jsonMessage.cost_usd ? `$${jsonMessage.cost_usd}` : 'free';
        const turns = jsonMessage.num_turns || 0;
        
        return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m📊 Session Complete\x1b[0m\r\n` +
               `\x1b[90m  Duration: ${duration} | Cost: ${cost} | Turns: ${turns}\x1b[0m\r\n\r\n`;
      }
      return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[90m⚙️  System: ${jsonMessage.subtype || 'message'}\x1b[0m\r\n`;
    }
    
    if (jsonMessage.type === 'user') {
      const content = jsonMessage.content || '';
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[32m👤 User Input\x1b[0m\r\n` +
             `\x1b[37m${preview}\x1b[0m\r\n\r\n`;
    }
    
    if (jsonMessage.type === 'assistant') {
      const content = jsonMessage.content || '';
      const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
      return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[1m\x1b[35m🤖 Assistant Response\x1b[0m\r\n` +
             `\x1b[37m${preview}\x1b[0m\r\n\r\n`;
    }
    
    // For other message types, show a generic format
    return `\r\n\x1b[36m[${timestamp}]\x1b[0m \x1b[90m📄 ${jsonMessage.type}: ${jsonMessage.subtype || 'message'}\x1b[0m\r\n`;
  }
}
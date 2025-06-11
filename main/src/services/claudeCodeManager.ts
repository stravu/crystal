import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import type { Logger } from '../utils/logger';
import { testClaudeCodeAvailability, testClaudeCodeInDirectory, getAugmentedPath } from '../utils/claudeCodeTest';
import type { ConfigManager } from './configManager';
import { getShellPath, findExecutableInPath } from '../utils/shellPath';
import { PermissionManager } from './permissionManager';
import { execSync } from 'child_process';

interface ClaudeCodeProcess {
  process: pty.IPty;
  sessionId: string;
  worktreePath: string;
}

export class ClaudeCodeManager extends EventEmitter {
  private processes: Map<string, ClaudeCodeProcess> = new Map();

  constructor(
    private sessionManager: any, 
    private logger?: Logger, 
    private configManager?: ConfigManager,
    private permissionIpcPath?: string | null
  ) {
    super();
  }

  async spawnClaudeCode(sessionId: string, worktreePath: string, prompt: string, conversationHistory?: string[], isResume: boolean = false, permissionMode?: 'approve' | 'ignore'): Promise<void> {
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
        
        // Emit a pseudo-message to show the error in the UI
        const errorMessage = {
          type: 'session',
          data: {
            status: 'error',
            message: 'Claude Code not available',
            details: [
              `Error: ${availability.error}`,
              '',
              'Claude Code is not installed or not found in your PATH.',
              '',
              'Please install Claude Code:',
              '1. Visit: https://docs.anthropic.com/en/docs/claude-code/overview',
              '2. Follow the installation instructions for your platform',
              '3. Verify installation by running "claude --version" in your terminal',
              '',
              'If Claude is installed but not in your PATH:',
              '- Add the Claude installation directory to your PATH environment variable',
              '- Or set a custom Claude executable path in Crystal Settings',
              '',
              `Current PATH: ${process.env.PATH}`,
              `Attempted command: claude --version`
            ].join('\n')
          }
        };
        
        this.emit('output', {
          sessionId,
          type: 'json',
          data: errorMessage,
          timestamp: new Date()
        });
        
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
      const args = ['--verbose', '--output-format', 'stream-json'];
      
      // Determine permission mode
      const defaultMode = this.configManager?.getConfig()?.defaultPermissionMode || 'ignore';
      const effectiveMode = permissionMode || defaultMode;
      
      if (effectiveMode === 'ignore') {
        args.push('--dangerously-skip-permissions');
      } else if (effectiveMode === 'approve' && this.permissionIpcPath) {
        // Create MCP config for permission approval
        // Use standalone script in packaged apps
        let mcpBridgePath = app.isPackaged
          ? path.join(__dirname, 'mcpPermissionBridgeStandalone.js')
          : path.join(__dirname, 'mcpPermissionBridge.js');
        
        // Use a directory without spaces for better compatibility
        // DMG apps can write to user's home directory
        let tempDir: string;
        try {
          const homeDir = os.homedir();
          tempDir = path.join(homeDir, '.crystal');
          
          // Ensure the directory exists
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
            this.logger?.verbose(`[MCP] Created MCP temp directory: ${tempDir}`);
          }
          
          // Test write access
          const testFile = path.join(tempDir, '.test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
        } catch (error) {
          this.logger?.error(`[MCP] Failed to create/access home directory, falling back to system temp: ${error}`);
          tempDir = os.tmpdir();
        }
        
        
        // Handle ASAR packaging - copy the script to temp directory since it can't be executed from ASAR
        if (mcpBridgePath.includes('.asar')) {
          this.logger?.verbose(`[MCP] Detected ASAR packaging, extracting script`);
          
          // Read the script from ASAR
          let scriptContent: string;
          try {
            scriptContent = fs.readFileSync(mcpBridgePath, 'utf8');
          } catch (error) {
            this.logger?.error(`[MCP] Failed to read script from ASAR: ${error}`);
            throw new Error(`Failed to read MCP bridge script from ASAR: ${error}`);
          }
          
          // Write to temp directory with executable permissions
          const tempScriptPath = path.join(tempDir, `mcpPermissionBridge-${sessionId}.js`);
          try {
            // First write the file
            fs.writeFileSync(tempScriptPath, scriptContent);
            
            // Then explicitly set permissions (more reliable than mode option)
            fs.chmodSync(tempScriptPath, 0o755);
            
            // Verify the file was created and is readable
            const stats = fs.statSync(tempScriptPath);
            this.logger?.verbose(`[MCP] Script extracted to: ${tempScriptPath}`);
            
            mcpBridgePath = tempScriptPath;
          } catch (error) {
            this.logger?.error(`[MCP] Failed to write script to temp directory: ${error}`);
            throw new Error(`Failed to extract MCP bridge script: ${error}`);
          }
        } else {
          // Verify the MCP bridge file exists
          if (!fs.existsSync(mcpBridgePath)) {
            this.logger?.error(`MCP permission bridge not found at: ${mcpBridgePath}`);
            throw new Error(`MCP permission bridge file not found. Expected at: ${mcpBridgePath}`);
          }
        }
        
        const mcpConfigPath = path.join(tempDir, `crystal-mcp-${sessionId}.json`);
        
        // Try to find node executable - critical for .dmg execution
        let nodePath = 'node';
        try {
          const nodeInPath = await findExecutableInPath('node');
          if (nodeInPath) {
            nodePath = nodeInPath;
          } else {
            // When running from .dmg, try common node locations
            const commonNodePaths = [
              '/usr/local/bin/node',
              '/opt/homebrew/bin/node',
              '/usr/bin/node',
              '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc',
              process.execPath // Use Electron's built-in Node if available
            ];
            
            for (const tryPath of commonNodePaths) {
              if (fs.existsSync(tryPath)) {
                nodePath = tryPath;
                break;
              }
            }
            
            // If still not found and we're in packaged app, use Electron's node
            if (nodePath === 'node' && app.isPackaged) {
              nodePath = process.execPath;
            }
          }
        } catch (e) {
          this.logger?.warn(`[MCP] Could not find node in PATH: ${e}`);
          // Use Electron's node as fallback for packaged apps
          if (app.isPackaged) {
            nodePath = process.execPath;
          }
        }
        
        
        // Test if the selected node path actually works
        try {
          execSync(`"${nodePath}" --version`, { encoding: 'utf8' });
        } catch (e) {
          this.logger?.error(`[MCP] Node executable test failed: ${e}`);
          if (app.isPackaged) {
          }
        }
        
        // If using Electron's executable, we need to handle it specially
        let mcpCommand: string = nodePath;
        let mcpArgs: string[] = [mcpBridgePath, sessionId, this.permissionIpcPath];
        
        if (nodePath === process.execPath && app.isPackaged) {
          
          // First, let's try to find any available node
          const alternateNodes = ['/usr/local/bin/node', '/opt/homebrew/bin/node', '/usr/bin/node'];
          let foundAlternate = false;
          
          for (const altNode of alternateNodes) {
            if (fs.existsSync(altNode)) {
              mcpCommand = altNode;
              mcpArgs = [mcpBridgePath, sessionId, this.permissionIpcPath];
              foundAlternate = true;
              break;
            }
          }
          
          if (!foundAlternate) {
            mcpCommand = nodePath;
            // Use Electron's --require flag to load the script
            mcpArgs = ['--require', mcpBridgePath, '--', sessionId, this.permissionIpcPath];
          }
        } else {
          // Normal node execution
          mcpCommand = nodePath;
          mcpArgs = [mcpBridgePath, sessionId, this.permissionIpcPath];
        }
        
        const mcpConfig = {
          "mcpServers": {
            "crystal-permissions": {
              "command": mcpCommand,
              "args": mcpArgs
            }
          }
        };
        
        this.logger?.verbose(`[MCP] Creating MCP config at: ${mcpConfigPath}`);
        
        try {
          fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
          
          // Verify the config file was created
          if (fs.existsSync(mcpConfigPath)) {
            const configStats = fs.statSync(mcpConfigPath);
            
            // Make config file readable by all (might help with permission issues)
            fs.chmodSync(mcpConfigPath, 0o644);
          } else {
            throw new Error('MCP config file was not created');
          }
        } catch (error) {
          this.logger?.error(`[MCP] Failed to create MCP config file: ${error}`);
          throw new Error(`Failed to create MCP config: ${error}`);
        }
        
        
        // Additional debugging: Test if the MCP bridge script can be executed
        try {
          const testCmd = `"${nodePath}" "${mcpBridgePath}" --version`;
          // Note: This will fail because the script expects different args, but it tests if node can execute it
          execSync(testCmd, { encoding: 'utf8', timeout: 2000 });
        } catch (testError: any) {
          // Expected to fail, but check if it's a permission error vs argument error
          if (testError.code === 'EACCES' || testError.message.includes('EACCES')) {
            this.logger?.error(`[MCP] Permission denied executing MCP bridge script`);
            throw new Error('MCP bridge script is not executable');
          }
        }
        
        // Add MCP flags
        args.push('--mcp-config', mcpConfigPath);
        args.push('--permission-prompt-tool', 'mcp__crystal-permissions__approve_permission');
        args.push('--allowedTools', 'mcp__crystal-permissions__approve_permission');
        
        
        // Store config path and temp script path for cleanup
        (global as any)[`mcp_config_${sessionId}`] = mcpConfigPath;
        if (mcpBridgePath.includes(tempDir)) {
          (global as any)[`mcp_script_${sessionId}`] = mcpBridgePath;
        }
        
        // Add a small delay to ensure file is fully written and accessible
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Final check that config file still exists
        if (!fs.existsSync(mcpConfigPath)) {
          throw new Error(`MCP config file disappeared after creation: ${mcpConfigPath}`);
        }
      } else {
        // Fallback to skip permissions if IPC path not available
        args.push('--dangerously-skip-permissions');
        if (effectiveMode === 'approve') {
          this.logger?.warn(`Permission approval mode requested but IPC server not available. Using skip permissions mode.`);
        }
      }
      
      if (isResume) {
        // Get Claude's session ID if available
        const claudeSessionId = this.sessionManager.getClaudeSessionId(sessionId);
        
        // Use --continue flag (automatically continues from latest session in folder)
        args.push('--continue');
        console.log(`[ClaudeCodeManager] Continuing latest Claude session in ${worktreePath} for Crystal session ${sessionId}`);
        
        // Commented out --resume logic for future reference
        // if (claudeSessionId) {
        //   // Use --resume flag with Claude's actual session ID
        //   args.push('--resume', claudeSessionId);
        //   console.log(`[ClaudeCodeManager] Resuming Claude session ${claudeSessionId} for Crystal session ${sessionId}`);
        // } else {
        //   // Fall back to --resume without ID (will resume most recent)
        //   args.push('--resume');
        //   console.log(`[ClaudeCodeManager] No Claude session ID found for Crystal session ${sessionId}, resuming most recent session`);
        // }
        
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
        PATH: shellPath,
        // Ensure MCP-related environment variables are preserved
        MCP_SOCKET_PATH: this.permissionIpcPath || '',
        // Add debug mode for MCP if verbose logging is enabled
        ...(this.configManager?.getConfig()?.verbose ? { MCP_DEBUG: '1' } : {})
      } as { [key: string]: string };
      
      
      // Use custom claude path if configured, otherwise find it in PATH
      let claudeCommand = this.configManager?.getConfig()?.claudeExecutablePath;
      if (!claudeCommand) {
        const foundPath = findExecutableInPath('claude');
        if (!foundPath) {
          // Emit a pseudo-message to show the error in the UI
          const errorMessage = {
            type: 'session',
            data: {
              status: 'error',
              message: 'Claude Code executable not found',
              details: [
                'Claude Code CLI not found in PATH.',
                '',
                'This can happen if:',
                '1. Claude Code is not installed',
                '2. Claude Code is installed but not in your PATH',
                '3. The "claude" command has a different name on your system',
                '',
                'To fix this:',
                '1. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview',
                '2. Add Claude to your PATH environment variable',
                '3. Or set a custom Claude executable path in Crystal Settings',
                '',
                `Current PATH: ${shellPath}`,
                'Searched for: claude'
              ].join('\n')
            }
          };
          
          this.emit('output', {
            sessionId,
            type: 'json',
            data: errorMessage,
            timestamp: new Date()
          });
          
          throw new Error('Claude Code CLI not found in PATH. Please ensure claude is installed and in your PATH.');
        }
        claudeCommand = foundPath;
      }
      
      
      let ptyProcess: pty.IPty;
      try {
        ptyProcess = pty.spawn(claudeCommand, args, {
          name: 'xterm-color',
          cols: 80,
          rows: 30,
          cwd: worktreePath,
          env
        });
      } catch (spawnError) {
        // Handle spawn errors (e.g., command not found, permission denied)
        const errorMsg = spawnError instanceof Error ? spawnError.message : String(spawnError);
        this.logger?.error(`Failed to spawn Claude process: ${errorMsg}`);
        
        // Emit a pseudo-message to show the error in the UI
        const errorMessage = {
          type: 'session',
          data: {
            status: 'error',
            message: 'Failed to start Claude Code',
            details: [
              `Error: ${errorMsg}`,
              '',
              'This usually means:',
              '1. Claude Code is not installed or not found in your PATH',
              '2. The Claude executable path is incorrect',
              '3. You don\'t have permission to execute the Claude command',
              '',
              `Command attempted: ${claudeCommand}`,
              `Working directory: ${worktreePath}`,
              '',
              'Please check:',
              '- Claude Code is installed: https://docs.anthropic.com/en/docs/claude-code/overview',
              '- Run "claude --version" in your terminal to verify installation',
              '- Check Settings for custom Claude executable path'
            ].join('\n')
          }
        };
        
        this.emit('output', {
          sessionId,
          type: 'json',
          data: errorMessage,
          timestamp: new Date()
        });
        
        throw new Error(`Failed to spawn Claude Code: ${errorMsg}`);
      }

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
              
              // Check if this looks like an error message
              const isError = line.includes('ERROR') || 
                            line.includes('Error:') || 
                            line.includes('error:') ||
                            line.includes('Command failed:') ||
                            line.includes('aborted') ||
                            line.includes('fatal:');
              
              this.emit('output', {
                sessionId,
                type: isError ? 'stderr' : 'stdout',
                data: line + '\n',
                timestamp: new Date()
              });
            }
          }
        }
      });

      ptyProcess.onExit(async ({ exitCode, signal }) => {
        // Process any remaining data in the buffer
        if (buffer.trim()) {
          try {
            const jsonMessage = JSON.parse(buffer.trim());
            this.emit('output', {
              sessionId,
              type: 'json',
              data: jsonMessage,
              timestamp: new Date()
            });
          } catch (error) {
            // Not JSON, check if it's an error message
            const isError = buffer.includes('ERROR') || 
                          buffer.includes('Error:') || 
                          buffer.includes('error:') ||
                          buffer.includes('Command failed:') ||
                          buffer.includes('aborted') ||
                          buffer.includes('fatal:');
            
            this.emit('output', {
              sessionId,
              type: isError ? 'stderr' : 'stdout',
              data: buffer,
              timestamp: new Date()
            });
          }
        }
        
        if (exitCode !== 0) {
          this.logger?.error(`Claude process failed for session ${sessionId}. Exit code: ${exitCode}, Signal: ${signal}`);
          
          // If Claude failed to start (no output received), emit an error message
          if (!hasReceivedOutput) {
            this.logger?.error(`No output received from Claude. This might indicate a startup failure.`);
            
            // Emit a pseudo-message to show the error in the UI
            const errorMessage = {
              type: 'session',
              data: {
                status: 'error',
                message: `Claude Code failed to start (exit code: ${exitCode})`,
                details: [
                  'This usually means Claude Code is not installed properly or not found in your PATH.',
                  '',
                  'Please ensure:',
                  '1. Claude Code is installed: https://docs.anthropic.com/en/docs/claude-code/overview',
                  '2. The "claude" command is available in your terminal',
                  '3. Your PATH environment variable includes the Claude Code installation directory',
                  '',
                  `Full command attempted: ${claudeCommand} ${args.join(' ')}`,
                  `Working directory: ${worktreePath}`,
                  `Exit code: ${exitCode}${signal ? `, Signal: ${signal}` : ''}`,
                  '',
                  'You can also set a custom Claude executable path in the Settings.'
                ].join('\n')
              }
            };
            
            this.emit('output', {
              sessionId,
              type: 'json',
              data: errorMessage,
              timestamp: new Date()
            });
          } else {
            this.logger?.error(`Last output from Claude: ${lastOutput.substring(-500)}`);
            
            // If we got some output but it still failed, show that in the error message
            const errorMessage = {
              type: 'session',
              data: {
                status: 'error',
                message: `Claude Code exited with error (exit code: ${exitCode})`,
                details: lastOutput.length > 0 ? `Last output:\n${lastOutput.substring(-500)}` : 'No additional details available'
              }
            };
            
            this.emit('output', {
              sessionId,
              type: 'json',
              data: errorMessage,
              timestamp: new Date()
            });
          }
        } else {
          this.logger?.info(`Claude process exited normally for session ${sessionId}`);
        }
        
        // Clear any pending permission requests
        PermissionManager.getInstance().clearPendingRequests(sessionId);
        
        // Clean up MCP config file if it exists (with a delay to ensure Claude had time to read it)
        const mcpConfigPath = (global as any)[`mcp_config_${sessionId}`];
        if (mcpConfigPath && fs.existsSync(mcpConfigPath)) {
          // Delay cleanup to ensure Claude has read the file
          setTimeout(() => {
            try {
              if (fs.existsSync(mcpConfigPath)) {
                fs.unlinkSync(mcpConfigPath);
                this.logger?.verbose(`[MCP] Cleaned up config file: ${mcpConfigPath}`);
              }
              delete (global as any)[`mcp_config_${sessionId}`];
            } catch (error) {
              this.logger?.error(`Failed to delete MCP config file:`, error instanceof Error ? error : undefined);
            }
          }, 5000); // 5 second delay
        }
        
        // Clean up temporary MCP script file if it exists (with same delay)
        const mcpScriptPath = (global as any)[`mcp_script_${sessionId}`];
        if (mcpScriptPath && fs.existsSync(mcpScriptPath)) {
          setTimeout(() => {
            try {
              if (fs.existsSync(mcpScriptPath)) {
                fs.unlinkSync(mcpScriptPath);
                this.logger?.verbose(`[MCP] Cleaned up script file: ${mcpScriptPath}`);
              }
              delete (global as any)[`mcp_script_${sessionId}`];
            } catch (error) {
              this.logger?.error(`Failed to delete temporary MCP script file:`, error instanceof Error ? error : undefined);
            }
          }, 5000); // 5 second delay
        }
        
        this.emit('exit', {
          sessionId,
          exitCode,
          signal
        });
        this.processes.delete(sessionId);
      });

      // Note: 'spawned' event is already emitted earlier in the function
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

  async killProcess(sessionId: string): Promise<void> {
    const claudeProcess = this.processes.get(sessionId);
    if (!claudeProcess) {
      return;
    }

    // Clear any pending permission requests
    PermissionManager.getInstance().clearPendingRequests(sessionId);
    
    // Clean up MCP config file if it exists (with a delay to ensure Claude had time to read it)
    const mcpConfigPath = (global as any)[`mcp_config_${sessionId}`];
    if (mcpConfigPath && fs.existsSync(mcpConfigPath)) {
      // Delay cleanup to ensure Claude has read the file
      setTimeout(() => {
        try {
          if (fs.existsSync(mcpConfigPath)) {
            fs.unlinkSync(mcpConfigPath);
            this.logger?.verbose(`[MCP] Cleaned up config file: ${mcpConfigPath}`);
          }
          delete (global as any)[`mcp_config_${sessionId}`];
        } catch (error) {
          this.logger?.error(`Failed to delete MCP config file:`, error instanceof Error ? error : undefined);
        }
      }, 5000); // 5 second delay
    }
    
    // Clean up temporary MCP script file if it exists (with same delay)
    const mcpScriptPath = (global as any)[`mcp_script_${sessionId}`];
    if (mcpScriptPath && fs.existsSync(mcpScriptPath)) {
      setTimeout(() => {
        try {
          if (fs.existsSync(mcpScriptPath)) {
            fs.unlinkSync(mcpScriptPath);
            this.logger?.verbose(`[MCP] Cleaned up script file: ${mcpScriptPath}`);
          }
          delete (global as any)[`mcp_script_${sessionId}`];
        } catch (error) {
          this.logger?.error(`Failed to delete temporary MCP script file:`, error instanceof Error ? error : undefined);
        }
      }, 5000); // 5 second delay
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
    await this.killProcess(sessionId);
    
    // Restart with conversation history
    await this.spawnClaudeCode(sessionId, worktreePath, initialPrompt, conversationHistory);
  }

  isSessionRunning(sessionId: string): boolean {
    return this.processes.has(sessionId);
  }

  async startSession(sessionId: string, worktreePath: string, prompt: string, permissionMode?: 'approve' | 'ignore'): Promise<void> {
    return this.spawnClaudeCode(sessionId, worktreePath, prompt, undefined, false, permissionMode);
  }

  async continueSession(sessionId: string, worktreePath: string, prompt: string, conversationHistory: any[]): Promise<void> {
    // Kill any existing process for this session first
    if (this.processes.has(sessionId)) {
      await this.killProcess(sessionId);
    }
    
    // Get the session's permission mode from database
    const dbSession = this.sessionManager.getDbSession(sessionId);
    const permissionMode = dbSession?.permission_mode;
    
    // For continuing a session, we use the --continue flag
    // The conversationHistory parameter is kept for compatibility but not used with --continue
    return this.spawnClaudeCode(sessionId, worktreePath, prompt, [], true, permissionMode);
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.killProcess(sessionId);
  }
}
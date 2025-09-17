import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import { findExecutableInPath } from '../../../utils/shellPath';
import { AbstractCliManager } from '../cli/AbstractCliManager';
import { DEFAULT_CODEX_MODEL, getCodexModelConfig } from '../../../../../shared/types/models';

interface CodexSpawnOptions {
  panelId: string;
  sessionId: string;
  worktreePath: string;
  prompt: string;
  conversationHistory?: string[];
  model?: string;
  modelProvider?: string;
  showRawAgentReasoning?: boolean;
  modelReasoningEffort?: 'low' | 'medium' | 'high';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy?: 'auto' | 'manual';
  webSearch?: boolean;
  isResume?: boolean;
  resumeSessionId?: string;
}

interface CodexProcess {
  process: import('@homebridge/node-pty-prebuilt-multiarch').IPty;
  panelId: string;
  sessionId: string;
  worktreePath: string;
  messageBuffer: string;
  nextId: number;
}

/**
 * CodexManager - Manages OpenAI Codex CLI processes
 * Extends AbstractCliManager for common CLI functionality
 * 
 * Note: GPT-5 was released on August 7, 2025, providing significant improvements
 * in reasoning, speed, and capabilities over GPT-4 models.
 */
export class CodexManager extends AbstractCliManager {
  private messageBuffers: Map<string, string> = new Map();
  private messageIdCounters: Map<string, number> = new Map();
  private codexProcesses: Map<string, ChildProcessWithoutNullStreams> = new Map();
  private pendingInitialPrompts: Map<string, string> = new Map();
  private protocolHandshakeComplete: Map<string, boolean> = new Map();
  
  // Platform-specific line ending
  private readonly lineEnding = process.platform === 'win32' ? '\r\n' : '\n';
  
  constructor(
    sessionManager: any,
    logger?: Logger,
    configManager?: ConfigManager
  ) {
    super(sessionManager, logger, configManager);
    this.logger?.info(`[codex-debug] CodexManager initialized for platform: ${process.platform}, using line ending: ${this.lineEnding === '\r\n' ? 'CRLF' : 'LF'}`);
  }

  // Abstract method implementations

  protected getCliToolName(): string {
    return 'Codex';
  }

  protected async testCliAvailability(customPath?: string): Promise<{ 
    available: boolean; 
    error?: string; 
    version?: string; 
    path?: string 
  }> {
    this.logger?.info('[codex-debug] Testing Codex availability...');
    try {
      const command = customPath || await this.findCodexExecutable();
      this.logger?.info(`[codex-debug] Looking for Codex at: ${command || 'not found'}`);
      if (!command) {
        this.logger?.warn('[codex-debug] Codex not found in any standard location');
        return {
          available: false,
          error: 'Codex not found in PATH or standard locations'
        };
      }

      // Test codex availability
      this.logger?.info(`[codex-debug] Testing Codex command: "${command}" --version`);
      
      // Try direct execution first
      try {
        const version = execSync(`"${command}" --version`, { 
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        this.logger?.info(`[codex-debug] Codex version detected: ${version}`);
        
        return {
          available: true,
          version,
          path: command
        };
      } catch (directError: any) {
        // Check if it's a shebang/node error (Unix/Linux/macOS) or Windows command error
        const errorMsg = directError.message || String(directError);
        const isUnixShebangError = errorMsg.includes('env: node:') || errorMsg.includes('No such file or directory');
        const isWindowsCommandError = errorMsg.includes('is not recognized as an internal or external command') ||
                                     errorMsg.includes('cannot find the path specified') ||
                                     errorMsg.includes('ENOENT') ||
                                     errorMsg.includes('The system cannot find the file specified');
        
        if (isUnixShebangError || isWindowsCommandError) {
          const errorType = isWindowsCommandError ? 'Windows command execution' : 'Unix shebang';
          this.logger?.warn(`[codex-debug] Codex appears to be a Node.js script with ${errorType} issue, trying Node.js fallback...`);
          this.logger?.info(`[codex-debug] Original error details: ${errorMsg}`);
          
          // Try to find Node.js and run the script directly
          const { findNodeExecutable } = require('../../../utils/nodeFinder');
          try {
            const nodePath = await findNodeExecutable();
            this.logger?.info(`[codex-debug] Found Node.js at: ${nodePath} for fallback execution`);
            
            // Test with Node.js directly
            const nodeCommand = `"${nodePath}" "${command}" --version`;
            this.logger?.info(`[codex-debug] Testing Node.js fallback command: ${nodeCommand}`);
            
            const version = execSync(nodeCommand, {
              encoding: 'utf8',
              timeout: 5000
            }).trim();
            this.logger?.info(`[codex-debug] Codex version detected via Node.js fallback: ${version}`);
            
            // Store that we need Node.js fallback
            (global as any).codexNeedsNodeFallback = true;
            this.logger?.info('[codex-debug] Node.js fallback mode enabled for future executions');
            
            return {
              available: true,
              version,
              path: command
            };
          } catch (nodeError: any) {
            const nodeErrorMsg = nodeError.message || String(nodeError);
            this.logger?.error(`[codex-debug] Node.js fallback also failed with error: ${nodeErrorMsg}`);
            this.logger?.error('[codex-debug] Node.js fallback stack trace:', nodeError instanceof Error ? nodeError : undefined);
            
            // Provide more helpful error message
            const enhancedError = new Error(
              `Codex execution failed on ${process.platform}. ` +
              `Original error: ${errorMsg}. ` +
              `Node.js fallback error: ${nodeErrorMsg}. ` +
              `Please ensure both Codex and Node.js are properly installed and accessible.`
            );
            throw enhancedError;
          }
        }
        throw directError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`[codex-debug] Codex availability test failed: ${errorMessage}`);
      return {
        available: false,
        error: `${errorMessage}`
      };
    }
  }

  protected buildCommandArgs(options: CodexSpawnOptions): string[] {
    // If resuming a session, use the resume command
    if (options.isResume && options.resumeSessionId) {
      const args: string[] = ['resume', options.resumeSessionId];
      
      // Add the prompt if provided
      if (options.prompt && options.prompt.trim()) {
        args.push(options.prompt);
      }
      
      this.logger?.info(`[codex-debug] Built resume command args: ${args.join(' ')}`);
      return args;
    }
    
    // Otherwise use the proto command for new sessions
    const args: string[] = ['proto'];
    
    // Model configuration - 'auto' means don't pass a model parameter
    const model = options.model || DEFAULT_CODEX_MODEL;
    if (model !== 'auto') {
      args.push('-c', `model="${model}"`);
    }
    
    if (options.modelProvider) {
      args.push('-c', `model_provider="${options.modelProvider}"`);
    }
    
    // Working directory
    args.push('-c', `cwd="${options.worktreePath}"`);
    
    // Show raw agent reasoning for debugging
    if (options.showRawAgentReasoning !== false) {
      args.push('-c', 'show_raw_agent_reasoning=true');
    }
    
    // Model reasoning settings
    if (options.modelReasoningEffort) {
      args.push('-c', `model_reasoning_effort="${options.modelReasoningEffort}"`);
    }
    
    // Sandbox mode (default to workspace-write for safety)
    const sandboxMode = options.sandboxMode || 'workspace-write';
    args.push('-c', `sandbox_mode="${sandboxMode}"`);
    
    // Approval policy (default to on-request for safety)
    // Valid values: untrusted, on-failure, on-request, never
    const approvalPolicy = options.approvalPolicy === 'manual' ? 'on-request' : 
                          options.approvalPolicy === 'auto' ? 'on-failure' : 
                          (options.approvalPolicy || 'on-request');
    args.push('-c', `approval_policy="${approvalPolicy}"`);
    
    // Web search
    if (options.webSearch) {
      args.push('-c', 'tools.web_search=true');
    }
    
    this.logger?.info(`[codex-debug] Codex command args: ${args.join(' ')}`);
    
    return args;
  }

  protected async getCliExecutablePath(): Promise<string> {
    // Check for custom path in config (using a generic config field for now)
    const config = this.configManager?.getConfig() as any;
    const customPath = config?.codexExecutablePath;
    if (customPath) {
      this.logger?.info(`[codex-debug] Using custom Codex executable path: ${customPath}`);
      return customPath;
    }
    
    // Find Codex in standard locations
    const foundPath = await this.findCodexExecutable();
    if (!foundPath) {
      throw new Error('Codex not found in PATH or standard locations');
    }
    
    return foundPath;
  }

  protected parseCliOutput(data: string, panelId: string, sessionId: string): Array<{
    panelId: string;
    sessionId: string;
    type: 'json' | 'stdout' | 'stderr';
    data: any;
    timestamp: Date;
  }> {
    const events: Array<{
      panelId: string;
      sessionId: string;
      type: 'json' | 'stdout' | 'stderr';
      data: any;
      timestamp: Date;
    }> = [];

    // Get or initialize buffer for this panel
    let buffer = this.messageBuffers.get(panelId) || '';
    
    // Add new data to buffer
    buffer += data;
    
    // Log raw buffer data for debugging line ending issues
    this.logger?.info(`[codex-debug] Raw buffer data (${data.length} chars): ${JSON.stringify(data)}`);
    this.logger?.info(`[codex-debug] Current buffer state (${buffer.length} chars): ${JSON.stringify(buffer.substring(0, 200))}`);
    
    // Process complete lines - handle both Windows (CRLF) and Unix (LF) line endings
    // First normalize CRLF to LF, then split on LF
    const normalizedBuffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Log if we normalized any line endings
    if (buffer !== normalizedBuffer) {
      this.logger?.info(`[codex-debug] Normalized line endings in buffer for panel ${panelId}. Original length: ${buffer.length}, normalized length: ${normalizedBuffer.length}`);
    }
    
    const lines = normalizedBuffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    // Update buffer (store normalized version to prevent accumulation of \r characters)
    this.messageBuffers.set(panelId, buffer);
    
    // Process each complete line
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const jsonMessage = JSON.parse(line);
        this.logger?.info(`[codex-debug] JSON message received from panel ${panelId}: ${JSON.stringify(jsonMessage).substring(0, 500)}`);
        
        // Check if this is a session_configured message with session_id
        if (jsonMessage.msg?.type === 'session_configured' && jsonMessage.msg?.session_id) {
          const codexSessionId = jsonMessage.msg.session_id;
          this.logger?.info(`[codex-debug] Received Codex session ID for panel ${panelId}: ${codexSessionId}`);
          
          // Store the session ID in the panel's custom state
          if (this.sessionManager) {
            const db = (this.sessionManager as any).db;
            if (db) {
              const panel = db.getPanel(panelId);
              if (panel) {
                const currentState = panel.state || {};
                const customState = currentState.customState || {};
                const updatedState = {
                  ...currentState,
                  customState: { ...customState, codexSessionId }
                };
                db.updatePanel(panelId, { state: updatedState });
                this.logger?.info(`[codex-debug] Stored Codex session_id for panel ${panelId}: ${codexSessionId}`);
              }
            }
          }
        }
        
        // Check if this is the initial protocol handshake
        const handshakeComplete = this.protocolHandshakeComplete.get(panelId);
        this.logger?.info(`[codex-debug] Handshake status for panel ${panelId}: ${handshakeComplete ? 'complete' : 'incomplete'}`);
        
        if (!handshakeComplete) {
          this.logger?.info(`[codex-debug] Protocol handshake received for panel ${panelId}: ${JSON.stringify(jsonMessage)}`);
          this.protocolHandshakeComplete.set(panelId, true);
          
          // Check all pending prompts
          this.logger?.info(`[codex-debug] All pending prompts: ${JSON.stringify(Array.from(this.pendingInitialPrompts.entries()))}`);
          
          // Send the pending initial prompt if there is one
          const pendingPrompt = this.pendingInitialPrompts.get(panelId);
          this.logger?.info(`[codex-debug] Pending prompt for panel ${panelId}: ${pendingPrompt ? `"${pendingPrompt}"` : 'none'}`);
          
          if (pendingPrompt) {
            this.logger?.info(`[codex-debug] Sending pending initial prompt to panel ${panelId}: "${pendingPrompt}"`);
            this.pendingInitialPrompts.delete(panelId);
            
            // Send the prompt asynchronously
            setImmediate(async () => {
              try {
                this.logger?.info(`[codex-debug] About to call sendUserInput for panel ${panelId} with prompt: "${pendingPrompt}"`);
                await this.sendUserInput(panelId, pendingPrompt);
                this.logger?.info(`[codex-debug] Successfully sent initial prompt to panel ${panelId}`);
              } catch (error) {
                this.logger?.error(`[codex-debug] Failed to send initial prompt to panel ${panelId}: ${error}`);
              }
            });
          } else {
            this.logger?.warn(`[codex-debug] No pending prompt found for panel ${panelId} after handshake`);
          }
        } else {
          this.logger?.info(`[codex-debug] Handshake already complete for panel ${panelId}, not processing as handshake`);
        }
        
        events.push({
          panelId,
          sessionId,
          type: 'json',
          data: jsonMessage,
          timestamp: new Date()
        });
      } catch (error) {
        // If not valid JSON, treat as regular output
        this.logger?.info(`[codex-debug] Raw stdout from panel ${panelId}: ${line}`);
        
        events.push({
          panelId,
          sessionId,
          type: 'stdout',
          data: line,
          timestamp: new Date()
        });
      }
    }
    
    return events;
  }

  protected async initializeCliEnvironment(options: CodexSpawnOptions): Promise<{ [key: string]: string }> {
    const env: { [key: string]: string } = {};
    
    // Get API key from environment or config
    const config = this.configManager?.getConfig() as any;
    const apiKey = process.env.OPENAI_API_KEY || config?.openaiApiKey;
    if (apiKey) {
      env.OPENAI_API_KEY = apiKey;
    }
    
    // Add other provider API keys if configured
    if (process.env.GEMINI_API_KEY) {
      env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    }
    
    if (process.env.OPENROUTER_API_KEY) {
      env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    }
    
    return env;
  }

  protected async cleanupCliResources(sessionId: string): Promise<void> {
    // Clean up message buffers for all panels of this session
    for (const [panelId, process] of this.processes) {
      if (process.sessionId === sessionId) {
        this.messageBuffers.delete(panelId);
        this.messageIdCounters.delete(panelId);
      }
    }
  }

  protected async getCliEnvironment(options: CodexSpawnOptions): Promise<{ [key: string]: string }> {
    // This is handled in initializeCliEnvironment for Codex
    return {};
  }

  protected getCliNotAvailableMessage(error?: string): string {
    const isWindows = process.platform === 'win32';
    const platformSpecificInstructions = isWindows ? [
      '',
      'Windows-specific notes:',
      '- If Codex is a Node.js script, ensure Node.js is installed and in PATH',
      '- Windows may have issues with Unix shebang lines - Crystal will attempt Node.js fallback',
      '- Try running "node codex --version" if direct execution fails',
      '- Consider using PowerShell or Command Prompt with administrator privileges'
    ] : [];

    return [
      `Error: ${error}`,
      '',
      'Codex is not installed or not found in your PATH.',
      '',
      'Please install Codex:',
      '1. Run: npm install -g @openai/codex',
      '   Or: bun add -g @openai/codex',
      '2. Verify installation by running "codex --version" in your terminal',
      '',
      'Note: Codex now supports GPT-5 (released August 7, 2025) by default',
      '',
      'If Codex is installed but not in your PATH:',
      '- Add the Codex installation directory to your PATH',
      '- Or set a custom Codex path in Crystal Settings',
      ...platformSpecificInstructions
    ].join('\n');
  }

  // Override spawnCliProcess to use pipes instead of PTY for Codex
  async spawnCliProcess(options: CodexSpawnOptions): Promise<void> {
    try {
      const { panelId, sessionId, worktreePath } = options;
      this.logger?.info(`[codex-debug] Starting spawn process for panel ${panelId} (session ${sessionId}) in ${worktreePath}`);

      // Test CLI availability
      const availability = await this.getCachedAvailability();
      if (!availability.available) {
        await this.handleCliNotAvailable(availability, panelId, sessionId);
        throw new Error(`Codex CLI not available: ${availability.error}`);
      }

      // Build command arguments
      const args = this.buildCommandArgs(options);
      
      // Get CLI executable path
      const cliCommand = await this.getCliExecutablePath();
      
      // Initialize CLI environment
      const cliEnv = await this.initializeCliEnvironment(options);
      const systemEnv = await this.getSystemEnvironment();
      const env = { ...process.env, ...systemEnv, ...cliEnv };

      // Check if we need Node.js fallback
      let finalCommand = cliCommand;
      let finalArgs = args;
      
      if ((global as any).codexNeedsNodeFallback) {
        this.logger?.info('[codex-debug] Using Node.js fallback for Codex execution due to previous detection');
        const { findNodeExecutable } = require('../../../utils/nodeFinder');
        try {
          const nodePath = await findNodeExecutable();
          this.logger?.info(`[codex-debug] Using Node.js at: ${nodePath} for Codex execution`);
          finalCommand = nodePath;
          finalArgs = [cliCommand, ...args];
          this.logger?.info(`[codex-debug] Node.js fallback command prepared: "${finalCommand}" with args: [${finalArgs.join(', ')}]`);
        } catch (nodeError: any) {
          const nodeErrorMsg = nodeError.message || String(nodeError);
          this.logger?.error(`[codex-debug] Failed to find Node.js for fallback: ${nodeErrorMsg}`);
          this.logger?.error('[codex-debug] Node.js fallback preparation stack trace:', nodeError instanceof Error ? nodeError : undefined);
          
          // Reset the fallback flag and try original command
          this.logger?.warn('[codex-debug] Disabling Node.js fallback mode and attempting direct execution');
          (global as any).codexNeedsNodeFallback = false;
          // Continue with original command as fallback
        }
      }

      // Spawn the process with pipes (not PTY)
      this.logger?.info(`[codex-debug] Spawning Codex process:\n  Command: ${finalCommand}\n  Args: ${finalArgs.join(' ')}\n  Working directory: ${worktreePath}\n  Environment vars: ${Object.keys(cliEnv).join(', ')}`);
      const childProcess = spawn(finalCommand, finalArgs, {
        cwd: worktreePath,
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Verify the process started
      if (!childProcess || !childProcess.pid) {
        throw new Error('Failed to spawn Codex process');
      }

      // Store the process
      this.codexProcesses.set(panelId, childProcess);
      this.logger?.info(`[codex-debug] Process spawned successfully for panel ${panelId} with PID ${childProcess.pid}`);
      
      // Set up event handlers
      childProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        this.logger?.info(`[codex-debug] STDOUT received (${output.length} chars): ${output}`);
        const events = this.parseCliOutput(output, panelId, sessionId);
        this.logger?.info(`[codex-debug] Parsed ${events.length} events from stdout`);
        events.forEach(event => this.emit('output', event));
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        this.logger?.error(`[codex-debug] STDERR: ${output}`);
        this.emit('output', {
          panelId,
          sessionId,
          type: 'stderr',
          data: output,
          timestamp: new Date()
        });
      });

      childProcess.on('exit', (code, signal) => {
        this.logger?.info(`[codex-debug] Process exited for panel ${panelId} with code ${code}, signal: ${signal}`);
        this.codexProcesses.delete(panelId);
        this.messageBuffers.delete(panelId);
        this.messageIdCounters.delete(panelId);
        this.pendingInitialPrompts.delete(panelId);
        this.protocolHandshakeComplete.delete(panelId);
        this.emit('exit', { panelId, sessionId, exitCode: code, signal });
      });

      childProcess.on('error', (error) => {
        const errorMsg = error.message || String(error);
        this.logger?.error(`[codex-debug] Process error for panel ${panelId}: ${errorMsg}\nStack: ${error.stack}`);
        
        // Enhanced error message for Windows compatibility issues
        let enhancedErrorMsg = errorMsg;
        if (errorMsg.includes('ENOENT') || errorMsg.includes('spawn') || errorMsg.includes('is not recognized')) {
          enhancedErrorMsg = `Codex process failed to start on ${process.platform}. ` +
                            `This may be due to shebang compatibility issues on Windows. ` +
                            `Original error: ${errorMsg}. ` +
                            `Please ensure Codex is properly installed and Node.js is available if using a Node.js-based Codex installation.`;
        }
        
        this.codexProcesses.delete(panelId); // Clean up on error
        this.messageBuffers.delete(panelId);
        this.messageIdCounters.delete(panelId);
        this.pendingInitialPrompts.delete(panelId);
        this.protocolHandshakeComplete.delete(panelId);
        this.emit('error', { panelId, sessionId, error: enhancedErrorMsg });
      });

      // Emit spawned event
      this.emit('spawned', { panelId, sessionId });
      this.logger?.info(`[codex-debug] Spawn complete for panel ${panelId} (session ${sessionId})`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`[codex-debug] Failed to spawn Codex for panel ${options.panelId}: ${errorMessage}\nStack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      this.emit('error', {
        panelId: options.panelId,
        sessionId: options.sessionId,
        error: errorMessage
      });
      throw error;
    }
  }

  // Override killProcess to work with regular child processes
  async killProcess(panelId: string): Promise<void> {
    const childProcess = this.codexProcesses.get(panelId);
    if (childProcess) {
      childProcess.kill();
      this.codexProcesses.delete(panelId);
    }
    
    // Also call parent method in case it's using PTY
    await super.killProcess(panelId);
  }

  // Public methods for panel interaction
  
  async checkAvailability(customPath?: string): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
    return this.getCachedAvailability();
  }

  async startPanel(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    prompt: string,
    model?: string,
    modelProvider?: string
  ): Promise<void> {
    const options: CodexSpawnOptions = {
      panelId,
      sessionId,
      worktreePath,
      prompt,
      model: model || DEFAULT_CODEX_MODEL,
      modelProvider: modelProvider || 'openai'
    };
    
    // Initialize message ID counter for this panel
    this.messageIdCounters.set(panelId, 1);
    this.logger?.info(`[codex-debug] Initialized message counter for panel ${panelId}`);
    
    // Store the initial prompt to send after handshake
    this.pendingInitialPrompts.set(panelId, prompt);
    this.logger?.info(`[codex-debug] Stored pending prompt for panel ${panelId}: "${prompt}"`);
    
    await this.spawnCliProcess(options);
    
    // Verify the process was spawned successfully
    const processCheck = this.codexProcesses.get(panelId);
    if (!processCheck) {
      throw new Error(`Failed to spawn Codex process for panel ${panelId} - process not found after spawn`);
    }
    
    this.logger?.info(`[codex-debug] Process verified for panel ${panelId}, PID: ${processCheck.pid}, waiting for protocol handshake...`);
    
    // The initial prompt will be sent when we receive the initial protocol message from Codex
  }

  async continuePanel(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    prompt: string,
    conversationHistory: any[]
  ): Promise<void> {
    // Check if we have a stored Codex session ID to resume from
    const codexSessionId = this.sessionManager?.getPanelCodexSessionId?.(panelId);
    
    if (codexSessionId) {
      this.logger?.info(`[codex-debug] Resuming Codex session ${codexSessionId} for panel ${panelId}`);
      
      // Use Codex's resume command to continue the conversation
      const options: CodexSpawnOptions = {
        panelId,
        sessionId,
        worktreePath,
        prompt,
        isResume: true,
        resumeSessionId: codexSessionId
      };
      
      // Initialize message ID counter for this panel
      this.messageIdCounters.set(panelId, 1);
      
      // If we have a prompt, store it to send after connection
      if (prompt && prompt.trim()) {
        this.pendingInitialPrompts.set(panelId, prompt);
        this.logger?.info(`[codex-debug] Stored pending prompt for resumed panel ${panelId}: "${prompt}"`);
      }
      
      await this.spawnCliProcess(options);
      
      // Verify the process was spawned successfully
      const processCheck = this.codexProcesses.get(panelId);
      if (!processCheck) {
        throw new Error(`Failed to spawn Codex process for panel ${panelId} - process not found after spawn`);
      }
      
      this.logger?.info(`[codex-debug] Resume process verified for panel ${panelId}, PID: ${processCheck.pid}`);
    } else {
      // No session ID to resume from, start a new session
      this.logger?.warn(`[codex-debug] No Codex session ID found for panel ${panelId}, starting new session`);
      await this.startPanel(panelId, sessionId, worktreePath, prompt);
    }
  }

  async stopPanel(panelId: string): Promise<void> {
    // Send shutdown command before killing
    await this.sendShutdown(panelId);
    
    // Give it a moment to shut down gracefully
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Then kill the process
    await this.killProcess(panelId);
    
    // Clean up buffers
    this.messageBuffers.delete(panelId);
    this.messageIdCounters.delete(panelId);
    this.pendingInitialPrompts.delete(panelId);
    this.protocolHandshakeComplete.delete(panelId);
  }

  async restartPanelWithHistory(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    initialPrompt: string,
    conversationHistory: string[]
  ): Promise<void> {
    // Kill existing process if it exists
    await this.killProcess(panelId);
    
    // For now, just restart with the initial prompt
    // TODO: Implement conversation history replay if Codex supports it
    // GPT-5 (released August 7, 2025) may support better history replay
    await this.startPanel(panelId, sessionId, worktreePath, initialPrompt);
  }

  // Codex-specific methods

  async sendUserInput(panelId: string, text: string): Promise<void> {
    const childProcess = this.codexProcesses.get(panelId);
    this.logger?.info(`[codex-debug] sendUserInput: Looking for process for panel ${panelId}, found: ${!!childProcess}`);
    if (childProcess) {
      this.logger?.info(`[codex-debug] Process details: PID=${childProcess.pid}, stdin available=${!!childProcess.stdin}`);
    }
    
    if (!childProcess) {
      // Log what processes we have
      this.logger?.error(`[codex-debug] No process found for panel ${panelId}. Available panels: ${Array.from(this.codexProcesses.keys()).join(', ')}`);
      throw new Error(`No Codex process found for panel ${panelId}`);
    }
    
    if (!childProcess.stdin) {
      throw new Error(`Codex process for panel ${panelId} has no stdin`);
    }
    
    const messageId = this.getNextMessageId(panelId);
    const message = {
      id: `msg-${messageId}`,
      op: {
        type: 'user_input',
        items: [
          {
            type: 'text',
            text: text
          }
        ]
      }
    };
    
    this.logger?.info(`[codex-debug] Sending user input to panel ${panelId}:\n  Message ID: ${message.id}\n  Text: "${text}"`);
    
    try {
      const written = this.writeJsonMessage(childProcess, message, panelId);
      
      // Save the user input to the database so it persists across refreshes
      if (this.sessionManager) {
        this.sessionManager.addPanelOutput(panelId, {
          panelId,
          type: 'json',
          data: message,
          timestamp: new Date()
        });
        this.logger?.info(`[codex-debug] Saved user input to database for panel ${panelId}`);
      }
    } catch (error) {
      this.logger?.error(`[codex-debug] STDIN write failed for panel ${panelId}: ${error}`);
      throw error;
    }
  }

  async sendApproval(panelId: string, callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch'): Promise<void> {
    const childProcess = this.codexProcesses.get(panelId);
    if (!childProcess || !childProcess.stdin) {
      throw new Error(`No Codex process found for panel ${panelId}`);
    }
    
    const messageId = this.getNextMessageId(panelId);
    const message = {
      id: `msg-${messageId}`,
      op: {
        type: type === 'exec' ? 'exec_approval' : 'patch_approval',
        id: callId,
        decision: decision
      }
    };
    
    this.logger?.info(`[codex-debug] Sending approval to panel ${panelId}:\n  Call ID: ${callId}\n  Decision: ${decision}\n  Type: ${type}`);
    
    this.writeJsonMessage(childProcess, message, panelId);
  }

  async sendInterrupt(panelId: string): Promise<void> {
    const childProcess = this.codexProcesses.get(panelId);
    if (!childProcess || !childProcess.stdin) {
      throw new Error(`No Codex process found for panel ${panelId}`);
    }
    
    const messageId = this.getNextMessageId(panelId);
    const message = {
      id: `msg-${messageId}`,
      op: {
        type: 'interrupt'
      }
    };
    
    this.logger?.info(`[codex-debug] Sending interrupt to panel ${panelId}`);
    
    this.writeJsonMessage(childProcess, message, panelId);
  }

  private async sendShutdown(panelId: string): Promise<void> {
    const childProcess = this.codexProcesses.get(panelId);
    if (!childProcess || !childProcess.stdin) {
      return; // Already shut down
    }
    
    const messageId = this.getNextMessageId(panelId);
    const message = {
      id: `msg-${messageId}`,
      op: {
        type: 'shutdown'
      }
    };
    
    this.logger?.info(`[codex-debug] Sending shutdown to panel ${panelId}`);
    
    try {
      this.writeJsonMessage(childProcess, message, panelId);
    } catch (error) {
      this.logger?.warn(`[codex-debug] Failed to send shutdown to panel ${panelId}: ${error}`);
    }
  }

  private getNextMessageId(panelId: string): string {
    const current = this.messageIdCounters.get(panelId) || 1;
    this.messageIdCounters.set(panelId, current + 1);
    const uuid = uuidv4();
    return `${current}-${uuid}`;
  }

  /**
   * Helper method to write JSON messages to stdin with proper platform line endings
   */
  private writeJsonMessage(childProcess: ChildProcessWithoutNullStreams, message: any, panelId: string): boolean {
    const jsonStr = JSON.stringify(message) + this.lineEnding;
    this.logger?.info(`[codex-debug] Writing JSON message to panel ${panelId} with ${process.platform} line ending (${this.lineEnding === '\r\n' ? 'CRLF' : 'LF'}): ${JSON.stringify(message)}`);
    
    try {
      const written = childProcess.stdin.write(jsonStr);
      this.logger?.info(`[codex-debug] STDIN write successful for panel ${panelId}, bytes written: ${written}`);
      return written;
    } catch (error) {
      this.logger?.error(`[codex-debug] STDIN write failed for panel ${panelId}: ${error}`);
      throw error;
    }
  }

  private async findCodexExecutable(): Promise<string | null> {
    // Check environment variable override first
    if (process.env.CODEX_PATH) {
      this.logger?.info(`[codex-debug] Using CODEX_PATH environment variable: ${process.env.CODEX_PATH}`);
      return process.env.CODEX_PATH;
    }
    
    // List of executable names to try in order of preference
    const executablesToTry = [
      'codex',  // Basic name - findExecutableInPath will try .exe, .cmd, .bat on Windows
      `codex-${this.getPlatformBinary()}`,  // Platform-specific binary
    ];
    
    // On Windows, also try some common variations
    if (process.platform === 'win32') {
      executablesToTry.push(
        'codex.exe',
        'codex.cmd', 
        'codex.bat'
      );
    }
    
    this.logger?.info(`[codex-debug] Searching for Codex executable. Will try: ${executablesToTry.join(', ')}`);
    
    // Try each executable name in order
    for (const executableName of executablesToTry) {
      this.logger?.info(`[codex-debug] Checking for: ${executableName}`);
      const result = findExecutableInPath(executableName);
      
      if (result) {
        this.logger?.info(`[codex-debug] Found Codex at: ${result}`);
        return result;
      }
    }
    
    this.logger?.info(`[codex-debug] Codex not found in PATH. Searched for: ${executablesToTry.join(', ')}`);
    return null;
  }

  private getPlatformBinary(): string {
    const platform = process.platform;
    const arch = process.arch;
    
    this.logger?.info(`[codex-debug] Getting platform binary for platform: ${platform}, arch: ${arch}`);
    
    if (platform === 'darwin') {
      const binary = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
      this.logger?.info(`[codex-debug] macOS platform binary: ${binary}`);
      return binary;
    } else if (platform === 'linux') {
      const binary = arch === 'arm64' ? 'aarch64-unknown-linux-musl' : 'x86_64-unknown-linux-musl';
      this.logger?.info(`[codex-debug] Linux platform binary: ${binary}`);
      return binary;
    } else if (platform === 'win32') {
      const binary = 'x86_64-pc-windows-msvc.exe';
      this.logger?.info(`[codex-debug] Windows platform binary: ${binary}`);
      return binary;
    }
    
    // Default fallback
    this.logger?.info(`[codex-debug] Using default fallback platform binary: x86_64-unknown-linux-musl`);
    return 'x86_64-unknown-linux-musl';
  }

  /**
   * Get debug state information for a panel
   */
  async getDebugState(panelId: string): Promise<any> {
    this.logger?.info(`[codex-debug] Getting debug state for panel ${panelId}`);
    
    const cliProcess = this.processes.get(panelId);
    const childProcess = this.codexProcesses.get(panelId);
    const messageBuffer = this.messageBuffers.get(panelId);
    const messageIdCounter = this.messageIdCounters.get(panelId);
    const pendingPrompt = this.pendingInitialPrompts.get(panelId);
    const handshakeComplete = this.protocolHandshakeComplete.get(panelId);
    
    // Log what we found
    this.logger?.info(`[codex-debug] Debug state check:
      - cliProcess exists: ${!!cliProcess}
      - childProcess exists: ${!!childProcess}
      - messageBuffer length: ${messageBuffer?.length || 0}
      - handshake complete: ${handshakeComplete || false}
      - pending prompt: ${!!pendingPrompt}`);
    
    // Get panel and session information from panelManager
    const { panelManager } = require('../../panelManager');
    const panel = panelManager.getPanel(panelId);
    const sessionId = cliProcess?.sessionId || panel?.sessionId || 'unknown';
    
    // Track process state and timing
    const now = Date.now();
    let processState: string = 'not_started';
    let pid: number | undefined;
    let isConnected = false;
    let startTime: string | undefined;
    let lastMessageTime: string | undefined;
    let timeSinceLastMessage: number | undefined;
    
    if (childProcess && childProcess.pid) {
      pid = childProcess.pid;
      isConnected = !childProcess.killed;
      processState = childProcess.killed ? 'stopped' : 'running';
      this.logger?.info(`[codex-debug] Found child process with PID ${pid}, connected: ${isConnected}`);
    } else if (cliProcess && cliProcess.process) {
      pid = cliProcess.process.pid;
      // Check if PTY process is still running
      try {
        // Send null signal to check if process is alive
        process.kill(pid, 0);
        isConnected = true;
        processState = 'running';
        this.logger?.info(`[codex-debug] Found PTY process with PID ${pid}, connected: true`);
      } catch {
        isConnected = false;
        processState = 'stopped';
        this.logger?.info(`[codex-debug] Found PTY process with PID ${pid}, but it's not running`);
      }
    } else {
      this.logger?.info(`[codex-debug] No process found for panel ${panelId}`);
    }
    
    // Get panel state for additional info
    const panelState = panel?.state?.customState as any;
    if (panelState) {
      startTime = panelState.startTime;
      lastMessageTime = panelState.lastActivityTime;
      
      if (lastMessageTime) {
        timeSinceLastMessage = now - new Date(lastMessageTime).getTime();
      }
    }
    
    // Get message statistics
    const outputs = this.sessionManager.getSessionOutputsForPanel(panelId, 1000);
    const messageStats = {
      totalMessagesReceived: outputs.filter((o: any) => o.type === 'json').length,
      totalMessagesSent: outputs.filter((o: any) => o.data && typeof o.data === 'object' && o.data.role === 'user').length,
      messageBufferSize: messageBuffer ? messageBuffer.length : 0
    };
    
    return {
      // Process information
      pid,
      isConnected,
      
      // Session information
      sessionId,
      panelId,
      worktreePath: cliProcess?.worktreePath,
      
      // Timing information
      startTime,
      lastMessageTime,
      timeSinceLastMessage,
      
      // Message statistics
      ...messageStats,
      
      // Process state
      processState,
      lastError: panelState?.lastError,
      
      // Protocol information
      protocolHandshakeComplete: handshakeComplete || false,
      pendingPrompt,
      
      // Model information
      model: panelState?.model,
      modelProvider: panelState?.modelProvider
    };
  }
}
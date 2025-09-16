import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawn, ChildProcessWithoutNullStreams } from 'child_process';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import { findExecutableInPath } from '../../../utils/shellPath';
import { AbstractCliManager } from '../cli/AbstractCliManager';

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
  
  constructor(
    sessionManager: any,
    logger?: Logger,
    configManager?: ConfigManager
  ) {
    super(sessionManager, logger, configManager);
    this.logger?.info('[codex-debug] CodexManager initialized');
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
      const version = execSync(`"${command}" --version`, { encoding: 'utf8' }).trim();
      this.logger?.info(`[codex-debug] Codex version detected: ${version}`);
      
      return {
        available: true,
        version,
        path: command
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`[codex-debug] Codex availability test failed: ${errorMessage}`);
      return {
        available: false,
        error: `Codex not found: ${errorMessage}`
      };
    }
  }

  protected buildCommandArgs(options: CodexSpawnOptions): string[] {
    const args: string[] = ['proto'];
    
    // Model configuration (defaults to GPT-5)
    const model = options.model || 'gpt-5';
    args.push('-c', `model="${model}"`);
    
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
    
    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    // Update buffer
    this.messageBuffers.set(panelId, buffer);
    
    // Process each complete line
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const jsonMessage = JSON.parse(line);
        this.logger?.info(`[codex-debug] JSON message received from panel ${panelId}: ${JSON.stringify(jsonMessage).substring(0, 500)}`);
        
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
      '- Or set a custom Codex path in Crystal Settings'
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

      // Spawn the process with pipes (not PTY)
      this.logger?.info(`[codex-debug] Spawning Codex process:\n  Command: ${cliCommand}\n  Args: ${args.join(' ')}\n  Working directory: ${worktreePath}\n  Environment vars: ${Object.keys(cliEnv).join(', ')}`);
      const childProcess = spawn(cliCommand, args, {
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
        this.logger?.error(`[codex-debug] Process error for panel ${panelId}: ${error.message}\nStack: ${error.stack}`);
        this.codexProcesses.delete(panelId); // Clean up on error
        this.messageBuffers.delete(panelId);
        this.messageIdCounters.delete(panelId);
        this.pendingInitialPrompts.delete(panelId);
        this.protocolHandshakeComplete.delete(panelId);
        this.emit('error', { panelId, sessionId, error: error.message });
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
      model: model || 'gpt-5', // Default to GPT-5 (released August 7, 2025)
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
    // For now, just start a new session with the prompt
    // TODO: Implement conversation history resumption if Codex supports it
    // GPT-5 (released August 7, 2025) has improved context handling
    await this.startPanel(panelId, sessionId, worktreePath, prompt);
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
    
    const jsonStr = JSON.stringify(message) + '\n';
    this.logger?.info(`[codex-debug] Sending user input to panel ${panelId}:\n  Message ID: ${message.id}\n  Text: "${text}"\n  Full JSON: ${jsonStr}`);
    
    try {
      const written = childProcess.stdin.write(jsonStr);
      this.logger?.info(`[codex-debug] STDIN write successful for panel ${panelId}, bytes written: ${written}`);
      
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
    
    const jsonStr = JSON.stringify(message) + '\n';
    this.logger?.info(`[codex-debug] Sending approval to panel ${panelId}:\n  Call ID: ${callId}\n  Decision: ${decision}\n  Type: ${type}\n  Full JSON: ${jsonStr}`);
    
    childProcess.stdin.write(jsonStr);
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
    
    const jsonStr = JSON.stringify(message) + '\n';
    this.logger?.info(`[codex-debug] Sending interrupt to panel ${panelId}: ${jsonStr}`);
    
    childProcess.stdin.write(jsonStr);
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
    
    const jsonStr = JSON.stringify(message) + '\n';
    this.logger?.info(`[codex-debug] Sending shutdown to panel ${panelId}: ${jsonStr}`);
    
    try {
      childProcess.stdin.write(jsonStr);
    } catch (error) {
      this.logger?.warn(`[codex-debug] Failed to send shutdown to panel ${panelId}: ${error}`);
    }
  }

  private getNextMessageId(panelId: string): number {
    const current = this.messageIdCounters.get(panelId) || 1;
    this.messageIdCounters.set(panelId, current + 1);
    return current;
  }

  private async findCodexExecutable(): Promise<string | null> {
    // Check environment variable override
    if (process.env.CODEX_PATH) {
      return process.env.CODEX_PATH;
    }
    
    // Check common installation locations
    const locations = [
      // Bun
      path.join(os.homedir(), '.bun/install/global/node_modules/@openai/codex/bin/codex-' + this.getPlatformBinary()),
      // NPM (user)
      path.join(os.homedir(), '.local/share/npm/lib/node_modules/@openai/codex/bin/codex-' + this.getPlatformBinary()),
      // NPM (system)
      '/usr/local/lib/node_modules/@openai/codex/bin/codex-' + this.getPlatformBinary(),
      '/opt/homebrew/lib/node_modules/@openai/codex/bin/codex-' + this.getPlatformBinary(),
      // Native binaries
      path.join(os.homedir(), '.cargo/bin/codex'),
      '/usr/local/bin/codex',
      '/opt/homebrew/bin/codex'
    ];
    
    // Windows specific
    if (process.platform === 'win32') {
      locations.push(
        path.join(process.env.APPDATA || '', 'npm/codex.cmd'),
        path.join(process.env.APPDATA || '', 'npm/codex.ps1')
      );
    }
    
    // Check each location
    for (const location of locations) {
      if (fs.existsSync(location)) {
        this.logger?.info(`[codex-debug] Found Codex executable at: ${location}`);
        return location;
      }
    }
    
    // Finally check PATH
    const pathResult = findExecutableInPath('codex');
    if (pathResult) {
      return pathResult;
    }
    
    return null;
  }

  private getPlatformBinary(): string {
    const platform = process.platform;
    const arch = process.arch;
    
    if (platform === 'darwin') {
      return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    } else if (platform === 'linux') {
      return arch === 'arm64' ? 'aarch64-unknown-linux-musl' : 'x86_64-unknown-linux-musl';
    } else if (platform === 'win32') {
      return 'x86_64-pc-windows-msvc.exe';
    }
    
    // Default fallback
    return 'x86_64-unknown-linux-musl';
  }
}
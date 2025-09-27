import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import * as path from 'path';
import * as os from 'os';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import type { ConversationMessage } from '../../../database/models';
import { getShellPath, findExecutableInPath } from '../../../utils/shellPath';
import { findNodeExecutable } from '../../../utils/nodeFinder';

interface CliProcess {
  process: pty.IPty;
  panelId: string;
  sessionId: string;
  worktreePath: string;
}

interface AvailabilityCache {
  result: { available: boolean; error?: string; version?: string; path?: string };
  timestamp: number;
}

interface CliSpawnOptions {
  panelId: string;
  sessionId: string;
  worktreePath: string;
  prompt: string;
  isResume?: boolean;
  [key: string]: unknown; // Allow CLI-specific options
}

interface CliOutputEvent {
  panelId: string;
  sessionId: string;
  type: 'json' | 'stdout' | 'stderr';
  data: unknown;
  timestamp: Date;
}

interface CliExitEvent {
  panelId: string;
  sessionId: string;
  exitCode: number | null;
  signal: number | null;
}

interface CliErrorEvent {
  panelId: string;
  sessionId: string;
  error: string;
}

interface CliSpawnedEvent {
  panelId: string;
  sessionId: string;
}

/**
 * Abstract base class for managing CLI tool processes in Crystal
 * Provides common functionality for spawning, managing, and communicating with CLI tools
 */
export abstract class AbstractCliManager extends EventEmitter {
  protected processes: Map<string, CliProcess> = new Map(); // Keyed by panelId
  protected availabilityCache: AvailabilityCache | null = null;
  protected readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
  protected readonly execAsync = promisify(exec);

  constructor(
    protected sessionManager: import('../../sessionManager').SessionManager,
    protected logger?: Logger,
    protected configManager?: ConfigManager
  ) {
    super();
    // Increase max listeners to prevent warnings when many components listen to events
    this.setMaxListeners(50);
  }

  // Abstract methods that must be implemented by subclasses

  /**
   * Get the CLI tool name (e.g., 'claude', 'aider')
   */
  protected abstract getCliToolName(): string;

  /**
   * Test if the CLI tool is available and get version/path info
   */
  protected abstract testCliAvailability(customPath?: string): Promise<{ available: boolean; error?: string; version?: string; path?: string }>;

  /**
   * Build command arguments for the CLI tool
   */
  protected abstract buildCommandArgs(options: CliSpawnOptions): string[];

  /**
   * Get the CLI executable path (custom or from PATH)
   */
  protected abstract getCliExecutablePath(): Promise<string>;

  /**
   * Parse and handle CLI output data
   * @param data Raw output data from the CLI
   * @param panelId Panel ID for the output
   * @param sessionId Session ID for the output
   * @returns Array of processed output events
   */
  protected abstract parseCliOutput(data: string, panelId: string, sessionId: string): CliOutputEvent[];

  /**
   * Handle CLI-specific initialization (e.g., setup config files, environment)
   */
  protected abstract initializeCliEnvironment(options: CliSpawnOptions): Promise<{ [key: string]: string }>;

  /**
   * Clean up CLI-specific resources (e.g., config files, temporary files)
   */
  protected abstract cleanupCliResources(sessionId: string): Promise<void>;

  /**
   * Get CLI-specific environment variables
   */
  protected abstract getCliEnvironment(options: CliSpawnOptions): Promise<{ [key: string]: string }>;

  // Common functionality that can be shared across CLI tools

  /**
   * Spawn a CLI process for a specific panel
   */
  async spawnCliProcess(options: CliSpawnOptions): Promise<void> {
    try {
      const { panelId, sessionId, worktreePath } = options;
      this.logger?.verbose(`Spawning ${this.getCliToolName()} for panel ${panelId} (session ${sessionId}) in ${worktreePath}`);

      // Test CLI availability (with caching)
      const availability = await this.getCachedAvailability();
      if (!availability.available) {
        await this.handleCliNotAvailable(availability, panelId, sessionId);
        throw new Error(`${this.getCliToolName()} CLI not available: ${availability.error}`);
      }

      this.logger?.verbose(`${this.getCliToolName()} found: ${availability.version || 'version unknown'}`);
      if (availability.path) {
        this.logger?.verbose(`${this.getCliToolName()} executable path: ${availability.path}`);
      }

      // Build command arguments
      const args = this.buildCommandArgs(options);

      // Initialize CLI-specific environment
      const cliEnv = await this.initializeCliEnvironment(options);

      // Get system environment with PATH enhancement
      const systemEnv = await this.getSystemEnvironment();

      // Merge environments
      const env = { ...systemEnv, ...cliEnv };

      // Get CLI executable path
      const cliCommand = await this.getCliExecutablePath();
      
      // Log the exact command being executed
      const fullCommand = `${cliCommand} ${args.join(' ')}`;
      this.logger?.info(`[${this.getCliToolName()}-command] COMMAND: ${fullCommand}`);
      this.logger?.info(`[${this.getCliToolName()}-command] Working directory: ${worktreePath}`);
      this.logger?.info(`[${this.getCliToolName()}-command] Environment vars: ${Object.keys(cliEnv).join(', ')}`);

      // Spawn the process
      const ptyProcess = await this.spawnPtyProcess(cliCommand, args, worktreePath, env);

      // Create process record
      const cliProcess: CliProcess = {
        process: ptyProcess,
        panelId,
        sessionId,
        worktreePath
      };

      this.processes.set(panelId, cliProcess);
      this.logger?.verbose(`${this.getCliToolName()} process created for panel ${panelId} (session ${sessionId})`);

      // Set up process event handlers
      this.setupProcessHandlers(ptyProcess, panelId, sessionId);

      // Emit spawned event
      this.emit('spawned', { panelId, sessionId } as CliSpawnedEvent);

      this.logger?.info(`${this.getCliToolName()} spawned successfully for panel ${panelId} (session ${sessionId})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to spawn ${this.getCliToolName()} for panel ${options.panelId} (session ${options.sessionId})`, error instanceof Error ? error : undefined);

      this.emit('error', {
        panelId: options.panelId,
        sessionId: options.sessionId,
        error: errorMessage
      } as CliErrorEvent);
      throw error;
    }
  }

  /**
   * Send input to a CLI process
   */
  sendInput(panelId: string, input: string): void {
    const cliProcess = this.processes.get(panelId);
    if (!cliProcess) {
      throw new Error(`No ${this.getCliToolName()} process found for panel ${panelId}`);
    }

    // Validate that the process matches the expected panel and session context
    if (cliProcess.panelId !== panelId) {
      this.logger?.error(`[${this.getCliToolName()}] Panel ID mismatch: process has ${cliProcess.panelId}, expected ${panelId}`);
      throw new Error(`Panel ID mismatch: process belongs to different panel`);
    }

    this.logger?.verbose(`[${this.getCliToolName()}] Sending input to panel ${panelId} (session ${cliProcess.sessionId})`);
    cliProcess.process.write(input);
  }

  /**
   * Kill a CLI process and clean up resources
   */
  async killProcess(panelId: string): Promise<void> {
    const cliProcess = this.processes.get(panelId);
    if (!cliProcess) {
      return;
    }

    const { sessionId } = cliProcess;
    const pid = cliProcess.process.pid;

    // Get all child processes before killing
    let killedProcesses: { pid: number; name?: string }[] = [];
    if (pid) {
      const descendantPids = this.getAllDescendantPids(pid);
      if (descendantPids.length > 0) {
        killedProcesses = await this.getProcessInfo(descendantPids);
        this.logger?.info(`[${this.getCliToolName()}] Found ${descendantPids.length} child processes started by ${this.getCliToolName()} for session ${sessionId}`);
      }
    }

    // Clean up CLI-specific resources
    await this.cleanupCliResources(sessionId);

    // Kill the process and all its children
    if (pid) {
      const success = await this.killProcessTree(pid, panelId, sessionId);

      // Report what processes were killed
      if (killedProcesses.length > 0) {
        const processReport = killedProcesses.map(p => `${p.name || 'unknown'}(${p.pid})`).join(', ');
        const message = `\n[Process Cleanup] Terminated ${killedProcesses.length} child process${killedProcesses.length > 1 ? 'es' : ''} started by ${this.getCliToolName()}: ${processReport}\n`;
        this.emit('output', {
          panelId,
          sessionId,
          type: 'stdout',
          data: message,
          timestamp: new Date()
        } as CliOutputEvent);
      }

      if (!success) {
        this.logger?.error(`Failed to cleanly terminate all child processes for ${this.getCliToolName()} panel ${panelId} (session ${sessionId})`);
      }
    } else {
      // Fallback to simple kill if no PID
      cliProcess.process.kill();
    }

    this.processes.delete(panelId);
  }

  /**
   * Get a CLI process by panel ID
   */
  getProcess(panelId: string): CliProcess | undefined {
    return this.processes.get(panelId);
  }

  /**
   * Get all active process panel IDs
   */
  getAllProcesses(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Check if a panel is running
   */
  isPanelRunning(panelId: string): boolean {
    return this.processes.has(panelId);
  }

  /**
   * Kill all CLI processes on shutdown
   */
  async killAllProcesses(): Promise<void> {
    const panelIds = Array.from(this.processes.keys());
    this.logger?.info(`[${this.getCliToolName()}] Killing ${panelIds.length} ${this.getCliToolName()} panel processes on shutdown`);

    const killPromises = panelIds.map(panelId => this.killProcess(panelId));
    await Promise.all(killPromises);
  }

  /**
   * Clear the CLI availability cache
   */
  clearAvailabilityCache(): void {
    this.availabilityCache = null;
    this.logger?.verbose(`[${this.getCliToolName()}Manager] Cleared ${this.getCliToolName()} availability cache`);
  }

  // Abstract methods for CLI-specific implementations

  /**
   * Start a CLI panel with the given options
   * This should be implemented by each CLI tool manager
   */
  abstract startPanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, ...args: unknown[]): Promise<void>;

  /**
   * Continue a CLI panel with conversation history
   * This should be implemented by each CLI tool manager
   */
  abstract continuePanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, conversationHistory: ConversationMessage[], ...args: unknown[]): Promise<void>;

  /**
   * Stop a CLI panel
   * This should be implemented by each CLI tool manager
   */
  abstract stopPanel(panelId: string): Promise<void>;

  /**
   * Restart a panel with conversation history
   * This should be implemented by each CLI tool manager
   */
  abstract restartPanelWithHistory(panelId: string, sessionId: string, worktreePath: string, initialPrompt: string, conversationHistory: ConversationMessage[]): Promise<void>;

  // Legacy session-based methods for backward compatibility
  // These provide default implementations that map to panel-based methods

  /**
   * @deprecated Use startPanel with real panel IDs instead
   */
  async startSession(sessionId: string, worktreePath: string, prompt: string, ...args: unknown[]): Promise<void> {
    console.warn(`[${this.getCliToolName()}Manager] DEPRECATED: startSession called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    const virtualPanelId = `session-${sessionId}`;
    return this.startPanel(virtualPanelId, sessionId, worktreePath, prompt, ...args);
  }

  /**
   * @deprecated Use continuePanel with real panel IDs instead
   */
  async continueSession(sessionId: string, worktreePath: string, prompt: string, conversationHistory: ConversationMessage[], ...args: unknown[]): Promise<void> {
    console.warn(`[${this.getCliToolName()}Manager] DEPRECATED: continueSession called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    const virtualPanelId = `session-${sessionId}`;
    return this.continuePanel(virtualPanelId, sessionId, worktreePath, prompt, conversationHistory, ...args);
  }

  /**
   * @deprecated Use stopPanel with real panel IDs instead
   */
  async stopSession(sessionId: string): Promise<void> {
    console.warn(`[${this.getCliToolName()}Manager] DEPRECATED: stopSession called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    const virtualPanelId = `session-${sessionId}`;
    await this.stopPanel(virtualPanelId);
  }

  /**
   * @deprecated Use isPanelRunning with real panel IDs instead
   */
  isSessionRunning(sessionId: string): boolean {
    console.warn(`[${this.getCliToolName()}Manager] DEPRECATED: isSessionRunning called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    const virtualPanelId = `session-${sessionId}`;
    return this.isPanelRunning(virtualPanelId);
  }

  // Protected utility methods

  /**
   * Find and store tool-specific session ID for resume functionality
   * This is used by CLI tools that have their own session management systems
   * @param panelId The panel ID
   * @param sessionIdPath Path to search for session files
   * @param extractSessionId Function to extract session ID from a session file
   */
  protected async findAndStoreToolSessionId(
    panelId: string,
    sessionIdPath: string,
    extractSessionId: (filePath: string, worktreePath: string) => Promise<string | null>
  ): Promise<void> {
    try {
      const fs = await import('fs').then(m => m.promises);
      const path = await import('path');
      
      // Check if session directory exists
      try {
        await fs.access(sessionIdPath);
      } catch {
        this.logger?.verbose(`[${this.getCliToolName()}] Session directory not found: ${sessionIdPath}`);
        return;
      }

      // Get the worktree path for this panel
      const process = this.processes.get(panelId);
      if (!process) {
        this.logger?.warn(`[${this.getCliToolName()}] No process found for panel ${panelId}`);
        return;
      }

      // Extract session ID
      const sessionId = await extractSessionId(sessionIdPath, process.worktreePath);
      
      if (sessionId) {
        this.logger?.info(`[${this.getCliToolName()}] Found session ID for panel ${panelId}: ${sessionId}`);
        
        // Store the session ID in the panel's custom state
        if (this.sessionManager) {
          // Use panelManager instead of direct database access
          const { panelManager } = await import('../../panelManager');
          const panel = await panelManager.getPanel(panelId);
          if (panel) {
            const currentState = panel.state || {};
            const customState = (currentState.customState as Record<string, unknown>) || {};
            
            // Only update if we don't already have a session ID
            const toolSessionKey = `${this.getCliToolName().toLowerCase()}SessionId`;
            if (!customState[toolSessionKey]) {
              const updatedState = {
                ...currentState,
                customState: { ...customState, [toolSessionKey]: sessionId }
              };
              
              await panelManager.updatePanel(panelId, { state: updatedState });
              this.logger?.verbose(`[${this.getCliToolName()}] Stored session ID in panel ${panelId}: ${sessionId}`);
            }
          }
        }
      } else {
        this.logger?.verbose(`[${this.getCliToolName()}] No session ID found for panel ${panelId}`);
      }
    } catch (error) {
      this.logger?.error(`[${this.getCliToolName()}] Error finding session ID: ${error}`);
    }
  }

  /**
   * Get cached availability result or perform fresh check
   */
  protected async getCachedAvailability(): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
    if (this.availabilityCache &&
        (Date.now() - this.availabilityCache.timestamp) < this.CACHE_TTL) {
      this.logger?.verbose(`Using cached ${this.getCliToolName()} availability check`);
      return this.availabilityCache.result;
    }

    // Perform fresh check
    const availability = await this.testCliAvailability();

    // Cache the result
    this.availabilityCache = {
      result: availability,
      timestamp: Date.now()
    };

    return availability;
  }

  /**
   * Handle CLI not available error
   */
  protected async handleCliNotAvailable(availability: { available: boolean; error?: string }, panelId: string, sessionId: string): Promise<void> {
    this.logger?.error(`${this.getCliToolName()} not available: ${availability.error}`);
    this.logger?.error(`Current PATH: ${process.env.PATH}`);
    this.logger?.error(`Enhanced PATH searched: ${getShellPath()}`);

    // Emit error message to show in the UI
    const errorMessage = {
      type: 'session',
      data: {
        status: 'error',
        message: `${this.getCliToolName()} not available`,
        details: this.getCliNotAvailableMessage(availability.error)
      }
    };

    this.emit('output', {
      panelId,
      sessionId,
      type: 'json',
      data: errorMessage,
      timestamp: new Date()
    } as CliOutputEvent);

    // Add dedicated error output
    this.sessionManager.addSessionError(
      sessionId,
      `${this.getCliToolName()} not available`,
      `${availability.error}\nPlease install ${this.getCliToolName()} or verify it is in your PATH.`
    );
  }

  /**
   * Get CLI not available error message (can be overridden by subclasses)
   */
  protected getCliNotAvailableMessage(error?: string): string {
    return [
      `Error: ${error}`,
      '',
      `${this.getCliToolName()} is not installed or not found in your PATH.`,
      '',
      `Please install ${this.getCliToolName()}:`,
      '1. Follow the installation instructions for your platform',
      `2. Verify installation by running "${this.getCliToolName()} --version" in your terminal`,
      '',
      `If ${this.getCliToolName()} is installed but not in your PATH:`,
      `- Add the ${this.getCliToolName()} installation directory to your PATH environment variable`,
      '- Or set a custom executable path in Crystal Settings',
      '',
      `Enhanced PATH searched: ${getShellPath()}`,
      `Attempted command: ${this.getCliToolName()} --version`
    ].join('\n');
  }

  /**
   * Get enhanced system environment with PATH
   * Uses centralized shellPath utility for consistent PATH management
   */
  protected async getSystemEnvironment(): Promise<{ [key: string]: string }> {
    // Get the enhanced PATH from centralized utility (includes Linux-specific paths)
    const shellPath = getShellPath();

    // Find Node.js and ensure it's in the PATH
    const nodePath = await findNodeExecutable();
    const nodeDir = path.dirname(nodePath);
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    
    // Combine Node.js directory with enhanced PATH
    const pathWithNode = nodeDir + pathSeparator + shellPath;

    return {
      ...process.env,
      PATH: pathWithNode
    } as { [key: string]: string };
  }


  /**
   * Spawn PTY process with error handling and Node.js fallback
   * This handles the common case where CLI tools are Node.js scripts with shebangs
   * that may not work correctly on all systems
   */
  protected async spawnPtyProcess(command: string, args: string[], cwd: string, env: { [key: string]: string }): Promise<pty.IPty> {
    if (!pty) {
      throw new Error('node-pty not available');
    }

    const fullCommand = `${command} ${args.join(' ')}`;
    this.logger?.verbose(`Executing ${this.getCliToolName()} command: ${fullCommand}`);
    this.logger?.verbose(`Working directory: ${cwd}`);

    let ptyProcess: pty.IPty;
    let spawnAttempt = 0;
    let lastError: unknown;
    const toolName = this.getCliToolName().toLowerCase();
    const needsNodeFallbackKey = `${toolName}NeedsNodeFallback`;

    // Try normal spawn first, then fallback to Node.js invocation if it fails
    while (spawnAttempt < 2) {
      try {
        const startTime = Date.now();

        // On Linux, add a small delay before spawning to avoid resource contention
        if (os.platform() === 'linux' && this.processes.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (spawnAttempt === 0 && !(global as typeof global & Record<string, boolean>)[needsNodeFallbackKey]) {
          // First attempt: normal spawn
          ptyProcess = pty.spawn(command, args, {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd,
            env
          });
        } else {
          // Second attempt or if we know we need Node.js: use Node.js directly
          this.logger?.verbose(`[${this.getCliToolName()}] Using Node.js fallback for execution`);

          // Try to find the CLI script (for npm-installed tools)
          let scriptPath = command;
          
          // For tools installed via npm, the command might be a symlink to a script
          // Try using the nodeFinder utility to locate the actual script
          try {
            // Use dynamic import to avoid circular dependencies
            const { findCliNodeScript } = await import('../../../utils/nodeFinder');
            const foundScript = findCliNodeScript(command);
            if (foundScript) {
              scriptPath = foundScript;
              this.logger?.verbose(`[${this.getCliToolName()}] Found script at: ${scriptPath}`);
            }
          } catch (e) {
            // If we can't find the script helper, just use the command as-is
            this.logger?.verbose(`[${this.getCliToolName()}] Using command directly for Node.js invocation`);
          }

          const nodePath = await findNodeExecutable();
          this.logger?.verbose(`[${this.getCliToolName()}] Using Node.js: ${nodePath}`);

          // Spawn with Node.js directly
          const nodeArgs = scriptPath === command 
            ? [command, ...args] // Command might be a direct script path
            : ['--no-warnings', '--enable-source-maps', scriptPath, ...args]; // Found script path
            
          ptyProcess = pty.spawn(nodePath, nodeArgs, {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd,
            env
          });
        }

        const spawnTime = Date.now() - startTime;
        this.logger?.verbose(`${this.getCliToolName()} process spawned successfully in ${spawnTime}ms`);
        return ptyProcess;
      } catch (spawnError) {
        lastError = spawnError;
        spawnAttempt++;

        if (spawnAttempt === 1 && !(global as typeof global & Record<string, boolean>)[needsNodeFallbackKey]) {
          const errorMsg = spawnError instanceof Error ? spawnError.message : String(spawnError);
          this.logger?.error(`First ${this.getCliToolName()} spawn attempt failed: ${errorMsg}`);

          // Check for typical shebang-related errors
          if (errorMsg.includes('No such file or directory') ||
              errorMsg.includes('env: node:') ||
              errorMsg.includes('is not recognized') ||
              errorMsg.includes('ENOENT')) {
            this.logger?.verbose(`Error suggests shebang issue, will try Node.js fallback`);
            (global as typeof global & Record<string, boolean>)[needsNodeFallbackKey] = true;
            continue;
          }
        }
        break;
      }
    }

    // If we failed after all attempts, handle the error
    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
    this.logger?.error(`Failed to spawn ${this.getCliToolName()} process after ${spawnAttempt} attempts: ${errorMsg}`);
    throw new Error(`Failed to spawn ${this.getCliToolName()}: ${errorMsg}`);
  }

  /**
   * Set up event handlers for a PTY process
   */
  protected setupProcessHandlers(ptyProcess: pty.IPty, panelId: string, sessionId: string): void {
    let hasReceivedOutput = false;
    let lastOutput = '';
    let buffer = '';

    ptyProcess.onData((data: string) => {
      hasReceivedOutput = true;
      lastOutput += data;
      buffer += data;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          const outputEvents = this.parseCliOutput(line + '\n', panelId, sessionId);
          for (const event of outputEvents) {
            this.emit('output', event);
          }
        }
      }
    });

    ptyProcess.onExit(async ({ exitCode, signal }) => {
      // Check for and kill any child processes
      const pid = ptyProcess.pid;
      if (pid) {
        const descendantPids = this.getAllDescendantPids(pid);
        if (descendantPids.length > 0) {
          const killedProcesses = await this.getProcessInfo(descendantPids);
          this.logger?.info(`[${this.getCliToolName()}] Found ${descendantPids.length} orphaned child processes after ${this.getCliToolName()} exit for session ${sessionId}`);

          await this.killProcessTree(pid, panelId, sessionId);

          const processReport = killedProcesses.map(p => `${p.name || 'unknown'}(${p.pid})`).join(', ');
          const message = `\n[Process Cleanup] Terminated ${killedProcesses.length} orphaned child process${killedProcesses.length > 1 ? 'es' : ''} after ${this.getCliToolName()} exit: ${processReport}\n`;
          this.emit('output', {
            panelId,
            sessionId,
            type: 'stdout',
            data: message,
            timestamp: new Date()
          } as CliOutputEvent);
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        const outputEvents = this.parseCliOutput(buffer, panelId, sessionId);
        for (const event of outputEvents) {
          this.emit('output', event);
        }
      }

      if (exitCode !== 0) {
        this.logger?.error(`${this.getCliToolName()} process failed for session ${sessionId}. Exit code: ${exitCode}, Signal: ${signal}`);

        if (!hasReceivedOutput) {
          await this.handleProcessStartupFailure(exitCode, signal, panelId, sessionId, lastOutput);
        } else {
          await this.handleProcessRuntimeFailure(exitCode, signal, panelId, sessionId, lastOutput);
        }
      } else {
        this.logger?.info(`${this.getCliToolName()} process exited normally for panel ${panelId} (session ${sessionId})`);
      }

      // Clean up CLI-specific resources
      await this.cleanupCliResources(sessionId);

      this.emit('exit', {
        panelId,
        sessionId,
        exitCode,
        signal: signal ?? null
      } as CliExitEvent);
      this.processes.delete(panelId);
    });
  }

  /**
   * Handle process startup failure
   */
  protected async handleProcessStartupFailure(exitCode: number | null, signal: number | undefined, panelId: string, sessionId: string, lastOutput: string): Promise<void> {
    this.logger?.error(`No output received from ${this.getCliToolName()}. This might indicate a startup failure.`);

    const errorMessage = {
      type: 'session',
      data: {
        status: 'error',
        message: `${this.getCliToolName()} failed to start (exit code: ${exitCode})`,
        details: [
          `This usually means ${this.getCliToolName()} is not installed properly or not found in your PATH.`,
          '',
          'Please ensure:',
          `1. ${this.getCliToolName()} is installed`,
          `2. The "${this.getCliToolName()}" command is available in your terminal`,
          '3. Your PATH environment variable includes the installation directory',
          '',
          `Exit code: ${exitCode}${signal ? `, Signal: ${signal}` : ''}`,
          '',
          'You can also set a custom executable path in the Settings.'
        ].join('\n')
      }
    };

    this.emit('output', {
      panelId,
      sessionId,
      type: 'json',
      data: errorMessage,
      timestamp: new Date()
    } as CliOutputEvent);
  }

  /**
   * Handle process runtime failure
   */
  protected async handleProcessRuntimeFailure(exitCode: number | null, signal: number | undefined, panelId: string, sessionId: string, lastOutput: string): Promise<void> {
    this.logger?.error(`Last output from ${this.getCliToolName()}: ${lastOutput.substring(-500)}`);

    const errorMessage = {
      type: 'session',
      data: {
        status: 'error',
        message: `${this.getCliToolName()} exited with error (exit code: ${exitCode})`,
        details: lastOutput.length > 0 ? `Last output:\n${lastOutput.substring(-500)}` : 'No additional details available'
      }
    };

    this.emit('output', {
      panelId,
      sessionId,
      type: 'json',
      data: errorMessage,
      timestamp: new Date()
    } as CliOutputEvent);
  }

  // Process management utilities

  /**
   * Get all descendant PIDs of a parent process recursively
   */
  protected getAllDescendantPids(parentPid: number): number[] {
    const descendants: number[] = [];
    const platform = os.platform();

    try {
      if (platform === 'win32') {
        const result = execSync(
          `wmic process where (ParentProcessId=${parentPid}) get ProcessId`,
          { encoding: 'utf8' }
        );

        const lines = result.split('\n').filter((line: string) => line.trim());
        for (let i = 1; i < lines.length; i++) {
          const pid = parseInt(lines[i].trim());
          if (!isNaN(pid) && pid !== parentPid) {
            descendants.push(pid);
            descendants.push(...this.getAllDescendantPids(pid));
          }
        }
      } else {
        const result = execSync(
          `ps -o pid= --ppid ${parentPid} 2>/dev/null || true`,
          { encoding: 'utf8' }
        );

        const pids = result.split('\n')
          .map((line: string) => parseInt(line.trim()))
          .filter((pid: number) => !isNaN(pid) && pid !== parentPid);

        for (const pid of pids) {
          descendants.push(pid);
          descendants.push(...this.getAllDescendantPids(pid));
        }
      }
    } catch (error) {
      this.logger?.warn(`Error getting descendant PIDs for ${parentPid}:`, error as Error);
    }

    return [...new Set(descendants)];
  }

  /**
   * Get process information for a list of PIDs
   */
  protected async getProcessInfo(pids: number[]): Promise<{ pid: number; name?: string }[]> {
    const processInfo: { pid: number; name?: string }[] = [];
    const platform = os.platform();

    for (const pid of pids) {
      try {
        let name: string | undefined;

        if (platform === 'win32') {
          const result = execSync(
            `wmic process where ProcessId=${pid} get Name`,
            { encoding: 'utf8' }
          );
          const lines = result.split('\n').filter((line: string) => line.trim());
          if (lines.length > 1) {
            name = lines[1].trim();
          }
        } else {
          const result = execSync(
            `ps -p ${pid} -o comm= 2>/dev/null || true`,
            { encoding: 'utf8' }
          );
          name = result.trim();
        }

        processInfo.push({ pid, name: name || 'unknown' });
      } catch (error) {
        processInfo.push({ pid, name: 'unknown' });
      }
    }

    return processInfo;
  }

  /**
   * Kill a process and all its descendants
   */
  protected async killProcessTree(pid: number, panelId: string, sessionId: string): Promise<boolean> {
    const platform = os.platform();

    const descendantPids = this.getAllDescendantPids(pid);
    this.logger?.info(`[${this.getCliToolName()}] Found ${descendantPids.length} descendant processes for PID ${pid} in session ${sessionId}`);

    let success = true;

    try {
      if (platform === 'win32') {
        try {
          await this.execAsync(`taskkill /F /T /PID ${pid}`);
          this.logger?.verbose(`[${this.getCliToolName()}] Successfully killed Windows process tree ${pid}`);
        } catch (error) {
          this.logger?.warn(`[${this.getCliToolName()}] Error killing Windows process tree: ${error as Error}`);
          for (const childPid of descendantPids) {
            try {
              await this.execAsync(`taskkill /F /PID ${childPid}`);
            } catch (e) {
              // Process might already be dead
            }
          }
        }
      } else {
        // Unix-like systems
        try {
          process.kill(pid, 'SIGTERM');
        } catch (error) {
          this.logger?.warn(`[${this.getCliToolName()}] SIGTERM failed:`, error as Error);
        }

        // Kill the entire process group
        try {
          await this.execAsync(`kill -TERM -${pid}`);
        } catch (error) {
          this.logger?.warn(`[${this.getCliToolName()}] Error sending SIGTERM to process group: ${error}`);
        }

        // Give processes a chance to clean up gracefully
        await new Promise(resolve => setTimeout(resolve, 200));

        // Force kill
        try {
          process.kill(pid, 'SIGKILL');
        } catch (error) {
          // Process might already be dead
        }

        try {
          await this.execAsync(`kill -9 -${pid}`);
        } catch (error) {
          this.logger?.warn(`[${this.getCliToolName()}] Error sending SIGKILL to process group: ${error}`);
        }

        // Kill all known descendants individually
        for (const childPid of descendantPids) {
          try {
            await this.execAsync(`kill -9 ${childPid}`);
            this.logger?.verbose(`[${this.getCliToolName()}] Killed descendant process ${childPid}`);
          } catch (error) {
            this.logger?.verbose(`[${this.getCliToolName()}] Process ${childPid} already terminated`);
          }
        }

        // Final cleanup attempt
        try {
          await this.execAsync(`pkill -9 -P ${pid}`);
        } catch (error) {
          // Ignore errors - processes might already be dead
        }
      }

      // Verify all processes are actually dead
      await new Promise(resolve => setTimeout(resolve, 500));
      const remainingPids = this.getAllDescendantPids(pid);

      if (remainingPids.length > 0) {
        this.logger?.error(`[${this.getCliToolName()}] WARNING: ${remainingPids.length} zombie processes remain: ${remainingPids.join(', ')}`);
        success = false;

        const remainingProcesses = await this.getProcessInfo(remainingPids);
        const processReport = remainingProcesses.map(p => `${p.name || 'unknown'}(${p.pid})`).join(', ');

        this.emit('output', {
          panelId,
          sessionId,
          type: 'stderr',
          data: `\n[WARNING] Failed to terminate ${remainingPids.length} child process${remainingPids.length > 1 ? 'es' : ''}: ${processReport}\nPlease manually kill these processes.\n`,
          timestamp: new Date()
        } as CliOutputEvent);
      }
    } catch (error) {
      this.logger?.error(`[${this.getCliToolName()}] Error in killProcessTree:`, error as Error);
      success = false;
    }

    // Always try to kill via pty interface as final fallback
    try {
      const cliProcess = this.processes.get(panelId);
      if (cliProcess) {
        cliProcess.process.kill();
      }
    } catch (error) {
      // Process might already be dead
    }

    return success;
  }
}
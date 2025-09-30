import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import type { ConversationMessage } from '../../../database/models';
import { testClaudeCodeAvailability, testClaudeCodeInDirectory } from '../../../utils/claudeCodeTest';
import { findExecutableInPath } from '../../../utils/shellPath';
import { PermissionManager } from '../../permissionManager';
import { findNodeExecutable } from '../../../utils/nodeFinder';
import { AbstractCliManager } from '../cli/AbstractCliManager';
import { withLock } from '../../../utils/mutex';
import { enhancePromptForStructuredCommit } from '../../../utils/promptEnhancer';

// Extend global object for MCP configuration storage  
interface GlobalMcpStorage {
  [key: string]: string | undefined;
}
declare const globalThis: GlobalMcpStorage;

interface ClaudeSpawnOptions {
  panelId: string;
  sessionId: string;
  worktreePath: string;
  prompt: string;
  conversationHistory?: string[];
  isResume?: boolean;
  permissionMode?: 'approve' | 'ignore';
  model?: string;
}

interface ClaudeCodeProcess {
  process: import('@homebridge/node-pty-prebuilt-multiarch').IPty;
  panelId: string;
  sessionId: string;
  worktreePath: string;
}

/**
 * ClaudeCodeManager - Manages Claude Code CLI processes
 * Extends AbstractCliManager for common CLI functionality
 */
export class ClaudeCodeManager extends AbstractCliManager {
  constructor(
    sessionManager: import('../../sessionManager').SessionManager,
    logger?: Logger,
    configManager?: ConfigManager,
    private permissionIpcPath?: string | null
  ) {
    super(sessionManager, logger, configManager);
  }

  // Abstract method implementations

  protected getCliToolName(): string {
    return 'Claude Code';
  }

  protected async testCliAvailability(customPath?: string): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
    return await testClaudeCodeAvailability(customPath);
  }

  protected buildCommandArgs(options: ClaudeSpawnOptions & { mcpConfigPath?: string | null }): string[] {
    const { sessionId, prompt, isResume, permissionMode, model, mcpConfigPath } = options;
    
    // Get session data for Claude-specific features
    const dbSession = this.sessionManager.getDbSession(sessionId);
    
    // Build base arguments
    const args = ['--verbose', '--output-format', 'stream-json'];

    // Add model argument if specified and not 'auto'
    if (model && model !== 'auto') {
      args.push('--model', model);
      this.logger?.verbose(`Using model: ${model}`);
    } else if (model === 'auto') {
      this.logger?.verbose(`Using auto model selection (Claude Code's default)`);
    }

    // Log commit mode for debugging (but don't pass to Claude Code)
    if (dbSession?.commit_mode) {
      this.logger?.verbose(`Session uses commit mode: ${dbSession.commit_mode}`);
    }

    // Handle permission mode
    const defaultMode = this.configManager?.getConfig()?.defaultPermissionMode || 'ignore';
    const effectiveMode = permissionMode || defaultMode;

    if (effectiveMode === 'ignore') {
      args.push('--dangerously-skip-permissions');
    } else if (effectiveMode === 'approve' && this.permissionIpcPath) {
      // If MCP config path is provided, we'll add the MCP args
      // Otherwise just log that MCP will be set up
      if (!mcpConfigPath) {
        this.logger?.verbose(`Will set up MCP for permission approval mode`);
      }
    } else {
      // Fallback to skip permissions if IPC path not available
      args.push('--dangerously-skip-permissions');
      if (effectiveMode === 'approve') {
        this.logger?.warn(`Permission approval mode requested but IPC server not available. Using skip permissions mode.`);
      }
    }

    // Handle resume and prompt logic
    if (isResume) {
      // Get Claude's session ID for this panel if available
      const claudeSessionId = this.sessionManager.getPanelClaudeSessionId(options.panelId);

      if (claudeSessionId) {
        // Use --resume flag with Claude's actual session ID
        args.push('--resume', claudeSessionId);
        console.log(`[ClaudeCodeManager] Resuming Claude session ${claudeSessionId} for Crystal session ${sessionId}`);
      } else {
        // Do not resume without explicit ID; this will be handled as an error
        throw new Error(`Cannot resume: no Claude session_id stored for Crystal session ${sessionId}`);
      }
      // If a new prompt is provided, add it
      if (prompt && prompt.trim()) {
        const finalPrompt = enhancePromptForStructuredCommit(prompt, dbSession || { id: sessionId }, this.logger);
        args.push('-p', finalPrompt);
      }
    } else {
      // Initial prompt for new session
      let finalPrompt = enhancePromptForStructuredCommit(prompt, dbSession || { id: sessionId }, this.logger);

      // Add system prompts for new sessions
      const systemPromptAppend = this.buildSystemPromptAppend(dbSession ? { ...dbSession, project_id: dbSession.project_id } : { id: sessionId });
      if (systemPromptAppend) {
        finalPrompt = `${finalPrompt}\n\n${systemPromptAppend}`;
      }

      args.push('-p', finalPrompt);
    }

    // Add MCP configuration if provided
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath, '--permission-prompt-tool', 'mcp__crystal-permissions__approve_permission', '--allowedTools', 'mcp__crystal-permissions__approve_permission');
    }

    return args;
  }

  protected async getCliExecutablePath(): Promise<string> {
    // Use custom claude path if configured, otherwise find it in PATH
    let claudeCommand = this.configManager?.getConfig()?.claudeExecutablePath;
    if (claudeCommand) {
      this.logger?.info(`[ClaudeManager] Using custom Claude executable path: ${claudeCommand}`);
      return claudeCommand;
    } else {
      this.logger?.verbose(`[ClaudeManager] No custom Claude path configured, searching in PATH...`);
      const foundPath = findExecutableInPath('claude');
      if (!foundPath) {
        throw new Error('Claude Code CLI not found in PATH. Please ensure claude is installed and in your PATH.');
      }
      return foundPath;
    }
  }

  protected parseCliOutput(data: string, panelId: string, sessionId: string): Array<{ panelId: string; sessionId: string; type: 'json' | 'stdout' | 'stderr'; data: unknown; timestamp: Date }> {
    const events: Array<{ panelId: string; sessionId: string; type: 'json' | 'stdout' | 'stderr'; data: unknown; timestamp: Date }> = [];

    try {
      const jsonMessage = JSON.parse(data.trim());
      this.logger?.verbose(`JSON message from panel ${panelId} (session ${sessionId}): ${JSON.stringify(jsonMessage)}`);

      // Check for system init message with available slash commands
      if (jsonMessage.type === 'system' && jsonMessage.subtype === 'init') {
        // Check if SlashCommand tool is available
        if (jsonMessage.tools && Array.isArray(jsonMessage.tools)) {
          const hasSlashCommandTool = jsonMessage.tools.includes('SlashCommand');
          console.log(`[slash-debug] SlashCommand tool ${hasSlashCommandTool ? 'IS' : 'IS NOT'} available in this session`);
        }

        // Log available slash commands
        if (jsonMessage.slash_commands) {
          const slashCommands = jsonMessage.slash_commands;
          console.log(`[slash-debug] Claude Code initialized with slash commands:`, slashCommands);
          console.log(`[slash-debug] Available commands: ${Array.isArray(slashCommands) ? slashCommands.join(', ') : 'none'}`);
        }
      }

      // Check for SlashCommand tool usage in assistant messages
      if (jsonMessage.type === 'assistant' && jsonMessage.message?.content) {
        const content = jsonMessage.message.content;
        if (Array.isArray(content)) {
          const slashCommandTools = content.filter((item: { type?: string; name?: string; input?: { command?: string } }) =>
            item.type === 'tool_use' && item.name === 'SlashCommand'
          );

          if (slashCommandTools.length > 0) {
            slashCommandTools.forEach((tool: { input?: { command?: string } }) => {
              const command = tool.input?.command || 'unknown';
              console.log(`[slash-debug] Detected SlashCommand in assistant message: ${command}`);
              console.log(`[slash-debug] Full tool data:`, JSON.stringify(tool, null, 2));
            });
          }
        }
      }

      // Emit JSON message - terminal formatting will be done on the fly
      events.push({
        panelId,
        sessionId,
        type: 'json',
        data: jsonMessage,
        timestamp: new Date()
      });
    } catch (error) {
      // If not valid JSON, treat as regular output
      this.logger?.verbose(`Raw output from panel ${panelId} (session ${sessionId}): ${data.substring(0, 200)}`);

      // Check if this looks like an error message
      const isError = data.includes('ERROR') ||
                    data.includes('Error:') ||
                    data.includes('error:') ||
                    data.includes('Command failed:') ||
                    data.includes('aborted') ||
                    data.includes('fatal:');

      events.push({
        panelId,
        sessionId,
        type: isError ? 'stderr' : 'stdout',
        data,
        timestamp: new Date()
      });
    }

    return events;
  }

  protected async initializeCliEnvironment(options: ClaudeSpawnOptions): Promise<{ [key: string]: string }> {
    const { sessionId, permissionMode } = options;
    
    // Get basic system environment
    const systemEnv = await this.getSystemEnvironment();
    
    // Initialize environment with MCP-specific variables
    const env: { [key: string]: string } = {
      // Ensure MCP-related environment variables are preserved
      MCP_SOCKET_PATH: this.permissionIpcPath || '',
      // Add debug mode for MCP if verbose logging is enabled
      ...(this.configManager?.getConfig()?.verbose ? { MCP_DEBUG: '1' } : {})
    };

    // Set up MCP configuration if permission approval is requested
    const defaultMode = this.configManager?.getConfig()?.defaultPermissionMode || 'ignore';
    const effectiveMode = permissionMode || defaultMode;

    if (effectiveMode === 'approve' && this.permissionIpcPath) {
      await this.setupMcpConfiguration(sessionId, env);
    }

    return env;
  }

  protected async cleanupCliResources(sessionId: string): Promise<void> {
    // Clear any pending permission requests
    PermissionManager.getInstance().clearPendingRequests(sessionId);

    // Clean up MCP config file if it exists
    const mcpConfigPath = globalThis[`mcp_config_${sessionId}`];
    if (mcpConfigPath && fs.existsSync(mcpConfigPath)) {
      setTimeout(() => {
        try {
          if (fs.existsSync(mcpConfigPath)) {
            fs.unlinkSync(mcpConfigPath);
            this.logger?.verbose(`[MCP] Cleaned up config file: ${mcpConfigPath}`);
          }
          delete globalThis[`mcp_config_${sessionId}`];
        } catch (error) {
          this.logger?.error(`Failed to delete MCP config file:`, error instanceof Error ? error : undefined);
        }
      }, 5000); // 5 second delay
    }

    // Clean up temporary MCP script file if it exists
    const mcpScriptPath = globalThis[`mcp_script_${sessionId}`];
    if (mcpScriptPath && fs.existsSync(mcpScriptPath)) {
      setTimeout(() => {
        try {
          if (fs.existsSync(mcpScriptPath)) {
            fs.unlinkSync(mcpScriptPath);
            this.logger?.verbose(`[MCP] Cleaned up script file: ${mcpScriptPath}`);
          }
          delete globalThis[`mcp_script_${sessionId}`];
        } catch (error) {
          this.logger?.error(`Failed to delete temporary MCP script file:`, error instanceof Error ? error : undefined);
        }
      }, 5000); // 5 second delay
    }
  }

  protected async getCliEnvironment(options: ClaudeSpawnOptions): Promise<{ [key: string]: string }> {
    // This is handled in initializeCliEnvironment for Claude
    return {};
  }

  protected getCliNotAvailableMessage(error?: string): string {
    return [
      `Error: ${error}`,
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
    ].join('\n');
  }

  // Override spawn method to handle resume validation and MCP setup
  async spawnCliProcess(options: ClaudeSpawnOptions): Promise<void> {
    return await withLock(`claude-spawn-${options.panelId}`, async () => {
      const { panelId, sessionId, isResume, permissionMode } = options;

      // Check if a process is already running for this panel
      if (this.processes.has(panelId)) {
        throw new Error(`Claude process already running for panel ${panelId}`);
      }

      // Handle resume validation before calling parent
      if (isResume) {
        const claudeSessionId = this.sessionManager.getPanelClaudeSessionId(panelId);
        
        if (!claudeSessionId) {
          const errMsg = `Cannot resume: no Claude session_id stored for Crystal session ${sessionId}`;
          this.logger?.error(`[ClaudeCodeManager] ${errMsg}`);
          
          const errorMessage = {
            type: 'system',
            subtype: 'error',
            timestamp: new Date().toISOString(),
            message: 'Unable to resume Claude conversation',
            details: 'Missing Claude session_id. Please start a new message to begin a fresh conversation.'
          };
          
          this.emit('output', {
            panelId,
            sessionId,
            type: 'json',
            data: errorMessage,
            timestamp: new Date()
          });
          
          throw new Error(errMsg);
        }
      }

      // Optional: Test claude in the target directory (skip on Linux for performance)
      const skipDirTest = os.platform() === 'linux';
      if (!skipDirTest) {
        const customClaudePath = this.configManager?.getConfig()?.claudeExecutablePath;
        const directoryTest = await testClaudeCodeInDirectory(options.worktreePath, customClaudePath);
        if (!directoryTest.success) {
          this.logger?.error(`Claude test failed in directory ${options.worktreePath}: ${directoryTest.error}`);
          if (directoryTest.output) {
            this.logger?.error(`Claude output: ${directoryTest.output}`);
          }
        } else {
          this.logger?.verbose(`Claude works in target directory`);
        }
      } else {
        this.logger?.verbose(`Skipping directory test on Linux for performance`);
      }

      // Set up MCP configuration if needed and add to args
      const defaultMode = this.configManager?.getConfig()?.defaultPermissionMode || 'ignore';
      const effectiveMode = permissionMode || defaultMode;
      
      let mcpConfigPath: string | null = null;
      if (effectiveMode === 'approve' && this.permissionIpcPath) {
        mcpConfigPath = await this.setupMcpConfigurationSync(sessionId);
      }

      // Store MCP config path in options for buildCommandArgs to use
      const enhancedOptions = {
        ...options,
        mcpConfigPath
      };

      // Emit initial session info message
      const finalArgs = this.buildCommandArgs(enhancedOptions);
      const sessionInfoMessage = {
        type: 'session_info',
        initial_prompt: options.prompt,
        claude_command: `claude ${finalArgs.join(' ')}`,
        worktree_path: options.worktreePath,
        model: options.model || 'default',
        permission_mode: options.permissionMode || 'default',
        timestamp: new Date().toISOString()
      };

      this.emit('output', {
        panelId,
        sessionId,
        type: 'json',
        data: sessionInfoMessage,
        timestamp: new Date()
      });

      // Call parent with enhanced options
      await super.spawnCliProcess(enhancedOptions);
    });
  }

  // Claude now uses the base class spawnPtyProcess with Node.js fallback
  // No override needed - the base class handles everything

  // Implementation of abstract methods from AbstractCliManager

  async startPanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void> {
    // Validate panel ownership before starting
    const { validatePanelSessionOwnership, logValidationFailure } = require('../../../utils/sessionValidation');
    const validation = validatePanelSessionOwnership(panelId, sessionId);
    if (!validation.valid) {
      logValidationFailure('ClaudeCodeManager.startPanel', validation);
      throw new Error(`Panel validation failed: ${validation.error}`);
    }

    console.log(`[ClaudeCodeManager] Validated panel ${panelId} belongs to session ${sessionId}`);
    return this.spawnClaudeCode(panelId, sessionId, worktreePath, prompt, undefined, false, permissionMode, model);
  }

  async continuePanel(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    prompt: string,
    conversationHistory: ConversationMessage[],
    permissionModeOverride?: 'approve' | 'ignore',
    model?: string
  ): Promise<void> {
    return await withLock(`claude-continue-${panelId}`, async () => {
      // Validate panel ownership before continuing
      const { validatePanelSessionOwnership, logValidationFailure } = require('../../../utils/sessionValidation');
      const validation = validatePanelSessionOwnership(panelId, sessionId);
      if (!validation.valid) {
        logValidationFailure('ClaudeCodeManager.continuePanel', validation);
        throw new Error(`Panel validation failed: ${validation.error}`);
      }

      console.log(`[ClaudeCodeManager] Validated panel ${panelId} belongs to session ${sessionId}`);

      // Kill any existing process for this panel first
      if (this.processes.has(panelId)) {
        console.log(`[ClaudeCodeManager] Killing existing process for panel ${panelId} before continuing`);
        await this.killProcess(panelId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (this.processes.has(panelId)) {
        console.error(`[ClaudeCodeManager] Process ${panelId} still exists after kill attempt, aborting continue`);
        throw new Error('Failed to stop previous panel instance');
      }

      // Get the session's permission mode from database
      const dbSession = this.sessionManager.getDbSession(sessionId);
      const permissionModeFromDb = dbSession?.permission_mode;
      const permissionMode = permissionModeOverride ?? permissionModeFromDb;

      // Check if we should skip --resume flag this time (after prompt compaction)
      const skipContinueRaw = dbSession?.skip_continue_next;
      const shouldSkipContinue = skipContinueRaw === true || (typeof skipContinueRaw === 'number' && skipContinueRaw === 1);

      console.log(`[ClaudeCodeManager] continuePanel called for ${panelId} (session ${sessionId}):`, {
        skip_continue_next_raw: skipContinueRaw,
        shouldSkipContinue,
        permissionMode,
        model
      });

      if (shouldSkipContinue) {
        // Clear the flag and start a fresh session without --resume
        console.log(`[ClaudeCodeManager] Clearing skip_continue_next flag for session ${sessionId}`);
        this.sessionManager.updateSession(sessionId, { skip_continue_next: false });
        console.log(`[ClaudeCodeManager] Skipping --resume flag for panel ${panelId} due to prompt compaction`);
        return this.spawnClaudeCode(panelId, sessionId, worktreePath, prompt, [], false, permissionMode, model);
      } else {
        // For continuing a session, we use the --resume flag
        console.log(`[ClaudeCodeManager] Using --resume flag for panel ${panelId}`);
        return this.spawnClaudeCode(panelId, sessionId, worktreePath, prompt, [], true, permissionMode, model);
      }
    });
  }

  async stopPanel(panelId: string): Promise<void> {
    await this.killProcess(panelId);
  }

  async restartPanelWithHistory(panelId: string, sessionId: string, worktreePath: string, initialPrompt: string, conversationHistory: ConversationMessage[]): Promise<void> {
    // Kill existing process if it exists
    await this.killProcess(panelId);

    // Convert ConversationMessage[] to string[] for backward compatibility
    const historyStrings = conversationHistory.map(msg => msg.content);

    // Restart with conversation history
    await this.spawnClaudeCode(panelId, sessionId, worktreePath, initialPrompt, historyStrings);
  }

  // Claude-specific public methods for backward compatibility

  async spawnClaudeCode(panelId: string, sessionId: string, worktreePath: string, prompt: string, conversationHistory?: string[], isResume: boolean = false, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void> {
    const options: ClaudeSpawnOptions = {
      panelId,
      sessionId,
      worktreePath,
      prompt,
      conversationHistory,
      isResume,
      permissionMode,
      model
    };

    await this.spawnCliProcess(options);
  }

  // Legacy methods are now inherited from AbstractCliManager

  // Private helper methods

  private buildSystemPromptAppend(dbSession: { project_id?: number; [key: string]: unknown }): string | undefined {
    const systemPromptParts: string[] = [];

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
    return systemPromptParts.length > 0 ? systemPromptParts.join('\n\n') : undefined;
  }


  private async setupMcpConfigurationSync(sessionId: string): Promise<string> {
    // Create MCP config for permission approval
    let mcpBridgePath = app.isPackaged
      ? path.join(__dirname, 'mcpPermissionBridgeStandalone.js')
      : path.join(__dirname, 'mcpPermissionBridge.js');

    // Use a directory without spaces for better compatibility
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

      let scriptContent: string;
      try {
        scriptContent = fs.readFileSync(mcpBridgePath, 'utf8');
      } catch (error) {
        this.logger?.error(`[MCP] Failed to read script from ASAR: ${error}`);
        throw new Error(`Failed to read MCP bridge script from ASAR: ${error}`);
      }

      const tempScriptPath = path.join(tempDir, `mcpPermissionBridge-${sessionId}.js`);
      try {
        fs.writeFileSync(tempScriptPath, scriptContent);
        fs.chmodSync(tempScriptPath, 0o755);

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

    // Try to find node executable
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
          process.execPath
        ];

        for (const tryPath of commonNodePaths) {
          if (fs.existsSync(tryPath)) {
            nodePath = tryPath;
            break;
          }
        }

        if (nodePath === 'node' && app.isPackaged) {
          nodePath = process.execPath;
        }
      }
    } catch (e) {
      this.logger?.warn(`[MCP] Could not find node in PATH: ${e}`);
      if (app.isPackaged) {
        nodePath = process.execPath;
      }
    }

    // Test if the selected node path actually works
    try {
      execSync(`"${nodePath}" --version`, { encoding: 'utf8' });
    } catch (e) {
      this.logger?.error(`[MCP] Node executable test failed: ${e}`);
    }

    // Set up MCP command and args
    let mcpCommand: string = nodePath;
    let mcpArgs: string[] = [mcpBridgePath, sessionId, this.permissionIpcPath!];

    if (nodePath === process.execPath && app.isPackaged) {
      // First, try to find any available node
      const alternateNodes = ['/usr/local/bin/node', '/opt/homebrew/bin/node', '/usr/bin/node'];
      let foundAlternate = false;

      for (const altNode of alternateNodes) {
        if (fs.existsSync(altNode)) {
          mcpCommand = altNode;
          mcpArgs = [mcpBridgePath, sessionId, this.permissionIpcPath!];
          foundAlternate = true;
          break;
        }
      }

      if (!foundAlternate) {
        mcpCommand = nodePath;
        mcpArgs = ['--require', mcpBridgePath, '--', sessionId, this.permissionIpcPath!];
      }
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

      if (fs.existsSync(mcpConfigPath)) {
        fs.chmodSync(mcpConfigPath, 0o644);
      } else {
        throw new Error('MCP config file was not created');
      }
    } catch (error) {
      this.logger?.error(`[MCP] Failed to create MCP config file: ${error}`);
      throw new Error(`Failed to create MCP config: ${error}`);
    }

    // Test if the MCP bridge script can be executed
    try {
      const testCmd = `"${nodePath}" "${mcpBridgePath}" --version`;
      execSync(testCmd, { encoding: 'utf8', timeout: 2000 });
    } catch (testError: unknown) {
      const error = testError as { code?: string; message?: string };
      if (error.code === 'EACCES' || (error.message && error.message.includes('EACCES'))) {
        this.logger?.error(`[MCP] Permission denied executing MCP bridge script`);
        throw new Error('MCP bridge script is not executable');
      }
    }

    // Store config path and temp script path for cleanup
    globalThis[`mcp_config_${sessionId}`] = mcpConfigPath;
    if (mcpBridgePath.includes(tempDir)) {
      globalThis[`mcp_script_${sessionId}`] = mcpBridgePath;
    }

    // Add a small delay to ensure file is fully written and accessible
    await new Promise(resolve => setTimeout(resolve, 100));

    // Final check that config file still exists
    if (!fs.existsSync(mcpConfigPath)) {
      throw new Error(`MCP config file disappeared after creation: ${mcpConfigPath}`);
    }

    this.logger?.verbose(`[MCP] MCP configuration complete. Config path: ${mcpConfigPath}`);
    return mcpConfigPath;
  }

  private async setupMcpConfiguration(sessionId: string, env: { [key: string]: string }): Promise<void> {
    // This method is called from initializeCliEnvironment but for Claude we handle MCP in spawnCliProcess
    // Just set up the basic environment variables here
    return;
  }
}

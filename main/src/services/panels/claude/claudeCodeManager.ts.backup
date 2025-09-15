import { EventEmitter } from 'events';
import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import type { Logger } from '../../../utils/logger';
import { testClaudeCodeAvailability, testClaudeCodeInDirectory, getAugmentedPath } from '../../../utils/claudeCodeTest';
import type { ConfigManager } from '../../configManager';
import { getShellPath, findExecutableInPath } from '../../../utils/shellPath';
import { PermissionManager } from '../../permissionManager';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { findNodeExecutable, testNodeExecutable, findClaudeCodeScript } from '../../../utils/nodeFinder';

interface ClaudeCodeProcess {
  process: pty.IPty;
  panelId: string;
  sessionId: string;
  worktreePath: string;
}

interface ClaudeAvailabilityCache {
  result: { available: boolean; error?: string; version?: string; path?: string };
  timestamp: number;
}

export class ClaudeCodeManager extends EventEmitter {
  private processes: Map<string, ClaudeCodeProcess> = new Map(); // Now keyed by panelId instead of sessionId
  private availabilityCache: ClaudeAvailabilityCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

  constructor(
    private sessionManager: any, 
    private logger?: Logger, 
    private configManager?: ConfigManager,
    private permissionIpcPath?: string | null
  ) {
    super();
    // Increase max listeners to prevent warnings when many components listen to events
    this.setMaxListeners(50);
  }

  async spawnClaudeCode(panelId: string, sessionId: string, worktreePath: string, prompt: string, conversationHistory?: string[], isResume: boolean = false, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void> {
    try {
      this.logger?.verbose(`Spawning Claude for panel ${panelId} (session ${sessionId}) in ${worktreePath}`);
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
      
      // Test if claude-code command exists and works (with caching)
      let availability;
      
      // Get custom claude path if configured
      const customClaudePath = this.configManager?.getConfig()?.claudeExecutablePath;
      
      // Check cache first
      if (this.availabilityCache && 
          (Date.now() - this.availabilityCache.timestamp) < this.CACHE_TTL) {
        availability = this.availabilityCache.result;
        this.logger?.verbose(`Using cached Claude availability check`);
      } else {
        // Perform fresh check, passing custom path if available
        availability = await testClaudeCodeAvailability(customClaudePath);
        
        // Cache the result
        this.availabilityCache = {
          result: availability,
          timestamp: Date.now()
        };
      }
      
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
        
        // Emit both the styled error message and add to session manager
        this.emit('output', {
          panelId,
          sessionId,
          type: 'json',
          data: errorMessage,
          timestamp: new Date()
        });
        
        // Add a dedicated error output that will be displayed in its own box
        this.sessionManager.addSessionError(
          sessionId, 
          'Claude Code not available', 
          availability.error + '\nPlease install Claude Code or verify it is in your PATH.'
        );
        
        throw new Error(`Claude Code CLI not available: ${availability.error}`);
      }
      this.logger?.verbose(`Claude found: ${availability.version || 'version unknown'}`);
      if (availability.path) {
        this.logger?.verbose(`Claude executable path: ${availability.path}`);
      }
      
      // Skip directory test on Linux for better performance
      const skipDirTest = os.platform() === 'linux';
      if (!skipDirTest) {
        // Test claude in the target directory, using custom path if available
        const directoryTest = await testClaudeCodeInDirectory(worktreePath, customClaudePath);
        if (!directoryTest.success) {
          this.logger?.error(`Claude test failed in directory ${worktreePath}: ${directoryTest.error}`);
          if (directoryTest.output) {
            this.logger?.error(`Claude output: ${directoryTest.output}`);
          }
        } else {
          this.logger?.verbose(`Claude works in target directory`);
        }
      } else {
        this.logger?.verbose(`Skipping directory test on Linux for performance`);
      }
      
      // Build the command arguments
      const args = ['--verbose', '--output-format', 'stream-json'];
      
      // Add model argument if specified and not 'auto'
      if (model && model !== 'auto') {
        // Pass the model shorthand directly (opus, sonnet, or haiku)
        args.push('--model', model);
        this.logger?.verbose(`Using model: ${model}`);
      } else if (model === 'auto') {
        this.logger?.verbose(`Using auto model selection (Claude Code's default)`);
      }
      
      // Log commit mode for debugging (but don't pass to Claude Code)
      if (dbSession?.commit_mode) {
        this.logger?.verbose(`Session uses commit mode: ${dbSession.commit_mode}`);
      }
      
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
        // Get Claude's session ID for this panel if available
        const claudeSessionId = this.sessionManager.getPanelClaudeSessionId(panelId);
        
        if (claudeSessionId) {
          // Use --resume flag with Claude's actual session ID
          args.push('--resume', claudeSessionId);
          console.log(`[ClaudeCodeManager] Resuming Claude session ${claudeSessionId} for Crystal session ${sessionId}`);
        } else {
          // Do not resume without explicit ID; log error and emit system message
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
        
        // If a new prompt is provided, add it
        if (prompt && prompt.trim()) {
          let finalPrompt = prompt;
          
          // Check if session has structured commit mode for continuation prompts too
          if (dbSession?.commit_mode === 'structured') {
            this.logger?.verbose(`Session ${sessionId} uses structured commit mode, enhancing continuation prompt`);
            
            let commitModeSettings;
            if (dbSession.commit_mode_settings) {
              try {
                commitModeSettings = JSON.parse(dbSession.commit_mode_settings);
              } catch (e) {
                this.logger?.error(`Failed to parse commit mode settings: ${e}`);
              }
            }
            
            // Get structured prompt template from settings or use default
            const { DEFAULT_STRUCTURED_PROMPT_TEMPLATE } = require('../../../shared/types');
            const structuredPromptTemplate = commitModeSettings?.structuredPromptTemplate || DEFAULT_STRUCTURED_PROMPT_TEMPLATE;
            
            // Add structured commit instructions to the prompt
            finalPrompt = `${prompt}\n\n${structuredPromptTemplate}`;
            this.logger?.verbose(`Added structured commit instructions to continuation prompt`);
          }
          
          args.push('-p', finalPrompt);
        }
      } else {
        // Initial prompt for new session
        let finalPrompt = prompt;
        
        // Check if session has structured commit mode
        if (dbSession?.commit_mode === 'structured') {
          this.logger?.verbose(`Session ${sessionId} uses structured commit mode, enhancing prompt`);
          
          let commitModeSettings;
          if (dbSession.commit_mode_settings) {
            try {
              commitModeSettings = JSON.parse(dbSession.commit_mode_settings);
            } catch (e) {
              this.logger?.error(`Failed to parse commit mode settings: ${e}`);
            }
          }
          
          // Get structured prompt template from settings or use default
          const { DEFAULT_STRUCTURED_PROMPT_TEMPLATE } = require('../../../shared/types');
          const structuredPromptTemplate = commitModeSettings?.structuredPromptTemplate || DEFAULT_STRUCTURED_PROMPT_TEMPLATE;
          
          // Add structured commit instructions to the prompt
          finalPrompt = `${prompt}\n\n${structuredPromptTemplate}`;
          this.logger?.verbose(`Added structured commit instructions to prompt`);
        }
        
        if (systemPromptAppend) {
          // Append the system prompt to the user's prompt
          finalPrompt = `${finalPrompt}\n\n${systemPromptAppend}`;
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
      // For Linux, use current PATH to avoid slow shell detection
      const isLinux = os.platform() === 'linux';
      let shellPath: string;
      
      if (isLinux) {
        // For Linux, enhance current PATH with common locations instead of shell detection
        console.log('[ClaudeManager] Linux detected - using optimized PATH strategy');
        const currentPath = process.env.PATH || '';
        const pathSeparator = ':';
        const commonLinuxPaths = [
          '/usr/local/bin',
          '/snap/bin',
          path.join(os.homedir(), '.local', 'bin'),
          path.join(os.homedir(), 'bin'),
          '/usr/bin',
          '/bin'
        ];
        
        console.log(`[ClaudeManager] Current PATH has ${currentPath.split(pathSeparator).length} entries`);
        
        // Add common paths that aren't already in PATH
        const currentPaths = new Set(currentPath.split(pathSeparator));
        const additionalPaths = commonLinuxPaths.filter(p => !currentPaths.has(p) && fs.existsSync(p));
        
        console.log(`[ClaudeManager] Adding ${additionalPaths.length} Linux-specific paths: ${additionalPaths.join(', ')}`);
        shellPath = currentPath + (additionalPaths.length > 0 ? pathSeparator + additionalPaths.join(pathSeparator) : '');
      } else {
        console.log('[ClaudeManager] Non-Linux platform - using full shell PATH detection');
        shellPath = getShellPath();
      }
      
      // Find Node.js and ensure it's in the PATH
      const nodePath = await findNodeExecutable();
      console.log(`[ClaudeManager] Found Node.js at: ${nodePath}`);
      
      // Add Node.js directory to PATH to ensure it's available
      const nodeDir = path.dirname(nodePath);
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      const pathWithNode = nodeDir + pathSeparator + shellPath;
      
      const env = {
        ...process.env,
        PATH: pathWithNode,
        // Ensure MCP-related environment variables are preserved
        MCP_SOCKET_PATH: this.permissionIpcPath || '',
        // Add debug mode for MCP if verbose logging is enabled
        ...(this.configManager?.getConfig()?.verbose ? { MCP_DEBUG: '1' } : {})
      } as { [key: string]: string };
      
      
      // Use custom claude path if configured, otherwise find it in PATH
      let claudeCommand = this.configManager?.getConfig()?.claudeExecutablePath;
      if (claudeCommand) {
        this.logger?.info(`[ClaudeManager] Using custom Claude executable path: ${claudeCommand}`);
      } else {
        this.logger?.verbose(`[ClaudeManager] No custom Claude path configured, searching in PATH...`);
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
            panelId,
            sessionId,
            type: 'json',
            data: errorMessage,
            timestamp: new Date()
          });
          
          // Add a dedicated error output that will be displayed in its own box
          this.sessionManager.addSessionError(
            sessionId, 
            'Claude Code executable not found', 
            'Claude Code CLI not found in PATH. Please ensure claude is installed and in your PATH.'
          );
          
          throw new Error('Claude Code CLI not found in PATH. Please ensure claude is installed and in your PATH.');
        }
        claudeCommand = foundPath;
      }
      
      
      let ptyProcess: pty.IPty;
      let spawnAttempt = 0;
      let lastError: any;
      
      // Try normal spawn first, then fallback to Node.js invocation if it fails
      while (spawnAttempt < 2) {
        try {
          console.log(`[ClaudeManager] Spawning Claude process (attempt ${spawnAttempt + 1}) with: ${fullCommand}`);
          console.log(`[ClaudeManager] Command: ${claudeCommand}`);
          console.log(`[ClaudeManager] Working directory: ${worktreePath}`);
          console.log(`[ClaudeManager] PATH entries: ${pathWithNode.split(pathSeparator).length}`);
          const startTime = Date.now();
          
          // On Linux, add a small delay before spawning to avoid resource contention
          if (isLinux && this.processes.size > 0) {
            console.log(`[ClaudeManager] Linux: Adding 500ms delay before spawn (${this.processes.size} active processes)`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          if (spawnAttempt === 0) {
            // First attempt: normal spawn
            ptyProcess = pty.spawn(claudeCommand, args, {
              name: 'xterm-color',
              cols: 80,
              rows: 30,
              cwd: worktreePath,
              env
            });
          } else {
            // Second attempt: use Node.js directly with Claude script
            console.log(`[ClaudeManager] First spawn failed, trying Node.js direct invocation...`);
            
            // Find the Claude Code script
            const claudeScript = findClaudeCodeScript(claudeCommand);
            if (!claudeScript) {
              throw new Error('Could not find Claude Code script for Node.js invocation');
            }
            
            console.log(`[ClaudeManager] Using Node.js: ${nodePath}`);
            console.log(`[ClaudeManager] Claude script: ${claudeScript}`);
            
            // Spawn with Node.js directly, bypassing the shebang
            const nodeArgs = ['--no-warnings', '--enable-source-maps', claudeScript, ...args];
            ptyProcess = pty.spawn(nodePath, nodeArgs, {
              name: 'xterm-color',
              cols: 80,
              rows: 30,
              cwd: worktreePath,
              env
            });
          }
          
          const spawnTime = Date.now() - startTime;
          console.log(`[ClaudeManager] Claude process spawned successfully in ${spawnTime}ms`);
          break; // Success, exit the loop
        } catch (spawnError) {
          lastError = spawnError;
          spawnAttempt++;
          
          if (spawnAttempt === 1) {
            // First attempt failed, check if it's the shebang issue
            const errorMsg = spawnError instanceof Error ? spawnError.message : String(spawnError);
            console.error(`[ClaudeManager] First spawn attempt failed: ${errorMsg}`);
            
            // Check for typical shebang-related errors
            if (errorMsg.includes('No such file or directory') || 
                errorMsg.includes('env: node:') ||
                errorMsg.includes('ENOENT')) {
              console.log(`[ClaudeManager] Error suggests shebang issue, will try Node.js fallback`);
              continue; // Try the fallback
            }
          }
          
          // If we've tried both methods or the error isn't shebang-related, give up
          break;
        }
      }
      
      // If we failed after all attempts, handle the error
      if (!ptyProcess!) {
        // Handle spawn errors (e.g., command not found, permission denied)
        const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
        this.logger?.error(`[ClaudeManager] Failed to spawn Claude process after ${spawnAttempt} attempts: ${errorMsg}`);
        
        // Emit a pseudo-message to show the error in the UI
        const errorMessage = {
          type: 'session',
          data: {
            status: 'error',
            message: 'Failed to start Claude Code',
            details: [
              `Error: ${errorMsg}`,
              '',
              `Crystal tried ${spawnAttempt} method(s) to start Claude Code:`,
              '1. Direct execution of claude command',
              spawnAttempt > 1 ? '2. Node.js fallback for macOS GUI compatibility' : '',
              '',
              'This error usually means:',
              '- Claude Code is not installed or not found in your PATH',
              '- The Claude executable path is incorrect',
              '- You don\'t have permission to execute the Claude command',
              '- Node.js is not available (for fallback method)',
              '',
              `Command attempted: ${claudeCommand}`,
              `Working directory: ${worktreePath}`,
              `Node.js path: ${nodePath}`,
              '',
              'To fix this:',
              '1. Install Claude Code: https://docs.anthropic.com/en/docs/claude-code/overview',
              '2. Run "claude --version" in your terminal to verify installation',
              '3. Check Settings for custom Claude executable path',
              '4. Ensure Node.js is installed and available'
            ].filter(line => line).join('\n')
          }
        };
        
        this.emit('output', {
          panelId,
          sessionId,
          type: 'json',
          data: errorMessage,
          timestamp: new Date()
        });
        
        // Add a dedicated error output that will be displayed in its own box
        this.sessionManager.addSessionError(
          sessionId, 
          'Failed to start Claude Code', 
          `${errorMsg}\nPlease check that Claude Code is installed and accessible.`
        );
        
        throw new Error(`Failed to spawn Claude Code: ${errorMsg}`);
      }

      const claudeProcess: ClaudeCodeProcess = {
        process: ptyProcess,
        panelId,
        sessionId,
        worktreePath
      };

      this.processes.set(panelId, claudeProcess);
      this.logger?.verbose(`Claude Code process created for panel ${panelId} (session ${sessionId})`);
      
      // Note: Git event subscription is now handled in ClaudePanelManager.registerPanel()
      // This ensures all Claude panels are subscribed, not just those that have been started
      
      // Emit spawned event to update panel status
      this.emit('spawned', { panelId, sessionId });

      // Emit initial session info message with prompt and command
      const sessionInfoMessage = {
        type: 'session_info',
        initial_prompt: prompt,
        claude_command: `${claudeCommand || 'claude'} ${args.join(' ')}`,
        worktree_path: worktreePath,
        model: model || 'default',
        permission_mode: permissionMode || 'default',
        timestamp: new Date().toISOString()
      };
      
      this.emit('output', {
        panelId,
        sessionId,
        type: 'json',
        data: sessionInfoMessage,
        timestamp: new Date()
      });

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
              this.logger?.verbose(`JSON message from panel ${panelId} (session ${sessionId}): ${JSON.stringify(jsonMessage)}`);
              
              // Emit JSON message only - terminal formatting will be done on the fly
              this.emit('output', {
                panelId,
                sessionId,
                type: 'json',
                data: jsonMessage,
                timestamp: new Date()
              });
            } catch (error) {
              // If not valid JSON, treat as regular output
              this.logger?.verbose(`Raw output from panel ${panelId} (session ${sessionId}): ${line.substring(0, 200)}`);
              
              // Check if this looks like an error message
              const isError = line.includes('ERROR') || 
                            line.includes('Error:') || 
                            line.includes('error:') ||
                            line.includes('Command failed:') ||
                            line.includes('aborted') ||
                            line.includes('fatal:');
              
              this.emit('output', {
                panelId,
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
        // Check for and kill any child processes that Claude may have started
        const pid = ptyProcess.pid;
        if (pid) {
          const descendantPids = this.getAllDescendantPids(pid);
          if (descendantPids.length > 0) {
            // Get process info before killing
            const killedProcesses = await this.getProcessInfo(descendantPids);
            this.logger?.info(`[Claude] Found ${descendantPids.length} orphaned child processes after Claude exit for session ${sessionId}`);
            
            // Kill all child processes
            await this.killProcessTree(pid, panelId, sessionId);
            
            // Report what processes were killed
            const processReport = killedProcesses.map(p => `${p.name || 'unknown'}(${p.pid})`).join(', ');
            const message = `\n[Process Cleanup] Terminated ${killedProcesses.length} orphaned child process${killedProcesses.length > 1 ? 'es' : ''} after Claude exit: ${processReport}\n`;
            this.emit('output', {
              panelId,
              sessionId,
              type: 'stdout',
              data: message,
              timestamp: new Date()
            });
          }
        }
        
        // Process any remaining data in the buffer
        if (buffer.trim()) {
          try {
            const jsonMessage = JSON.parse(buffer.trim());
            this.emit('output', {
              panelId,
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
              panelId,
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
            
            // Linux-specific troubleshooting info
            const linuxSpecificInfo = isLinux ? [
              '',
              'Linux-specific issues:',
              `- Active Claude processes: ${this.processes.size}`,
              '- Common causes: PTY resource limits, file descriptor limits',
              '- Try: ulimit -n 4096 (increase file descriptor limit)',
              '- Try: Check /proc/sys/kernel/pty/max for PTY limit'
            ] : [];
            
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
                  ...linuxSpecificInfo,
                  '',
                  'You can also set a custom Claude executable path in the Settings.'
                ].join('\n')
              }
            };
            
            this.emit('output', {
              panelId,
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
              panelId,
              sessionId,
              type: 'json',
              data: errorMessage,
              timestamp: new Date()
            });
          }
        } else {
          this.logger?.info(`Claude process exited normally for panel ${panelId} (session ${sessionId})`);
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
          panelId,
          sessionId,
          exitCode,
          signal
        });
        this.processes.delete(panelId);
      });

      // Note: 'spawned' event is already emitted earlier in the function
      this.logger?.info(`Claude spawned successfully for panel ${panelId} (session ${sessionId})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Failed to spawn Claude for panel ${panelId} (session ${sessionId})`, error instanceof Error ? error : undefined);
      
      this.emit('error', {
        panelId,
        sessionId,
        error: errorMessage
      });
      throw error;
    }
  }

  sendInput(panelId: string, input: string): void {
    const claudeProcess = this.processes.get(panelId);
    if (!claudeProcess) {
      throw new Error(`No Claude Code process found for panel ${panelId}`);
    }

    claudeProcess.process.write(input);
  }

  async killProcess(panelId: string): Promise<void> {
    const claudeProcess = this.processes.get(panelId);
    if (!claudeProcess) {
      return;
    }

    const { sessionId } = claudeProcess;
    const pid = claudeProcess.process.pid;
    
    // Note: Panel event unsubscription is now handled in ClaudePanelManager.unregisterPanel()
    // This ensures proper cleanup when panels are destroyed
    
    // Get all child processes before killing
    let killedProcesses: { pid: number; name?: string }[] = [];
    if (pid) {
      const descendantPids = this.getAllDescendantPids(pid);
      if (descendantPids.length > 0) {
        // Try to get process names for better reporting
        killedProcesses = await this.getProcessInfo(descendantPids);
        this.logger?.info(`[Claude] Found ${descendantPids.length} child processes started by Claude for session ${sessionId}`);
      }
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

    // Kill the process and all its children
    if (pid) {
      const success = await this.killProcessTree(pid, panelId, sessionId);
      
      // Report what processes were killed
      if (killedProcesses.length > 0) {
        const processReport = killedProcesses.map(p => `${p.name || 'unknown'}(${p.pid})`).join(', ');
        const message = `\n[Process Cleanup] Terminated ${killedProcesses.length} child process${killedProcesses.length > 1 ? 'es' : ''} started by Claude: ${processReport}\n`;
        this.emit('output', {
          panelId,
          sessionId,
          type: 'stdout',
          data: message,
          timestamp: new Date()
        });
      }
      
      if (!success) {
        this.logger?.error(`Failed to cleanly terminate all child processes for Claude panel ${panelId} (session ${sessionId})`);
      }
    } else {
      // Fallback to simple kill if no PID
      claudeProcess.process.kill();
    }
    
    this.processes.delete(panelId);
  }

  getProcess(panelId: string): ClaudeCodeProcess | undefined {
    return this.processes.get(panelId);
  }

  getAllProcesses(): string[] {
    return Array.from(this.processes.keys());
  }

  async restartPanelWithHistory(panelId: string, sessionId: string, worktreePath: string, initialPrompt: string, conversationHistory: string[]): Promise<void> {
    // Kill existing process if it exists
    await this.killProcess(panelId);
    
    // Restart with conversation history
    await this.spawnClaudeCode(panelId, sessionId, worktreePath, initialPrompt, conversationHistory);
  }

  isPanelRunning(panelId: string): boolean {
    return this.processes.has(panelId);
  }

  async startPanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void> {
    return this.spawnClaudeCode(panelId, sessionId, worktreePath, prompt, undefined, false, permissionMode, model);
  }

  async continuePanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, conversationHistory: any[], model?: string): Promise<void> {
    // Kill any existing process for this panel first
    if (this.processes.has(panelId)) {
      console.log(`[ClaudeCodeManager] Killing existing process for panel ${panelId} before continuing`);
      await this.killProcess(panelId);
      // Add a small delay to ensure the process is fully cleaned up
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Double-check that the process was actually killed
    if (this.processes.has(panelId)) {
      console.error(`[ClaudeCodeManager] Process ${panelId} still exists after kill attempt, aborting continue`);
      throw new Error('Failed to stop previous panel instance');
    }
    
    // Get the session's permission mode from database
    const dbSession = this.sessionManager.getDbSession(sessionId);
    const permissionMode = dbSession?.permission_mode;
    
    // Check if we should skip --resume flag this time (after prompt compaction)
    // SQLite returns 0/1 for booleans, so we need to check explicitly
    const skipContinueRaw = dbSession?.skip_continue_next;
    const shouldSkipContinue = skipContinueRaw === 1 || skipContinueRaw === true;
    
    console.log(`[ClaudeCodeManager] continuePanel called for ${panelId} (session ${sessionId}):`, {
      skip_continue_next_raw: skipContinueRaw,
      skip_continue_next_type: typeof skipContinueRaw,
      skip_continue_next_value: skipContinueRaw,
      shouldSkipContinue,
      hasDbSession: !!dbSession,
      permissionMode,
      model
    });
    
    if (shouldSkipContinue) {
      // Clear the flag and start a fresh session without --resume
      console.log(`[ClaudeCodeManager] Clearing skip_continue_next flag for session ${sessionId}`);
      this.sessionManager.updateSession(sessionId, { skip_continue_next: false });
      
      // Verify the flag was cleared
      const updatedDbSession = this.sessionManager.getDbSession(sessionId);
      console.log(`[ClaudeCodeManager] Verified skip_continue_next flag is now:`, updatedDbSession?.skip_continue_next);
      console.log(`[ClaudeCodeManager] Skipping --resume flag for panel ${panelId} due to prompt compaction`);
      return this.spawnClaudeCode(panelId, sessionId, worktreePath, prompt, [], false, permissionMode, model);
    } else {
      // For continuing a session, we use the --resume flag
      // The conversationHistory parameter is kept for compatibility but not used with --resume
      console.log(`[ClaudeCodeManager] Using --resume flag for panel ${panelId}`);
      return this.spawnClaudeCode(panelId, sessionId, worktreePath, prompt, [], true, permissionMode, model);
    }
  }

  async stopPanel(panelId: string): Promise<void> {
    await this.killProcess(panelId);
  }

  // Legacy methods for backward compatibility with session management
  // DEPRECATED: These methods create virtual panel IDs which can cause database issues
  async startSession(sessionId: string, worktreePath: string, prompt: string, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void> {
    console.warn(`[ClaudeCodeManager] DEPRECATED: startSession called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    // For legacy session calls, create a virtual panel ID
    const virtualPanelId = `session-${sessionId}`;
    return this.startPanel(virtualPanelId, sessionId, worktreePath, prompt, permissionMode, model);
  }

  async continueSession(sessionId: string, worktreePath: string, prompt: string, conversationHistory: any[], model?: string): Promise<void> {
    console.warn(`[ClaudeCodeManager] DEPRECATED: continueSession called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    // For legacy session calls, create a virtual panel ID
    const virtualPanelId = `session-${sessionId}`;
    return this.continuePanel(virtualPanelId, sessionId, worktreePath, prompt, conversationHistory, model);
  }

  async stopSession(sessionId: string): Promise<void> {
    console.warn(`[ClaudeCodeManager] DEPRECATED: stopSession called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    // For legacy session calls, use virtual panel ID
    const virtualPanelId = `session-${sessionId}`;
    await this.stopPanel(virtualPanelId);
  }

  isSessionRunning(sessionId: string): boolean {
    console.warn(`[ClaudeCodeManager] DEPRECATED: isSessionRunning called with virtual panel ID for session ${sessionId}. Use real panel IDs instead.`);
    // For legacy session calls, check virtual panel ID
    const virtualPanelId = `session-${sessionId}`;
    return this.isPanelRunning(virtualPanelId);
  }

  /**
   * Kill all Claude processes on shutdown
   */
  async killAllProcesses(): Promise<void> {
    const panelIds = Array.from(this.processes.keys());
    this.logger?.info(`[Claude] Killing ${panelIds.length} Claude panel processes on shutdown`);
    
    const killPromises = panelIds.map(panelId => this.killProcess(panelId));
    await Promise.all(killPromises);
  }

  /**
   * Clear the Claude availability cache
   * This should be called when settings change (e.g., custom Claude path)
   */
  clearAvailabilityCache(): void {
    this.availabilityCache = null;
    this.logger?.verbose('[ClaudeManager] Cleared Claude availability cache');
  }

  /**
   * Get all descendant PIDs of a parent process recursively
   * This is critical for ensuring all child processes are killed
   */
  private getAllDescendantPids(parentPid: number): number[] {
    const descendants: number[] = [];
    const platform = os.platform();
    
    try {
      if (platform === 'win32') {
        // Windows: Use WMIC to get child processes
        const result = execSync(
          `wmic process where (ParentProcessId=${parentPid}) get ProcessId`,
          { encoding: 'utf8' }
        );
        
        const lines = result.split('\n').filter((line: string) => line.trim());
        for (let i = 1; i < lines.length; i++) { // Skip header
          const pid = parseInt(lines[i].trim());
          if (!isNaN(pid) && pid !== parentPid) {
            descendants.push(pid);
            // Recursively get children of this process
            descendants.push(...this.getAllDescendantPids(pid));
          }
        }
      } else {
        // Unix/Linux/macOS: Use ps command
        const result = execSync(
          `ps -o pid= --ppid ${parentPid} 2>/dev/null || true`,
          { encoding: 'utf8' }
        );
        
        const pids = result.split('\n')
          .map((line: string) => parseInt(line.trim()))
          .filter((pid: number) => !isNaN(pid) && pid !== parentPid);
        
        for (const pid of pids) {
          descendants.push(pid);
          // Recursively get children of this process
          descendants.push(...this.getAllDescendantPids(pid));
        }
      }
    } catch (error) {
      this.logger?.warn(`Error getting descendant PIDs for ${parentPid}:`, error as Error);
    }
    
    // Remove duplicates
    return [...new Set(descendants)];
  }

  /**
   * Get process information for a list of PIDs
   */
  private async getProcessInfo(pids: number[]): Promise<{ pid: number; name?: string }[]> {
    const processInfo: { pid: number; name?: string }[] = [];
    const platform = os.platform();
    
    for (const pid of pids) {
      try {
        let name: string | undefined;
        
        if (platform === 'win32') {
          // Windows: Use wmic to get process name
          const result = execSync(
            `wmic process where ProcessId=${pid} get Name`,
            { encoding: 'utf8' }
          );
          const lines = result.split('\n').filter((line: string) => line.trim());
          if (lines.length > 1) {
            name = lines[1].trim();
          }
        } else {
          // Unix/Linux/macOS: Use ps to get process name
          const result = execSync(
            `ps -p ${pid} -o comm= 2>/dev/null || true`,
            { encoding: 'utf8' }
          );
          name = result.trim();
        }
        
        processInfo.push({ pid, name: name || 'unknown' });
      } catch (error) {
        // Process might have already exited
        processInfo.push({ pid, name: 'unknown' });
      }
    }
    
    return processInfo;
  }

  /**
   * Kill a process and all its descendants
   * Returns true if successful, false if zombie processes remain
   */
  private async killProcessTree(pid: number, panelId: string, sessionId: string): Promise<boolean> {
    const platform = os.platform();
    const execAsync = promisify(exec);
    
    // First, get all descendant PIDs before we start killing
    const descendantPids = this.getAllDescendantPids(pid);
    this.logger?.info(`[Claude] Found ${descendantPids.length} descendant processes for PID ${pid} in session ${sessionId}`);
    
    let success = true;
    
    try {
      if (platform === 'win32') {
        // On Windows, use taskkill to terminate the process tree
        try {
          await execAsync(`taskkill /F /T /PID ${pid}`);
          this.logger?.verbose(`[Claude] Successfully killed Windows process tree ${pid}`);
        } catch (error) {
          this.logger?.warn(`[Claude] Error killing Windows process tree: ${error as Error}`);
          // Fallback: kill descendants individually
          for (const childPid of descendantPids) {
            try {
              await execAsync(`taskkill /F /PID ${childPid}`);
            } catch (e) {
              // Process might already be dead
            }
          }
        }
      } else {
        // On Unix-like systems (macOS, Linux)
        // First, try SIGTERM for graceful shutdown
        try {
          process.kill(pid, 'SIGTERM');
        } catch (error) {
          this.logger?.warn('[Claude] SIGTERM failed:', error as Error);
        }
        
        // Kill the entire process group using negative PID
        try {
          await execAsync(`kill -TERM -${pid}`);
        } catch (error) {
          this.logger?.warn(`[Claude] Error sending SIGTERM to process group: ${error}`);
        }
        
        // Give processes a chance to clean up gracefully
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Now forcefully kill the main process
        try {
          process.kill(pid, 'SIGKILL');
        } catch (error) {
          // Process might already be dead
        }
        
        // Kill the process group with SIGKILL
        try {
          await execAsync(`kill -9 -${pid}`);
        } catch (error) {
          this.logger?.warn(`[Claude] Error sending SIGKILL to process group: ${error}`);
        }
        
        // Kill all known descendants individually to be sure
        for (const childPid of descendantPids) {
          try {
            await execAsync(`kill -9 ${childPid}`);
            this.logger?.verbose(`[Claude] Killed descendant process ${childPid}`);
          } catch (error) {
            this.logger?.verbose(`[Claude] Process ${childPid} already terminated`);
          }
        }
        
        // Final cleanup attempt using pkill
        try {
          await execAsync(`pkill -9 -P ${pid}`);
        } catch (error) {
          // Ignore errors - processes might already be dead
        }
      }
      
      // Verify all processes are actually dead
      await new Promise(resolve => setTimeout(resolve, 500));
      const remainingPids = this.getAllDescendantPids(pid);
      
      if (remainingPids.length > 0) {
        this.logger?.error(`[Claude] WARNING: ${remainingPids.length} zombie processes remain: ${remainingPids.join(', ')}`);
        success = false;
        
        // Get process info for remaining processes
        const remainingProcesses = await this.getProcessInfo(remainingPids);
        const processReport = remainingProcesses.map(p => `${p.name || 'unknown'}(${p.pid})`).join(', ');
        
        // Emit error event so UI can show warning
        this.emit('output', {
          panelId,
          sessionId,
          type: 'stderr',
          data: `\n[WARNING] Failed to terminate ${remainingPids.length} child process${remainingPids.length > 1 ? 'es' : ''}: ${processReport}\nPlease manually kill these processes.\n`,
          timestamp: new Date()
        });
      }
    } catch (error) {
      this.logger?.error('[Claude] Error in killProcessTree:', error as Error);
      success = false;
    }
    
    // Always try to kill via pty interface as final fallback
    try {
      const claudeProcess = this.processes.get(sessionId);
      if (claudeProcess) {
        claudeProcess.process.kill();
      }
    } catch (error) {
      // Process might already be dead
    }
    
    return success;
  }
}

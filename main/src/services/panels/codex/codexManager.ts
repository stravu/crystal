import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import type { SessionManager } from '../../sessionManager';
import type { ConversationMessage } from '../../../database/models';
import { findExecutableInPath } from '../../../utils/shellPath';
import { AbstractCliManager } from '../cli/AbstractCliManager';
import { DEFAULT_CODEX_MODEL, getCodexModelConfig } from '../../../../../shared/types/models';
import type { CodexPanelState } from '../../../../../shared/types/panels';
import type { ToolPanel } from '../../../../../shared/types/panels';
import { findNodeExecutable } from '../../../utils/nodeFinder';
import { panelManager } from '../../panelManager';
import { enhancePromptForStructuredCommit } from '../../../utils/promptEnhancer';

interface CodexDebugState {
  pid?: number;
  isConnected: boolean;
  sessionId: string;
  panelId: string;
  worktreePath?: string;
  codexSessionId?: string;
  processState: string;
  model?: string;
  modelProvider?: string;
  totalMessagesReceived: number;
  totalMessagesSent: number;
}

interface SessionInfoMessage {
  type: string;
  initial_prompt: string;
  original_prompt: string;
  codex_command: string;
  worktree_path: string;
  model: string;
  model_provider?: string;
  approval_policy?: string;
  sandbox_mode?: boolean | string;
  permission_mode?: string;
  resume_session_id?: string;
  is_resume?: boolean;
  web_search?: boolean;
  timestamp?: string;
}

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
  thinkingLevel?: 'low' | 'medium' | 'high';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy?: 'auto' | 'manual';
  webSearch?: boolean;
  isResume?: boolean;
  resumeSessionId?: string;
  [key: string]: unknown; // Allow CLI-specific options
}

interface CodexProcess {
  process: import('@homebridge/node-pty-prebuilt-multiarch').IPty;
  panelId: string;
  sessionId: string;
  worktreePath: string;
}

/**
 * CodexManager - Manages OpenAI Codex CLI processes using interactive mode
 * Extends AbstractCliManager for common CLI functionality, similar to Claude Code
 * 
 * Note: GPT-5 was released on August 7, 2025, providing significant improvements
 * in reasoning, speed, and capabilities over GPT-4 models.
 */
export class CodexManager extends AbstractCliManager {
  private sessionIdSearchAttempts: number = 0;
  private hasTriggeredSessionIdSearch: Set<string> = new Set();
  private messageCount: Map<string, number> = new Map();
  private originalPrompts: Map<string, string> = new Map(); // Track original prompts per panel
  
  constructor(
    sessionManager: SessionManager,
    logger?: Logger,
    configManager?: ConfigManager
  ) {
    super(sessionManager, logger, configManager);
    this.logger?.info(`[codex] CodexManager initialized in interactive mode`);
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
    this.logger?.info('[codex] Testing Codex availability...');
    try {
      const command = customPath || await this.findCodexExecutable();
      this.logger?.info(`[codex] Looking for Codex at: ${command || 'not found'}`);
      if (!command) {
        this.logger?.warn('[codex] Codex not found in any standard location');
        return {
          available: false,
          error: 'Codex not found in PATH or standard locations'
        };
      }

      // Test codex availability
      this.logger?.info(`[codex] Testing Codex command: "${command}" --version`);
      
      // Try direct execution first
      try {
        const version = execSync(`"${command}" --version`, { 
          encoding: 'utf8',
          timeout: 5000
        }).trim();
        this.logger?.info(`[codex] Codex version detected: ${version}`);
        
        return {
          available: true,
          version,
          path: command
        };
      } catch (directError: unknown) {
        // Check if it's a shebang/node error
        const error = directError as { message?: string };
        const errorMsg = error.message || String(directError);
        const isShebangError = errorMsg.includes('env: node:') || 
                               errorMsg.includes('No such file or directory') ||
                               errorMsg.includes('is not recognized') ||
                               errorMsg.includes('ENOENT');
        
        if (isShebangError) {
          this.logger?.warn(`[codex] Codex appears to be a Node.js script, trying Node.js fallback...`);
          
          // Try to find Node.js and run the script directly
          try {
            const nodePath = await findNodeExecutable();
            this.logger?.info(`[codex] Found Node.js at: ${nodePath} for fallback execution`);
            
            // Test with Node.js directly
            const nodeCommand = `"${nodePath}" "${command}" --version`;
            this.logger?.info(`[codex] Testing Node.js fallback command: ${nodeCommand}`);
            
            const version = execSync(nodeCommand, {
              encoding: 'utf8',
              timeout: 5000
            }).trim();
            this.logger?.info(`[codex] Codex version detected via Node.js fallback: ${version}`);
            
            // Store that we need Node.js fallback
            (global as typeof global & { codexNeedsNodeFallback?: boolean }).codexNeedsNodeFallback = true;
            this.logger?.info('[codex] Node.js fallback mode enabled for future executions');
            
            return {
              available: true,
              version,
              path: command
            };
          } catch (nodeError: unknown) {
            const nodeErr = nodeError as { message?: string };
            const nodeErrorMsg = nodeErr.message || String(nodeError);
            this.logger?.error(`[codex] Node.js fallback also failed: ${nodeErrorMsg}`);
            throw new Error(`Codex execution failed. Original error: ${errorMsg}. Node.js fallback error: ${nodeErrorMsg}`);
          }
        }
        throw directError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`[codex] Codex availability test failed: ${errorMessage}`);
      return {
        available: false,
        error: errorMessage
      };
    }
  }

  protected buildCommandArgs(options: CodexSpawnOptions): string[] {
    const {
      prompt,
      isResume,
      resumeSessionId,
      model,
      sandboxMode,
      webSearch,
      thinkingLevel
    } = options;

    this.logger?.info('[codex-command-build] Building command with options:');
    this.logger?.info(`[codex-command-build]   isResume: ${isResume}`);
    this.logger?.info(`[codex-command-build]   resumeSessionId: ${resumeSessionId || 'none'}`);
    this.logger?.info(`[codex-command-build]   model: ${model || 'not specified'}`);
    this.logger?.info(`[codex-command-build]   sandboxMode: ${sandboxMode || 'workspace-write'}`);
    this.logger?.info(`[codex-command-build]   webSearch: ${webSearch || false}`);
    this.logger?.info(`[codex-command-build]   thinkingLevel: ${thinkingLevel || 'not specified'}`);
    this.logger?.info(`[codex-command-build]   prompt: "${prompt || ''}"`);
    
    // Store the original prompt for display purposes
    this.originalPrompts.set(options.panelId, prompt);
    
    // Get session data for structured commit enhancement
    const dbSession = this.sessionManager.getDbSession(options.sessionId);
    
    // Enhance prompt for structured commit mode if needed
    const finalPrompt = enhancePromptForStructuredCommit(prompt, dbSession || { id: options.sessionId }, this.logger);

    const args: string[] = ['exec', '--json'];

    if (model && model !== 'auto') {
      args.push('-m', model);
      this.logger?.info(`[codex] Setting model to: ${model}`);
    }

    const sandbox = sandboxMode || 'workspace-write';
    args.push('-c', `sandbox_mode="${sandbox}"`);
    this.logger?.info(`[codex] Setting sandbox mode to: ${sandbox}`);

    if (thinkingLevel) {
      args.push('-c', `model_reasoning_effort="${thinkingLevel}"`);
      this.logger?.info(`[codex] Setting model_reasoning_effort to: ${thinkingLevel}`);
    }

    if (webSearch) {
      args.push('-c', 'web_search=true');
      this.logger?.info('[codex] Enabling web_search via config override');
    } else {
      this.logger?.info('[codex] Web search disabled for this command');
    }

    if (isResume) {
      if (resumeSessionId) {
        args.push('resume', resumeSessionId);
      } else {
        this.logger?.warn('[codex] Resume requested without a resumeSessionId. Falling back to a new session command.');
      }
    }

    if (finalPrompt && finalPrompt.trim()) {
      args.push(finalPrompt);
    }

    const commandSummary = `codex ${args.join(' ')}`;
    const commandType = isResume && resumeSessionId ? 'RESUME' : 'NEW SESSION';
    this.logger?.info(`[codex-command-build] ✅ Built ${commandType} command: ${commandSummary}`);

    return args;
  }

  private emitSessionInfoMessage(params: {
    panelId: string;
    sessionId: string;
    worktreePath: string;
    prompt: string;
    command: string;
    model?: string;
    modelProvider?: string;
    approvalPolicy?: string;
    sandboxMode?: string;
    permissionMode?: string;
    resumeSessionId?: string;
    isResume?: boolean;
    webSearch?: boolean;
  }): void {
    const {
      panelId,
      sessionId,
      worktreePath,
      prompt,
      command,
      model,
      modelProvider,
      approvalPolicy,
      sandboxMode,
      permissionMode,
      resumeSessionId,
      isResume,
      webSearch
    } = params;

    const sessionInfoMessage: SessionInfoMessage = {
      type: 'session_info',
      initial_prompt: prompt,
      original_prompt: prompt, // Store original prompt separately for transformer use
      codex_command: command,
      worktree_path: worktreePath,
      model: model || DEFAULT_CODEX_MODEL,
      model_provider: modelProvider || 'openai',
      timestamp: new Date().toISOString()
    };

    if (approvalPolicy) {
      sessionInfoMessage.approval_policy = approvalPolicy;
    }

    if (typeof webSearch === 'boolean') {
      sessionInfoMessage.web_search = webSearch;
    }

    if (sandboxMode) {
      sessionInfoMessage.sandbox_mode = sandboxMode;
    }

    if (permissionMode) {
      sessionInfoMessage.permission_mode = permissionMode;
    }

    if (resumeSessionId) {
      sessionInfoMessage.resume_session_id = resumeSessionId;
    }

    if (typeof isResume === 'boolean') {
      sessionInfoMessage.is_resume = isResume;
    }

    this.emit('output', {
      panelId,
      sessionId,
      type: 'json',
      data: sessionInfoMessage,
      timestamp: new Date()
    });
  }

  protected async getCliExecutablePath(): Promise<string> {
    // Check for custom path in config
    const config = this.configManager?.getConfig();
    const customPath = config?.codexExecutablePath;
    if (customPath) {
      this.logger?.info(`[codex] Using custom Codex executable path: ${customPath}`);
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
    data: unknown;
    timestamp: Date;
  }> {
    const events: Array<{
      panelId: string;
      sessionId: string;
      type: 'json' | 'stdout' | 'stderr';
      data: unknown;
      timestamp: Date;
    }> = [];

    // Split by newlines and process each line
    const lines = data.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        // Try to parse as JSON (similar to Claude's stream-json mode)
        const jsonMessage = JSON.parse(line.trim());
        this.logger?.verbose(`[codex] JSON message from panel ${panelId}: ${JSON.stringify(jsonMessage).substring(0, 500)}`);
        
        // Track message count for this panel
        const currentCount = this.messageCount.get(panelId) || 0;
        this.messageCount.set(panelId, currentCount + 1);
        
        // Trigger session ID search after receiving the third message
        // (skip session info and prompt messages)
        // BUT ONLY if we don't already have a session ID stored
        if (currentCount === 2 && !this.hasTriggeredSessionIdSearch.has(panelId)) {
          this.hasTriggeredSessionIdSearch.add(panelId);
          
          // Check if we already have a session ID stored
          let existingSessionId: string | undefined;
          if (this.sessionManager) {
            const db = this.sessionManager.db;
            if (db) {
              const panel = db.getPanel(panelId);
              const customState = panel?.state?.customState as Record<string, unknown> | undefined;
              existingSessionId = (customState?.agentSessionId as string) || (customState?.codexSessionId as string);
            }
          }
          
          if (existingSessionId) {
            this.logger?.info(`[session-id-debug] Panel ${panelId} already has session ID: ${existingSessionId}, skipping search`);
          } else {
            this.logger?.info(`[session-id-debug] Triggering session ID search after third message for panel ${panelId}`);
            
            // Get the worktree path from the process
            const process = this.processes.get(panelId);
            if (process) {
              this.findAndStoreCodexSessionId(panelId, process.worktreePath).catch(error => {
                this.logger?.error(`[session-id-debug] Failed to find session ID: ${error}`);
              });
            }
          }
        }
        
        // Check if this is a session ID message from Codex
        // We're looking for a specific session_id field, NOT generic id fields
        // Session IDs should be UUIDs, not numbers like 0
        
        // Only check for explicit session ID fields
        const possibleSessionId = jsonMessage.session_id || 
                                 jsonMessage.sessionId || 
                                 jsonMessage.payload?.session_id ||
                                 jsonMessage.payload?.sessionId;
        
        // Validate it's a proper UUID before accepting it
        const isValidUUID = possibleSessionId && 
                           typeof possibleSessionId === 'string' &&
                           /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(possibleSessionId);
        
        if (isValidUUID) {
          const codexSessionId = possibleSessionId;
          this.logger?.info(`[session-id-debug] Found valid Codex session ID in JSON for panel ${panelId}: ${codexSessionId}`);
          
          // Store the session ID in the panel's custom state (similar to Claude)
          if (this.sessionManager) {
            const db = this.sessionManager.db;
            if (db) {
              const panel = db.getPanel(panelId);
              if (panel) {
                // Check if we already have a session ID stored
                const currentState = panel.state || {};
                const customState = (currentState.customState as Record<string, unknown>) || {};
                
                // Only update if we don't have one - never overwrite existing session IDs
                if (!customState.agentSessionId && !customState.codexSessionId) {
                  const updatedState = {
                    ...currentState,
                    customState: { 
                      ...customState, 
                      agentSessionId: codexSessionId, // Use new generic field
                      codexSessionId  // Keep legacy field for backward compatibility
                    }
                  };
                  // Use panelManager to update so cache is properly updated
                  // Schedule the update asynchronously since parseCliOutput is not async
                  setImmediate(async () => {
                    await panelManager.updatePanel(panelId, { state: updatedState });
                    this.logger?.info(`[session-id-debug] Stored valid Codex session_id for panel ${panelId}: ${codexSessionId}`);
                  });
                }
              } else {
                this.logger?.warn(`[session-id-debug] Could not find panel ${panelId} to store session ID`);
              }
            } else {
              this.logger?.warn(`[session-id-debug] No database available to store session ID`);
            }
          } else {
            this.logger?.warn(`[session-id-debug] No session manager available to store session ID`);
          }
        } else if (possibleSessionId) {
          // Log when we find something that looks like it might be a session ID but isn't valid
          this.logger?.verbose(`[session-id-debug] Found possible session ID but not a valid UUID: ${possibleSessionId}`);
        } else {
          // Log first few messages to understand the JSON structure
          if (!this.sessionIdSearchAttempts) {
            this.sessionIdSearchAttempts = 0;
          }
          if (this.sessionIdSearchAttempts < 5) {
            this.logger?.info(`[session-id-debug] No session ID found in message. Full JSON: ${JSON.stringify(jsonMessage)}`);
            this.sessionIdSearchAttempts++;
          }
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
        this.logger?.verbose(`[codex] Raw output from panel ${panelId}: ${line}`);
        
        // Check if this looks like an error message
        const isError = line.includes('ERROR') ||
                       line.includes('Error:') ||
                       line.includes('error:') ||
                       line.includes('Command failed:') ||
                       line.includes('aborted') ||
                       line.includes('fatal:');
        
        events.push({
          panelId,
          sessionId,
          type: isError ? 'stderr' : 'stdout',
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
    const config = this.configManager?.getConfig();
    const apiKey = process.env.OPENAI_API_KEY || config?.openaiApiKey;
    if (apiKey) {
      env.OPENAI_API_KEY = apiKey;
      this.logger?.info(`[codex-env] Setting OPENAI_API_KEY (length: ${apiKey.length})`);
    }
    
    // Add other provider API keys if configured
    if (process.env.GEMINI_API_KEY) {
      env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      this.logger?.info(`[codex-env] Setting GEMINI_API_KEY`);
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      this.logger?.info(`[codex-env] Setting ANTHROPIC_API_KEY`);
    }
    
    if (process.env.OPENROUTER_API_KEY) {
      env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      this.logger?.info(`[codex-env] Setting OPENROUTER_API_KEY`);
    }
    
    this.logger?.info(`[codex-env] Environment variables configured: ${Object.keys(env).join(', ') || 'none'}`);
    
    return env;
  }

  protected async cleanupCliResources(sessionId: string): Promise<void> {
    // Clean up any session-specific resources if needed
    this.logger?.verbose(`[codex] Cleaning up resources for session ${sessionId}`);
  }

  protected async getCliEnvironment(options: CodexSpawnOptions): Promise<{ [key: string]: string }> {
    // Additional environment variables if needed
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

  // Codex now uses the base class spawnPtyProcess with Node.js fallback
  // Override only to add Codex-specific logging
  protected async spawnPtyProcess(command: string, args: string[], cwd: string, env: { [key: string]: string }): Promise<import('@homebridge/node-pty-prebuilt-multiarch').IPty> {
    this.logger?.info(`[session-id-debug] Spawning Codex in directory: ${cwd}`);
    this.logger?.info(`[session-id-debug] This is where ~/.codex/sessions will be created`);
    
    // Use the base class implementation which now handles Node.js fallback
    return super.spawnPtyProcess(command, args, cwd, env);
  }

  // Public methods for panel interaction (similar to Claude's interface)
  
  async checkAvailability(customPath?: string): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
    return this.getCachedAvailability();
  }

  async startPanel(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    prompt: string,
    model?: string,
    modelProvider?: string,
    thinkingLevel?: 'low' | 'medium' | 'high',
    approvalPolicy?: 'auto' | 'manual',
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch?: boolean
  ): Promise<void> {
    const options: CodexSpawnOptions = {
      panelId,
      sessionId,
      worktreePath,
      prompt,
      model: model || DEFAULT_CODEX_MODEL,
      modelProvider: modelProvider || 'openai',
      thinkingLevel,
      approvalPolicy,
      sandboxMode,
      webSearch
    };
    
    this.logger?.info(`[codex] Starting panel ${panelId} with interactive mode`);
    
    // Reset tracking for this panel (in case it's being restarted)
    this.hasTriggeredSessionIdSearch.delete(panelId);
    this.messageCount.set(panelId, 0);
    
    const finalArgs = this.buildCommandArgs(options);
    const commandPreview = `codex ${finalArgs.join(' ')}`;

    // Emit initial session info message (similar to Claude)
    this.emitSessionInfoMessage({
      panelId,
      sessionId,
      worktreePath,
      prompt: options.prompt,
      command: commandPreview,
      model: options.model,
      modelProvider: options.modelProvider,
      approvalPolicy: options.approvalPolicy,
      sandboxMode: options.sandboxMode,
      webSearch: options.webSearch
    });
    
    await this.spawnCliProcess(options);
    
    // Session ID search will be triggered after receiving the third message
    // This ensures the session file has been created by Codex
  }

  /**
   * Find the most recent Codex session ID for a worktree path
   * Reads ~/.codex/sessions subdirectories recursively for .jsonl files and extracts the UUID from the FIRST line.
   * Cross-platform implementation that mimics the original shell command behavior.
   */
  private async findAndStoreCodexSessionId(panelId: string, worktreePath: string): Promise<void> {
    // Small delay to ensure file is written
    await new Promise(resolve => setTimeout(resolve, 500));

    const fsPromises = require('fs').promises as typeof import('fs').promises;
    const fsSync = require('fs') as typeof import('fs');
    const pathMod = require('path') as typeof import('path');
    const osMod = require('os') as typeof import('os');

    const isWindows = process.platform === 'win32';

    const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

    // Normalize paths for comparison
    const normalizePath = (p: string): string => {
      try {
        // Resolve symlinks
        p = fsSync.realpathSync(p);
      } catch {}
      // Resolve to absolute path
      let n = pathMod.resolve(p);
      // Normalize path separators
      n = pathMod.normalize(n);
      // Case insensitive on Windows
      if (isWindows) n = n.toLowerCase();
      // Remove trailing separator
      if (n.endsWith(pathMod.sep)) n = n.slice(0, -1);
      return n;
    };

    // Check if two paths are equivalent (handles macOS /tmp -> /private/tmp mapping)
    const arePathsEquivalent = (a: string, b: string): boolean => {
      const na = normalizePath(a);
      const nb = normalizePath(b);
      if (na === nb) return true;
      
      // macOS often maps /tmp -> /private/tmp (and /var -> /private/var)
      if (process.platform === 'darwin') {
        // Check if one is /private/X and the other is /X
        if (na.startsWith('/private/') && nb === na.slice(8)) return true;
        if (nb.startsWith('/private/') && na === nb.slice(8)) return true;
      }
      return false;
    };

    try {
      // Directory where Codex writes session logs
      const codexDir = pathMod.join(osMod.homedir(), '.codex', 'sessions');

      try {
        await fsPromises.access(codexDir);
      } catch {
        this.logger?.info(`[session-id-debug] Codex sessions directory not found: ${codexDir}`);
        return;
      }

      const targetPath = normalizePath(worktreePath);
      this.logger?.info(`[session-id-debug] Looking for sessions with cwd: ${targetPath}`);

      // Get all .jsonl files recursively (they might be in subdirectories)
      const findJsonlFiles = async (dir: string): Promise<string[]> => {
        const files: string[] = [];
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = pathMod.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Recursively search subdirectories
            const subFiles = await findJsonlFiles(fullPath);
            files.push(...subFiles);
          } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        }
        
        return files;
      };
      
      const jsonlFiles = await findJsonlFiles(codexDir);
      
      if (!jsonlFiles.length) {
        this.logger?.info(`[session-id-debug] No session files found in ${codexDir}`);
        return;
      }

      // Get file stats and sort by modification time (newest first)
      const filesWithTimes = await Promise.all(
        jsonlFiles.map(async (file: string) => {
          try {
            const st = await fsPromises.stat(file);
            return { file, mtime: st.mtimeMs };
          } catch {
            return { file, mtime: 0 };
          }
        })
      );
      filesWithTimes.sort((a, b) => b.mtime - a.mtime);
      this.logger?.info(`[session-id-debug] Found ${filesWithTimes.length} session files, checking most recent first`);

      // Check each file - ONLY read the FIRST line (like the original implementation)
      for (const { file } of filesWithTimes) {
        try {
          // Read the entire file (we need to handle line breaks properly)
          const content = await fsPromises.readFile(file, 'utf8');
          const firstLine = content.split('\n')[0];
          
          if (!firstLine || !firstLine.trim()) continue;
          
          try {
            const sessionData = JSON.parse(firstLine);
            
            // Log the structure for debugging
            this.logger?.verbose(`[session-id-debug] File ${pathMod.basename(file)} first line structure: ${JSON.stringify(Object.keys(sessionData))}`);
            if (sessionData.payload) {
              this.logger?.verbose(`[session-id-debug] Payload keys: ${JSON.stringify(Object.keys(sessionData.payload))}`);
            }
            
            // Check if the cwd matches
            const sessionCwd = sessionData.payload?.cwd;
            if (!sessionCwd || typeof sessionCwd !== 'string') {
              this.logger?.verbose(`[session-id-debug] No cwd in payload for ${pathMod.basename(file)}`);
              continue;
            }
            
            this.logger?.verbose(`[session-id-debug] Comparing paths: session="${sessionCwd}" vs worktree="${worktreePath}"`);
            if (!arePathsEquivalent(sessionCwd, worktreePath)) {
              this.logger?.verbose(`[session-id-debug] Paths don't match for ${pathMod.basename(file)}`);
              continue;
            }
            
            this.logger?.info(`[session-id-debug] Found matching cwd in ${pathMod.basename(file)}`);
            
            // Extract session ID
            const sessionId = sessionData.payload?.id;
            if (!sessionId || typeof sessionId !== 'string') {
              this.logger?.warn(`[session-id-debug] Found matching cwd but no session ID! payload.id=${sessionId}`);
              this.logger?.warn(`[session-id-debug] Full payload: ${JSON.stringify(sessionData.payload)}`);
              continue;
            }
            
            // Validate UUID format
            if (!uuidRegex.test(sessionId)) {
              this.logger?.info(`[session-id-debug] Found session ID but invalid format: ${sessionId}`);
              continue;
            }
            
            // Found it!
            this.logger?.info(`[session-id-debug] Found valid session ID: ${sessionId} (from ${pathMod.basename(file)})`);
            
            // Store in the panel state (but check if we're overwriting)
            if (this.sessionManager) {
              const db = this.sessionManager.db;
              if (db) {
                const panel = db.getPanel(panelId);
                if (panel) {
                  const currentState = panel.state || {};
                  const customState = (currentState.customState as Record<string, unknown>) || {};
                  const existingSessionId = (customState.agentSessionId as string) || (customState.codexSessionId as string);
                  
                  if (existingSessionId) {
                    this.logger?.warn(`[session-id-debug] WARNING: Attempted to overwrite existing session ID ${existingSessionId} with ${sessionId} - BLOCKED`);
                    return; // Don't overwrite existing session ID
                  }
                  
                  const updatedState = { 
                    ...currentState, 
                    customState: { 
                      ...customState, 
                      agentSessionId: sessionId, // Use new generic field
                      codexSessionId: sessionId  // Keep legacy field for backward compatibility
                    } 
                  };
                  
                  this.logger?.info(`[session-id-debug] About to update panel state with: ${JSON.stringify(updatedState)}`);
                  // Use panelManager to update so cache is properly updated
                  await panelManager.updatePanel(panelId, { state: updatedState });
                  
                  // Verify it was saved
                  const verifyPanel = panelManager.getPanel(panelId);
                  const verifyCustomState = verifyPanel?.state?.customState as CodexPanelState;
                  const savedSessionId = verifyCustomState?.agentSessionId || verifyCustomState?.codexSessionId;
                  if (savedSessionId === sessionId) {
                    this.logger?.info(`[session-id-debug] ✅ Verified session ID was stored correctly: ${savedSessionId}`);
                  } else {
                    this.logger?.error(`[session-id-debug] ❌ Failed to store session ID! Expected ${sessionId}, got ${savedSessionId}`);
                    this.logger?.error(`[session-id-debug] Panel state after save: ${JSON.stringify(verifyPanel?.state)}`);
                  }
                } else {
                  this.logger?.error(`[session-id-debug] Panel ${panelId} not found in database!`);
                }
              } else {
                this.logger?.error(`[session-id-debug] Database not available!`);
              }
            } else {
              this.logger?.error(`[session-id-debug] Session manager not available!`);
            }
            return; // Done - found and stored the session ID
            
          } catch (parseError) {
            // Skip lines that aren't valid JSON
            continue;
          }
        } catch (readError) {
          this.logger?.verbose(`[session-id-debug] Error reading file ${file}: ${readError}`);
          continue;
        }
      }

      this.logger?.warn(`[session-id-debug] No matching session found for path: ${targetPath}`);
      
      // Fallback: Try the most recent file (within last 10 seconds) that has a valid session ID
      const tenSecondsAgo = Date.now() - 10000;
      for (const { file, mtime } of filesWithTimes) {
        if (mtime < tenSecondsAgo) break; // Stop checking files older than 10 seconds
        
        try {
          const content = await fsPromises.readFile(file, 'utf8');
          const firstLine = content.split('\n')[0];
          if (!firstLine || !firstLine.trim()) continue;
          
          const sessionData = JSON.parse(firstLine);
          const sessionId = sessionData.payload?.id;
          
          if (sessionId && typeof sessionId === 'string' && uuidRegex.test(sessionId)) {
            this.logger?.info(`[session-id-debug] FALLBACK: Using most recent session ID: ${sessionId} from ${pathMod.basename(file)}`);
            this.logger?.info(`[session-id-debug] FALLBACK: File cwd was: ${sessionData.payload?.cwd}`);
            
            // Store in the panel state
            if (this.sessionManager) {
              const db = this.sessionManager.db;
              if (db) {
                const panel = db.getPanel(panelId);
                if (panel) {
                  const currentState = panel.state || {};
                  const customState = (currentState.customState as Record<string, unknown>) || {};
                  
                  // Check if session ID already exists
                  const existingSessionId = (customState.agentSessionId as string) || (customState.codexSessionId as string);
                  if (existingSessionId) {
                    this.logger?.warn(`[session-id-debug] FALLBACK: Attempted to overwrite existing session ID ${existingSessionId} with ${sessionId} - BLOCKED`);
                    return; // Don't overwrite existing session ID
                  }
                  
                  const updatedState = { 
                    ...currentState, 
                    customState: { 
                      ...customState, 
                      agentSessionId: sessionId, // Use new generic field
                      codexSessionId: sessionId  // Keep legacy field for backward compatibility
                    } 
                  };
                  
                  this.logger?.info(`[session-id-debug] FALLBACK: About to update panel state with: ${JSON.stringify(updatedState)}`);
                  // Use panelManager to update so cache is properly updated
                  await panelManager.updatePanel(panelId, { state: updatedState });
                  
                  // Verify it was saved
                  const verifyPanel = panelManager.getPanel(panelId);
                  const verifyCustomState = verifyPanel?.state?.customState as CodexPanelState;
                  const savedSessionId = verifyCustomState?.agentSessionId || verifyCustomState?.codexSessionId;
                  if (savedSessionId === sessionId) {
                    this.logger?.info(`[session-id-debug] ✅ FALLBACK: Verified session ID was stored correctly: ${savedSessionId}`);
                  } else {
                    this.logger?.error(`[session-id-debug] ❌ FALLBACK: Failed to store session ID! Expected ${sessionId}, got ${savedSessionId}`);
                  }
                } else {
                  this.logger?.error(`[session-id-debug] FALLBACK: Panel ${panelId} not found!`);
                }
              }
            }
            return;
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      this.logger?.error(`[session-id-debug] Error searching for session ID: ${error}`);
    }
  }

  async continuePanel(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    prompt: string,
    conversationHistory: ConversationMessage[],
    model?: string,
    modelProvider?: string,
    thinkingLevel?: 'low' | 'medium' | 'high',
    approvalPolicy?: 'auto' | 'manual',
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch?: boolean
  ): Promise<void> {
    // Check if we have a stored Codex session ID to resume from
    this.logger?.info(`[session-id-debug] === CONTINUE PANEL CALLED ===`);
    this.logger?.info(`[session-id-debug] Panel ID: ${panelId}`);
    this.logger?.info(`[session-id-debug] Session ID: ${sessionId}`);
    this.logger?.info(`[session-id-debug] Worktree: ${worktreePath}`);
    this.logger?.info(`[session-id-debug] New prompt: "${prompt}"`);
    this.logger?.info(`[session-id-debug] History items: ${conversationHistory.length}`);
    this.logger?.info(`[session-id-debug] Passed approvalPolicy: ${approvalPolicy || 'undefined'}`);
    this.logger?.info(`[session-id-debug] Passed sandboxMode: ${sandboxMode || 'undefined'}`);
    this.logger?.info(`[session-id-debug] Passed webSearch: ${webSearch !== undefined ? webSearch : 'undefined'}`);

    let panelState: CodexPanelState | undefined;
    // Try to get the session ID from the panel's custom state
    let codexSessionId = null;
    if (this.sessionManager) {
      const db = (this.sessionManager as { db?: { getPanel: (id: string) => { state?: { customState?: CodexPanelState } } | null } }).db;
      if (db) {
        const panel = db.getPanel(panelId);
        if (panel) {
          panelState = panel.state?.customState as CodexPanelState | undefined;
          const customStateGeneric = panel.state?.customState as Record<string, unknown> | undefined;
          codexSessionId = (customStateGeneric?.agentSessionId as string) || (customStateGeneric?.codexSessionId as string);
          this.logger?.info(`[session-id-debug] Retrieved from panel state: ${codexSessionId || 'null'}`);
          this.logger?.info(`[session-id-debug] Full panel state: ${JSON.stringify(panel.state)}`);
        } else {
          this.logger?.warn(`[session-id-debug] Panel ${panelId} not found in database`);
        }
      } else {
        this.logger?.warn(`[session-id-debug] Database not available`);
      }
    } else {
      this.logger?.warn(`[session-id-debug] Session manager not available`);
    }
    
    // Also try the getPanelCodexSessionId method - THIS IS THE PREFERRED METHOD
    const methodSessionId = this.sessionManager?.getPanelCodexSessionId?.(panelId);
    this.logger?.info(`[session-id-debug] getPanelCodexSessionId returned: ${methodSessionId || 'null'}`);
    
    // Prefer the method over direct access as it's more reliable
    codexSessionId = methodSessionId || codexSessionId;
    
    if (codexSessionId) {
      this.logger?.info(`[session-id-debug] ✅ Found Codex session ID: ${codexSessionId}`);
      this.logger?.info(`[session-id-debug] Panel state for resume: ${JSON.stringify(panelState || {})}`);
      
      // Mark that we already have a session ID so we don't search for it again
      this.hasTriggeredSessionIdSearch.add(panelId);
      // Reset message counter for the new conversation turn
      this.messageCount.set(panelId, 0);
      
      // Prefer the passed parameters over the saved panel state
      const resolvedModel = model || panelState?.model || DEFAULT_CODEX_MODEL;
      const resolvedModelProvider = modelProvider || panelState?.modelProvider || 'openai';
      const resolvedApprovalPolicy = approvalPolicy ?? panelState?.approvalPolicy;
      const resolvedSandboxMode = sandboxMode !== undefined ? sandboxMode : (panelState?.sandboxMode || 'workspace-write');
      const resolvedWebSearch = webSearch !== undefined ? webSearch : (panelState?.webSearch || false);

      this.logger?.info(`[session-id-debug] Resolved sandboxMode: ${resolvedSandboxMode}`);
      this.logger?.info(`[session-id-debug] Resolved webSearch: ${resolvedWebSearch}`);

      // Use Codex's resume command to continue the conversation
      const options: CodexSpawnOptions = {
        panelId,
        sessionId,
        worktreePath,
        prompt,
        model: resolvedModel,
        modelProvider: resolvedModelProvider,
        thinkingLevel,
        isResume: true,
        resumeSessionId: codexSessionId,
        approvalPolicy: resolvedApprovalPolicy,
        sandboxMode: resolvedSandboxMode,
        webSearch: resolvedWebSearch
      };
      const finalArgs = this.buildCommandArgs(options);
      const commandPreview = `codex ${finalArgs.join(' ')}`;
      this.logger?.info(`[session-id-debug] Will use resume command: ${commandPreview}`);

      this.emitSessionInfoMessage({
        panelId,
        sessionId,
        worktreePath,
        prompt,
        command: commandPreview,
        model: options.model,
        modelProvider: options.modelProvider,
        approvalPolicy: options.approvalPolicy,
        sandboxMode: options.sandboxMode,
        webSearch: options.webSearch,
        resumeSessionId: codexSessionId,
        isResume: true
      });

      await this.spawnCliProcess(options);
    } else {
      // No session ID to resume from, start a new session
      this.logger?.warn(`[session-id-debug] ❌ No Codex session ID found for panel ${panelId}`);
      this.logger?.warn(`[session-id-debug] Starting NEW session instead of resuming`);
      // Use passed parameters with panel state as fallback
      await this.startPanel(
        panelId,
        sessionId,
        worktreePath,
        prompt,
        model || panelState?.model,
        modelProvider || panelState?.modelProvider,
        thinkingLevel,
        approvalPolicy ?? panelState?.approvalPolicy,
        sandboxMode !== undefined ? sandboxMode : panelState?.sandboxMode,
        webSearch !== undefined ? webSearch : panelState?.webSearch
      );
    }
  }

  async stopPanel(panelId: string): Promise<void> {
    // Clean up tracking data
    this.hasTriggeredSessionIdSearch.delete(panelId);
    this.messageCount.delete(panelId);
    this.originalPrompts.delete(panelId);
    
    await this.killProcess(panelId);
  }

  async restartPanelWithHistory(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    initialPrompt: string,
    conversationHistory: ConversationMessage[]
  ): Promise<void> {
    // Kill existing process if it exists
    await this.killProcess(panelId);
    
    // For now, just restart with the initial prompt
    // TODO: Implement conversation history replay if Codex supports it
    await this.startPanel(panelId, sessionId, worktreePath, initialPrompt);
  }

  // Codex-specific helper methods

  private async findCodexExecutable(): Promise<string | null> {
    // Check environment variable override first
    if (process.env.CODEX_PATH) {
      this.logger?.info(`[codex] Using CODEX_PATH environment variable: ${process.env.CODEX_PATH}`);
      return process.env.CODEX_PATH;
    }
    
    // List of executable names to try
    const executablesToTry = [
      'codex',  // Basic name
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
    
    this.logger?.info(`[codex] Searching for Codex executable. Will try: ${executablesToTry.join(', ')}`);
    
    // Try each executable name
    for (const executableName of executablesToTry) {
      this.logger?.info(`[codex] Checking for: ${executableName}`);
      const result = findExecutableInPath(executableName);
      
      if (result) {
        this.logger?.info(`[codex] Found Codex at: ${result}`);
        return result;
      }
    }
    
    this.logger?.info(`[codex] Codex not found in PATH`);
    return null;
  }

  private getPlatformBinary(): string {
    const platform = process.platform;
    const arch = process.arch;
    
    this.logger?.info(`[codex] Getting platform binary for platform: ${platform}, arch: ${arch}`);
    
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

  /**
   * Get the original prompt for a panel (before structured commit enhancement)
   */
  getOriginalPrompt(panelId: string): string | undefined {
    return this.originalPrompts.get(panelId);
  }

  /**
   * Get debug state information for a panel
   */
  async getDebugState(panelId: string): Promise<CodexDebugState> {
    this.logger?.info(`[codex] Getting debug state for panel ${panelId}`);
    
    const cliProcess = this.processes.get(panelId);
    
    // Get panel and session information from panelManager
    const { panelManager } = require('../../panelManager');
    const panel = panelManager.getPanel(panelId);
    const sessionId = cliProcess?.sessionId || panel?.sessionId || 'unknown';
    
    // Track process state and timing
    const now = Date.now();
    let processState: string = 'not_started';
    let pid: number | undefined;
    let isConnected = false;
    
    if (cliProcess && cliProcess.process) {
      pid = cliProcess.process.pid;
      // Check if PTY process is still running
      try {
        // Send null signal to check if process is alive
        process.kill(pid, 0);
        isConnected = true;
        processState = 'running';
      } catch {
        isConnected = false;
        processState = 'stopped';
      }
    }
    
    // Get panel state for additional info
    const panelState = panel?.state?.customState as CodexPanelState;
    
    // Get Codex session ID for resume capability
    let codexSessionId: string | undefined = undefined;
    
    // Try to get from panel's custom state first
    const panelCustomState = panel?.state?.customState as Record<string, unknown> | undefined;
    if (panelCustomState?.agentSessionId || panelCustomState?.codexSessionId) {
      codexSessionId = (panelCustomState.agentSessionId as string) || (panelCustomState.codexSessionId as string);
      this.logger?.info(`[session-id-debug] Debug state: Retrieved session ID from panel state: ${codexSessionId}`);
    } else if (this.sessionManager) {
      // Fallback to trying to get from sessionManager/db directly
      const db = (this.sessionManager as { db?: { getPanel: (id: string) => { state?: { customState?: CodexPanelState } } | null } }).db;
      if (db) {
        const dbPanel = db.getPanel(panelId);
        const dbPanelCustomState = dbPanel?.state?.customState as Record<string, unknown> | undefined;
        if (dbPanelCustomState?.agentSessionId || dbPanelCustomState?.codexSessionId) {
          codexSessionId = (dbPanelCustomState.agentSessionId as string) || (dbPanelCustomState.codexSessionId as string);
          this.logger?.info(`[session-id-debug] Debug state: Retrieved session ID from DB: ${codexSessionId}`);
        } else {
          this.logger?.info(`[session-id-debug] Debug state: No session ID found in DB for panel ${panelId}`);
        }
      }
    }
    
    // Also try the getPanelCodexSessionId method if it exists  
    const methodSessionId = this.sessionManager?.getPanelCodexSessionId?.(panelId);
    if (methodSessionId) {
      codexSessionId = methodSessionId;
      this.logger?.info(`[session-id-debug] Debug state: Retrieved session ID from method: ${codexSessionId}`);
    }
    
    this.logger?.info(`[session-id-debug] Debug state final session ID: ${codexSessionId || 'null'}`);
    
    // Get message statistics
    const outputs = this.sessionManager.getSessionOutputsForPanel(panelId);
    const messageStats = {
      totalMessagesReceived: outputs.filter((o: { type?: string }) => o.type === 'json').length,
      totalMessagesSent: 0, // Interactive mode doesn't track sent messages the same way
    };
    
    return {
      // Process information
      pid,
      isConnected,
      
      // Session information
      sessionId,
      panelId,
      worktreePath: cliProcess?.worktreePath,
      codexSessionId, // Include Codex session ID for resume
      
      // Process state
      processState,
      
      // Model information
      model: panelState?.model,
      modelProvider: panelState?.modelProvider,
      
      // Message statistics
      ...messageStats
    };
  }
}

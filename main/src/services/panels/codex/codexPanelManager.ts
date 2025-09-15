import { AbstractAIPanelManager } from '../ai/AbstractAIPanelManager';
import { CodexManager } from './codexManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';

/**
 * Codex-specific panel state
 */
export interface CodexPanelState {
  isInitialized: boolean;
  codexResumeId?: string;
  lastActivityTime: string;
  model?: string;
  modelProvider?: string;
  approvalPolicy?: 'auto' | 'manual';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  webSearch?: boolean;
}

/**
 * Manager for OpenAI Codex panels
 * Handles Codex-specific functionality while leveraging base AI panel management
 */
export class CodexPanelManager extends AbstractAIPanelManager {
  
  constructor(
    codexManager: CodexManager,
    sessionManager: any,
    logger?: Logger,
    configManager?: ConfigManager
  ) {
    super(codexManager, sessionManager, logger, configManager);
    this.logger?.info('[codex-debug] CodexPanelManager initialized');
    this.setupCodexSpecificHandlers();
  }

  /**
   * Get the agent name for logging and identification
   */
  protected getAgentName(): string {
    return 'Codex';
  }

  /**
   * Setup Codex-specific event handlers
   */
  private setupCodexSpecificHandlers(): void {
    this.logger?.info('[codex-debug] Setting up Codex-specific event handlers');
    // Codex-specific event handling can be added here
    // For example, handling approval requests, model switches, etc.
  }

  /**
   * Cast the CLI manager to CodexManager for type-safe access to Codex-specific methods
   */
  private get codexManager(): CodexManager {
    return this.cliManager as CodexManager;
  }

  /**
   * Start a Codex panel with specific configuration
   */
  async startPanel(
    panelId: string, 
    worktreePath: string, 
    prompt: string, 
    model?: string,
    modelProvider?: string,
    approvalPolicy?: 'auto' | 'manual',
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch?: boolean
  ): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      this.logger?.error(`[codex-debug] Panel ${panelId} not found in mappings. Available panels: ${Array.from(this.panelMappings.keys()).join(', ')}`);
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Starting Codex panel:\n  Panel ID: ${panelId}\n  Session ID: ${mapping.sessionId}\n  Model: ${model || 'gpt-5'}\n  Provider: ${modelProvider || 'openai'}\n  Worktree: ${worktreePath}\n  Prompt: "${prompt}"\n  Approval: ${approvalPolicy || 'on-request'}\n  Sandbox: ${sandboxMode || 'workspace-write'}\n  Web Search: ${webSearch || false}`);
    
    // Use the CodexManager's startPanel method with Codex-specific parameters
    return this.codexManager.startPanel(
      panelId,
      mapping.sessionId,
      worktreePath,
      prompt,
      model,
      modelProvider
    );
  }

  /**
   * Send approval decision to Codex
   */
  async sendApproval(panelId: string, callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch'): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Sending approval:\n  Panel ID: ${panelId}\n  Call ID: ${callId}\n  Decision: ${decision}\n  Type: ${type}`);
    return this.codexManager.sendApproval(panelId, callId, decision, type);
  }

  /**
   * Send interrupt signal to Codex
   */
  async sendInterrupt(panelId: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Sending interrupt to panel ${panelId}`);
    return this.codexManager.sendInterrupt(panelId);
  }

  /**
   * Send user input to Codex (override to use Codex-specific method)
   */
  async sendInputToPanel(panelId: string, input: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Sending user input to panel ${panelId}: "${input}"`);
    await this.codexManager.sendUserInput(panelId, input);
  }

  /**
   * Get Codex-specific panel state
   */
  getPanelState(panelId: string): CodexPanelState | undefined {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      this.logger?.warn(`[codex-debug] getPanelState: Panel ${panelId} not found`);
      return undefined;
    }

    const isRunning = this.codexManager.isPanelRunning(panelId);
    this.logger?.info(`[codex-debug] Panel ${panelId} state: running=${isRunning}, sessionId=${mapping.sessionId}`);
    
    return {
      isInitialized: isRunning,
      codexResumeId: mapping.resumeId,
      lastActivityTime: new Date().toISOString(),
      // Additional Codex-specific state can be retrieved here
      model: 'gpt-5', // Default or retrieve from stored state
      modelProvider: 'openai'
    };
  }

  /**
   * Continue panel with conversation history (Codex-specific implementation)
   */
  async continuePanel(
    panelId: string, 
    worktreePath: string, 
    prompt: string, 
    conversationHistory: any[],
    model?: string,
    modelProvider?: string
  ): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Continuing panel:\n  Panel ID: ${panelId}\n  Session ID: ${mapping.sessionId}\n  History items: ${conversationHistory.length}\n  Model: ${model || 'gpt-5'}\n  Provider: ${modelProvider || 'openai'}\n  Worktree: ${worktreePath}\n  Prompt: "${prompt}"`);
    
    // Codex doesn't fully support history replay yet, but GPT-5 has improved context handling
    // For now, we'll start a new session with the prompt
    return this.codexManager.continuePanel(
      panelId,
      mapping.sessionId,
      worktreePath,
      prompt,
      conversationHistory
    );
  }

  /**
   * Restart panel with conversation history
   */
  async restartPanelWithHistory(
    panelId: string,
    worktreePath: string,
    initialPrompt: string,
    conversationHistory: string[]
  ): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Restarting panel with history:\n  Panel ID: ${panelId}\n  Session ID: ${mapping.sessionId}\n  History items: ${conversationHistory.length}\n  Worktree: ${worktreePath}\n  Initial prompt: "${initialPrompt}"`);
    
    return this.codexManager.restartPanelWithHistory(
      panelId,
      mapping.sessionId,
      worktreePath,
      initialPrompt,
      conversationHistory
    );
  }
}
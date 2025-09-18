import * as os from 'os';
import { AbstractAIPanelManager } from '../ai/AbstractAIPanelManager';
import { CodexManager } from './codexManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import { DEFAULT_CODEX_MODEL } from '../../../../../shared/types/models';

const SIGNAL_NAME_BY_VALUE: Map<number, string> = (() => {
  const map = new Map<number, string>();
  const signals = (os.constants as any)?.signals as Record<string, number> | undefined;
  if (signals) {
    for (const [name, value] of Object.entries(signals)) {
      if (typeof value === 'number') {
        map.set(value, name);
      }
    }
  }
  return map;
})();

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
    this.cliManager.on('panel-exit', (data: any) => {
      const panelId: string | undefined = data?.panelId;
      if (!panelId) {
        this.logger?.warn('[codex-debug] Received panel-exit event without panelId');
        return;
      }

      const mapping = this.panelMappings.get(panelId);
      const sessionId = data?.sessionId ?? mapping?.sessionId;
      if (!sessionId) {
        this.logger?.warn(`[codex-debug] Panel ${panelId} exit event missing sessionId`);
        return;
      }
      const rawExitCode = data?.exitCode;
      const exitCode: number | null = typeof rawExitCode === 'number' ? rawExitCode : rawExitCode ?? null;
      const rawSignal = data?.signal;
      const signalNumber: number | null = typeof rawSignal === 'number' && rawSignal > 0 ? rawSignal : null;
      const signalName = signalNumber !== null ? SIGNAL_NAME_BY_VALUE.get(signalNumber) : undefined;
      const finishedAt = new Date();

      let status: 'completed' | 'terminated' | 'error';
      let summary: string;

      if (exitCode === 0 && signalNumber === null) {
        status = 'completed';
        summary = 'Codex process completed successfully.';
      } else if (signalNumber !== null) {
        status = 'terminated';
        summary = `Codex process terminated by signal ${signalName || signalNumber}.`;
      } else if (exitCode === null) {
        status = 'terminated';
        summary = 'Codex process exited without reporting an exit code.';
      } else if (exitCode > 0) {
        status = 'error';
        summary = `Codex process exited with code ${exitCode}.`;
      } else {
        status = 'completed';
        summary = `Codex process exited with code ${exitCode}.`;
      }

      const outcomeDetail =
        status === 'completed'
          ? 'Completed successfully'
          : status === 'terminated'
            ? 'Terminated before completion'
            : 'Exited with errors';

      const signalDetail = signalNumber !== null ? `${signalName || 'unknown'} (${signalNumber})` : 'none';

      const detailLines = [
        `Outcome: ${outcomeDetail}`,
        `Exit code: ${exitCode !== null ? exitCode : 'not reported'}`,
        `Signal: ${signalDetail}`,
        `Finished at: ${finishedAt.toISOString()}`
      ];

      this.logger?.info(
        `[codex-debug] Panel ${panelId} process exit recorded: status=${status}, exitCode=${exitCode}, signal=${signalDetail}`
      );

      const message = {
        type: 'session',
        data: {
          status,
          message: summary,
          details: detailLines.join('\n'),
          diagnostics: {
            exitCode,
            signal: signalNumber,
            signalName,
            finishedAt: finishedAt.toISOString()
          }
        }
      };

      const outputEvent = {
        panelId,
        sessionId,
        type: 'json' as const,
        data: message,
        timestamp: finishedAt
      };

      if (this.panelMappings.has(panelId)) {
        this.cliManager.emit('output', outputEvent);
        return;
      }

      this.logger?.info(`[codex-debug] Panel ${panelId} exit received after unregistration; emitting summary directly`);
      this.cliManager.emit('panel-output', outputEvent);

      try {
        if (this.sessionManager?.addSessionOutput) {
          this.sessionManager.addSessionOutput(sessionId, {
            type: 'json',
            data: message,
            timestamp: finishedAt
          });
        }
      } catch (error) {
        this.logger?.warn(`[codex-debug] Failed to persist Codex session summary for panel ${panelId}:`, error as Error);
      }
    });
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
    webSearch?: boolean,
    thinkingLevel?: 'low' | 'medium' | 'high'
  ): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      this.logger?.error(`[codex-debug] Panel ${panelId} not found in mappings. Available panels: ${Array.from(this.panelMappings.keys()).join(', ')}`);
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Starting Codex panel:\n  Panel ID: ${panelId}\n  Session ID: ${mapping.sessionId}\n  Model: ${model || DEFAULT_CODEX_MODEL}\n  Provider: ${modelProvider || 'openai'}\n  Worktree: ${worktreePath}\n  Prompt: "${prompt}"\n  Approval: ${approvalPolicy || 'on-request'}\n  Sandbox: ${sandboxMode || 'workspace-write'}\n  Web Search: ${webSearch || false}\n  Thinking Level: ${thinkingLevel || 'medium'}`);
    
    // Use the CodexManager's startPanel method with Codex-specific parameters
    return this.codexManager.startPanel(
      panelId,
      mapping.sessionId,
      worktreePath,
      prompt,
      model,
      modelProvider,
      thinkingLevel
    );
  }

  /**
   * Send approval decision to Codex
   * Note: In interactive mode, approvals are handled differently than in proto mode
   */
  async sendApproval(panelId: string, callId: string, decision: 'approved' | 'denied', type: 'exec' | 'patch'): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex] Approval handling in interactive mode - may need configuration:\n  Panel ID: ${panelId}\n  Call ID: ${callId}\n  Decision: ${decision}\n  Type: ${type}`);
    // In interactive mode, approval may be handled through stdin or configuration
    // For now, log a warning as this functionality may need to be adapted
    this.logger?.warn(`[codex] Approval handling in interactive mode is not yet fully implemented`);
  }

  /**
   * Send interrupt signal to Codex
   * Note: In interactive mode, interrupts are handled through the PTY process
   */
  async sendInterrupt(panelId: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    // Check if process is running before trying to send interrupt
    if (!this.codexManager.isPanelRunning(panelId)) {
      this.logger?.warn(`[codex] Cannot send interrupt - no running process for panel ${panelId}`);
      // No need to throw here as the process isn't running anyway
      return;
    }

    this.logger?.info(`[codex] Sending interrupt signal (Ctrl+C) to panel ${panelId}`);
    // In interactive mode, send Ctrl+C through the PTY
    this.codexManager.sendInput(panelId, '\x03'); // Ctrl+C
  }

  /**
   * Send user input to Codex - DEPRECATED in interactive mode
   * In interactive mode, each prompt spawns a new process via startPanel or continuePanel
   * @deprecated Use continuePanel instead for subsequent prompts
   */
  async sendInputToPanel(panelId: string, input: string): Promise<void> {
    // This method is no longer used in interactive mode
    // Each user prompt should spawn a new process using continuePanel
    throw new Error('sendInputToPanel is not supported in interactive mode. Use continuePanel instead.');
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
      model: DEFAULT_CODEX_MODEL, // Default or retrieve from stored state
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
    modelProvider?: string,
    thinkingLevel?: 'low' | 'medium' | 'high'
  ): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[codex-debug] Continuing panel:\n  Panel ID: ${panelId}\n  Session ID: ${mapping.sessionId}\n  History items: ${conversationHistory.length}\n  Model: ${model || DEFAULT_CODEX_MODEL}\n  Provider: ${modelProvider || 'openai'}\n  Thinking Level: ${thinkingLevel || 'medium'}\n  Worktree: ${worktreePath}\n  Prompt: "${prompt}"`);
    
    // Codex doesn't fully support history replay yet, but GPT-5 has improved context handling
    // For now, we'll start a new session with the prompt
    return this.codexManager.continuePanel(
      panelId,
      mapping.sessionId,
      worktreePath,
      prompt,
      conversationHistory,
      model,
      thinkingLevel
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

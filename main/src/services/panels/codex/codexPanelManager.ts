import * as os from 'os';
import { AbstractAIPanelManager } from '../ai/AbstractAIPanelManager';
import { CodexManager } from './codexManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import type { AnalyticsManager } from '../../analyticsManager';
import type { ConversationMessage } from '../../../database/models';
import { AIPanelConfig, StartPanelConfig, ContinuePanelConfig } from '../../../../../shared/types/aiPanelConfig';
import { DEFAULT_CODEX_MODEL } from '../../../../../shared/types/models';
import type { CodexPanelState } from '../../../../../shared/types/panels';

const SIGNAL_NAME_BY_VALUE: Map<number, string> = (() => {
  const map = new Map<number, string>();
  const signals = (os.constants as { signals?: Record<string, number> })?.signals;
  if (signals) {
    for (const [name, value] of Object.entries(signals)) {
      if (typeof value === 'number') {
        map.set(value, name);
      }
    }
  }
  return map;
})();

// CodexPanelState is now imported from shared/types/panels
export type { CodexPanelState };

/**
 * Manager for OpenAI Codex panels
 * Uses unified configuration object approach
 */
export class CodexPanelManager extends AbstractAIPanelManager {
  
  constructor(
    codexManager: CodexManager,
    sessionManager: import('../../sessionManager').SessionManager,
    logger?: Logger,
    configManager?: ConfigManager,
    analyticsManager?: AnalyticsManager
  ) {
    super(codexManager, sessionManager, logger, configManager, analyticsManager);
    this.logger?.verbose('CodexPanelManager initialized');
    this.setupCodexSpecificHandlers();
  }

  /**
   * Get the agent name for logging and identification
   */
  protected getAgentName(): string {
    return 'Codex';
  }

  /**
   * Extract Codex-specific configuration parameters
   * Codex uses: model, modelProvider, thinkingLevel, approvalPolicy, sandboxMode, webSearch
   */
  protected extractAgentConfig(config: AIPanelConfig): [string, string, string, string, string, boolean] {
    return [
      config.model || DEFAULT_CODEX_MODEL,
      config.modelProvider || 'openai',
      config.thinkingLevel || 'medium',
      config.approvalPolicy || 'manual',
      config.sandboxMode || 'workspace-write',
      config.webSearch ?? false
    ];
  }

  /**
   * Setup Codex-specific event handlers
   */
  private setupCodexSpecificHandlers(): void {
    this.logger?.verbose('Setting up Codex-specific event handlers');
    this.cliManager.on('panel-exit', (data: { panelId?: string; sessionId?: string; exitCode?: number; signal?: number; [key: string]: unknown }) => {
      const panelId: string | undefined = data?.panelId;
      if (!panelId) {
        this.logger?.warn('Received panel-exit event without panelId');
        return;
      }

      const mapping = this.panelMappings.get(panelId);
      const sessionId = data?.sessionId ?? mapping?.sessionId;
      if (!sessionId) {
        this.logger?.warn(`Panel ${panelId} exit event missing sessionId`);
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

      this.logger?.verbose(
        `Codex panel ${panelId} process exit: status=${status}, exitCode=${exitCode}, signal=${signalDetail}`
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

      this.logger?.verbose(`Panel ${panelId} exit received after unregistration`);
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
        this.logger?.warn(`Failed to persist Codex session summary for panel ${panelId}:`, error as Error);
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
   * Start a Codex panel with specific configuration for backward compatibility
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
  ): Promise<void>;
  async startPanel(config: StartPanelConfig): Promise<void>;
  async startPanel(
    panelIdOrConfig: string | StartPanelConfig,
    worktreePath?: string,
    prompt?: string,
    model?: string,
    modelProvider?: string,
    approvalPolicy?: 'auto' | 'manual',
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch?: boolean,
    thinkingLevel?: 'low' | 'medium' | 'high'
  ): Promise<void> {
    // Handle both signatures for backward compatibility
    if (typeof panelIdOrConfig === 'string') {
      const config: StartPanelConfig = {
        panelId: panelIdOrConfig,
        worktreePath: worktreePath!,
        prompt: prompt!,
        model,
        modelProvider,
        approvalPolicy,
        sandboxMode,
        webSearch,
        thinkingLevel
      };
      return super.startPanel(config);
    } else {
      return super.startPanel(panelIdOrConfig);
    }
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

    this.logger?.verbose(`Approval request for Codex panel ${panelId}: ${decision}`);
    // In interactive mode, approval may be handled through stdin or configuration
    // For now, log a warning as this functionality may need to be adapted
    this.logger?.warn(`Approval handling in interactive mode is not yet fully implemented`);
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
      this.logger?.verbose(`Cannot send interrupt - no running process for panel ${panelId}`);
      // No need to throw here as the process isn't running anyway
      return;
    }

    this.logger?.verbose(`Sending interrupt signal (Ctrl+C) to panel ${panelId}`);
    // In interactive mode, send Ctrl+C through the PTY
    this.codexManager.sendInput(panelId, '\x03'); // Ctrl+C
  }

  /**
   * Register panel with Codex-specific state handling
   * @param panelId - The panel ID to register
   * @param sessionId - The session ID this panel belongs to
   * @param initialState - Optional Codex-specific initial state
   * @param isUserInitiated - If true, track analytics event (default: true). Set to false during app startup/restoration.
   */
  registerPanel(panelId: string, sessionId: string, initialState?: CodexPanelState, isUserInitiated = true): void {
    // Transform Codex-specific state to base state if needed
    const baseInitialState = initialState ? {
      isInitialized: initialState.isInitialized,
      resumeId: initialState.codexResumeId,
      lastActivityTime: initialState.lastActivityTime,
      config: {
        model: initialState.model,
        modelProvider: initialState.modelProvider,
        approvalPolicy: initialState.approvalPolicy,
        sandboxMode: initialState.sandboxMode,
        webSearch: initialState.webSearch,
        thinkingLevel: initialState.codexConfig?.thinkingLevel
      }
    } : undefined;

    super.registerPanel(panelId, sessionId, baseInitialState, isUserInitiated);
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
    const baseState = super.getPanelState(panelId);
    if (!baseState) {
      return undefined;
    }

    const mapping = this.panelMappings.get(panelId);
    const config = mapping?.config;

    // Transform base state to Codex-specific state
    return {
      isInitialized: baseState.isInitialized,
      codexResumeId: baseState.resumeId,
      lastActivityTime: baseState.lastActivityTime,
      lastPrompt: config?.prompt,
      model: config?.model || DEFAULT_CODEX_MODEL,
      modelProvider: config?.modelProvider || 'openai',
      approvalPolicy: config?.approvalPolicy || 'manual',
      sandboxMode: config?.sandboxMode || 'workspace-write',
      webSearch: config?.webSearch ?? false,
      codexConfig: {
        model: config?.model || DEFAULT_CODEX_MODEL,
        thinkingLevel: config?.thinkingLevel || 'medium',
        sandboxMode: config?.sandboxMode || 'workspace-write',
        webSearch: config?.webSearch ?? false
      }
    };
  }

  /**
   * Continue panel with conversation history for backward compatibility
   */
  async continuePanel(
    panelId: string, 
    worktreePath: string, 
    prompt: string, 
    conversationHistory: ConversationMessage[],
    model?: string,
    modelProvider?: string,
    thinkingLevel?: 'low' | 'medium' | 'high',
    approvalPolicy?: 'auto' | 'manual',
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch?: boolean
  ): Promise<void>;
  async continuePanel(config: ContinuePanelConfig): Promise<void>;
  async continuePanel(
    panelIdOrConfig: string | ContinuePanelConfig,
    worktreePath?: string,
    prompt?: string,
    conversationHistory?: ConversationMessage[],
    model?: string,
    modelProvider?: string,
    thinkingLevel?: 'low' | 'medium' | 'high',
    approvalPolicy?: 'auto' | 'manual',
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access',
    webSearch?: boolean
  ): Promise<void> {
    // Handle both signatures for backward compatibility
    if (typeof panelIdOrConfig === 'string') {
      const config: ContinuePanelConfig = {
        panelId: panelIdOrConfig,
        worktreePath: worktreePath!,
        prompt: prompt!,
        conversationHistory: conversationHistory!,
        model,
        modelProvider,
        thinkingLevel,
        approvalPolicy,
        sandboxMode,
        webSearch
      };
      return super.continuePanel(config);
    } else {
      return super.continuePanel(panelIdOrConfig);
    }
  }

  /**
   * Restart panel with conversation history
   */
  async restartPanelWithHistory(
    panelId: string,
    worktreePath: string,
    initialPrompt: string,
    conversationHistory: ConversationMessage[]
  ): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.verbose(`Restarting Codex panel ${panelId} with ${conversationHistory.length} history items`);
    
    return this.codexManager.restartPanelWithHistory(
      panelId,
      mapping.sessionId,
      worktreePath,
      initialPrompt,
      conversationHistory
    );
  }
}

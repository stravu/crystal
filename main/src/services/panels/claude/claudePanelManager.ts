import { AbstractAIPanelManager } from '../ai/AbstractAIPanelManager';
import { AbstractCliManager } from '../cli/AbstractCliManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import type { AnalyticsManager } from '../../analyticsManager';
import type { ConversationMessage } from '../../../database/models';
import { AIPanelConfig, StartPanelConfig, ContinuePanelConfig } from '../../../../../shared/types/aiPanelConfig';
import { ClaudePanelState } from '../../../../../shared/types/panels';

/**
 * Manager for Claude Code panels
 * Uses unified configuration object approach
 */
export class ClaudePanelManager extends AbstractAIPanelManager {
  
  constructor(
    claudeCodeManager: AbstractCliManager,
    sessionManager: import('../../sessionManager').SessionManager,
    logger?: Logger,
    configManager?: ConfigManager,
    analyticsManager?: AnalyticsManager
  ) {
    super(claudeCodeManager, sessionManager, logger, configManager, analyticsManager);
  }

  /**
   * Get the agent name for logging and identification
   */
  protected getAgentName(): string {
    return 'Claude';
  }

  /**
   * Extract Claude-specific configuration parameters
   * Claude uses: permissionMode, model
   */
  protected extractAgentConfig(config: AIPanelConfig): [string | undefined, string | undefined] {
    return [
      config.permissionMode, // 'approve' | 'ignore' | undefined
      config.model          // model string
    ];
  }

  /**
   * Claude-specific panel start method for backward compatibility
   * Delegates to the base class startPanel with unified config
   */
  async startPanel(panelId: string, worktreePath: string, prompt: string, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void>;
  async startPanel(config: StartPanelConfig): Promise<void>;
  async startPanel(
    panelIdOrConfig: string | StartPanelConfig,
    worktreePath?: string,
    prompt?: string,
    permissionMode?: 'approve' | 'ignore',
    model?: string
  ): Promise<void> {
    // Handle both signatures for backward compatibility
    if (typeof panelIdOrConfig === 'string') {
      const config: StartPanelConfig = {
        panelId: panelIdOrConfig,
        worktreePath: worktreePath!,
        prompt: prompt!,
        permissionMode,
        model
      };
      return super.startPanel(config);
    } else {
      return super.startPanel(panelIdOrConfig);
    }
  }

  /**
   * Claude-specific panel continue method for backward compatibility
   * Delegates to the base class continuePanel with unified config
   */
  async continuePanel(panelId: string, worktreePath: string, prompt: string, conversationHistory: ConversationMessage[], model?: string): Promise<void>;
  async continuePanel(config: ContinuePanelConfig): Promise<void>;
  async continuePanel(
    panelIdOrConfig: string | ContinuePanelConfig,
    worktreePath?: string,
    prompt?: string,
    conversationHistory?: ConversationMessage[],
    model?: string
  ): Promise<void> {
    // Handle both signatures for backward compatibility
    if (typeof panelIdOrConfig === 'string') {
      const config: ContinuePanelConfig = {
        panelId: panelIdOrConfig,
        worktreePath: worktreePath!,
        prompt: prompt!,
        conversationHistory: conversationHistory!,
        model
      };
      return super.continuePanel(config);
    } else {
      return super.continuePanel(panelIdOrConfig);
    }
  }

  /**
   * Get Claude-specific panel state
   * Returns ClaudePanelState with claudeResumeId instead of generic resumeId
   */
  getPanelState(panelId: string): ClaudePanelState | undefined {
    const baseState = super.getPanelState(panelId);
    if (!baseState) {
      return undefined;
    }

    // Transform base state to Claude-specific state
    return {
      isInitialized: baseState.isInitialized,
      claudeResumeId: baseState.resumeId, // Map resumeId to claudeResumeId for Claude
      lastActivityTime: baseState.lastActivityTime
    };
  }

  /**
   * Register panel with Claude-specific state handling
   * @param panelId - The panel ID to register
   * @param sessionId - The session ID this panel belongs to
   * @param initialState - Optional Claude-specific initial state
   * @param isUserInitiated - If true, track analytics event (default: true). Set to false during app startup/restoration.
   */
  registerPanel(panelId: string, sessionId: string, initialState?: ClaudePanelState, isUserInitiated = true): void {
    // Transform Claude-specific state to base state if needed
    const baseInitialState = initialState ? {
      ...initialState,
      resumeId: initialState.claudeResumeId // Map claudeResumeId to resumeId for base class
    } : undefined;

    super.registerPanel(panelId, sessionId, baseInitialState, isUserInitiated);
  }

  /**
   * Utility method to get panel ID from Claude resume ID
   * This is a Claude-specific convenience method
   */
  getPanelIdFromClaudeResumeId(claudeResumeId: string): string | undefined {
    return this.getPanelIdFromResumeId(claudeResumeId);
  }
}
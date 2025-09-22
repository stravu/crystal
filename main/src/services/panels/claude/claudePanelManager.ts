import { AbstractAIPanelManager } from '../ai/AbstractAIPanelManager';
import { AbstractCliManager } from '../cli/AbstractCliManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import { ClaudePanelState } from '../../../../../shared/types/panels';

/**
 * Manager for Claude Code panels
 * Extends AbstractAIPanelManager to leverage common AI panel functionality
 */
export class ClaudePanelManager extends AbstractAIPanelManager {
  
  constructor(
    claudeCodeManager: AbstractCliManager,
    sessionManager: any,
    logger?: Logger,
    configManager?: ConfigManager
  ) {
    super(claudeCodeManager, sessionManager, logger, configManager);
  }

  /**
   * Get the agent name for logging and identification
   */
  protected getAgentName(): string {
    return 'Claude';
  }

  /**
   * Claude-specific panel start method with additional parameters
   * Delegates to the base class startPanel after validation
   */
  async startPanel(panelId: string, worktreePath: string, prompt: string, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[ClaudePanelManager] Starting Claude panel ${panelId} (session: ${mapping.sessionId})`);
    // Pass Claude-specific parameters through the args spread
    return this.cliManager.startPanel(panelId, mapping.sessionId, worktreePath, prompt, permissionMode, model);
  }

  /**
   * Claude-specific panel continue method with model parameter
   * Delegates to the base class continuePanel
   */
  async continuePanel(panelId: string, worktreePath: string, prompt: string, conversationHistory: any[], model?: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[ClaudePanelManager] Continuing Claude panel ${panelId} (session: ${mapping.sessionId})`);
    // Pass model parameter through the args spread
    return this.cliManager.continuePanel(panelId, mapping.sessionId, worktreePath, prompt, conversationHistory, model);
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
   */
  registerPanel(panelId: string, sessionId: string, initialState?: ClaudePanelState): void {
    // Transform Claude-specific state to base state if needed
    const baseInitialState = initialState ? {
      ...initialState,
      resumeId: initialState.claudeResumeId // Map claudeResumeId to resumeId for base class
    } : undefined;

    super.registerPanel(panelId, sessionId, baseInitialState);
  }

  /**
   * Utility method to get panel ID from Claude resume ID
   * This is a Claude-specific convenience method
   */
  getPanelIdFromClaudeResumeId(claudeResumeId: string): string | undefined {
    return this.getPanelIdFromResumeId(claudeResumeId);
  }
}
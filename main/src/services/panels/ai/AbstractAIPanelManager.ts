import { AbstractCliManager } from '../cli/AbstractCliManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import { PanelEvent } from '../../../../../shared/types/panels';
import { AIPanelConfig, StartPanelConfig, ContinuePanelConfig, AIPanelState } from '../../../../../shared/types/aiPanelConfig';
import { panelEventBus } from '../../panelEventBus';

/**
 * Mapping between a panel and its associated session
 */
export interface PanelMapping {
  panelId: string;
  sessionId: string;
  resumeId?: string;
  config?: Partial<AIPanelConfig>;
}

/**
 * Abstract base class for managing AI agent panels (Claude, Codex, etc.)
 * Uses unified configuration object approach
 */
export abstract class AbstractAIPanelManager {
  protected panelMappings = new Map<string, PanelMapping>();
  protected resumeIdToPanel = new Map<string, string>();

  constructor(
    protected cliManager: AbstractCliManager,
    protected sessionManager: any,
    protected logger?: Logger,
    protected configManager?: ConfigManager
  ) {
    this.setupEventHandlers();
  }

  /**
   * Get the name of the AI agent (e.g., 'Claude', 'Codex')
   */
  protected abstract getAgentName(): string;

  /**
   * Extract agent-specific configuration from the unified config
   * Each subclass implements this to pick out its relevant fields
   */
  protected abstract extractAgentConfig(config: AIPanelConfig): any[];

  /**
   * Generate a resume ID for conversation continuation
   */
  protected generateResumeId(panelId: string): string {
    return `${this.getAgentName().toLowerCase()}-panel-${panelId}`;
  }

  /**
   * Setup event handlers to forward CLI manager events to panel events
   */
  protected setupEventHandlers(): void {
    // Forward output events
    this.cliManager.on('output', (data: any) => {
      const { panelId, sessionId } = data;
      if (panelId && this.panelMappings.has(panelId)) {
        try {
          if (this.sessionManager?.addPanelOutput) {
            this.sessionManager.addPanelOutput(panelId, {
              type: data.type,
              data: data.data,
              timestamp: data.timestamp || new Date()
            });
          }
        } catch (error) {
          this.logger?.error(`[${this.getAgentName()}PanelManager] Failed to store panel output: ${error}`);
        }

        this.cliManager.emit('panel-output', {
          panelId,
          sessionId,
          type: data.type,
          data: data.data,
          timestamp: data.timestamp
        });
      }
    });

    // Forward spawned events
    this.cliManager.on('spawned', (data: any) => {
      const { panelId, sessionId } = data;
      if (panelId && this.panelMappings.has(panelId)) {
        this.cliManager.emit('panel-spawned', {
          panelId,
          sessionId
        });
      }
    });

    // Forward exit events
    this.cliManager.on('exit', (data: any) => {
      const { panelId, sessionId, exitCode, signal } = data;
      if (!panelId) {
        this.logger?.warn(`[${this.getAgentName()}PanelManager] Received exit event without panelId`);
        return;
      }

      const mapping = this.panelMappings.get(panelId);
      const resolvedSessionId = mapping?.sessionId ?? sessionId;

      if (!resolvedSessionId) {
        this.logger?.warn(`[${this.getAgentName()}PanelManager] Exit event for panel ${panelId} missing sessionId`);
        return;
      }

      this.cliManager.emit('panel-exit', {
        panelId,
        sessionId: resolvedSessionId,
        exitCode,
        signal
      });
    });

    // Forward error events
    this.cliManager.on('error', (data: any) => {
      const { panelId, sessionId, error } = data;
      if (panelId && this.panelMappings.has(panelId)) {
        this.cliManager.emit('panel-error', {
          panelId,
          sessionId,
          error
        });
      }
    });
  }

  /**
   * Subscribe panel to git events for the same session only
   */
  protected subscribeToGitEvents(panelId: string, sessionId: string): void {
    const gitEventCallback = (event: PanelEvent) => {
      if (event.source.panelId !== panelId && event.type.startsWith('git:')) {
        this.logger?.verbose(`[${this.getAgentName()}] Git event received in panel ${panelId} (session: ${sessionId})`);
        this.logger?.verbose(`[${this.getAgentName()}] Event triggeringSessionId: ${event.data.triggeringSessionId}`);
        this.logger?.verbose(`[${this.getAgentName()}] Panel sessionId: ${sessionId}`);
        this.logger?.verbose(`[${this.getAgentName()}] Match: ${event.data.triggeringSessionId === sessionId}`);
        
        if (event.data.triggeringSessionId === sessionId) {
          this.logger?.info(`[${this.getAgentName()}] Forwarding git event to panel ${panelId} for session ${sessionId}`);
          
          const gitMessage = {
            type: 'system',
            subtype: 'git_operation',
            timestamp: event.timestamp,
            message: event.data.message,
            details: {
              operation: event.data.operation,
              triggeringSession: event.data.triggeringSessionName || event.data.triggeringSessionId,
              branch: event.data.branch,
              targetBranch: event.data.targetBranch
            }
          };

          const outputEvent = {
            panelId,
            sessionId,
            type: 'json' as const,
            data: gitMessage,
            timestamp: event.timestamp
          };

          this.cliManager.emit('output', outputEvent);
        }
      }
    };

    // Subscribe to git events for this panel
    const subscription = {
      panelId,
      eventTypes: ['git:operation' as any],  // Listen for git events
      callback: gitEventCallback
    };
    panelEventBus.subscribe(subscription);
  }

  /**
   * Register a panel with optional initial state
   */
  registerPanel(panelId: string, sessionId: string, initialState?: AIPanelState): void {
    const resumeId = initialState?.resumeId || this.generateResumeId(panelId);
    
    const mapping: PanelMapping = {
      panelId,
      sessionId,
      resumeId,
      config: initialState?.config
    };
    
    this.panelMappings.set(panelId, mapping);
    this.resumeIdToPanel.set(resumeId, panelId);
    
    this.subscribeToGitEvents(panelId, sessionId);
    
    this.logger?.info(`[${this.getAgentName()}PanelManager] Registered panel ${panelId} for session ${sessionId}`);
  }

  /**
   * Unregister a panel from the manager
   */
  unregisterPanel(panelId: string): void {
    const mapping = this.panelMappings.get(panelId);
    if (mapping) {
      if (mapping.resumeId) {
        this.resumeIdToPanel.delete(mapping.resumeId);
      }
      this.panelMappings.delete(panelId);
      panelEventBus.unsubscribePanel(panelId);
      this.logger?.info(`[${this.getAgentName()}PanelManager] Unregistered panel ${panelId}`);
    }
  }

  /**
   * Start a panel with unified configuration
   */
  async startPanel(config: StartPanelConfig): Promise<void> {
    const { panelId, sessionId, worktreePath, prompt } = config;
    
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    // Store config for future reference
    mapping.config = config;
    
    const resolvedSessionId = sessionId || mapping.sessionId;
    this.logger?.info(`[${this.getAgentName()}PanelManager] Starting panel ${panelId} (session: ${resolvedSessionId})`);
    
    // Extract agent-specific parameters using the subclass implementation
    const agentParams = this.extractAgentConfig(config);
    
    return this.cliManager.startPanel(
      panelId,
      resolvedSessionId,
      worktreePath,
      prompt,
      ...agentParams
    );
  }

  /**
   * Continue a panel conversation with unified configuration
   */
  async continuePanel(config: ContinuePanelConfig): Promise<void> {
    const { panelId, worktreePath, prompt, conversationHistory } = config;
    
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    // Merge with stored config
    mapping.config = { ...mapping.config, ...config };
    
    this.logger?.info(`[${this.getAgentName()}PanelManager] Continuing panel ${panelId} (session: ${mapping.sessionId})`);
    
    // Extract agent-specific parameters
    const agentParams = this.extractAgentConfig(config);
    
    return this.cliManager.continuePanel(
      panelId,
      mapping.sessionId,
      worktreePath,
      prompt,
      conversationHistory,
      ...agentParams
    );
  }

  /**
   * Stop a panel
   */
  async stopPanel(panelId: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[${this.getAgentName()}PanelManager] Stopping panel ${panelId}`);
    return this.cliManager.stopPanel(panelId);
  }

  /**
   * Send input to a panel
   */
  sendInputToPanel(panelId: string, input: string): void {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.verbose(`[${this.getAgentName()}PanelManager] Sending input to panel ${panelId}`);
    this.cliManager.sendInput(panelId, input);
  }

  /**
   * Check if panel is running
   */
  isPanelRunning(panelId: string): boolean {
    const mapping = this.panelMappings.get(panelId);
    return mapping ? this.cliManager.isPanelRunning(panelId) : false;
  }

  /**
   * Get panel process
   */
  getPanelProcess(panelId: string): any {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      return undefined;
    }

    return this.cliManager.getProcess(panelId);
  }

  /**
   * Get panel state
   */
  getPanelState(panelId: string): AIPanelState | undefined {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) return undefined;

    return {
      isInitialized: this.isPanelRunning(panelId),
      resumeId: mapping.resumeId,
      lastActivityTime: new Date().toISOString(),
      config: mapping.config
    };
  }

  /**
   * Get panel ID from resume ID
   */
  getPanelIdFromResumeId(resumeId: string): string | undefined {
    return this.resumeIdToPanel.get(resumeId);
  }

  /**
   * Get all registered panels
   */
  getAllPanels(): string[] {
    return Array.from(this.panelMappings.keys());
  }

  /**
   * Cleanup all panels for a session
   */
  async cleanupSessionPanels(sessionId: string): Promise<void> {
    const panelsToCleanup: string[] = [];
    
    // Find all panels for this session
    for (const [panelId, mapping] of this.panelMappings) {
      if (mapping.sessionId === sessionId) {
        panelsToCleanup.push(panelId);
      }
    }
    
    // Stop and unregister each panel
    for (const panelId of panelsToCleanup) {
      try {
        if (this.isPanelRunning(panelId)) {
          await this.stopPanel(panelId);
        }
        this.unregisterPanel(panelId);
      } catch (error) {
        this.logger?.error(`[${this.getAgentName()}PanelManager] Failed to cleanup panel ${panelId}: ${error}`);
      }
    }
    
    this.logger?.info(`[${this.getAgentName()}PanelManager] Cleaned up ${panelsToCleanup.length} panels for session ${sessionId}`);
  }
}
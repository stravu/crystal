import { AbstractCliManager } from '../cli/AbstractCliManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import { PanelEvent } from '../../../../../shared/types/panels';
import { panelEventBus } from '../../panelEventBus';

/**
 * Mapping between a panel and its associated session
 */
export interface PanelMapping {
  panelId: string;
  sessionId: string;
  resumeId?: string; // Optional resume ID for conversation continuation
}

/**
 * Abstract base class for managing AI agent panels (Claude, Codex, etc.)
 * Provides common functionality for panel registration, event handling, and lifecycle management
 */
export abstract class AbstractAIPanelManager {
  protected panelMappings = new Map<string, PanelMapping>(); // panelId -> mapping
  protected resumeIdToPanel = new Map<string, string>(); // resumeId -> panelId

  constructor(
    protected cliManager: AbstractCliManager,
    protected sessionManager: any, // SessionManager with panel-based methods
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
        // Store output using panel-based method
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

        // Emit as panel event
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
      if (panelId && this.panelMappings.has(panelId)) {
        this.cliManager.emit('panel-exit', {
          panelId,
          sessionId,
          exitCode,
          signal
        });
      }
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
      // Only process git events from the same session
      if (event.source.panelId !== panelId && event.type.startsWith('git:')) {
        // Debug logging to understand what's happening
        this.logger?.verbose(`[${this.getAgentName()}] Git event received in panel ${panelId} (session: ${sessionId})`);
        this.logger?.verbose(`[${this.getAgentName()}] Event triggeringSessionId: ${event.data.triggeringSessionId}`);
        this.logger?.verbose(`[${this.getAgentName()}] Panel sessionId: ${sessionId}`);
        this.logger?.verbose(`[${this.getAgentName()}] Match: ${event.data.triggeringSessionId === sessionId}`);
        
        // Only show git operation messages in panels from the same session
        if (event.data.triggeringSessionId === sessionId) {
          this.logger?.info(`[${this.getAgentName()}] Forwarding git event to panel ${panelId} for session ${sessionId}`);
          
          // Format the git operation message for the AI agent
          const gitMessage = {
            type: 'system',
            subtype: 'git_operation',
            timestamp: event.timestamp,
            message: event.data.message,
            details: {
              operation: event.data.operation,
              triggeringSession: event.data.triggeringSessionName || event.data.triggeringSessionId,
              ...event.data
            }
          };
          
          // Send the git operation message to this panel
          this.cliManager.emit('output', {
            panelId,
            sessionId,
            type: 'json',
            data: gitMessage,
            timestamp: new Date()
          });
        } else {
          this.logger?.verbose(`[${this.getAgentName()}] Skipping git event for panel ${panelId} - different session`);
        }
      }
    };
    
    // Subscribe to git events
    panelEventBus.subscribe({
      panelId,
      eventTypes: ['git:operation_started', 'git:operation_completed', 'git:operation_failed'],
      callback: gitEventCallback
    });
    
    this.logger?.verbose(`Panel ${panelId} subscribed to git operation events`);
  }

  /**
   * Register a panel with the manager
   */
  registerPanel(panelId: string, sessionId: string, initialState?: any): void {
    const mapping: PanelMapping = {
      panelId,
      sessionId,
      resumeId: initialState?.resumeId || this.generateResumeId(panelId)
    };

    this.panelMappings.set(panelId, mapping);
    if (mapping.resumeId) {
      this.resumeIdToPanel.set(mapping.resumeId, panelId);
    }

    // Subscribe this panel to git operation events
    this.subscribeToGitEvents(panelId, sessionId);

    this.logger?.info(`[${this.getAgentName()}PanelManager] Registered panel ${panelId} for session ${sessionId} with resumeId ${mapping.resumeId}`);
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
      
      // Unsubscribe from panel events
      panelEventBus.unsubscribePanel(panelId);
      
      this.logger?.info(`[${this.getAgentName()}PanelManager] Unregistered panel ${panelId}`);
    }
  }

  /**
   * Start a panel with initial prompt
   */
  async startPanel(panelId: string, worktreePath: string, prompt: string, ...args: any[]): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[${this.getAgentName()}PanelManager] Starting panel ${panelId} (session: ${mapping.sessionId})`);
    return this.cliManager.startPanel(panelId, mapping.sessionId, worktreePath, prompt, ...args);
  }

  /**
   * Continue a panel conversation with history
   */
  async continuePanel(panelId: string, worktreePath: string, prompt: string, conversationHistory: any[], ...args: any[]): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[${this.getAgentName()}PanelManager] Continuing panel ${panelId} (session: ${mapping.sessionId})`);
    return this.cliManager.continuePanel(panelId, mapping.sessionId, worktreePath, prompt, conversationHistory, ...args);
  }

  /**
   * Stop a panel
   */
  async stopPanel(panelId: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[${this.getAgentName()}PanelManager] Stopping panel ${panelId} (session: ${mapping.sessionId})`);
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

    this.logger?.verbose(`[${this.getAgentName()}PanelManager] Sending input to panel ${panelId} (session: ${mapping.sessionId})`);
    this.cliManager.sendInput(panelId, input);
  }

  /**
   * Check if panel is running
   */
  isPanelRunning(panelId: string): boolean {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      return false;
    }

    return this.cliManager.isPanelRunning(panelId);
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
   * Get all registered panels
   */
  getAllPanels(): string[] {
    return Array.from(this.panelMappings.keys());
  }

  /**
   * Get panel state
   */
  getPanelState(panelId: string): any {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      return undefined;
    }

    const isRunning = this.cliManager.isPanelRunning(panelId);
    
    return {
      isInitialized: isRunning,
      resumeId: mapping.resumeId,
      lastActivityTime: new Date().toISOString()
    };
  }

  /**
   * Get session ID for panel
   */
  getSessionIdForPanel(panelId: string): string | undefined {
    return this.panelMappings.get(panelId)?.sessionId;
  }

  /**
   * Get panel ID from resume ID
   */
  getPanelIdFromResumeId(resumeId: string): string | undefined {
    return this.resumeIdToPanel.get(resumeId);
  }

  /**
   * Clean up all panels for a session
   */
  async cleanupSessionPanels(sessionId: string): Promise<void> {
    const panelsToCleanup: string[] = [];
    
    // Find all panels for this session
    for (const [panelId, mapping] of this.panelMappings.entries()) {
      if (mapping.sessionId === sessionId) {
        panelsToCleanup.push(panelId);
      }
    }

    // Clean up each panel
    for (const panelId of panelsToCleanup) {
      try {
        await this.stopPanel(panelId);
      } catch (error) {
        this.logger?.warn(`[${this.getAgentName()}PanelManager] Error stopping panel ${panelId}:`, error as Error);
      }
      this.unregisterPanel(panelId);
    }

    this.logger?.info(`[${this.getAgentName()}PanelManager] Cleaned up ${panelsToCleanup.length} panels for session ${sessionId}`);
  }
}
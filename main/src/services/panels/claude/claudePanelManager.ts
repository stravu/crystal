import { ClaudeCodeManager } from './claudeCodeManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';
import { ClaudePanelState, PanelEvent } from '../../../../../shared/types/panels';
import { panelEventBus } from '../../panelEventBus';

interface PanelMapping {
  panelId: string;
  sessionId: string;
  claudeResumeId?: string;
}

export class ClaudePanelManager {
  private panelMappings = new Map<string, PanelMapping>(); // panelId -> mapping
  private resumeIdToPanel = new Map<string, string>(); // claudeResumeId -> panelId

  constructor(
    private claudeCodeManager: ClaudeCodeManager,
    private sessionManager: any, // SessionManager with panel-based methods
    private logger?: Logger,
    private configManager?: ConfigManager
  ) {
    // Listen to Claude Code Manager events and translate them to panel events
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Forward events from Claude Code Manager to panel events
    this.claudeCodeManager.on('output', (data: any) => {
      // Data now includes panelId directly from ClaudeCodeManager
      const { panelId, sessionId } = data;
      if (panelId && this.panelMappings.has(panelId)) {
        // Store output using panel-based method for Claude data
        try {
          if (this.sessionManager && this.sessionManager.addPanelOutput) {
            this.sessionManager.addPanelOutput(panelId, {
              type: data.type,
              data: data.data,
              timestamp: data.timestamp || new Date()
            });
          }
        } catch (error) {
          this.logger?.error(`[ClaudePanelManager] Failed to store panel output: ${error}`);
        }

        // Emit as panel event instead of session event
        this.claudeCodeManager.emit('panel-output', {
          panelId,
          sessionId,
          type: data.type,
          data: data.data,
          timestamp: data.timestamp
        });
      }
    });

    this.claudeCodeManager.on('spawned', (data: any) => {
      // Data now includes panelId directly from ClaudeCodeManager
      const { panelId, sessionId } = data;
      if (panelId && this.panelMappings.has(panelId)) {
        this.claudeCodeManager.emit('panel-spawned', {
          panelId,
          sessionId
        });
      }
    });

    this.claudeCodeManager.on('exit', (data: any) => {
      // Data now includes panelId directly from ClaudeCodeManager
      const { panelId, sessionId, exitCode, signal } = data;
      if (panelId && this.panelMappings.has(panelId)) {
        this.claudeCodeManager.emit('panel-exit', {
          panelId,
          sessionId,
          exitCode,
          signal
        });
      }
    });

    this.claudeCodeManager.on('error', (data: any) => {
      // Data now includes panelId directly from ClaudeCodeManager
      const { panelId, sessionId, error } = data;
      if (panelId && this.panelMappings.has(panelId)) {
        this.claudeCodeManager.emit('panel-error', {
          panelId,
          sessionId,
          error
        });
      }
    });
  }

  // Removed findPanelBySessionId method - no longer needed since events now include panelId directly

  private generateClaudeResumeId(panelId: string): string {
    // For now, use panel ID as the resume ID
    // This could be enhanced later with a proper mapping
    return `panel-${panelId}`;
  }

  registerPanel(panelId: string, sessionId: string, initialState?: ClaudePanelState): void {
    const mapping: PanelMapping = {
      panelId,
      sessionId,
      claudeResumeId: initialState?.claudeResumeId || this.generateClaudeResumeId(panelId)
    };

    this.panelMappings.set(panelId, mapping);
    if (mapping.claudeResumeId) {
      this.resumeIdToPanel.set(mapping.claudeResumeId, panelId);
    }

    // Subscribe this panel to git operation events
    this.subscribeToGitEvents(panelId, sessionId);

    this.logger?.info(`[ClaudePanelManager] Registered panel ${panelId} for session ${sessionId} with resumeId ${mapping.claudeResumeId}`);
  }
  
  private subscribeToGitEvents(panelId: string, sessionId: string): void {
    // Subscribe to git operation events for this panel
    const gitEventCallback = (event: PanelEvent) => {
      // Only process git events for the same project
      if (event.source.panelId !== panelId && event.type.startsWith('git:')) {
        // Check if this event is for the same project
        const dbSession = this.sessionManager.getDbSession(sessionId);
        
        if (dbSession?.project_id && event.data.projectId === dbSession.project_id) {
          // Format the git operation message for Claude
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
          
          // Send the git operation message to this Claude panel
          // This will automatically be saved to session output by the output handler
          this.claudeCodeManager.emit('output', {
            panelId,
            sessionId,
            type: 'json',
            data: gitMessage,
            timestamp: new Date()
          });
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

  unregisterPanel(panelId: string): void {
    const mapping = this.panelMappings.get(panelId);
    if (mapping) {
      if (mapping.claudeResumeId) {
        this.resumeIdToPanel.delete(mapping.claudeResumeId);
      }
      this.panelMappings.delete(panelId);
      
      // Unsubscribe from panel events
      panelEventBus.unsubscribePanel(panelId);
      
      this.logger?.info(`[ClaudePanelManager] Unregistered panel ${panelId}`);
    }
  }

  // Delegate methods to claudeCodeManager, passing panel_id directly
  async startPanel(panelId: string, worktreePath: string, prompt: string, permissionMode?: 'approve' | 'ignore', model?: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[ClaudePanelManager] Starting Claude panel ${panelId} (session: ${mapping.sessionId})`);
    return this.claudeCodeManager.startPanel(panelId, mapping.sessionId, worktreePath, prompt, permissionMode, model);
  }

  async continuePanel(panelId: string, worktreePath: string, prompt: string, conversationHistory: any[], model?: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[ClaudePanelManager] Continuing Claude panel ${panelId} (session: ${mapping.sessionId})`);
    return this.claudeCodeManager.continuePanel(panelId, mapping.sessionId, worktreePath, prompt, conversationHistory, model);
  }

  async stopPanel(panelId: string): Promise<void> {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.info(`[ClaudePanelManager] Stopping Claude panel ${panelId} (session: ${mapping.sessionId})`);
    return this.claudeCodeManager.stopPanel(panelId);
  }

  sendInputToPanel(panelId: string, input: string): void {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      throw new Error(`Panel ${panelId} not registered`);
    }

    this.logger?.verbose(`[ClaudePanelManager] Sending input to panel ${panelId} (session: ${mapping.sessionId})`);
    this.claudeCodeManager.sendInput(panelId, input);
  }

  isPanelRunning(panelId: string): boolean {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      return false;
    }

    return this.claudeCodeManager.isPanelRunning(panelId);
  }

  getPanelProcess(panelId: string): any {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      return undefined;
    }

    return this.claudeCodeManager.getProcess(panelId);
  }

  getAllPanels(): string[] {
    return Array.from(this.panelMappings.keys());
  }

  getPanelState(panelId: string): ClaudePanelState | undefined {
    const mapping = this.panelMappings.get(panelId);
    if (!mapping) {
      return undefined;
    }

    const isRunning = this.claudeCodeManager.isPanelRunning(panelId);
    
    return {
      isInitialized: isRunning,
      claudeResumeId: mapping.claudeResumeId,
      lastActivityTime: new Date().toISOString()
    };
  }

  // Utility method to get session ID from panel ID
  getSessionIdForPanel(panelId: string): string | undefined {
    return this.panelMappings.get(panelId)?.sessionId;
  }

  // Utility method to get panel ID from Claude resume ID
  getPanelIdFromResumeId(claudeResumeId: string): string | undefined {
    return this.resumeIdToPanel.get(claudeResumeId);
  }

  // Clean up all panels for a session
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
        this.logger?.warn(`[ClaudePanelManager] Error stopping panel ${panelId}:`, error as Error);
      }
      this.unregisterPanel(panelId);
    }

    this.logger?.info(`[ClaudePanelManager] Cleaned up ${panelsToCleanup.length} Claude panels for session ${sessionId}`);
  }
}
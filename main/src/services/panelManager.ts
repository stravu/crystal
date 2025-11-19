import { v4 as uuidv4 } from 'uuid';
import { ToolPanel, CreatePanelRequest, PanelEventType, ToolPanelState, ToolPanelMetadata, ToolPanelType, LogsPanelState } from '../../../shared/types/panels';
import { databaseService } from './database';
import { panelEventBus } from './panelEventBus';
import { mainWindow } from '../index';
import { withLock } from '../utils/mutex';
import type { AnalyticsManager } from './analyticsManager';

export class PanelManager {
  private panels = new Map<string, ToolPanel>();
  private analyticsManager: AnalyticsManager | null = null;

  setAnalyticsManager(analyticsManager: AnalyticsManager): void {
    this.analyticsManager = analyticsManager;
  }

  constructor() {
    // Load panels from database on startup (but don't initialize processes)
    this.loadPanelsFromDatabase();
  }
  
  private loadPanelsFromDatabase(): void {
    // This will be called on app startup to restore panel state
    // But we don't start any processes - that happens lazily
    console.log('[PanelManager] Loading panels from database...');
    
    // Load all panels from database
    const allPanels = databaseService.getAllPanels();
    
    // Clean up any stale running states in logs panels
    allPanels.forEach(panel => {
      if (panel.type === 'logs' && panel.state?.customState) {
        const logsState = panel.state.customState as LogsPanelState;
        if (logsState.isRunning) {
          // Reset the running state since processes don't survive app restarts
          logsState.isRunning = false;
          // Also clear process-related fields
          logsState.processId = undefined;
          logsState.endTime = new Date().toISOString();
          // Update in database
          databaseService.updatePanel(panel.id, {
            state: panel.state
          });
        }
      }
      // Cache the panel
      this.panels.set(panel.id, panel);
    });
  }
  
  async createPanel(request: CreatePanelRequest): Promise<ToolPanel> {
    return await withLock(`panel-creation-${request.sessionId}`, async () => {
      // Generate unique ID
      const panelId = uuidv4();
      
      // Auto-generate title if not provided
      const title = request.title || this.generatePanelTitle(request.sessionId, request.type);
      
      // Create initial state
      const state: ToolPanelState = {
        isActive: false,
        hasBeenViewed: false,
        customState: request.initialState || {}
      };
      
      // Create metadata (merge with any provided overrides)
      const metadata: ToolPanelMetadata = {
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        position: this.getNextPosition(request.sessionId),
        ...request.metadata // Apply any metadata overrides (like permanent flag)
      };
      
      // Create panel object
      const panel: ToolPanel = {
        id: panelId,
        sessionId: request.sessionId,
        type: request.type,
        title,
        state,
        metadata
      };
      
      // Save to database and set as active in a single transaction
      databaseService.createPanelAndSetActive({
        id: panel.id,
        sessionId: panel.sessionId,
        type: panel.type,
        title: panel.title,
        state: panel.state,
        metadata: panel.metadata
      });
      
      // Update the panel state to reflect it's now active
      panel.state.isActive = true;
      panel.metadata.lastActiveAt = new Date().toISOString();
      
      // Cache in memory
      this.panels.set(panelId, panel);
      
      // Update panel states to reflect the new active panel
      const panels = this.getPanelsForSession(request.sessionId);
      panels.forEach(p => {
        const isActive = p.id === panelId;
        if (p.state.isActive !== isActive) {
          p.state.isActive = isActive;
          if (isActive) {
            p.metadata.lastActiveAt = new Date().toISOString();
          }
        }
      });
      
      // Emit IPC event to notify frontend
      if (mainWindow) {
        mainWindow.webContents.send('panel:created', panel);
      }

      // Track terminal panel creation analytics (only for new panels, not restoration)
      if (request.type === 'terminal' && this.analyticsManager) {
        const terminalCount = this.getPanelsBySessionAndType(request.sessionId, 'terminal').length;
        this.analyticsManager.track('terminal_panel_created', {
          session_id_hash: this.analyticsManager.hashSessionId(request.sessionId),
          terminal_count: terminalCount
        });
      }

      console.log(`[PanelManager] Created panel ${panelId} of type ${request.type} for session ${request.sessionId}`);

      return panel;
    });
  }
  
  async ensureDiffPanel(sessionId: string): Promise<void> {
    const panels = this.getPanelsForSession(sessionId);
    const hasDiff = panels.some(p => p.type === 'diff');
    
    if (!hasDiff) {
      console.log(`[PanelManager] Creating diff panel for session ${sessionId}`);
      await this.createPanel({
        sessionId,
        type: 'diff',
        title: 'Diff',
        metadata: { permanent: true }
      });
    }
  }
  
  async deletePanel(panelId: string): Promise<void> {
    return await withLock(`panel-delete-${panelId}`, async () => {
      const panel = this.getPanel(panelId);
      if (!panel) {
        console.warn(`[PanelManager] Panel ${panelId} not found for deletion`);
        return;
      }

      // Check if panel is permanent
      if (panel.metadata.permanent) {
        console.warn(`[PanelManager] Cannot delete permanent panel ${panelId}`);
        return;
      }

      // Calculate panel lifetime for analytics
      const createdAt = new Date(panel.metadata.createdAt);
      const now = new Date();
      const lifetimeSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

      // Clean up event subscriptions
      panelEventBus.unsubscribePanel(panelId);

      // If this was the active panel, activate another one
      const activePanelId = databaseService.getActivePanel(panel.sessionId)?.id;
      if (activePanelId === panelId) {
        const otherPanels = this.getPanelsForSession(panel.sessionId).filter(p => p.id !== panelId);
        if (otherPanels.length > 0) {
          await this.setActivePanel(panel.sessionId, otherPanels[0].id);
        } else {
          await this.setActivePanel(panel.sessionId, null);
        }
      }

      // Remove from database
      databaseService.deletePanel(panelId);

      // Remove from cache
      this.panels.delete(panelId);

      // Emit IPC event to notify frontend
      if (mainWindow) {
        mainWindow.webContents.send('panel:deleted', { panelId, sessionId: panel.sessionId });
      }

      // Track panel closure
      if (this.analyticsManager) {
        this.analyticsManager.track('panel_closed', {
          panel_type: panel.type,
          panel_lifetime_seconds: lifetimeSeconds
        });
      }

      console.log(`[PanelManager] Deleted panel ${panelId}`);
    });
  }
  
  async updatePanel(panelId: string, updates: Partial<ToolPanel>): Promise<void> {
    return await withLock(`panel-update-${panelId}`, async () => {
      const panel = this.getPanel(panelId);
      if (!panel) {
        console.warn(`[PanelManager] Panel ${panelId} not found for update`);
        return;
      }
      
      // Update in database
      databaseService.updatePanel(panelId, {
        title: updates.title,
        state: updates.state,
        metadata: updates.metadata
      });
      
      // Update in cache
      if (updates.title !== undefined) panel.title = updates.title;
      if (updates.state !== undefined) panel.state = updates.state;
      if (updates.metadata !== undefined) panel.metadata = updates.metadata;
      
      // Emit IPC event to notify frontend
      if (mainWindow) {
        mainWindow.webContents.send('panel:updated', panel);
      }
      
      console.log(`[PanelManager] Updated panel ${panelId}`);
    });
  }
  
  async setActivePanel(sessionId: string, panelId: string | null): Promise<void> {
    return await withLock(`panel-active-${sessionId}`, async () => {
      // Get current active panel for analytics
      const currentActivePanel = databaseService.getActivePanel(sessionId);
      const fromPanelType = currentActivePanel?.type;

      // Update database
      databaseService.setActivePanel(sessionId, panelId);

      // Get new active panel for analytics
      const newActivePanel = panelId ? this.getPanel(panelId) : null;
      const toPanelType = newActivePanel?.type;

      // Update panel states
      const panels = this.getPanelsForSession(sessionId);
      panels.forEach(panel => {
        const isActive = panel.id === panelId;
        if (panel.state.isActive !== isActive) {
          panel.state.isActive = isActive;
          if (isActive) {
            panel.metadata.lastActiveAt = new Date().toISOString();
          }
          // Don't call updatePanel here to avoid nested locks
          // Update in database directly
          databaseService.updatePanel(panel.id, {
            state: panel.state,
            metadata: panel.metadata
          });

          // Update in cache
          this.panels.set(panel.id, panel);
        }
      });

      // Emit IPC event to notify frontend
      if (mainWindow) {
        mainWindow.webContents.send('panel:activeChanged', { sessionId, panelId });
      }

      // Track panel switching (only if both from and to panels exist)
      if (this.analyticsManager && fromPanelType && toPanelType && fromPanelType !== toPanelType) {
        this.analyticsManager.track('panel_switched', {
          from_panel_type: fromPanelType,
          to_panel_type: toPanelType
        });
      }

      console.log(`[PanelManager] Set active panel for session ${sessionId} to ${panelId}`);
    });
  }
  
  getPanel(panelId: string): ToolPanel | undefined {
    // Check cache first
    if (this.panels.has(panelId)) {
      return this.panels.get(panelId);
    }
    
    // Load from database if not cached
    const panel = databaseService.getPanel(panelId);
    if (panel) {
      // Fix any panels that have state stored as a string (defensive programming)
      if (typeof panel.state === 'string') {
        try {
          panel.state = JSON.parse(panel.state);
        } catch (e) {
          console.error(`[PanelManager] Failed to parse panel state for ${panel.id}:`, e);
          panel.state = { isActive: false, hasBeenViewed: false, customState: {} };
        }
      }
      if (typeof panel.metadata === 'string') {
        try {
          panel.metadata = JSON.parse(panel.metadata);
        } catch (e) {
          console.error(`[PanelManager] Failed to parse panel metadata for ${panel.id}:`, e);
          panel.metadata = { createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), position: 0 };
        }
      }
      this.panels.set(panelId, panel);
      return panel;
    }
    
    return undefined;
  }
  
  getPanelsForSession(sessionId: string): ToolPanel[] {
    // Always get fresh from database to ensure consistency
    const panels = databaseService.getPanelsForSession(sessionId);
    
    // Fix any panels that have state stored as a string (defensive programming)
    panels.forEach(panel => {
      if (typeof panel.state === 'string') {
        try {
          panel.state = JSON.parse(panel.state);
        } catch (e) {
          console.error(`[PanelManager] Failed to parse panel state for ${panel.id}:`, e);
          panel.state = { isActive: false, hasBeenViewed: false, customState: {} };
        }
      }
      if (typeof panel.metadata === 'string') {
        try {
          panel.metadata = JSON.parse(panel.metadata);
        } catch (e) {
          console.error(`[PanelManager] Failed to parse panel metadata for ${panel.id}:`, e);
          panel.metadata = { createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), position: 0 };
        }
      }
      // Update cache
      this.panels.set(panel.id, panel);
    });
    
    return panels;
  }
  
  getPanelsBySessionAndType(sessionId: string, type: ToolPanelType): ToolPanel[] {
    const panels = this.getPanelsForSession(sessionId);
    return panels.filter(p => p.type === type);
  }
  
  async emitPanelEvent(panelId: string, eventType: PanelEventType, data: unknown): Promise<void> {
    const panel = this.getPanel(panelId);
    if (!panel) {
      console.warn(`[PanelManager] Panel ${panelId} not found for event emission`);
      return;
    }
    
    const event = {
      type: eventType,
      source: {
        panelId: panel.id,
        panelType: panel.type,
        sessionId: panel.sessionId
      },
      data,
      timestamp: new Date().toISOString()
    };
    
    // Emit through event bus
    panelEventBus.emitPanelEvent(event);
    
    // Also emit to frontend via IPC
    if (mainWindow) {
      mainWindow.webContents.send('panel:event', event);
    }
    
    console.log(`[PanelManager] Emitted event ${eventType} from panel ${panelId}`);
  }
  
  private generatePanelTitle(sessionId: string, type: string): string {
    const existingPanels = this.getPanelsForSession(sessionId);
    const samePType = existingPanels.filter(p => p.type === type);
    const nextNumber = samePType.length + 1;
    
    // Capitalize first letter of type
    const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
    
    return `${capitalizedType} ${nextNumber}`;
  }
  
  private getNextPosition(sessionId: string): number {
    const panels = this.getPanelsForSession(sessionId);
    if (panels.length === 0) return 0;
    
    const maxPosition = Math.max(...panels.map(p => p.metadata.position));
    return maxPosition + 1;
  }
  
  // Clean up all panels for a session (called when session is deleted)
  async cleanupSessionPanels(sessionId: string): Promise<void> {
    const panels = this.getPanelsForSession(sessionId);
    
    for (const panel of panels) {
      // Unsubscribe from events
      panelEventBus.unsubscribePanel(panel.id);
      
      // Remove from cache
      this.panels.delete(panel.id);
    }
    
    // Delete all from database (cascade delete should handle this too)
    databaseService.deletePanelsForSession(sessionId);
    
    console.log(`[PanelManager] Cleaned up ${panels.length} panels for session ${sessionId}`);
  }
}

// Export singleton instance
export const panelManager = new PanelManager();
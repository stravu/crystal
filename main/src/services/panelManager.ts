import { v4 as uuidv4 } from 'uuid';
import { ToolPanel, CreatePanelRequest, PanelEventType, ToolPanelState, ToolPanelMetadata, ToolPanelType } from '../../../shared/types/panels';
import { databaseService } from './database';
import { panelEventBus } from './panelEventBus';
import { mainWindow } from '../index';

export class PanelManager {
  private panels = new Map<string, ToolPanel>();
  
  constructor() {
    // Load panels from database on startup (but don't initialize processes)
    this.loadPanelsFromDatabase();
  }
  
  private loadPanelsFromDatabase(): void {
    // This will be called on app startup to restore panel state
    // But we don't start any processes - that happens lazily
    console.log('[PanelManager] Loading panels from database...');
  }
  
  async createPanel(request: CreatePanelRequest): Promise<ToolPanel> {
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
    
    // Save to database
    databaseService.createPanel({
      id: panel.id,
      sessionId: panel.sessionId,
      type: panel.type,
      title: panel.title,
      state: panel.state,
      metadata: panel.metadata
    });
    
    // Cache in memory
    this.panels.set(panelId, panel);
    
    // Set as active panel for the session
    await this.setActivePanel(request.sessionId, panelId);
    
    // Emit IPC event to notify frontend
    if (mainWindow) {
      mainWindow.webContents.send('panel:created', panel);
    }
    
    console.log(`[PanelManager] Created panel ${panelId} of type ${request.type} for session ${request.sessionId}`);
    
    return panel;
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
    
    console.log(`[PanelManager] Deleted panel ${panelId}`);
  }
  
  async updatePanel(panelId: string, updates: Partial<ToolPanel>): Promise<void> {
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
  }
  
  async setActivePanel(sessionId: string, panelId: string | null): Promise<void> {
    // Update database
    databaseService.setActivePanel(sessionId, panelId);
    
    // Update panel states
    const panels = this.getPanelsForSession(sessionId);
    panels.forEach(panel => {
      const isActive = panel.id === panelId;
      if (panel.state.isActive !== isActive) {
        panel.state.isActive = isActive;
        if (isActive) {
          panel.metadata.lastActiveAt = new Date().toISOString();
        }
        this.updatePanel(panel.id, { state: panel.state, metadata: panel.metadata });
      }
    });
    
    // Emit IPC event to notify frontend
    if (mainWindow) {
      mainWindow.webContents.send('panel:activeChanged', { sessionId, panelId });
    }
    
    console.log(`[PanelManager] Set active panel for session ${sessionId} to ${panelId}`);
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
  
  async emitPanelEvent(panelId: string, eventType: PanelEventType, data: any): Promise<void> {
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
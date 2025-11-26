import { CreatePanelRequest, ToolPanel } from '../../../shared/types/panels';

export const panelApi = {
  async createPanel(request: CreatePanelRequest): Promise<ToolPanel> {
    const response = await window.electronAPI.panels.createPanel(
      request.sessionId, 
      request.type, 
      request.title || '', 
      request.initialState as Record<string, unknown> | undefined
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create panel');
    }
    return response.data;
  },
  
  async deletePanel(panelId: string): Promise<void> {
    const response = await window.electronAPI.panels.deletePanel(panelId);
    if (!response.success) {
      throw new Error(response.error || 'Failed to delete panel');
    }
  },
  
  async updatePanel(panelId: string, updates: Partial<ToolPanel>): Promise<void> {
    // If only updating title, use renamePanel for backward compatibility
    if (Object.keys(updates).length === 1 && updates.title !== undefined) {
      const response = await window.electronAPI.panels.renamePanel(panelId, updates.title || '');
      if (!response.success) {
        throw new Error(response.error || 'Failed to update panel');
      }
    } else {
      // Use the full update handler for state and other updates
      const response = await window.electronAPI.invoke('panels:update', panelId, updates);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update panel');
      }
    }
  },
  
  async loadPanelsForSession(sessionId: string): Promise<ToolPanel[]> {
    const response = await window.electronAPI.panels.getSessionPanels(sessionId);
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load panels');
    }
    return response.data;
  },
  
  async getActivePanel(sessionId: string): Promise<ToolPanel | null> {
    const panels = await this.loadPanelsForSession(sessionId);
    return panels.find(panel => panel.state.isActive) || null;
  },
  
  async setActivePanel(sessionId: string, panelId: string): Promise<void> {
    const response = await window.electronAPI.panels.setActivePanel(sessionId, panelId);
    if (!response.success) {
      throw new Error(response.error || 'Failed to set active panel');
    }
  },
  
  async emitPanelEvent(panelId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    // Use direct invoke for event emission as there's no typed wrapper for this
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC event emission returns void
    return window.electron!.invoke('panels:emitEvent', panelId, eventType, data) as unknown as void;
  },

  async clearPanelUnviewedContent(panelId: string): Promise<void> {
    // Clear the hasUnviewedContent flag and set status to 'stopped' for AI panels
    const response = await window.electron!.invoke('panels:clearUnviewedContent', panelId);
    if (!response.success) {
      throw new Error(response.error || 'Failed to clear unviewed content');
    }
  }
};
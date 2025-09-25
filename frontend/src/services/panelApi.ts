import { CreatePanelRequest, ToolPanel } from '../../../shared/types/panels';

export const panelApi = {
  async createPanel(request: CreatePanelRequest): Promise<ToolPanel> {
    return window.electron!.invoke('panels:create', request);
  },
  
  async deletePanel(panelId: string): Promise<void> {
    return window.electron!.invoke('panels:delete', panelId);
  },
  
  async updatePanel(panelId: string, updates: Partial<ToolPanel>): Promise<void> {
    return window.electron!.invoke('panels:update', panelId, updates);
  },
  
  async loadPanelsForSession(sessionId: string): Promise<ToolPanel[]> {
    return window.electron!.invoke('panels:list', sessionId);
  },
  
  async getActivePanel(sessionId: string): Promise<ToolPanel | null> {
    return window.electron!.invoke('panels:getActive', sessionId);
  },
  
  async setActivePanel(sessionId: string, panelId: string): Promise<void> {
    return window.electron!.invoke('panels:setActive', sessionId, panelId);
  },
  
  async emitPanelEvent(panelId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    return window.electron!.invoke('panels:emitEvent', panelId, eventType, data);
  }
};
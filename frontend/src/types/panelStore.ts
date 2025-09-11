import { ToolPanel, PanelEvent, PanelEventType } from '../../../shared/types/panels';

export interface PanelStore {
  // State (using plain objects instead of Maps for React reactivity)
  panels: Record<string, ToolPanel[]>;        // sessionId -> panels
  activePanels: Record<string, string>;       // sessionId -> active panelId
  panelEvents: PanelEvent[];                  // Recent events
  eventSubscriptions: Record<string, Set<PanelEventType>>; // panelId -> subscribed events
  
  // Synchronous state update actions
  setPanels: (sessionId: string, panels: ToolPanel[]) => void;
  setActivePanel: (sessionId: string, panelId: string) => void;
  addPanel: (panel: ToolPanel) => void;
  removePanel: (sessionId: string, panelId: string) => void;
  updatePanelState: (panel: ToolPanel) => void;
  
  // Event actions  
  subscribeToPanelEvents: (panelId: string, eventTypes: PanelEventType[]) => void;
  unsubscribeFromPanelEvents: (panelId: string, eventTypes: PanelEventType[]) => void;
  addPanelEvent: (event: PanelEvent) => void;
  
  // Getters
  getSessionPanels: (sessionId: string) => ToolPanel[];
  getActivePanel: (sessionId: string) => ToolPanel | undefined;
  getPanelEvents: (panelId?: string, eventTypes?: PanelEventType[]) => PanelEvent[];
  
}
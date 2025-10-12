import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { PanelStore } from '../types/panelStore';
import { ToolPanel } from '../../../shared/types/panels';

// FIX: Use immer for safe immutable updates
export const usePanelStore = create<PanelStore>()(
  immer((set, get) => ({
    panels: {},
    activePanels: {},
    panelEvents: [],
    eventSubscriptions: {},

    // Pure synchronous state updates
    setPanels: (sessionId, panels) => {
      set((state) => {
        // Replace panels array entirely to ensure React detects changes
        state.panels[sessionId] = panels;
      });
    },

    setActivePanel: (sessionId, panelId) => {
      set((state) => {
        state.activePanels[sessionId] = panelId;
      });
    },

    addPanel: (panel) => {
      set((state) => {
        if (!state.panels[panel.sessionId]) {
          state.panels[panel.sessionId] = [];
        }
        // Check if panel already exists to prevent duplicates
        const existing = state.panels[panel.sessionId].find((p: ToolPanel) => p.id === panel.id);
        if (!existing) {
          state.panels[panel.sessionId].push(panel);
          state.activePanels[panel.sessionId] = panel.id;
        }
      });
    },

    removePanel: (sessionId, panelId) => {
      set((state) => {
        if (state.panels[sessionId]) {
          state.panels[sessionId] = state.panels[sessionId].filter((p: ToolPanel) => p.id !== panelId);
        }
        // Clear active panel if it was the removed one
        if (state.activePanels[sessionId] === panelId) {
          delete state.activePanels[sessionId];
        }
      });
    },

    updatePanelState: (panel) => {
      set((state) => {
        const sessionPanels = state.panels[panel.sessionId];
        if (sessionPanels) {
          const index = sessionPanels.findIndex((p: ToolPanel) => p.id === panel.id);
          if (index !== -1) {
            sessionPanels[index] = panel;
          }
        }
      });
    },

    // Getters remain the same
    getSessionPanels: (sessionId) => get().panels[sessionId] || [],
    getActivePanel: (sessionId) => {
      const panels = get().panels[sessionId] || [];
      return panels.find(p => p.id === get().activePanels[sessionId]);
    },

    // Event management
    subscribeToPanelEvents: (panelId, eventTypes) => {
      set((state) => {
        if (!state.eventSubscriptions[panelId]) {
          state.eventSubscriptions[panelId] = new Set();
        }
        eventTypes.forEach(type => state.eventSubscriptions[panelId].add(type));
      });
    },

    unsubscribeFromPanelEvents: (panelId, eventTypes) => {
      set((state) => {
        if (state.eventSubscriptions[panelId]) {
          eventTypes.forEach(type => state.eventSubscriptions[panelId].delete(type));
        }
      });
    },

    addPanelEvent: (event) => {
      set((state) => {
        state.panelEvents.push(event);
        // Keep only last 100 events
        if (state.panelEvents.length > 100) {
          state.panelEvents = state.panelEvents.slice(-100);
        }
      });
    },

    getPanelEvents: (panelId, eventTypes) => {
      const events = get().panelEvents;
      return events.filter(e => {
        const matchesPanel = !panelId || e.source.panelId === panelId;
        const matchesType = !eventTypes || eventTypes.includes(e.type);
        return matchesPanel && matchesType;
      });
    }
  }))
);
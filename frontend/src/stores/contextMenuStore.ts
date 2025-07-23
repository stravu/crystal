import { create } from 'zustand';

export interface ContextMenuItem {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  isDivider?: boolean;
  icon?: React.ReactNode;
}

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  sessionId: string | null;
  menuItems: ContextMenuItem[];
}

interface ContextMenuActions {
  openContextMenu: (sessionId: string, position: { x: number; y: number }, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;
  replaceContextMenu: (sessionId: string, position: { x: number; y: number }, items: ContextMenuItem[]) => void;
}

export type ContextMenuStore = ContextMenuState & ContextMenuActions;

export const useContextMenuStore = create<ContextMenuStore>((set) => ({
  // State
  isOpen: false,
  position: { x: 0, y: 0 },
  sessionId: null,
  menuItems: [],

  // Actions
  openContextMenu: (sessionId: string, position: { x: number; y: number }, items: ContextMenuItem[]) => {
    set({
      isOpen: true,
      position,
      sessionId,
      menuItems: items,
    });
  },

  closeContextMenu: () => {
    set({
      isOpen: false,
      position: { x: 0, y: 0 },
      sessionId: null,
      menuItems: [],
    });
  },

  replaceContextMenu: (sessionId: string, position: { x: number; y: number }, items: ContextMenuItem[]) => {
    // Close existing menu first, then open new one
    set({
      isOpen: true,
      position,
      sessionId,
      menuItems: items,
    });
  },
}));
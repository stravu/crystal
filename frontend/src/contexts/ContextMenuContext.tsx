import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { ContextMenuPayload } from '../types/session';

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuState {
  type: 'session' | 'folder' | null;
  position: ContextMenuPosition | null;
  payload: ContextMenuPayload | null;
}

interface ContextMenuContextType {
  menuState: ContextMenuState;
  openMenu: (type: 'session' | 'folder', payload: ContextMenuPayload, position: ContextMenuPosition) => void;
  closeMenu: () => void;
  isMenuOpen: (type: 'session' | 'folder', id?: string) => boolean;
}

const ContextMenuContext = createContext<ContextMenuContextType | undefined>(undefined);

export const useContextMenu = () => {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return context;
};

interface ContextMenuProviderProps {
  children: ReactNode;
}

export const ContextMenuProvider: React.FC<ContextMenuProviderProps> = ({ children }) => {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    type: null,
    position: null,
    payload: null,
  });

  const openMenu = useCallback((type: 'session' | 'folder', payload: ContextMenuPayload, position: ContextMenuPosition) => {
    // Close any existing menu before opening a new one
    setMenuState({
      type,
      position,
      payload,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState({
      type: null,
      position: null,
      payload: null,
    });
  }, []);

  const isMenuOpen = useCallback((type: 'session' | 'folder', id?: string) => {
    if (menuState.type !== type) return false;
    if (!id) return true;
    
    // Check if the ID matches based on the menu type
    if (type === 'session' && menuState.payload?.id === id) return true;
    if (type === 'folder' && menuState.payload?.id === id) return true;
    
    return false;
  }, [menuState]);

  // Global click handler to close menu when clicking outside
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      // Check if the click is on the context menu itself
      const target = event.target as HTMLElement;
      const isContextMenu = target?.closest?.('.context-menu');
      
      // If click is outside the context menu, close it
      if (!isContextMenu && menuState.type !== null) {
        closeMenu();
      }
    };

    // Add slight delay to prevent immediate closing on right-click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleGlobalClick);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleGlobalClick);
    };
  }, [menuState.type, closeMenu]);

  // Global keyboard handler for ESC key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuState.type !== null) {
        closeMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState.type, closeMenu]);

  const contextValue: ContextMenuContextType = {
    menuState,
    openMenu,
    closeMenu,
    isMenuOpen,
  };

  return (
    <ContextMenuContext.Provider value={contextValue}>
      {children}
    </ContextMenuContext.Provider>
  );
};
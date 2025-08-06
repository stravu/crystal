import React, { createContext, useContext, useState, useEffect } from 'react';
import { API } from '../utils/api';

interface DebugContextType {
  debugMode: boolean;
  setDebugMode: (enabled: boolean) => void;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [debugMode, setDebugModeState] = useState(false);

  useEffect(() => {
    // Load initial debug mode from config
    loadDebugMode();
  }, []);

  const loadDebugMode = async () => {
    try {
      const response = await API.config.get();
      if (response.success && response.data) {
        setDebugModeState(response.data.debugMode || false);
      }
    } catch (error) {
      console.error('Failed to load debug mode:', error);
    }
  };

  const setDebugMode = (enabled: boolean) => {
    setDebugModeState(enabled);
    // Update localStorage for immediate effect
    localStorage.setItem('crystal-debug-mode', enabled ? 'true' : 'false');
  };

  return (
    <DebugContext.Provider value={{ debugMode, setDebugMode }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebug() {
  const context = useContext(DebugContext);
  if (context === undefined) {
    // Fallback to localStorage if context is not available
    const debugMode = localStorage.getItem('crystal-debug-mode') === 'true';
    return { debugMode, setDebugMode: () => {} };
  }
  return context;
}

// Helper function for conditional debug logging
export function debugLog(component: string, message: string, data?: any) {
  const debugMode = localStorage.getItem('crystal-debug-mode') === 'true';
  if (debugMode) {
    if (data) {
      console.log(`[${component}]`, message, data);
    } else {
      console.log(`[${component}]`, message);
    }
  }
}
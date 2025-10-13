import React, { createContext, useContext, useEffect, useState } from 'react';
import { useConfigStore } from '../stores/configStore';
import { API } from '../utils/api';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useConfigStore();
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage for saved preference (for immediate access)
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    // Default to dark theme
    return 'dark';
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  // Sync theme from config when it loads
  useEffect(() => {
    if (config?.theme && (config.theme === 'light' || config.theme === 'dark')) {
      setTheme(config.theme);
      localStorage.setItem('theme', config.theme);
      setConfigLoaded(true);
    }
  }, [config?.theme]);

  useEffect(() => {
    // Update document root and body classes
    const root = document.documentElement;
    const body = document.body;

    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      body.classList.remove('dark');
      body.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      body.classList.remove('light');
      body.classList.add('dark');
    }

    // Save preference to localStorage for immediate access
    localStorage.setItem('theme', theme);

    // Only save to config after initial config has loaded
    // This prevents overwriting the config with the initial state
    if (configLoaded) {
      API.config.update({ theme }).catch(err => {
        console.error('Failed to save theme to config:', err);
      });
    }
  }, [theme, configLoaded]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
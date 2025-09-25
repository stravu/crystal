// Convert rgb(r g b) format to hex format
const rgbToHex = (rgb: string): string => {
  // Check if already in hex format
  if (rgb.startsWith('#')) return rgb;
  
  // Match rgb(r g b) or rgb(r, g, b) format
  const match = rgb.match(/rgb\((\d+)[\s,]+(\d+)[\s,]+(\d+)\)/);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  
  // If we can't parse it, return as-is
  return rgb;
};

// Get CSS variable value from the document with smart fallbacks
const getCSSVariable = (name: string): string => {
  // Force a reflow to ensure CSS variables are up to date
  void document.documentElement.offsetHeight;
  
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value) {
    // Convert to hex format if needed
    return rgbToHex(value);
  }
  
  // Provide smart fallbacks based on current theme
  const isLight = document.documentElement.classList.contains('light');
  const isDark = document.documentElement.classList.contains('dark');
  
  // Define theme-aware fallbacks (already in hex format)
  const fallbacks: Record<string, { light: string; dark: string }> = {
    '--color-terminal-bg': { light: '#ffffff', dark: '#111827' },
    '--color-terminal-fg': { light: '#1e2026', dark: '#f3f4f6' },
    '--color-terminal-cursor': { light: '#6366f1', dark: '#818cf8' },
    '--color-terminal-black': { light: '#1e2026', dark: '#111827' },
    '--color-terminal-white': { light: '#f9fafb', dark: '#f3f4f6' },
    '--color-terminal-bright-black': { light: '#6b7280', dark: '#6b7280' },
    '--color-terminal-bright-white': { light: '#f3f4f6', dark: '#ffffff' },
  };
  
  const fallback = fallbacks[name];
  if (fallback) {
    // Prioritize explicit dark class, then light class, then default to dark
    if (isDark) return fallback.dark;
    if (isLight) return fallback.light;
    return fallback.dark;
  }
  
  // Default color fallbacks
  return isLight ? '#000000' : '#ffffff';
};

// Terminal theme generator that reads from CSS variables
export const getTerminalTheme = () => {
  return {
    background: getCSSVariable('--color-terminal-bg'),
    foreground: getCSSVariable('--color-terminal-fg'),
    cursor: getCSSVariable('--color-terminal-cursor'),
    black: getCSSVariable('--color-terminal-black'),
    red: getCSSVariable('--color-terminal-red'),
    green: getCSSVariable('--color-terminal-green'),
    yellow: getCSSVariable('--color-terminal-yellow'),
    blue: getCSSVariable('--color-terminal-blue'),
    magenta: getCSSVariable('--color-terminal-magenta'),
    cyan: getCSSVariable('--color-terminal-cyan'),
    white: getCSSVariable('--color-terminal-white'),
    brightBlack: getCSSVariable('--color-terminal-bright-black'),
    brightRed: getCSSVariable('--color-terminal-bright-red'),
    brightGreen: getCSSVariable('--color-terminal-bright-green'),
    brightYellow: getCSSVariable('--color-terminal-bright-yellow'),
    brightBlue: getCSSVariable('--color-terminal-bright-blue'),
    brightMagenta: getCSSVariable('--color-terminal-bright-magenta'),
    brightCyan: getCSSVariable('--color-terminal-bright-cyan'),
    brightWhite: getCSSVariable('--color-terminal-bright-white'),
  };
};

// Script terminal theme (slightly different background for better UI integration)
export const getScriptTerminalTheme = () => {
  const baseTheme = getTerminalTheme();
  const isLight = document.documentElement.classList.contains('light');
  const isDark = document.documentElement.classList.contains('dark');
  
  // Use surface colors for better integration with the UI
  const surfaceBackground = getCSSVariable('--color-surface-secondary');
  
  return {
    ...baseTheme,
    background: surfaceBackground || (isLight ? '#f9fafb' : isDark ? '#1f2937' : '#1f2937'),
  };
};

// Debug function to check current terminal theme values
export const debugTerminalTheme = () => {
  const isLight = document.documentElement.classList.contains('light');
  const isDark = document.documentElement.classList.contains('dark');
  
  // Check actual CSS variable values
  const bgVar = getComputedStyle(document.documentElement).getPropertyValue('--color-terminal-bg').trim();
  const fgVar = getComputedStyle(document.documentElement).getPropertyValue('--color-terminal-fg').trim();
  
  // Return debug info instead of logging to console
  return {
    classes: document.documentElement.className,
    isLight,
    isDark,
    cssVariables: {
      '--color-terminal-bg': bgVar || 'NOT SET',
      '--color-terminal-fg': fgVar || 'NOT SET',
    },
    terminalTheme: getTerminalTheme(),
    scriptTerminalTheme: getScriptTerminalTheme(),
  };
};
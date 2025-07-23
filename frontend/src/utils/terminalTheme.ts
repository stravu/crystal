// Get CSS variable value from the document
const getCSSVariable = (name: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || '#000000'; // fallback
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

// Script terminal theme (slightly different background)
export const getScriptTerminalTheme = () => {
  const theme = getTerminalTheme();
  // For script terminal, use surface colors for better integration
  const isLight = document.documentElement.classList.contains('light');
  return {
    ...theme,
    background: isLight 
      ? getCSSVariable('--color-surface-secondary') // Light: gray-50
      : getCSSVariable('--color-surface-secondary'), // Dark: gray-800
  };
};
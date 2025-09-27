/**
 * Performance-optimized console utilities
 * Reduces console.log calls in production builds
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isVerboseEnabled = () => {
  // Check if verbose logging is enabled in settings
  try {
    const verboseLogging = localStorage.getItem('crystal.verboseLogging');
    return verboseLogging === 'true';
  } catch {
    return false;
  }
};

export const devLog = {
  log: (...args: unknown[]) => {
    if (isDevelopment || isVerboseEnabled()) {
      console.log(...args);
    }
  },
  
  warn: (...args: unknown[]) => {
    if (isDevelopment || isVerboseEnabled()) {
      console.warn(...args);
    }
  },
  
  error: (...args: unknown[]) => {
    // Always log errors
    console.error(...args);
  },
  
  debug: (...args: unknown[]) => {
    if (isDevelopment && isVerboseEnabled()) {
      console.debug(...args);
    }
  },
  
  info: (...args: unknown[]) => {
    if (isDevelopment || isVerboseEnabled()) {
      console.info(...args);
    }
  }
};

/**
 * Performance-focused logging for component renders
 * Only logs in development with verbose enabled
 */
export const renderLog = (...args: unknown[]) => {
  if (isDevelopment && isVerboseEnabled()) {
    console.log(...args);
  }
};
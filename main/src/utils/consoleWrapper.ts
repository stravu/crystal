// Simple console wrapper to reduce logging based on verbose setting
// This follows the existing pattern in the codebase

import { ConfigManager } from '../services/configManager';

const isDevelopment = process.env.NODE_ENV !== 'production' && !(global as any).isPackaged;

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

// ConfigManager instance will be set after initialization
let configManager: ConfigManager | null = null;

// Helper to check if verbose logging is enabled
function isVerboseEnabled(): boolean {
  // If ConfigManager is not yet initialized, check for verbose in stored config
  if (!configManager) {
    try {
      // Try to read the config file directly during startup
      const Store = require('electron-store');
      const store = new Store({ name: 'crystal-settings' });
      const config = store.get('config', {});
      return config.verbose || false;
    } catch {
      // If we can't read config, default to NOT verbose (shut up the logs!)
      return false;
    }
  }
  
  try {
    const config = configManager.getConfig();
    return config?.verbose || false;
  } catch {
    // If config can't be read, default to not verbose
    return false;
  }
}

// Helper to check if a message should be logged
function shouldLog(level: 'log' | 'info' | 'debug', args: any[]): boolean {
  if (args.length === 0) return false;
  
  const firstArg = args[0];
  if (typeof firstArg === 'string') {
    // Always log errors from any component
    if (firstArg.includes('Error') || firstArg.includes('Failed')) return true;
    
    // If verbose is disabled, block EVERYTHING except errors
    if (!isVerboseEnabled()) {
      return false; // Block ALL non-error logs when verbose is off
    }
    
    // When verbose is enabled, still skip these extremely noisy logs
    if (firstArg.includes('[CommandExecutor]')) return false;
    if (firstArg.includes('[ShellPath]')) return false;
    if (firstArg.includes('[Database] Getting folders')) return false;
    if (firstArg.includes('[WorktreeManager]') && firstArg.includes('called with')) return false;
    // Skip git status polling logs
    if (firstArg.includes('[GitStatus]') && !firstArg.includes('error') && !firstArg.includes('failed')) return false;
    if (firstArg.includes('[Git]') && firstArg.includes('Refreshing git status')) return false;
    // Skip individual git status updates from frontend
    if (firstArg.includes('Git status updated:')) return false;
    if (firstArg.includes('Git status:') && firstArg.includes('→')) return false;
    // Skip verbose git status manager logs
    if (firstArg.includes('Polling git status for')) return false;
    if (firstArg.includes('Using cached status for')) return false;
    if (firstArg.includes('[IPC:git] Getting commits')) return false;
    if (firstArg.includes('[IPC:git] Project path:')) return false;
    if (firstArg.includes('[IPC:git] Using main branch:')) return false;
    
    // Log everything else when verbose is enabled
    return true;
  }
  
  return isVerboseEnabled(); // Default to verbose setting
}

// Override console methods
export function setupConsoleWrapper() {
  console.log = (...args: any[]) => {
    if (shouldLog('log', args)) {
      originalConsole.log(...args);
    }
  };
  
  console.info = (...args: any[]) => {
    if (shouldLog('info', args)) {
      originalConsole.info(...args);
    }
  };
  
  console.debug = (...args: any[]) => {
    if (shouldLog('debug', args)) {
      originalConsole.debug(...args);
    }
  };
  
  // Always log warnings and errors
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

// Function to update the config manager after it's initialized
export function updateConfigManager(cm: ConfigManager) {
  configManager = cm;
}

// Export original console for critical logging
export { originalConsole };
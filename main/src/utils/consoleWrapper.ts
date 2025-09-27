// Simple console wrapper to reduce logging in production
// This follows the existing pattern in the codebase

const isDevelopment = process.env.NODE_ENV !== 'production' && !((global as { isPackaged?: boolean }).isPackaged);

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug
};

// Helper to check if a message should be logged
function shouldLog(level: 'log' | 'info' | 'debug', args: unknown[]): boolean {
  if (args.length === 0) return false;
  const firstArg = args[0];
  if (typeof firstArg === 'string') {
    // Always log [Main] messages as they're important startup info
    if (firstArg.includes('[Main]')) return true;
    // Always log errors from any component
    if (firstArg.includes('Error') || firstArg.includes('Failed')) return true;
    
    // Skip verbose logging from these components in both dev and production
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
    
    // In development, log everything else
    if (isDevelopment) {
      return true;
    }
  }
  
  return !isDevelopment; // In production, default to not logging
}

// Override console methods
export function setupConsoleWrapper() {
  console.log = (...args: unknown[]) => {
    if (shouldLog('log', args)) {
      originalConsole.log(...args);
    }
  };
  
  console.info = (...args: unknown[]) => {
    if (shouldLog('info', args)) {
      originalConsole.info(...args);
    }
  };
  
  console.debug = (...args: unknown[]) => {
    if (shouldLog('debug', args)) {
      originalConsole.debug(...args);
    }
  };
  
  // Always log warnings and errors
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

// Export original console for critical logging
export { originalConsole };
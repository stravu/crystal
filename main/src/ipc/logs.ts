import { ipcMain } from 'electron';
import { SessionManager } from '../services/sessionManager';
import { mainWindow } from '../index';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

// Store logs per session in memory
const sessionLogs = new Map<string, LogEntry[]>();

export function setupLogHandlers(sessionManager: SessionManager) {
  // Get logs for a session
  ipcMain.handle('sessions:get-logs', async (_event, sessionId: string) => {
    try {
      const logs = sessionLogs.get(sessionId) || [];
      return { success: true, data: logs };
    } catch (error) {
      console.error('Failed to get logs:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get logs' 
      };
    }
  });

  // Clear logs for a session
  ipcMain.handle('sessions:clear-logs', async (_event, sessionId: string) => {
    try {
      sessionLogs.set(sessionId, []);
      return { success: true };
    } catch (error) {
      console.error('Failed to clear logs:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to clear logs' 
      };
    }
  });

  // Add a log entry
  ipcMain.handle('sessions:add-log', async (_event, sessionId: string, entry: LogEntry) => {
    try {
      const logs = sessionLogs.get(sessionId) || [];
      logs.push(entry);
      sessionLogs.set(sessionId, logs);
      
      // Send the log entry to the renderer
      if (mainWindow) {
        mainWindow.webContents.send('session-log', {
          sessionId,
          entry
        });
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to add log:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to add log' 
      };
    }
  });
}

// Helper function to add a log from internal sources
export function addSessionLog(sessionId: string, level: LogEntry['level'], message: string, source?: string) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    source
  };
  
  const logs = sessionLogs.get(sessionId) || [];
  logs.push(entry);
  sessionLogs.set(sessionId, logs);
  
  // Send the log entry to the renderer
  if (mainWindow) {
    mainWindow.webContents.send('session-log', {
      sessionId,
      entry
    });
  }
}

// Helper to clean up logs when a session is deleted or when starting a new run
export function cleanupSessionLogs(sessionId: string) {
  sessionLogs.delete(sessionId);
  
  // Notify the frontend to clear logs
  if (mainWindow) {
    mainWindow.webContents.send('session-logs-cleared', { sessionId });
  }
}
import type { ConfigManager } from '../services/configManager';
import * as fs from 'fs';
import * as path from 'path';
import { getCrystalSubdirectory } from './crystalDirectory';
import { formatForDatabase } from './timestampUtils';

// Capture the ORIGINAL console methods immediately when this module loads
// This must happen before any other code can override them
const ORIGINAL_CONSOLE = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

export class Logger {
  private logDir: string;
  private currentLogFile: string;
  private logStream: fs.WriteStream | null = null;
  private currentLogSize = 0;
  private readonly MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_LOG_FILES = 5;
  private originalConsole = ORIGINAL_CONSOLE;
  private isReinitializing = false;
  private writeQueue: Array<{ message: string; callback?: (error?: Error) => void }> = [];
  private isProcessingQueue = false;
  private isInErrorHandler = false; // Prevent recursion in error handling

  constructor(private configManager: ConfigManager) {
    // Use the centralized Crystal directory
    this.logDir = getCrystalSubdirectory('logs');
    
    this.currentLogFile = this.getCurrentLogFileName();
    this.initializeLogger();
  }

  private initializeLogger() {
    if (this.isReinitializing) {
      return; // Prevent multiple simultaneous reinitializations
    }
    
    this.isReinitializing = true;
    
    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Check if current log file exists and get its size
      if (fs.existsSync(this.currentLogFile)) {
        const stats = fs.statSync(this.currentLogFile);
        this.currentLogSize = stats.size;
      }

      // Open write stream in append mode
      this.logStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
      
      // Clean up old log files
      this.cleanupOldLogs();
      
      // Process any queued writes
      this.processWriteQueue();
    } catch (error) {
      this.originalConsole.error('[Logger] Failed to initialize file logging:', error);
    } finally {
      this.isReinitializing = false;
    }
  }

  private getCurrentLogFileName(): string {
    const date = formatForDatabase().split('T')[0]; // YYYY-MM-DD
    return path.join(this.logDir, `crystal-${date}.log`);
  }

  private rotateLogIfNeeded() {
    if (this.currentLogSize >= this.MAX_LOG_SIZE) {
      try {
        // Close current stream
        if (this.logStream) {
          this.logStream.end();
        }

        // Generate new filename with timestamp
        const timestamp = formatForDatabase().replace(/[:.]/g, '-');
        const rotatedFileName = path.join(this.logDir, `crystal-${timestamp}.log`);
        
        // Rename current file
        fs.renameSync(this.currentLogFile, rotatedFileName);

        // Reset and create new log file
        this.currentLogSize = 0;
        this.logStream = fs.createWriteStream(this.currentLogFile, { flags: 'a' });
        
        // Clean up old logs
        this.cleanupOldLogs();
      } catch (error) {
        this.originalConsole.error('[Logger] Failed to rotate log:', error);
      }
    }
  }

  private cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(file => file.startsWith('crystal-') && file.endsWith('.log'))
        .map(file => ({
          name: file,
          path: path.join(this.logDir, file),
          mtime: fs.statSync(path.join(this.logDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Keep only the most recent MAX_LOG_FILES
      if (files.length > this.MAX_LOG_FILES) {
        const filesToDelete = files.slice(this.MAX_LOG_FILES);
        filesToDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            this.originalConsole.error(`[Logger] Failed to delete old log ${file.name}:`, error);
          }
        });
      }
    } catch (error) {
      this.originalConsole.error('[Logger] Failed to cleanup old logs:', error);
    }
  }

  private writeToFile(logMessage: string) {
    const messageWithNewline = logMessage + '\n';
    
    // Add to queue
    this.writeQueue.push({
      message: messageWithNewline,
      callback: (error) => {
        if (error) {
          this.handleWriteError(error);
        }
      }
    });
    
    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      this.processWriteQueue();
    }
  }
  
  private processWriteQueue() {
    if (this.isProcessingQueue || this.writeQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    const processNext = () => {
      if (this.writeQueue.length === 0) {
        this.isProcessingQueue = false;
        return;
      }
      
      const { message, callback } = this.writeQueue.shift()!;
      
      if (!this.logStream || this.logStream.destroyed) {
        // Queue the write for after reinitialization
        this.writeQueue.unshift({ message, callback });
        this.isProcessingQueue = false;
        if (!this.isReinitializing) {
          this.initializeLogger();
        }
        return;
      }
      
      const messageSize = Buffer.byteLength(message);
      
      // Check if we need to rotate before writing
      if (this.currentLogSize + messageSize >= this.MAX_LOG_SIZE) {
        this.rotateLogIfNeeded();
      }
      
      // Write with callback
      this.logStream.write(message, (writeError) => {
        if (writeError) {
          if (callback) callback(writeError);
        } else {
          // Only increment size on successful write
          this.currentLogSize += messageSize;
        }
        
        // Process next item in queue
        processNext();
      });
    };
    
    processNext();
  }
  
  private handleWriteError(error: NodeJS.ErrnoException) {
    if (error.code === 'EPIPE') {
      // Stream was closed, reinitialize
      this.logStream = null;
      if (!this.isReinitializing) {
        this.initializeLogger();
      }
    } else {
      // Only log non-EPIPE errors to avoid infinite recursion
      try {
        this.originalConsole.error('[Logger] Failed to write to log file:', error);
      } catch {
        // Silently fail if console is also broken
      }
    }
  }

  private log(level: string, message: string, error?: Error) {
    const timestamp = formatForDatabase();
    const errorInfo = error ? ` Error: ${error.message}\nStack: ${error.stack}` : '';
    const fullMessage = `[${timestamp}] ${level}: ${message}${errorInfo}`;
    
    // Try to log to console, but handle EPIPE errors gracefully
    try {
      // Always log to console using the original console method to avoid recursion
      this.originalConsole.log(fullMessage);
    } catch (consoleError: unknown) {
      // If console logging fails (e.g., EPIPE), just write to file
      if ((consoleError as NodeJS.ErrnoException)?.code !== 'EPIPE' && !this.isInErrorHandler) {
        // Prevent recursion by setting flag
        this.isInErrorHandler = true;
        try {
          // For non-EPIPE errors, try to at least write the error to file
          // Use a direct write to avoid potential recursion through writeToFile
          const errorMessage = `[${timestamp}] ERROR: Failed to write to console: ${(consoleError as Error)?.message || 'Unknown error'}\n`;
          if (this.logStream && !this.logStream.destroyed) {
            this.logStream.write(errorMessage);
          }
        } catch {
          // Silently fail - we've done our best
        } finally {
          this.isInErrorHandler = false;
        }
      }
    }
    
    // Also write to file (unless we're in error handler to prevent recursion)
    if (!this.isInErrorHandler) {
      this.writeToFile(fullMessage);
    }
  }

  verbose(message: string) {
    if (this.configManager.isVerbose()) {
      this.log('VERBOSE', message);
    }
  }

  info(message: string) {
    this.log('INFO', message);
  }

  warn(message: string, error?: Error) {
    this.log('WARN', message, error);
  }

  error(message: string, error?: Error) {
    this.log('ERROR', message, error);
  }

  // Close the log stream when shutting down
  close() {
    // Clear the write queue
    this.writeQueue = [];
    this.isProcessingQueue = false;
    
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}
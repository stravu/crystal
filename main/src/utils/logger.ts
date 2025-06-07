import type { ConfigManager } from '../services/configManager';

export class Logger {
  constructor(private configManager: ConfigManager) {}

  private log(level: string, message: string, error?: Error) {
    const timestamp = new Date().toISOString();
    const errorInfo = error ? ` Error: ${error.message}\nStack: ${error.stack}` : '';
    console.log(`[${timestamp}] ${level}: ${message}${errorInfo}`);
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
}
/**
 * ScriptExecutionTracker - Centralized service for tracking script execution state
 *
 * This service manages the state of running scripts for both sessions and projects,
 * ensuring only one script can run at a time and providing a unified interface
 * for script state management.
 */

import { EventEmitter } from 'events';
import { mainWindow } from '../index';

export type ScriptType = 'session' | 'project';

export interface RunningScriptInfo {
  type: ScriptType;
  id: string | number; // sessionId or projectId
  sessionId?: string; // The actual session where the script is running
  startedAt: Date;
}

export class ScriptExecutionTracker extends EventEmitter {
  private static instance: ScriptExecutionTracker;
  private runningScript: RunningScriptInfo | null = null;
  private closingScript: RunningScriptInfo | null = null;

  private constructor() {
    super();
  }

  static getInstance(): ScriptExecutionTracker {
    if (!ScriptExecutionTracker.instance) {
      ScriptExecutionTracker.instance = new ScriptExecutionTracker();
    }
    return ScriptExecutionTracker.instance;
  }

  /**
   * Get information about the currently running script
   */
  getRunningScript(): RunningScriptInfo | null {
    return this.runningScript;
  }

  /**
   * Get the ID of the currently running script (for backward compatibility)
   */
  getRunningScriptId(type: ScriptType): string | number | null {
    if (!this.runningScript || this.runningScript.type !== type) {
      return null;
    }
    return this.runningScript.id;
  }

  /**
   * Check if a specific script is currently running
   */
  isRunning(type: ScriptType, id: string | number): boolean {
    return (
      this.runningScript !== null &&
      this.runningScript.type === type &&
      this.runningScript.id === id
    );
  }

  /**
   * Check if a specific script is currently closing
   */
  isClosing(type: ScriptType, id: string | number): boolean {
    return (
      this.closingScript !== null &&
      this.closingScript.type === type &&
      this.closingScript.id === id
    );
  }

  /**
   * Mark a script as starting
   */
  start(type: ScriptType, id: string | number, sessionId?: string): void {
    // If there's already a running script of a different type/id, it should be stopped first
    if (this.runningScript && (this.runningScript.type !== type || this.runningScript.id !== id)) {
      console.warn(
        `[ScriptExecutionTracker] Starting ${type}:${id} while ${this.runningScript.type}:${this.runningScript.id} is still running`
      );
    }

    this.runningScript = {
      type,
      id,
      sessionId,
      startedAt: new Date()
    };

    this.closingScript = null;

    // Emit events to notify frontend
    this.emitStateChange(type, id);
    this.emit('script-started', { type, id, sessionId });
  }

  /**
   * Mark a script as closing (stopping in progress)
   */
  markClosing(type: ScriptType, id: string | number): void {
    if (!this.isRunning(type, id)) {
      console.warn(`[ScriptExecutionTracker] Cannot mark ${type}:${id} as closing - not running`);
      return;
    }

    this.closingScript = this.runningScript;

    // Emit closing event to notify frontend
    if (mainWindow) {
      if (type === 'session') {
        mainWindow.webContents.send('script-closing', id);
      } else {
        mainWindow.webContents.send('project-script-closing', { projectId: id });
      }
    }

    this.emit('script-closing', { type, id });
  }

  /**
   * Mark a script as stopped
   */
  stop(type: ScriptType, id: string | number): void {
    if (!this.isRunning(type, id) && !this.isClosing(type, id)) {
      // Script might have already been stopped, which is fine
      return;
    }

    this.runningScript = null;
    this.closingScript = null;

    // Emit events to notify frontend
    this.emitStateChange(type, null);
    this.emit('script-stopped', { type, id });
  }

  /**
   * Emit state change events to frontend based on type
   */
  private emitStateChange(type: ScriptType, id: string | number | null): void {
    if (!mainWindow) return;

    if (type === 'session') {
      mainWindow.webContents.send('script-session-changed', id);
    } else {
      mainWindow.webContents.send('project-script-changed', { projectId: id });
    }
  }

  /**
   * Clear all script state (useful for cleanup/reset)
   */
  clear(): void {
    this.runningScript = null;
    this.closingScript = null;
  }
}

// Export singleton instance
export const scriptExecutionTracker = ScriptExecutionTracker.getInstance();

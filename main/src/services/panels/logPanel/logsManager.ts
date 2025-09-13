import { ChildProcess, spawn } from 'child_process';
import { ToolPanel, LogsPanelState } from '../../../../../shared/types/panels';
import { panelManager } from '../../panelManager';
import { addSessionLog, cleanupSessionLogs } from '../../../ipc/logs';
import { mainWindow } from '../../../index';
import { getShellPath } from '../../../utils/shellPath';

export class LogsManager {
  private static instance: LogsManager;
  private activeProcesses = new Map<string, ChildProcess>(); // panelId -> process
  
  static getInstance(): LogsManager {
    if (!LogsManager.instance) {
      LogsManager.instance = new LogsManager();
    }
    return LogsManager.instance;
  }

  /**
   * Get or create singleton logs panel for session
   */
  async getOrCreateLogsPanel(sessionId: string): Promise<ToolPanel> {
    const panels = await panelManager.getPanelsForSession(sessionId);
    const existingLogs = panels.find((p: ToolPanel) => p.type === 'logs');
    
    if (existingLogs) {
      // Clear existing panel output
      await this.clearPanel(existingLogs.id);
      return existingLogs;
    }
    
    // Create new logs panel
    return await panelManager.createPanel({
      sessionId,
      type: 'logs',
      title: 'Logs'
    });
  }
  
  /**
   * Clear panel output and reset state
   */
  async clearPanel(panelId: string): Promise<void> {
    const panel = await panelManager.getPanel(panelId);
    if (!panel) return;
    
    // Clear session logs
    cleanupSessionLogs(panel.sessionId);
    
    // Reset panel state
    await panelManager.updatePanel(panelId, {
      state: {
        ...panel.state,
        customState: {
          isRunning: false,
          processId: undefined,
          command: undefined,
          startTime: undefined,
          endTime: undefined,
          exitCode: undefined,
          outputBuffer: [],
          errorCount: 0,
          warningCount: 0,
          lastActivityTime: undefined
        } as LogsPanelState
      }
    });
  }
  
  /**
   * Run a script in the logs panel
   */
  async runScript(sessionId: string, command: string, cwd: string): Promise<void> {
    // Get or create logs panel
    const panel = await this.getOrCreateLogsPanel(sessionId);
    
    // Stop any existing process for this panel
    await this.stopScript(panel.id);
    
    // Clear previous content
    await this.clearPanel(panel.id);
    
    // Small delay to ensure frontend processes the clear event
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Update panel state to running
    const startTime = new Date().toISOString();
    await panelManager.updatePanel(panel.id, {
      state: {
        ...panel.state,
        customState: {
          isRunning: true,
          command,
          startTime,
          outputBuffer: [],
          errorCount: 0,
          warningCount: 0,
          lastActivityTime: startTime
        } as LogsPanelState
      }
    });
    
    // Make panel active
    await panelManager.setActivePanel(sessionId, panel.id);
    
    // Emit process started event
    if (mainWindow) {
      mainWindow.webContents.send('panel:event', {
        type: 'process:started',
        source: {
          panelId: panel.id,
          panelType: 'logs',
          sessionId
        },
        data: { command, cwd },
        timestamp: startTime
      });
    }
    
    // Get enhanced shell PATH for packaged apps
    const shellPath = getShellPath();
    
    // Start process with shell
    const childProcess = spawn(command, [], {
      cwd,
      shell: true,
      env: {
        ...process.env,
        PATH: shellPath
      }
    });
    
    if (childProcess.pid) {
      // Store process reference
      this.activeProcesses.set(panel.id, childProcess);
      
      // Update panel with process ID
      await panelManager.updatePanel(panel.id, {
        state: {
          ...panel.state,
          customState: {
            ...(panel.state.customState as LogsPanelState),
            processId: childProcess.pid
          } as LogsPanelState
        }
      });
      
      // Stream stdout
      childProcess.stdout?.on('data', (data) => {
        this.handleOutput(panel.id, sessionId, data.toString(), 'stdout');
      });
      
      // Stream stderr
      childProcess.stderr?.on('data', (data) => {
        this.handleOutput(panel.id, sessionId, data.toString(), 'stderr');
      });
      
      // Handle process exit
      childProcess.on('exit', (code) => {
        this.handleProcessExit(panel.id, sessionId, code);
      });
      
      // Handle process error
      childProcess.on('error', (error) => {
        this.handleOutput(panel.id, sessionId, `Process error: ${error.message}`, 'stderr');
        this.handleProcessExit(panel.id, sessionId, 1);
      });
    } else {
      // Process failed to start
      this.handleOutput(panel.id, sessionId, 'Failed to start process', 'stderr');
      this.handleProcessExit(panel.id, sessionId, 1);
    }
  }
  
  /**
   * Stop a running script
   */
  async stopScript(panelId: string): Promise<void> {
    const childProcess = this.activeProcesses.get(panelId);
    if (!childProcess) return;
    
    // Kill process tree (similar to how sessionManager does it)
    if (childProcess.pid) {
      try {
        // On Windows, use taskkill to kill the process tree
        if (require('os').platform() === 'win32') {
          require('child_process').exec(`taskkill /pid ${childProcess.pid} /T /F`);
        } else {
          // On Unix, kill the process group
          childProcess.kill('SIGTERM');
          
          // Give it a moment to terminate gracefully
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error killing process:', error);
      }
    }
    
    // Remove from active processes
    this.activeProcesses.delete(panelId);
  }
  
  /**
   * Handle process output
   */
  private async handleOutput(panelId: string, sessionId: string, content: string, type: 'stdout' | 'stderr'): Promise<void> {
    // Add to session logs
    const level = type === 'stderr' ? 'error' : 'info';
    addSessionLog(sessionId, level, content, 'Script');
    
    // Emit output event
    if (mainWindow) {
      mainWindow.webContents.send('panel:event', {
        type: 'process:output',
        source: {
          panelId,
          panelType: 'logs',
          sessionId
        },
        data: { content, type },
        timestamp: new Date().toISOString()
      });
      
      // Also send logs-specific output event for the panel
      mainWindow.webContents.send('logs:output', {
        panelId,
        content,
        type
      });
    }
    
    // Update panel state
    const panel = await panelManager.getPanel(panelId);
    if (panel) {
      const currentState = panel.state.customState as LogsPanelState || {};
      const outputBuffer = currentState.outputBuffer || [];
      outputBuffer.push(content);
      
      // Keep only last 1000 lines in buffer
      if (outputBuffer.length > 1000) {
        outputBuffer.splice(0, outputBuffer.length - 1000);
      }
      
      // Count errors and warnings
      let errorCount = currentState.errorCount || 0;
      let warningCount = currentState.warningCount || 0;
      
      if (type === 'stderr' || content.toLowerCase().includes('error')) {
        errorCount++;
      }
      if (content.toLowerCase().includes('warning')) {
        warningCount++;
      }
      
      await panelManager.updatePanel(panelId, {
        state: {
          ...panel.state,
          customState: {
            ...currentState,
            outputBuffer,
            errorCount,
            warningCount,
            lastActivityTime: new Date().toISOString()
          } as LogsPanelState
        }
      });
    }
  }
  
  /**
   * Handle process exit
   */
  private async handleProcessExit(panelId: string, sessionId: string, code: number | null): Promise<void> {
    // Remove from active processes
    this.activeProcesses.delete(panelId);
    
    // Update panel state
    const panel = await panelManager.getPanel(panelId);
    if (panel) {
      const currentState = panel.state.customState as LogsPanelState || {};
      await panelManager.updatePanel(panelId, {
        state: {
          ...panel.state,
          customState: {
            ...currentState,
            isRunning: false,
            endTime: new Date().toISOString(),
            exitCode: code ?? undefined
          } as LogsPanelState
        }
      });
    }
    
    // Emit process ended event
    if (mainWindow) {
      mainWindow.webContents.send('panel:event', {
        type: 'process:ended',
        source: {
          panelId,
          panelType: 'logs',
          sessionId
        },
        data: { exitCode: code },
        timestamp: new Date().toISOString()
      });
      
      // Also send specific event for the panel
      mainWindow.webContents.send('process:ended', {
        panelId,
        exitCode: code
      });
    }
    
    // Add final log entry
    const message = code === 0 
      ? 'Process completed successfully'
      : `Process exited with code ${code}`;
    addSessionLog(sessionId, code === 0 ? 'info' : 'error', message, 'Script');
  }
  
  /**
   * Check if a logs panel is running for a session
   */
  async isRunning(sessionId: string): Promise<boolean> {
    const panels = await panelManager.getPanelsForSession(sessionId);
    const logsPanel = panels.find((p: ToolPanel) => p.type === 'logs');
    
    if (!logsPanel) return false;
    
    const state = logsPanel.state.customState as LogsPanelState;
    return state?.isRunning || false;
  }
  
  /**
   * Get the running process for a session's logs panel
   */
  async getRunningProcess(sessionId: string): Promise<ChildProcess | undefined> {
    const panels = await panelManager.getPanelsForSession(sessionId);
    const logsPanel = panels.find((p: ToolPanel) => p.type === 'logs');
    
    if (!logsPanel) return undefined;
    
    return this.activeProcesses.get(logsPanel.id);
  }
  
  /**
   * Cleanup all running processes
   */
  async cleanup(): Promise<void> {
    // Stop all running processes
    for (const [panelId, process] of this.activeProcesses) {
      await this.stopScript(panelId);
    }
    this.activeProcesses.clear();
  }
}

export const logsManager = LogsManager.getInstance();
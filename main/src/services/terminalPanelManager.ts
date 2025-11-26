import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { ToolPanel, TerminalPanelState, PanelEventType } from '../../../shared/types/panels';
import { panelManager } from './panelManager';
import { mainWindow } from '../index';
import * as os from 'os';
import * as path from 'path';
import { getShellPath } from '../utils/shellPath';
import { ShellDetector } from '../utils/shellDetector';
import type { AnalyticsManager } from './analyticsManager';

interface TerminalProcess {
  pty: pty.IPty;
  panelId: string;
  sessionId: string;
  scrollbackBuffer: string;
  commandHistory: string[];
  currentCommand: string;
  lastActivity: Date;
}

export class TerminalPanelManager {
  private terminals = new Map<string, TerminalProcess>();
  private readonly MAX_SCROLLBACK_LINES = 10000;
  private analyticsManager: AnalyticsManager | null = null;

  setAnalyticsManager(analyticsManager: AnalyticsManager): void {
    this.analyticsManager = analyticsManager;
  }

  async initializeTerminal(panel: ToolPanel, cwd: string): Promise<void> {
    if (this.terminals.has(panel.id)) {
      return;
    }
    
    
    // Determine shell based on platform using the detector from the legacy terminal manager
    const shellInfo = ShellDetector.getDefaultShell();

    const isLinux = process.platform === 'linux';
    const enhancedPath = isLinux ? (process.env.PATH || '') : getShellPath();
    
    // Create PTY process with enhanced environment
    const ptyProcess = pty.spawn(shellInfo.path, shellInfo.args || [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: cwd,
      env: {
        ...process.env,
        PATH: enhancedPath,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: process.env.LANG || 'en_US.UTF-8',
        WORKTREE_PATH: cwd,
        CRYSTAL_SESSION_ID: panel.sessionId,
        CRYSTAL_PANEL_ID: panel.id
      }
    });
    
    // Create terminal process object
    const terminalProcess: TerminalProcess = {
      pty: ptyProcess,
      panelId: panel.id,
      sessionId: panel.sessionId,
      scrollbackBuffer: '',
      commandHistory: [],
      currentCommand: '',
      lastActivity: new Date()
    };
    
    // Store in map
    this.terminals.set(panel.id, terminalProcess);
    
    // Set up event handlers
    this.setupTerminalHandlers(terminalProcess);
    
    // Update panel state
    const state = panel.state;
    state.customState = {
      ...state.customState,
      isInitialized: true,
      cwd: cwd,
      shellType: shellInfo.name || path.basename(shellInfo.path),
      dimensions: { cols: 80, rows: 30 }
    } as TerminalPanelState;
    
    await panelManager.updatePanel(panel.id, { state });

    // NOTE: terminal_panel_created analytics tracking has been moved to panelManager.createPanel()
    // to ensure it only fires when users explicitly create new panels, not during app restoration
    // or when panels are initialized for viewing.

  }
  
  private setupTerminalHandlers(terminal: TerminalProcess): void {
    // Handle terminal output
    terminal.pty.onData((data: string) => {
      // Update last activity
      terminal.lastActivity = new Date();
      
      // Add to scrollback buffer
      this.addToScrollback(terminal, data);
      
      // Detect commands (simple heuristic - look for carriage returns)
      if (data.includes('\r') || data.includes('\n')) {
        if (terminal.currentCommand.trim()) {
          terminal.commandHistory.push(terminal.currentCommand);
          
          // Emit command executed event
          panelManager.emitPanelEvent(
            terminal.panelId,
            'terminal:command_executed',
            {
              command: terminal.currentCommand,
              timestamp: new Date().toISOString()
            }
          );
          
          // Check for file operation commands
          if (this.isFileOperationCommand(terminal.currentCommand)) {
            panelManager.emitPanelEvent(
              terminal.panelId,
              'files:changed',
              {
                command: terminal.currentCommand,
                timestamp: new Date().toISOString()
              }
            );
          }
          
          terminal.currentCommand = '';
        }
      } else {
        // Accumulate command input
        terminal.currentCommand += data;
      }
      
      // Send output to frontend
      if (mainWindow) {
        mainWindow.webContents.send('terminal:output', {
          sessionId: terminal.sessionId,
          panelId: terminal.panelId,
          output: data
        });
      }
    });
    
    // Handle terminal exit
    terminal.pty.onExit((exitCode: { exitCode: number; signal?: number }) => {
      // Emit exit event
      panelManager.emitPanelEvent(
        terminal.panelId,
        'terminal:exit',
        {
          exitCode: exitCode.exitCode,
          signal: exitCode.signal,
          timestamp: new Date().toISOString()
        }
      );
      
      // Clean up
      this.terminals.delete(terminal.panelId);
      
      // Notify frontend
      if (mainWindow) {
        mainWindow.webContents.send('terminal:exited', {
          sessionId: terminal.sessionId,
          panelId: terminal.panelId,
          exitCode: exitCode.exitCode
        });
      }
    });
  }
  
  private addToScrollback(terminal: TerminalProcess, data: string): void {
    // Add raw data to scrollback buffer
    terminal.scrollbackBuffer += data;
    
    // Trim buffer if it exceeds max size (keep last ~500KB of data)
    const maxBufferSize = 500000; // 500KB
    if (terminal.scrollbackBuffer.length > maxBufferSize) {
      // Keep the most recent data
      terminal.scrollbackBuffer = terminal.scrollbackBuffer.slice(-maxBufferSize);
    }
  }
  
  private isFileOperationCommand(command: string): boolean {
    const fileOperations = [
      'touch', 'rm', 'mv', 'cp', 'mkdir', 'rmdir',
      'cat >', 'echo >', 'echo >>', 'vim', 'vi', 'nano', 'emacs',
      'git add', 'git rm', 'git mv'
    ];
    
    const trimmedCommand = command.trim().toLowerCase();
    return fileOperations.some(op => trimmedCommand.startsWith(op));
  }
  
  isTerminalInitialized(panelId: string): boolean {
    return this.terminals.has(panelId);
  }
  
  writeToTerminal(panelId: string, data: string): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      console.warn(`[TerminalPanelManager] Terminal ${panelId} not found`);
      return;
    }
    
    terminal.pty.write(data);
    terminal.lastActivity = new Date();
  }
  
  resizeTerminal(panelId: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      console.warn(`[TerminalPanelManager] Terminal ${panelId} not found for resize`);
      return;
    }
    
    terminal.pty.resize(cols, rows);
    
    // Update panel state with new dimensions
    const panel = panelManager.getPanel(panelId);
    if (panel) {
      const state = panel.state;
      state.customState = {
        ...state.customState,
        dimensions: { cols, rows }
      } as TerminalPanelState;
      panelManager.updatePanel(panelId, { state });
    }
  }
  
  async saveTerminalState(panelId: string): Promise<void> {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      console.warn(`[TerminalPanelManager] Terminal ${panelId} not found for state save`);
      return;
    }
    
    const panel = panelManager.getPanel(panelId);
    if (!panel) return;
    
    // Get current working directory (if possible)
    let cwd = (panel.state.customState && 'cwd' in panel.state.customState) ? panel.state.customState.cwd : undefined;
    cwd = cwd || process.cwd();
    try {
      // Try to get CWD from process (platform-specific)
      if (process.platform !== 'win32') {
        const pid = terminal.pty.pid;
        if (pid) {
          // This is a simplified approach - in production you might use platform-specific methods
          cwd = await this.getProcessCwd(pid);
        }
      }
    } catch (error) {
      console.warn(`[TerminalPanelManager] Could not get CWD for terminal ${panelId}:`, error);
    }
    
    // Save state to panel
    const state = panel.state;
    state.customState = {
      ...state.customState,
      isInitialized: true,
      cwd: cwd,
      scrollbackBuffer: terminal.scrollbackBuffer,
      commandHistory: terminal.commandHistory.slice(-100), // Keep last 100 commands
      lastActivityTime: terminal.lastActivity.toISOString(),
      lastActiveCommand: terminal.currentCommand
    } as TerminalPanelState;
    
    await panelManager.updatePanel(panelId, { state });
    
  }
  
  private async getProcessCwd(pid: number): Promise<string> {
    // This is platform-specific and simplified
    // In production, you'd use more robust methods
    if (process.platform === 'darwin' || process.platform === 'linux') {
      try {
        const fs = require('fs').promises;
        const cwdLink = `/proc/${pid}/cwd`;
        return await fs.readlink(cwdLink);
      } catch {
        return process.cwd();
      }
    }
    return process.cwd();
  }
  
  async restoreTerminalState(panel: ToolPanel, state: TerminalPanelState): Promise<void> {
    if (!state.scrollbackBuffer || state.scrollbackBuffer.length === 0) {
      return;
    }
    
    // Initialize terminal first
    await this.initializeTerminal(panel, state.cwd || process.cwd());
    
    const terminal = this.terminals.get(panel.id);
    if (!terminal) return;
    
    // Restore scrollback buffer (handle both string and array formats)
    if (typeof state.scrollbackBuffer === 'string') {
      terminal.scrollbackBuffer = state.scrollbackBuffer;
    } else if (Array.isArray(state.scrollbackBuffer)) {
      // Convert legacy array format to string
      terminal.scrollbackBuffer = state.scrollbackBuffer.join('\n');
    } else {
      terminal.scrollbackBuffer = '';
    }
    terminal.commandHistory = state.commandHistory || [];
    
    // Send restoration indicator to terminal
    const restorationMsg = `\r\n[Session Restored from ${state.lastActivityTime || 'previous session'}]\r\n`;
    terminal.pty.write(restorationMsg);
    
    // Send scrollback to frontend
    if (mainWindow && state.scrollbackBuffer) {
      mainWindow.webContents.send('terminal:output', {
        sessionId: panel.sessionId,
        panelId: panel.id,
        output: state.scrollbackBuffer + restorationMsg
      });
    }
  }
  
  getTerminalState(panelId: string): TerminalPanelState | null {
    const terminal = this.terminals.get(panelId);
    if (!terminal) return null;
    
    return {
      isInitialized: true,
      cwd: process.cwd(), // Simplified - would need platform-specific implementation
      shellType: process.env.SHELL || 'bash',
      scrollbackBuffer: terminal.scrollbackBuffer,
      commandHistory: terminal.commandHistory,
      lastActivityTime: terminal.lastActivity.toISOString(),
      lastActiveCommand: terminal.currentCommand
    };
  }
  
  destroyTerminal(panelId: string): void {
    const terminal = this.terminals.get(panelId);
    if (!terminal) {
      return;
    }
    
    // Save state before destroying
    this.saveTerminalState(panelId);
    
    // Kill the PTY process
    try {
      terminal.pty.kill();
    } catch (error) {
      console.error(`[TerminalPanelManager] Error killing terminal ${panelId}:`, error);
    }
    
    // Remove from map
    this.terminals.delete(panelId);
  }
  
  destroyAllTerminals(): void {
    for (const [panelId, terminal] of this.terminals) {
      try {
        terminal.pty.kill();
      } catch (error) {
        console.error(`[TerminalPanelManager] Error killing terminal ${panelId}:`, error);
      }
    }
    
    this.terminals.clear();
  }
  
  getActiveTerminals(): string[] {
    return Array.from(this.terminals.keys());
  }
}

// Export singleton instance
export const terminalPanelManager = new TerminalPanelManager();

# Logs Panel REFACTOR Plan

## Context: Tool Panel System Already Implemented

The Tool Panel system (Phases 1 & 2) has been successfully implemented as described in TOOL_PANEL_DESIGN.md. Terminal and Claude panels are working/planned. Logs will be a special singleton panel type.

**THIS IS A REFACTOR, NOT A REWRITE.** Every existing file will be moved to its new location and adapted minimally. No components will be rewritten from scratch.

**Core Principle**: MOVE files first, EDIT them second, NEVER rewrite.

## Special Characteristics of Logs Panel

**SINGLETON BEHAVIOR**: Unlike other panel types, there can only be ONE logs panel per session at any time.
- When running a script, the logs panel is automatically created if it doesn't exist
- If a logs panel already exists, it's cleared and reused
- Users cannot manually create additional logs panels
- The logs panel cannot be closed while a process is running

## Refactoring Goals

1. **100% Code Preservation**: Move ALL existing Logs files to new locations intact
2. **Singleton Panel**: Enforce single logs panel per session
3. **Auto-creation**: Automatically create when running scripts
4. **Clear-on-run**: Clear existing content when starting new run
5. **Process Integration**: Connect to existing run script functionality

## Current State Analysis

### Existing Logs Files (TO BE MOVED, NOT REWRITTEN)

#### Frontend Files to Move
- `frontend/src/components/LogsView.tsx` → Move to `frontend/src/components/panels/logs/LogsView.tsx`
- `frontend/src/components/RunScriptButton.tsx` → Keep in place, modify to use panel
- Any logs-related utilities → Move to `frontend/src/utils/logs/`

#### Backend Files
- Script execution logic in `main/src/ipc/session.ts` → Extract to `main/src/services/panels/logs/logsManager.ts`
- Process management code → Reuse existing, add panel routing

## Panel Type Definition

Add to `shared/types/panels.ts`:

```typescript
// Add to ToolPanelType enum
export type ToolPanelType = 'terminal' | 'claude' | 'editor' | 'logs';

// Add LogsPanelState interface
export interface LogsPanelState {
  isRunning: boolean;              // Process currently running
  processId?: number;              // Active process PID
  command?: string;                // Command being executed
  startTime?: string;              // When process started
  endTime?: string;                // When process ended
  exitCode?: number;               // Process exit code
  outputBuffer?: string[];         // Recent output lines
  errorCount?: number;             // Number of errors detected
  warningCount?: number;           // Number of warnings detected
  lastActivityTime?: string;       // Last output received
}

// Add to PANEL_CAPABILITIES
logs: {
  canEmit: ['process:started', 'process:output', 'process:ended'],
  canConsume: [],                  // Logs doesn't listen to other panels
  requiresProcess: true,            // Manages script processes
  singleton: true                   // ONLY ONE logs panel per session
}
```

## Implementation Plan

### Step 1: File Movement and Directory Setup

**Goal**: Move all Logs-related files to their new panel locations without breaking imports.

1. Create directory: `frontend/src/components/panels/logs/`
2. Use `git mv` to move files:
   ```bash
   git mv frontend/src/components/LogsView.tsx frontend/src/components/panels/logs/LogsView.tsx
   ```
3. Update all imports throughout the codebase
4. Run build to verify no broken imports

### Step 2: Create Logs Panel Manager

Create `main/src/services/panels/logs/logsManager.ts`:

```typescript
export class LogsManager {
  private activeProcesses = new Map<string, ChildProcess>(); // panelId -> process
  
  // Get or create singleton logs panel for session
  async getOrCreateLogsPanel(sessionId: string): Promise<ToolPanel> {
    const panels = await panelManager.getPanelsForSession(sessionId);
    const existingLogs = panels.find(p => p.type === 'logs');
    
    if (existingLogs) {
      // Clear existing panel
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
  
  async runScript(sessionId: string, command: string, cwd: string) {
    // Get or create logs panel
    const panel = await this.getOrCreateLogsPanel(sessionId);
    
    // Clear previous content
    await this.clearPanel(panel.id);
    
    // Update panel state to running
    await panelManager.updatePanel(panel.id, {
      state: {
        customState: {
          isRunning: true,
          command,
          startTime: new Date().toISOString()
        }
      }
    });
    
    // Make panel active
    await panelManager.setActivePanel(sessionId, panel.id);
    
    // Start process (reuse existing script execution code)
    const process = spawn(command, { cwd, shell: true });
    this.activeProcesses.set(panel.id, process);
    
    // Stream output to panel
    process.stdout.on('data', (data) => {
      this.sendOutput(panel.id, data.toString(), 'stdout');
    });
    
    process.stderr.on('data', (data) => {
      this.sendOutput(panel.id, data.toString(), 'stderr');
    });
    
    process.on('exit', (code) => {
      this.handleProcessExit(panel.id, code);
    });
  }
  
  async stopScript(panelId: string) {
    const process = this.activeProcesses.get(panelId);
    if (process) {
      process.kill();
      this.activeProcesses.delete(panelId);
    }
  }
}
```

### Step 3: Create Logs Panel Wrapper

Create `frontend/src/components/panels/logs/LogsPanel.tsx`:

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { LogsView } from './LogsView';
import { LogsPanelProps } from '../../../types/panelComponents';

export const LogsPanel: React.FC<LogsPanelProps> = ({ 
  panel, 
  isActive 
}) => {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const logsState = panel.state?.customState as LogsPanelState;
  
  // Listen for output events
  useEffect(() => {
    const handleOutput = (_, data: { panelId: string; content: string }) => {
      if (data.panelId === panel.id) {
        setOutput(prev => [...prev, data.content]);
      }
    };
    
    const handleProcessEnd = (_, data: { panelId: string; exitCode: number }) => {
      if (data.panelId === panel.id) {
        setIsRunning(false);
      }
    };
    
    window.electron.on('logs:output', handleOutput);
    window.electron.on('process:ended', handleProcessEnd);
    
    return () => {
      window.electron.off('logs:output', handleOutput);
      window.electron.off('process:ended', handleProcessEnd);
    };
  }, [panel.id]);
  
  // Set running state from panel state
  useEffect(() => {
    setIsRunning(logsState?.isRunning || false);
  }, [logsState?.isRunning]);
  
  const handleStop = () => {
    window.electron.invoke('logs:stop', panel.id);
  };
  
  return (
    <LogsView 
      output={output}
      isRunning={isRunning}
      onStop={handleStop}
      command={logsState?.command}
      startTime={logsState?.startTime}
    />
  );
};
```

### Step 4: Update Run Script Button

Modify `frontend/src/components/RunScriptButton.tsx`:

```typescript
const handleRunScript = async () => {
  // Old: Run script and show in logs tab
  // New: Run script which auto-creates/reuses logs panel
  
  await window.electron.invoke('logs:runScript', {
    sessionId: session.id,
    command: scriptCommand,
    cwd: session.worktreePath
  });
  
  // The backend will:
  // 1. Create logs panel if needed
  // 2. Clear existing logs panel if present
  // 3. Make logs panel active
  // 4. Start streaming output
};
```

### Step 5: Singleton Enforcement

Edit `frontend/src/components/panels/PanelTabBar.tsx`:

```typescript
// In the Add Tool dropdown, filter out 'logs' if one already exists
const availablePanelTypes = Object.keys(PANEL_CAPABILITIES)
  .filter(type => {
    if (type === 'logs') {
      // Check if logs panel already exists
      return !panels.some(p => p.type === 'logs');
    }
    return true;
  }) as ToolPanelType[];
```

### Step 6: Prevent Closing During Execution

```typescript
// In handlePanelClose
const handlePanelClose = useCallback((panel: ToolPanel) => {
  if (panel.type === 'logs') {
    const logsState = panel.state?.customState as LogsPanelState;
    if (logsState?.isRunning) {
      // Show warning or prevent closing
      alert('Cannot close logs panel while process is running');
      return;
    }
  }
  // Continue with normal close logic
}, []);
```

### Step 7: Auto-focus on Run

When a script is run:
1. Logs panel is created/cleared
2. Panel becomes active automatically
3. View switches to show panel content
4. User sees output immediately

## Migration Strategy

### For Existing Sessions
- Logs tab in main view remains functional initially
- Running a script creates/uses logs panel
- Main tab logs can be hidden when panel exists

### Behavior Changes
- OLD: Logs tab always present, shows last run
- NEW: Logs panel created on demand, cleared each run
- NEW: Cannot have multiple logs views

## User Experience

### Running Scripts
1. User clicks "Run Script" button
2. System checks for existing logs panel
3. If exists: Clear and reuse
4. If not: Create new logs panel
5. Panel becomes active, shows output
6. Stop button appears while running

### Panel Behavior
- **Single Instance**: Only one logs panel ever exists
- **Auto-clear**: Each run starts with clean output
- **Auto-focus**: Panel activates when run starts
- **Protected**: Cannot close while running
- **Persistent**: Remains after process ends (until manually closed)

## Event Flow

```
User clicks Run Script →
  Backend checks for logs panel →
    Found: Clear existing panel
    Not found: Create new panel →
  Make panel active →
  Start process →
  Stream output to panel →
  Process ends →
  Update panel state
```

## Benefits of Panel-Based Logs

1. **Consistent UI**: Logs behave like other panels
2. **Clear Context**: Each run starts fresh
3. **Protected Execution**: Can't accidentally close during run
4. **Better Integration**: Part of panel ecosystem
5. **Automatic Management**: System handles panel lifecycle

## Risk Mitigation

### Risk: User Confusion About Singleton
- Clear messaging in UI
- Disable "Add Logs" when one exists
- Tooltip explaining singleton behavior

### Risk: Lost Previous Output
- Option to save logs before clearing
- Export logs functionality
- Terminal panels for persistent output

### Risk: Accidental Interruption
- Confirm before stopping running process
- Prevent panel close while running
- Show process status clearly

## Testing Checklist

- [ ] Move all logs files with git mv
- [ ] Update all import paths
- [ ] Create LogsPanel wrapper component
- [ ] Implement singleton enforcement
- [ ] Test auto-creation on run
- [ ] Test clear-and-reuse behavior
- [ ] Test prevention of close while running
- [ ] Test process management
- [ ] Test output streaming
- [ ] Verify no regression in functionality

## Success Criteria

1. All existing logs code moved, not rewritten
2. Only one logs panel can exist per session
3. Running script creates/reuses logs panel
4. Panel clears on each new run
5. Cannot close panel while process running
6. All output streams correctly to panel
7. Clean integration with panel system

## Conclusion

This refactor plan moves the existing logs implementation into the panel system as a special singleton panel type. The key differentiator is that logs panels are automatically managed by the system - created when needed, cleared on reuse, and protected during execution. By wrapping the existing LogsView component and adding singleton logic, we preserve all current functionality while providing better integration with the panel ecosystem.
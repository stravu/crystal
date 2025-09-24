# Implementing New CLI Agents in Crystal

This guide provides step-by-step instructions for adding support for new CLI agent tools (like Aider, Continue, Cursor, etc.) to Crystal's architecture.

## Table of Contents
- [Overview](#overview)
- [Architecture Summary](#architecture-summary)
- [Implementation Steps](#implementation-steps)
- [File Structure](#file-structure)
- [Code Examples](#code-examples)
- [Testing Your Implementation](#testing-your-implementation)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Overview

Crystal's architecture is designed to be extensible, allowing new CLI agents to be added with minimal modifications to existing code. The system follows a plugin-like pattern where each CLI tool is self-contained in its own directory structure.

### What You'll Need to Build

1. **New Files (90% of the work)**
   - Backend manager class extending `AbstractCliManager`
   - Frontend React panel component
   - Protocol handlers (if needed)
   - Utility functions specific to your CLI

2. **Minimal Modifications (10% of the work)**
   - Register your tool (~4 lines)
   - Update UI factory (~3 lines)
   - Add type definitions (~2 lines)

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│              Crystal Application                 │
├─────────────────────────────────────────────────┤
│                                                  │
│  Frontend (React)          Backend (Electron)   │
│  ┌──────────────┐         ┌──────────────────┐ │
│  │ YourCliPanel │◄──IPC──►│ YourCliManager   │ │
│  └──────────────┘         └──────────────────┘ │
│         ▲                          │            │
│         │                          ▼            │
│  ┌──────────────┐         ┌──────────────────┐ │
│  │CliPanelFactory│         │AbstractCliManager│ │
│  └──────────────┘         └──────────────────┘ │
│                                    │            │
└────────────────────────────────────┼────────────┘
                                     ▼
                              ┌──────────────┐
                              │  Your CLI    │
                              │  (External)  │
                              └──────────────┘
```

## Implementation Steps

### Step 1: Create the Backend Manager

Create a new directory for your CLI in `main/src/services/panels/[your-cli]/` and implement the manager class:

```typescript
// main/src/services/panels/aider/aiderManager.ts
import { AbstractCliManager } from '../cli/AbstractCliManager';

export class AiderManager extends AbstractCliManager {
  // Implement required abstract methods
  protected getCliToolName(): string {
    return 'Aider';
  }

  protected async testCliAvailability(customPath?: string): Promise<{
    available: boolean;
    error?: string;
    version?: string;
    path?: string;
  }> {
    // Test if CLI is installed
  }

  protected buildCommandArgs(options: any): string[] {
    // Build command-line arguments
  }

  protected async getCliExecutablePath(): Promise<string> {
    // Return path to CLI executable
  }

  protected parseCliOutput(data: string, panelId: string, sessionId: string): Array<any> {
    // Parse CLI output into events
  }
}
```

### Step 2: Create the Frontend Panel Component

Create React components in `frontend/src/components/panels/[your-cli]/`:

```typescript
// frontend/src/components/panels/aider/AiderPanel.tsx
import React from 'react';

export const AiderPanel: React.FC<{ panel: ToolPanel; isActive: boolean }> = ({ panel, isActive }) => {
  // Implement your panel UI
  return (
    <div className="h-full flex flex-col">
      {/* Your UI here */}
    </div>
  );
};

// Make it the default export for lazy loading
export default AiderPanel;
```

### Step 3: Register Your CLI Tool

Modify `main/src/services/cliManagerFactory.ts` to register your tool:

```typescript
// In registerBuiltInTools() method around line 149-159:
private registerBuiltInTools(): void {
  // Existing registrations...
  this.registerClaudeTool();
  
  // Add your registration
  this.registerAiderTool(); // ADD THIS LINE
}

// Add a new registration method:
private registerAiderTool(): void {
  const aiderDefinition: CliToolDefinition = {
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programming in your terminal',
    // ... other configuration
    managerFactory: (sessionManager, logger, configManager) => 
      new AiderManager(sessionManager, logger, configManager)
  };
  
  this.registry.registerTool(aiderDefinition);
}
```

### Step 4: Update the Frontend Panel Factory

Modify `frontend/src/components/panels/cli/CliPanelFactory.tsx`:

```typescript
// Add lazy import at the top (around line 82-83):
const AiderPanel = lazy(() => import('../aider/AiderPanel'));

// Add case in renderPanel() switch statement (around line 104-118):
case 'aider':
  return (
    <Suspense fallback={<LoadingFallback cliToolId={cliToolId} />}>
      <AiderPanel panel={panel} isActive={isActive} />
    </Suspense>
  );

// Update supported tools list (around line 149):
const supportedTools = ['claude', 'codex', 'aider']; // ADD 'aider'
```

### Step 5: Update Type Definitions

Modify `shared/types/panels.ts`:

```typescript
// Update ToolPanelType union (line 10):
export type ToolPanelType = 'terminal' | 'claude' | 'codex' | 'aider' | 'diff' | 'editor' | 'logs' | 'dashboard';

// Add panel state interface if needed (optional):
export interface AiderPanelState extends BaseAIPanelState {
  // Aider-specific state
  editFormat?: 'whole' | 'diff' | 'patch';
  autoCommits?: boolean;
}
```

## File Structure

Your implementation should follow this structure:

```
crystal/
├── main/src/services/panels/aider/           # Backend implementation
│   ├── aiderManager.ts                       # Main manager class (required)
│   ├── aiderProtocol.ts                      # Protocol handling (if needed)
│   ├── aiderMessageParser.ts                 # Output parsing utilities
│   └── types.ts                              # TypeScript interfaces
│
├── frontend/src/components/panels/aider/     # Frontend implementation
│   ├── AiderPanel.tsx                        # Main panel component (required)
│   ├── AiderOutput.tsx                       # Output display component
│   ├── AiderInput.tsx                        # Input component
│   ├── AiderToolCalls.tsx                    # Tool call visualization
│   └── styles.css                            # Component-specific styles
│
└── shared/types/                             # Shared type definitions
    └── aiderTypes.ts                         # Aider-specific types (optional)
```

## Code Examples

### Example: Simple CLI Manager

For a basic CLI that just needs stdin/stdout:

```typescript
export class SimpleCliManager extends AbstractCliManager {
  protected getCliToolName(): string {
    return 'SimpleCLI';
  }

  protected async testCliAvailability(customPath?: string): Promise<any> {
    try {
      const { execSync } = require('child_process');
      const cmd = customPath || 'simple-cli';
      const version = execSync(`${cmd} --version`, { encoding: 'utf8' });
      return { available: true, version: version.trim(), path: cmd };
    } catch {
      return { available: false, error: 'CLI not found' };
    }
  }

  protected buildCommandArgs(options: any): string[] {
    return [options.prompt]; // Simple args
  }

  protected async getCliExecutablePath(): Promise<string> {
    return 'simple-cli';
  }

  protected parseCliOutput(data: string, panelId: string, sessionId: string): Array<any> {
    return [{
      panelId,
      sessionId,
      type: 'stdout',
      data,
      timestamp: new Date()
    }];
  }
}
```

### Example: Protocol-Based CLI Manager

For CLIs using JSON-RPC or similar protocols:

```typescript
export class ProtocolCliManager extends AbstractCliManager {
  private protocol: ProtocolHandler;

  constructor(sessionManager: any, logger?: Logger, configManager?: ConfigManager) {
    super(sessionManager, logger, configManager);
    this.protocol = new ProtocolHandler();
  }

  protected parseCliOutput(data: string, panelId: string, sessionId: string): Array<any> {
    try {
      const message = JSON.parse(data);
      return this.protocol.handleMessage(message, panelId, sessionId);
    } catch {
      // Fallback to plain text
      return super.parseCliOutput(data, panelId, sessionId);
    }
  }

  async sendInput(panelId: string, input: string): Promise<void> {
    const message = this.protocol.createInputMessage(input);
    const process = this.processes.get(panelId);
    process?.write(JSON.stringify(message) + '\n');
  }
}
```

### Example: Minimal Panel Component

```typescript
import React, { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';

export const MinimalPanel: React.FC<{ panel: any; isActive: boolean }> = ({ panel, isActive }) => {
  const [output, setOutput] = useState<string[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    // Listen for output
    const handleOutput = (event: any, data: any) => {
      if (data.panelId === panel.id) {
        setOutput(prev => [...prev, data.data]);
      }
    };

    window.electron.on('panel:output', handleOutput);

    // Initialize panel when active
    if (isActive && !panel.state.isInitialized) {
      window.electron.invoke('panels:initialize', panel.id);
    }

    return () => {
      window.electron.off('panel:output', handleOutput);
    };
  }, [panel.id, isActive]);

  const handleSubmit = async () => {
    if (input.trim()) {
      await window.electron.invoke('panels:send-input', panel.id, input);
      setInput('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-primary">
      <div className="flex items-center gap-2 p-4 border-b border-border-primary">
        <Terminal className="w-4 h-4" />
        <span className="font-medium">My CLI Tool</span>
      </div>
      
      <div className="flex-1 overflow-auto p-4 font-mono text-sm">
        {output.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      
      <div className="p-4 border-t border-border-primary">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Enter command..."
          className="w-full px-3 py-2 bg-surface-secondary rounded"
        />
      </div>
    </div>
  );
};

export default MinimalPanel;
```

## Testing Your Implementation

### 1. Test CLI Availability

```bash
# In the Electron dev console or a test file
const factory = require('./main/src/services/cliManagerFactory');
const manager = factory.createManager('aider', { sessionManager });
const result = await manager.testCliAvailability();
console.log('Aider available:', result);
```

### 2. Test Process Spawning

```typescript
// Test spawning a process
await manager.startPanel(
  'test-panel-1',
  'test-session-1',
  '/path/to/project',
  'Test prompt'
);
```

### 3. Test Frontend Integration

1. Run Crystal in development mode
2. Create a new session
3. Add a tool panel and select your CLI
4. Verify the panel renders and accepts input

## Common Patterns

### Pattern: Handling Authentication

If your CLI requires authentication:

```typescript
protected async initializeCliEnvironment(options: any): Promise<Record<string, string>> {
  const apiKey = this.configManager?.getConfig()?.aiderApiKey;
  if (!apiKey) {
    throw new Error('API key required. Please configure in Settings.');
  }
  
  return {
    AIDER_API_KEY: apiKey,
    ...process.env
  };
}
```

### Pattern: Session Resumption

For CLIs that support resuming conversations:

```typescript
async continuePanel(panelId: string, sessionId: string, conversationHistory: any[]): Promise<void> {
  const resumeArgs = this.buildResumeArgs(conversationHistory);
  const options = {
    panelId,
    sessionId,
    additionalArgs: resumeArgs
  };
  return this.spawnCliProcess(options);
}

private buildResumeArgs(history: any[]): string[] {
  // Convert history to CLI-specific format
  return ['--resume', JSON.stringify(history)];
}
```

### Pattern: Handling Tool Calls

For CLIs that perform file operations:

```typescript
protected parseCliOutput(data: string, panelId: string, sessionId: string): Array<any> {
  const events = [];
  
  // Detect tool calls
  if (this.isToolCall(data)) {
    const toolCall = this.parseToolCall(data);
    events.push({
      type: 'tool_call',
      tool: toolCall.name,
      args: toolCall.args
    });
    
    // Emit file change event if applicable
    if (toolCall.name === 'write_file') {
      this.emit('files:changed', { 
        panelId, 
        files: [toolCall.args.path] 
      });
    }
  }
  
  return events;
}
```

## Troubleshooting

### Common Issues and Solutions

1. **CLI not found**
   - Ensure the CLI is installed and in PATH
   - Check `getCliExecutablePath()` returns correct path
   - Verify `testCliAvailability()` handles errors properly

2. **Panel not rendering**
   - Verify lazy import path is correct
   - Check panel is registered in `CliPanelFactory`
   - Ensure component has default export

3. **No output displayed**
   - Check `parseCliOutput()` returns proper event format
   - Verify IPC event listeners are set up
   - Ensure panel ID matches in events

4. **Input not working**
   - Verify process is running (`this.processes.get(panelId)`)
   - Check input formatting matches CLI expectations
   - Ensure write permissions on process stdin

### Debug Tips

1. **Enable verbose logging**:
   ```typescript
   this.logger?.debug('[YourCli] Spawning process:', { command, args });
   ```

2. **Add console output in frontend**:
   ```typescript
   console.log('[YourCliPanel] Received output:', data);
   ```

3. **Use Chrome DevTools**:
   - Open DevTools in Electron (Cmd/Ctrl+Shift+I)
   - Check Network tab for IPC calls
   - Monitor Console for errors

4. **Test CLI directly**:
   ```bash
   # Test your CLI works outside Crystal
   your-cli --version
   echo "test prompt" | your-cli
   ```

## Best Practices

1. **Error Handling**: Always provide clear error messages
2. **Resource Cleanup**: Implement proper cleanup in `cleanupCliResources()`
3. **State Persistence**: Store CLI-specific state for session resumption
4. **User Feedback**: Show loading states and error messages in UI
5. **Configuration**: Allow users to customize CLI behavior via settings
6. **Documentation**: Comment complex parsing or protocol logic
7. **Type Safety**: Use TypeScript interfaces for all data structures
8. **Testing**: Write unit tests for parsing and protocol logic

## Next Steps

After implementing your CLI:

1. Test thoroughly in development mode
2. Add configuration options to Settings UI
3. Update Help documentation
4. Consider contributing back to Crystal repository
5. Share your implementation with the community

For more details on specific aspects:
- [Abstract CLI Manager API](../main/src/services/panels/cli/AbstractCliManager.ts)
- [CLI Tool Registry](../main/src/services/cliToolRegistry.ts)
- [Example: Claude Implementation](../main/src/services/panels/claude/)
- [Example: Codex Implementation](../main/src/services/panels/codex/)
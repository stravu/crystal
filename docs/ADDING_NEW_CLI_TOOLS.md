# Adding New CLI Tools to Crystal

This guide explains how to extend Crystal to support additional CLI tools beyond Claude Code. Crystal's architecture has been designed with extensibility in mind, using abstract base classes and a registry pattern.

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Step-by-Step Implementation](#step-by-step-implementation)
- [Testing Your Integration](#testing-your-integration)
- [Database Considerations](#database-considerations)
- [Best Practices](#best-practices)

## Overview

Crystal uses a modular architecture that allows you to add support for new CLI tools (like Aider, Continue, Cursor, etc.) by:
1. Creating a manager class that extends `AbstractCliManager`
2. Registering the tool in the CLI tool registry
3. Adding frontend panel components
4. Updating type definitions

## Architecture

### Key Components

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React)                    │
├─────────────────────────────────────────────────────┤
│  CliPanelFactory → YourCliPanel → BaseCliPanel      │
└─────────────────────────────────────────────────────┘
                          ↕ IPC
┌─────────────────────────────────────────────────────┐
│                Main Process (Electron)               │
├─────────────────────────────────────────────────────┤
│  CliToolRegistry → YourCliManager → AbstractCliManager │
└─────────────────────────────────────────────────────┘
```

### Core Classes

- **`AbstractCliManager`**: Base class providing common CLI management functionality
- **`CliToolRegistry`**: Singleton registry for managing CLI tools
- **`CliPanelFactory`**: Factory for rendering appropriate CLI panels
- **`BaseCliPanel`**: (Optional) Base React component with common UI elements

## Step-by-Step Implementation

### Step 1: Create Your CLI Manager

Create a new manager class in `main/src/services/panels/[your-cli]/`:

```typescript
// main/src/services/panels/aider/aiderManager.ts
import { AbstractCliManager } from '../cli/AbstractCliManager';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';

interface AiderSpawnOptions {
  panelId: string;
  sessionId: string;
  worktreePath: string;
  prompt: string;
  conversationHistory?: string[];
  // Add your CLI-specific options
  model?: string;
  editFormat?: 'whole' | 'diff' | 'patch';
}

export class AiderManager extends AbstractCliManager {
  constructor(
    sessionManager: any,
    logger?: Logger,
    configManager?: ConfigManager
  ) {
    super(sessionManager, logger, configManager);
  }

  // Required abstract method implementations

  protected getCliToolName(): string {
    return 'Aider';
  }

  protected async testCliAvailability(customPath?: string): Promise<{
    available: boolean;
    error?: string;
    version?: string;
    path?: string;
  }> {
    // Implement CLI availability test
    try {
      const { execSync } = require('child_process');
      const command = customPath || 'aider';
      const version = execSync(`${command} --version`, { encoding: 'utf8' }).trim();
      return {
        available: true,
        version,
        path: command
      };
    } catch (error) {
      return {
        available: false,
        error: `Aider not found: ${error}`
      };
    }
  }

  protected buildCommandArgs(options: AiderSpawnOptions): string[] {
    const args: string[] = [];
    
    // Add your CLI-specific arguments
    if (options.model) {
      args.push('--model', options.model);
    }
    
    if (options.editFormat) {
      args.push('--edit-format', options.editFormat);
    }
    
    // Add the prompt
    if (options.prompt) {
      args.push('--message', options.prompt);
    }
    
    return args;
  }

  protected async getCliExecutablePath(): Promise<string> {
    // Check for custom path in config
    const customPath = this.configManager?.getConfig()?.aiderExecutablePath;
    if (customPath) {
      return customPath;
    }
    
    // Otherwise find in PATH
    const { findExecutableInPath } = require('../../../utils/shellPath');
    const foundPath = findExecutableInPath('aider');
    if (!foundPath) {
      throw new Error('Aider not found in PATH');
    }
    return foundPath;
  }

  protected parseCliOutput(
    data: string,
    panelId: string,
    sessionId: string
  ): Array<{
    panelId: string;
    sessionId: string;
    type: 'json' | 'stdout' | 'stderr';
    data: any;
    timestamp: Date;
  }> {
    // Parse your CLI's output format
    const events = [];
    
    // Example: if your CLI outputs JSON
    try {
      const jsonMessage = JSON.parse(data.trim());
      events.push({
        panelId,
        sessionId,
        type: 'json' as const,
        data: jsonMessage,
        timestamp: new Date()
      });
    } catch {
      // Treat as regular output
      events.push({
        panelId,
        sessionId,
        type: 'stdout' as const,
        data,
        timestamp: new Date()
      });
    }
    
    return events;
  }

  protected async initializeCliEnvironment(options: AiderSpawnOptions): Promise<{
    [key: string]: string;
  }> {
    // Set up environment variables for your CLI
    return {
      AIDER_AUTO_COMMITS: 'false',
      // Add other environment variables
    };
  }

  protected async cleanupCliResources(sessionId: string): Promise<void> {
    // Clean up any resources specific to your CLI
    // e.g., temp files, cache, etc.
  }

  protected getCliNotAvailableMessage(error?: string): string {
    return [
      `Error: ${error}`,
      '',
      'Aider is not installed or not found in your PATH.',
      '',
      'Please install Aider:',
      '1. Run: pip install aider-chat',
      '2. Verify installation by running "aider --version" in your terminal',
      '',
      'If Aider is installed but not in your PATH:',
      '- Add the Aider installation directory to your PATH',
      '- Or set a custom Aider path in Crystal Settings'
    ].join('\n');
  }

  // Public methods for panel interaction

  async startPanel(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    prompt: string,
    model?: string
  ): Promise<void> {
    const options: AiderSpawnOptions = {
      panelId,
      sessionId,
      worktreePath,
      prompt,
      model
    };
    return this.spawnCliProcess(options);
  }

  async continuePanel(
    panelId: string,
    sessionId: string,
    worktreePath: string,
    prompt: string,
    conversationHistory: any[]
  ): Promise<void> {
    // Implement continuation logic for your CLI
    const options: AiderSpawnOptions = {
      panelId,
      sessionId,
      worktreePath,
      prompt,
      conversationHistory
    };
    return this.spawnCliProcess(options);
  }

  async stopPanel(panelId: string): Promise<void> {
    return this.killProcess(panelId);
  }
}
```

### Step 2: Register Your CLI Tool

Add your tool to the registry in `main/src/services/cliManagerFactory.ts`:

```typescript
// main/src/services/cliManagerFactory.ts
import { AiderManager } from './panels/aider/aiderManager';

export function registerBuiltInTools(
  registry: CliToolRegistry,
  sessionManager: any,
  logger?: Logger,
  configManager?: ConfigManager,
  permissionIpcPath?: string | null
): void {
  // Existing Claude registration...
  
  // Register Aider
  registry.registerTool({
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programming in your terminal',
    managerClass: AiderManager,
    icon: 'terminal', // or custom icon
    config: {
      executablePath: 'aider',
      defaultModel: 'gpt-4',
      // Add other default config
    }
  });
}
```

### Step 3: Add Type Definitions

Update the shared types in `shared/types/`:

```typescript
// shared/types/panels.ts
export type ToolPanelType = 
  | 'terminal' 
  | 'claude' 
  | 'aider'  // Add your tool here
  | 'diff' 
  | 'editor' 
  | 'logs' 
  | 'dashboard';

// shared/types/cliPanels.ts
export type CliPanelType = 'claude' | 'aider'; // Add your tool here

// Add specific state interfaces if needed
export interface AiderPanelState {
  model?: string;
  editFormat?: 'whole' | 'diff' | 'patch';
  autoCommits?: boolean;
}
```

### Step 4: Create Frontend Panel Component

Create your panel component in `frontend/src/components/panels/[your-cli]/`:

```typescript
// frontend/src/components/panels/aider/AiderPanel.tsx
import React, { useEffect, useState } from 'react';
import { Terminal } from 'lucide-react';
import { BaseCliPanel } from '../cli/BaseCliPanel'; // Optional
import { usePanelStore } from '../../../stores/panelStore';

interface AiderPanelProps {
  panelId: string;
  sessionId: string;
}

export const AiderPanel: React.FC<AiderPanelProps> = ({ 
  panelId, 
  sessionId 
}) => {
  const { activePanel, panels } = usePanelStore();
  const [output, setOutput] = useState<string[]>([]);
  
  useEffect(() => {
    // Set up IPC listeners for output
    const handleOutput = (event: any, data: any) => {
      if (data.panelId === panelId) {
        setOutput(prev => [...prev, data.data]);
      }
    };
    
    window.electron.on('panel:output', handleOutput);
    
    // Initialize panel if needed
    if (activePanel === panelId) {
      window.electron.invoke('panels:initialize', panelId);
    }
    
    return () => {
      window.electron.off('panel:output', handleOutput);
    };
  }, [panelId, activePanel]);
  
  const handleInput = async (input: string) => {
    await window.electron.invoke('panels:send-input', panelId, input);
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <span className="font-medium">Aider</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        {output.map((line, index) => (
          <div key={index} className="font-mono text-sm">
            {line}
          </div>
        ))}
      </div>
      
      <div className="border-t border-border-primary p-4">
        <input
          type="text"
          placeholder="Type your message..."
          className="w-full px-3 py-2 bg-surface-secondary rounded"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleInput(e.currentTarget.value);
              e.currentTarget.value = '';
            }
          }}
        />
      </div>
    </div>
  );
};
```

### Step 5: Update Panel Factory

Add your panel to the factory in `frontend/src/components/panels/cli/CliPanelFactory.tsx`:

```typescript
// frontend/src/components/panels/cli/CliPanelFactory.tsx
import { AiderPanel } from '../aider/AiderPanel';

export const CliPanelFactory: React.FC<CliPanelFactoryProps> = ({ 
  panel 
}) => {
  switch (panel.type) {
    case 'claude':
      return <ClaudePanel panelId={panel.id} sessionId={panel.session_id} />;
    
    case 'aider':
      return <AiderPanel panelId={panel.id} sessionId={panel.session_id} />;
    
    default:
      return (
        <div className="p-4 text-text-secondary">
          Unknown panel type: {panel.type}
        </div>
      );
  }
};
```

### Step 6: Add IPC Handlers

Create IPC handlers for your CLI in `main/src/ipc/[your-cli].ts`:

```typescript
// main/src/ipc/aider.ts
import { ipcMain } from 'electron';
import { getCliManagerFactory } from '../services/cliManagerFactory';

export function registerAiderHandlers() {
  const factory = getCliManagerFactory();
  const registry = factory.getRegistry();
  
  ipcMain.handle('aider:start', async (event, panelId, sessionId, options) => {
    const manager = registry.createManager('aider');
    return manager.startPanel(
      panelId,
      sessionId,
      options.worktreePath,
      options.prompt,
      options.model
    );
  });
  
  ipcMain.handle('aider:send-input', async (event, panelId, input) => {
    const manager = registry.getManager('aider');
    return manager.sendInput(panelId, input);
  });
  
  ipcMain.handle('aider:stop', async (event, panelId) => {
    const manager = registry.getManager('aider');
    return manager.stopPanel(panelId);
  });
}
```

## Testing Your Integration

### 1. Test CLI Availability
```typescript
// In your test file or console
const manager = new AiderManager(sessionManager, logger, configManager);
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
  'Hello from Aider'
);
```

### 3. Test Output Parsing
```typescript
// Test your output parser
const output = manager.parseCliOutput(
  '{"type": "message", "content": "Hello"}',
  'panel-1',
  'session-1'
);
console.log('Parsed output:', output);
```

## Database Considerations

Crystal's database schema is flexible and can accommodate new CLI tools without migration:

- The `tool_panels` table has a `type` column that accepts any string value
- Panel-specific state is stored as JSON in the `state` column
- No schema changes are needed for new CLI tools

### Storing CLI-Specific Data

```typescript
// When creating a panel
const panelData = {
  id: generateId(),
  session_id: sessionId,
  type: 'aider', // Your CLI type
  name: 'Aider Session',
  state: JSON.stringify({
    model: 'gpt-4',
    editFormat: 'diff',
    // Your CLI-specific state
  })
};
```

## Best Practices

### 1. Error Handling
Always provide clear error messages and recovery paths:

```typescript
protected async testCliAvailability(): Promise<CliAvailabilityResult> {
  try {
    // Test CLI
  } catch (error) {
    return {
      available: false,
      error: this.getCliNotAvailableMessage(error.message)
    };
  }
}
```

### 2. Resource Cleanup
Always clean up resources when panels are closed:

```typescript
protected async cleanupCliResources(sessionId: string): Promise<void> {
  // Clean up temp files
  const tempDir = path.join(os.tmpdir(), `aider-${sessionId}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  
  // Clear any caches
  this.clearCache(sessionId);
}
```

### 3. Output Formatting
Provide consistent output formatting for better UX:

```typescript
protected parseCliOutput(data: string): OutputEvent[] {
  // Detect different output types
  if (this.isToolCall(data)) {
    return this.formatToolCall(data);
  }
  if (this.isError(data)) {
    return this.formatError(data);
  }
  return this.formatStandard(data);
}
```

### 4. Configuration
Allow users to customize CLI behavior:

```typescript
// In your manager
const getCliConfig = () => {
  return {
    executablePath: this.configManager?.getConfig()?.aiderPath,
    defaultModel: this.configManager?.getConfig()?.aiderModel || 'gpt-4',
    autoCommits: this.configManager?.getConfig()?.aiderAutoCommits ?? false
  };
};
```

### 5. Process Management
Handle process lifecycle properly:

```typescript
// Override spawnCliProcess if needed for special handling
async spawnCliProcess(options: AiderSpawnOptions): Promise<void> {
  // Pre-spawn setup
  await this.validateEnvironment(options);
  
  // Call parent implementation
  await super.spawnCliProcess(options);
  
  // Post-spawn setup
  await this.initializeSession(options);
}
```

## Common Patterns

### Stream Processing
For CLIs that stream output:

```typescript
protected handleStreamData(chunk: Buffer, panelId: string): void {
  const lines = chunk.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      const events = this.parseCliOutput(line, panelId, this.getSessionId(panelId));
      events.forEach(event => this.emit('output', event));
    }
  }
}
```

### Session Persistence
To support session resumption:

```typescript
async continuePanel(panelId: string, sessionId: string, ...args): Promise<void> {
  // Load previous session state
  const sessionState = await this.loadSessionState(sessionId);
  
  // Reconstruct command with session context
  const options = this.buildContinuationOptions(sessionState, ...args);
  
  return this.spawnCliProcess(options);
}
```

### Interactive Commands
For CLIs that require interaction:

```typescript
async sendInput(panelId: string, input: string): Promise<void> {
  const process = this.processes.get(panelId);
  if (!process) {
    throw new Error(`No process found for panel ${panelId}`);
  }
  
  // Handle special commands
  if (this.isSpecialCommand(input)) {
    return this.handleSpecialCommand(panelId, input);
  }
  
  // Send to CLI
  process.write(input + '\n');
}
```

## Troubleshooting

### Common Issues

1. **CLI not found**: Ensure the CLI is installed and in PATH
2. **Process won't start**: Check permissions and working directory
3. **Output not displaying**: Verify output parsing and event emission
4. **Panel not updating**: Check IPC event listeners and handlers

### Debug Tips

1. Enable verbose logging in your manager
2. Add console.log statements in critical paths
3. Use Chrome DevTools for frontend debugging
4. Check the main process console for backend errors

## Examples

### Minimal CLI Integration

For a simple CLI that just needs basic I/O:

```typescript
export class SimpleCliManager extends AbstractCliManager {
  protected getCliToolName(): string {
    return 'SimpleCLI';
  }
  
  protected buildCommandArgs(options: any): string[] {
    return [options.prompt];
  }
  
  protected async getCliExecutablePath(): Promise<string> {
    return 'simple-cli';
  }
  
  // Use default implementations for other methods
}
```

### Advanced CLI Integration

For complex CLIs with multiple features:

```typescript
export class AdvancedCliManager extends AbstractCliManager {
  private sessions = new Map<string, SessionContext>();
  private configCache = new Map<string, any>();
  
  // Override multiple methods for advanced behavior
  // Add session management, caching, etc.
}
```

## Contributing

When adding a new CLI tool to Crystal:

1. Follow the existing code style and patterns
2. Add comprehensive error handling
3. Include debug logging for troubleshooting
4. Test thoroughly with different scenarios
5. Update this documentation if you discover new patterns

## Support

For questions or issues with CLI integration:
1. Check existing CLI implementations (ClaudeCodeManager) for examples
2. Review the AbstractCliManager base class documentation
3. Open an issue on the Crystal GitHub repository
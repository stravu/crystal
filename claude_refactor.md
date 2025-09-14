I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end.

### Observations

The `ClaudeCodeManager` is a comprehensive class that manages Claude Code CLI processes with extensive functionality including availability testing, MCP permission setup, process spawning with complex argument building, and process lifecycle management. The class extends EventEmitter and uses a Map to store processes keyed by panelId. The `ClaudePanelManager` acts as a thin wrapper that manages panel-to-session mappings and forwards events. The refactoring needs to preserve all existing functionality while extracting only the truly generic process management patterns to the base class.

### Approach

I'll refactor `ClaudeCodeManager` to extend `BaseAIAssistantManager` while preserving all existing functionality. This will be done as a careful refactor, not a rewrite:

1. **Import and Extend**: Change class declaration to extend `BaseAIAssistantManager<ClaudeCodeProcess>`
2. **Constructor Refactor**: Call `super()` with common dependencies and keep Claude-specific initialization
3. **Process Management**: Remove generic process methods that are now inherited from base class
4. **Override Abstract Methods**: Implement the abstract methods (`spawnProcess`, `killProcess`, `sendInput`) by moving existing logic
5. **Preserve Claude Logic**: Keep all Claude-specific functionality (availability caching, MCP setup, command building, permission handling)
6. **Update Method Signatures**: Ensure compatibility with base class interface while maintaining existing behavior

The refactor will be minimal and focused - most of the 1400+ lines of Claude-specific logic will remain unchanged.

### Reasoning

I explored the repository structure and examined the current `ClaudeCodeManager` and `ClaudePanelManager` implementations. I analyzed the file summary showing ClaudeCodeManager is a large class (1447 lines) extending EventEmitter with process management, availability caching, and Claude-specific logic. I reviewed the panel type system in `shared/types/panels.ts` to understand the existing structure. I read portions of the ClaudeCodeManager to understand the constructor pattern, process storage, and key methods that need to be refactored to work with the base class.

## Mermaid Diagram

```sequenceDiagram
    participant Client as Client Code
    participant CPM as ClaudePanelManager
    participant CCM as ClaudeCodeManager
    participant Base as BaseAIAssistantManager
    participant Process as Claude Process

    Note over CCM,Base: Refactoring: CCM now extends Base

    Client->>CPM: startPanel(panelId, worktreePath, prompt)
    CPM->>CCM: startPanel(panelId, sessionId, worktreePath, prompt)
    CCM->>CCM: Claude-specific logic (availability, MCP setup)
    CCM->>Base: spawnProcess(panelId, sessionId, worktreePath, prompt)
    Base->>CCM: calls abstract spawnProcess implementation
    CCM->>Process: spawn claude process with args
    Process-->>CCM: process events (output, exit, error)
    CCM->>Base: emit events through inherited EventEmitter
    Base-->>CPM: forward events as panel events
    CPM-->>Client: panel events

    Client->>CPM: sendInputToPanel(panelId, input)
    CPM->>CCM: sendInput(panelId, input)
    CCM->>Base: sendInput(panelId, input)
    Base->>CCM: calls abstract sendInput implementation
    CCM->>Process: write input to process

    Client->>CPM: stopPanel(panelId)
    CPM->>CCM: stopPanel(panelId)
    CCM->>Base: killProcess(panelId)
    Base->>CCM: calls abstract killProcess implementation
    CCM->>Process: terminate process and cleanup
```
## Proposed File Changes

### main/src/services/panels/claude/claudeCodeManager.ts(MODIFY)

Refactor `ClaudeCodeManager` to extend `BaseAIAssistantManager<ClaudeCodeProcess>` while preserving all existing functionality:

**1. Import and Class Declaration Changes:**
- Add import for `BaseAIAssistantManager` and `BaseAIProcess` from `../base/baseAIAssistantManager`
- Change class declaration from `extends EventEmitter` to `extends BaseAIAssistantManager<ClaudeCodeProcess>`
- Update `ClaudeCodeProcess` interface to extend `BaseAIProcess` if needed

**2. Constructor Refactoring:**
- Replace the current constructor with a call to `super(sessionManager, logger, configManager, permissionIpcPath)`
- Remove the `super()` call to EventEmitter and `setMaxListeners(50)` (now handled by base class)
- Keep the Claude-specific initialization: `availabilityCache` and `CACHE_TTL`
- Remove the `processes` Map declaration since it's now inherited from base class

**3. Remove Inherited Methods:**
- Remove `getProcess(panelId: string)` method (now inherited from base class)
- Remove `getAllProcesses()` method (now inherited from base class) 
- Remove `isPanelRunning(panelId: string)` method (now inherited from base class)
- Remove `killAllProcesses()` method (now inherited from base class)

**4. Implement Abstract Methods:**
- Create `spawnProcess(panelId: string, sessionId: string, worktreePath: string, prompt: string, ...args: any[]): Promise<void>` method that wraps the existing `spawnClaudeCode` logic
- Create `killProcess(panelId: string): Promise<void>` method that wraps the existing process termination logic from the current `killProcess` method
- Create `sendInput(panelId: string, input: string): void` method that wraps the existing input sending logic

**5. Refactor Existing Methods:**
- Update `spawnClaudeCode` to call the new `spawnProcess` method internally
- Keep all existing public methods (`startPanel`, `continuePanel`, `stopPanel`, `restartPanel`) unchanged
- Ensure all Claude-specific logic (availability testing, MCP setup, command building, permission handling) remains in the concrete class

**6. Preserve All Claude-Specific Functionality:**
- Keep availability caching logic (`availabilityCache`, `CACHE_TTL`)
- Keep all MCP permission setup and file management
- Keep Claude-specific command argument building
- Keep platform-specific process tree operations
- Keep Claude-specific error handling and messaging
- Keep resume logic and conversation history handling

The refactoring should result in a cleaner class structure while maintaining 100% backward compatibility and preserving all existing functionality.
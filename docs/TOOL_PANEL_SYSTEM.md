# Tool Panel System Implementation Guidelines

⚠️ **IMPORTANT**: The tool panel system implements a flexible, extensible architecture for managing multiple tool instances per session.

## Architecture Overview

The tool panel system consists of several key components:

1. **Panel Manager** (`main/src/services/panelManager.ts`): Central coordinator for panel lifecycle management
2. **Terminal Panel Manager** (`main/src/services/terminalPanelManager.ts`): Specialized handler for terminal panel processes
3. **Panel Event Bus** (`main/src/services/panelEventBus.ts`): Event communication system between panels
4. **Panel Store** (`frontend/src/stores/panelStore.ts`): Frontend state management with Zustand
5. **Panel Components**: React components for rendering different panel types

## Key Implementation Principles

1. **Lazy Initialization**: Panels are created in the database immediately but background processes (like terminal PTY) only start when the panel is first viewed
2. **State Persistence**: All panel state including terminal scrollback, working directories, and configurations persist across application restarts
3. **Memory Efficiency**: Inactive panels suspend rendering but maintain background processes
4. **Event-Driven Updates**: Uses IPC events to synchronize state between main and renderer processes
5. **Extensible Design**: Architecture supports future panel types beyond terminals

## Panel Lifecycle

1. **Creation**: User clicks "Add Tool" → Panel entry created in database → Added to UI
2. **First View**: User clicks panel tab → Background process initializes → XTerm.js mounts
3. **Switching**: User switches panels → Previous panel unmounts XTerm → New panel mounts
4. **Background Operation**: Processes continue running even when panel is not visible
5. **Deletion**: Panel closed → Process terminated → Database entry removed → UI updated

## Terminal Panel Specifics

- Each terminal panel spawns an independent PTY process using node-pty
- Terminal state (scrollback, history, dimensions) persists in `tool_panels.state` as JSON
- XTerm.js instances mount/unmount based on panel visibility to save memory
- Working directories are maintained independently per panel
- Command history and environment variables can be preserved across restarts

## Database Schema

- `tool_panels` table stores panel configuration and state
- `sessions.active_panel_id` tracks the currently active panel per session
- Foreign key constraints ensure panels are cleaned up when sessions are deleted

## Event System

- Terminal panels emit `terminal:command_executed`, `terminal:exit`, and `files:changed` events
- Event bus routes events to subscribed panels (planned for future panel types)
- Events support future inter-panel communication (e.g., diff panels reacting to file changes)

## Implemented Panel Types

The tool panel system currently supports 8 panel types:

1. **Terminal** (`terminal`) - Multiple PTY shells per session
  - Independent processes with command history and scrollback
  - File operation detection triggers `files:changed` events

2. **Claude** (`claude`) - Multiple Claude Code instances
  - Managed by `claudePanelManager.ts`
  - Permission mode: approve/ignore
  - Automatic context tracking with token usage display

3. **Codex** (`codex`) - Multiple Codex CLI instances
  - Managed by `codexPanelManager.ts`
  - Configurable model provider and approval policy
  - Sandbox mode and web search support

4. **Diff** (`diff`) - Git diff viewer (singleton, permanent)
  - View modes: split/unified
  - Whitespace and context line configuration
  - Auto-refreshes on file changes

5. **Editor** (`editor`) - In-app file editor
  - Syntax highlighting with Monaco
  - File tree with expanded directory tracking
  - Cursor position and scroll persistence

6. **Logs** (`logs`) - Script execution panel (singleton)
  - Process management with PID tracking
  - Output buffer with error/warning counts
  - Start/end time and exit code tracking

7. **Dashboard** (`dashboard`) - Project overview (singleton, permanent, projects-only)
  - Session health monitoring
  - Filter by status: all/stale/changes/pr
  - Cached data persistence

8. **Setup Tasks** (`setup-tasks`) - Project setup checklist (singleton, permanent, projects-only)
  - Task completion tracking
  - Dismissible tasks
  - Last check timestamp

## Panel Capabilities

Each panel type has specific capabilities defined in `PANEL_CAPABILITIES`:

- **requiresProcess**: Whether panel needs background process (terminal, claude, codex, logs)
- **singleton**: Only one instance per session (diff, logs, dashboard, setup-tasks)
- **permanent**: Cannot be closed by user (diff, dashboard, setup-tasks)
- **canAppearInProjects**: Available in project view (all except diff)
- **canAppearInWorktrees**: Available in worktree sessions (all except dashboard, setup-tasks)
- **canEmit**: Events this panel can produce
- **canConsume**: Events this panel listens to

Example: Diff panels are singleton + permanent + worktree-only, consuming `files:changed` and `terminal:command_executed` events to auto-refresh.

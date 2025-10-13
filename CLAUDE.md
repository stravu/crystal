# Crystal - Multi-Session Claude Code Manager

Created by [Stravu](https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1)

## Project Overview

Crystal is a fully-implemented Electron desktop application for managing multiple AI code assistant instances (Claude Code and Codex) against a single directory using git worktrees. It provides a streamlined interface for running parallel AI assistant sessions with different approaches to the same problem.

## References
Use these reference pages for more information:
- How to invoke Claude Code through the command line as an SDK: https://docs.anthropic.com/en/docs/claude-code/sdk
- How to run multiple Claude Code instances with Git Worktrees: https://docs.anthropic.com/en/docs/claude-code/tutorials#run-parallel-claude-code-sessions-with-git-worktrees
- [**Adding New CLI Tools**](./docs/ADDING_NEW_CLI_TOOLS.md): Guide for extending Crystal to support additional CLI tools beyond Claude Code
- [**Implementing New CLI Agents**](./docs/IMPLEMENTING_NEW_CLI_AGENTS.md): Step-by-step instructions for adding new CLI agent tools with code examples and best practices
- [**Codex Configuration**](./main/src/services/panels/codex/CODEX_CONFIG.md): Configuration guide for Codex CLI integration

## Implementation Status: ✅ COMPLETE

All core features have been successfully implemented with significant enhancements beyond the original requirements.

## ✅ Implemented Features

### Core Session Management
- **Multi-session support**: Run multiple Claude Code instances simultaneously
- **Session templates**: Create single or multiple sessions with numbered templates
- **Session persistence**: SQLite database for persistent sessions across restarts
- **Session archiving**: Archive sessions instead of permanent deletion
- **Conversation continuation**: Resume conversations with full history context
- **Real-time status tracking**: initializing, running, waiting, stopped, error
- **Automatic session naming**: AI-powered session name generation based on prompts

### Git Worktree Integration  
- **Isolated development**: Each Claude Code session operates in its own git worktree
- **Conflict prevention**: Prevents conflicts between parallel development efforts
- **Automatic cleanup**: Worktree cleanup when sessions are deleted
- **Branch management**: Support for existing branches or creation of new branches
- **Empty repo handling**: Automatic initial commit for repositories with no commits

### Git Operations
- **Rebase from main**: Pull latest changes from main branch into worktree
- **Squash and rebase to main**: Combine all commits and rebase onto main
- **Diff visualization**: View all changes with syntax highlighting
- **Commit tracking**: History with statistics (additions, deletions, files changed)
- **Uncommitted changes**: Detection and display of uncommitted changes
- **Command preview**: Git command tooltips for transparency
- **Error handling**: Detailed error dialogs with full git output

### Project Management
- **Multiple projects**: Support for multiple projects with easy switching
- **Auto-initialization**: Automatic directory creation and git initialization
- **Project settings**: Custom prompts, run scripts, main branch configuration
- **Active project**: Persistent active project selection

### User Interface
- **Dual tab system**: Main view tabs (Output | Diff | Logs | Editor) with tool panel bar underneath
- **Tool Panel System**: Flexible panel framework supporting multiple terminal instances per session
- **Multiple view modes**:
  - Output View: Formatted terminal output with syntax highlighting
  - Messages View: Raw JSON message inspection for debugging
  - View Diff View: Git diff viewer with file statistics
  - Editor View: File editor with syntax highlighting
- **Multi-instance terminals**: Multiple XTerm.js terminals per session with 50,000 line scrollback
- **Panel management**: Create, switch, rename, and close tool panels dynamically
- **Sidebar navigation**: Session list, project selector, prompt history
- **Real-time updates**: IPC-based live output streaming
- **Status indicators**: Color-coded badges with animations
- **Unread indicators**: Activity tracking across views

### Prompt Management
- **Prompt history**: Complete history of all prompts across sessions
- **Search functionality**: Search prompts and session names
- **Quick reuse**: One-click prompt reuse for new sessions
- **Prompt navigation**: Jump to specific prompts within session output
- **Clipboard support**: Copy prompts to clipboard

### Advanced Terminal Features
- **Panel-based terminals**: Each terminal runs in its own panel with independent state
- **Multi-instance support**: Multiple terminal panels per session for parallel workflows
- **Multi-line input**: Auto-resizing textarea with keyboard shortcuts
- **Smart formatting**: Automatic formatting of JSON messages
- **Tool call display**: Clear visual structure for Claude's tool usage
- **Script execution**: Run project scripts with real-time output
- **Process management**: Start/stop script processes
- **State persistence**: Terminal scrollback, working directory, and history persist across app restarts
- **Lazy initialization**: Terminal processes only start when panels are first viewed

### Tool Panel System ✨ NEW
- **Flexible architecture**: Extensible panel framework supporting multiple panel types
- **Multi-instance terminals**: Run multiple terminal instances per session in separate panels
- **Lazy initialization**: Panels only start processes when first viewed for memory efficiency
- **State persistence**: Terminal scrollback, working directories, and panel configurations persist across restarts
- **Panel lifecycle management**: Create, switch, rename, and delete panels dynamically
- **Event-driven communication**: Panel event bus enabling future inter-panel communication
- **Always-visible panel bar**: Tool panel tabs always visible below main view tabs
- **Seamless integration**: Panels integrate with existing session and view management
- **Memory efficient**: Inactive panels suspend rendering while maintaining background processes
- **Future extensibility**: Architecture designed to support Claude, Diff, and Editor panels in future releases

### Settings & Configuration
- **Global settings**:
  - Verbose logging toggle
  - Anthropic API key configuration
  - Global system prompt additions
  - Custom Claude executable path
- **Notification settings**:
  - Desktop notifications toggle
  - Sound notifications with Web Audio API
  - Customizable triggers (status changes, waiting, completion, errors)
- **Project-specific settings**:
  - Custom system prompts per project
  - Run scripts for testing/building
  - Main branch customization

### Data Persistence
- **SQLite Database**:
  - `projects`: Project configurations, paths, and commit settings
  - `sessions`: Core session metadata with active_panel_id, folder_id, tool_type ('claude'|'codex'|'none'), and status tracking
  - `session_outputs`: Terminal output history (linked to panels via panel_id)
  - `conversation_messages`: Conversation history with tool calls/results (linked to panels via panel_id)
  - `execution_diffs`: Git diff tracking per execution (linked to panels via panel_id)
  - `prompt_markers`: Navigation markers for prompts with completion timestamps (linked to panels via panel_id)
  - `tool_panels`: Panel configurations, state, metadata, and settings (JSON)
  - `folders`: Hierarchical folder structure for organizing sessions (supports nesting via parent_folder_id)
  - `project_run_commands`: Multiple configurable run commands per project
  - `claude_panel_settings`: Claude-specific panel configuration (legacy, being migrated to tool_panels.settings)
  - `ui_state`: UI state persistence for application preferences
  - `app_opens`: Application launch tracking for analytics
  - `user_preferences`: User preference storage for application behavior
- **Automatic initialization**: `~/.crystal` directory created on first run
- **Migration system**: Dual migration system (TypeScript and SQL) for schema evolution
- **JSON Configuration**: Application configuration stored in ~/.crystal/config.json

### Developer Experience
- **Task Queue**: Bull queue with optional Redis support
- **Process Management**: node-pty for Claude Code instances
- **Error handling**: Comprehensive error reporting and recovery
- **Performance optimizations**: Lazy loading, debounced updates, caching
- **Keyboard shortcuts**: Cmd/Ctrl+Enter for input submission

## Technical Stack

### Electron Application
- **Main Process**: Electron main process with IPC communication
  - Window management with native OS integration
  - Custom ConfigManager for configuration persistence (~/.crystal/config.json)
  - IPC handlers for renderer communication

### Frontend (React 19 + TypeScript)
- **Framework**: React 19 with TypeScript
- **State Management**: Zustand for reactive state management
- **UI Styling**: Tailwind CSS utility-first framework
- **Terminal**: @xterm/xterm professional terminal emulator
- **Build Tool**: Vite for fast development
- **Icons**: Lucide React for consistent iconography

### Backend Services (Integrated in Main Process)
- **Runtime**: Node.js with TypeScript
- **IPC Server**: Direct IPC communication with renderer process
- **Database**: Better-SQLite3 for synchronous operations
- **Task Queue**: Bull with in-memory queue for Electron
- **Claude Integration**: @anthropic-ai/claude-code SDK
- **Process Management**: node-pty for PTY processes
- **Git Integration**: Command-line git worktree management

### Communication
- **Electron IPC**: Secure inter-process communication for all operations
- **Event System**: IPC-based event handling for real-time updates

## Architecture

```javascript
┌─────────────────────────────────────────────────────────┐
│              Electron Desktop Application                │
├─────────────────────────────────────────────────────────┤
│             Renderer Process (Frontend)                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐  │
│  │    Sidebar      │ │   Terminal      │ │   Help     │  │
│  │   (Sessions)    │ │   (XTerm.js)    │ │  Dialog    │  │
│  └─────────────────┘ └─────────────────┘ └────────────┘  │
├─────────────────────────────────────────────────────────┤
│                 IPC Communication                        │
├─────────────────────────────────────────────────────────┤
│              Main Process (Electron + Node.js)           │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│ │  Task Queue  │ │  Session     │ │   Config         │  │
│ │    (Bull)    │ │  Manager     │ │   Manager        │  │
│ └──────────────┘ └──────────────┘ └───────────────────┘  │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│ │  Worktree    │ │ Claude Code  │ │   Config         │  │
│ │  Manager     │ │   Manager    │ │   Manager        │  │
│ └──────────────┘ └──────────────┘ └───────────────────┘  │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│ │ IPC Handlers │ │    Event     │ │   Git Diff       │  │
│ │(git,session) │ │   Manager    │ │   Manager        │  │
│ └──────────────┘ └──────────────┘ └───────────────────┘  │
├─────────────────────────────────────────────────────────┤
│            Better-SQLite3 Database                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │  sessions   │ │session_     │ │conversation_        │ │
│  │   table     │ │outputs      │ │messages             │ │
│  └─────────────┘ └─────────────────┘ └─────────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │execution_   │ │prompt_      │ │ projects            │ │
│  │diffs        │ │markers      │ │                     │ │
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│         Claude Code SDK Instances (node-pty)             │
│              ┌─────────────────────────────┐              │
│              │     Git Worktrees           │              │
│              └─────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

## Critical Implementation Details

### Modular Architecture (Refactored)

The main process has been refactored from a monolithic `index.ts` file into a comprehensive modular structure:

**Core Main Process:**
- **`index.ts`** (776 lines): Core Electron setup and initialization
- **`events.ts`** (1,108 lines): Event handling and coordination

**IPC Handlers** (`main/src/ipc/`):
- **`session.ts`** (1,872 lines): Session management IPC handlers
- **`git.ts`** (1,391 lines): Git-related IPC handlers
- **`file.ts`** (865 lines): File operations (read/write/delete/list)
- **`dashboard.ts`** (741 lines): Dashboard overview and project status
- **`codexPanel.ts`** (496 lines): Codex AI panel management
- **`baseAIPanelHandler.ts`** (382 lines): Base class for AI panel handlers
- **`project.ts`** (349 lines): Project CRUD operations
- **`claudePanel.ts`** (268 lines): Claude AI panel management
- **`script.ts`** (230 lines): Script execution handlers
- **`panels.ts`** (228 lines): General panel lifecycle management
- Plus 13 additional specialized handlers

**Service Layer** (`main/src/services/`):
- **`sessionManager.ts`** (1,598 lines): Core session lifecycle management
- **`worktreeManager.ts`** (931 lines): Git worktree operations
- **`gitStatusManager.ts`** (872 lines): Git status tracking
- **`taskQueue.ts`** (671 lines): Async task queue management
- **`gitDiffManager.ts`** (606 lines): Diff generation and tracking
- **`cliToolRegistry.ts`** (532 lines): CLI tool registration system
- **`panelManager.ts`** (374 lines): Panel lifecycle coordinator
- **`terminalPanelManager.ts`** (370 lines): Terminal panel processes
- Plus 8 additional service modules

**Panel Services** (`main/src/services/panels/`):
- **`codex/codexManager.ts`** (1,251 lines): Codex CLI integration
- **`cli/AbstractCliManager.ts`** (994 lines): Abstract CLI manager base class
- **`claude/claudeCodeManager.ts`** (741 lines): Claude CLI integration
- **`logPanel/logsManager.ts`** (496 lines): Log panel management
- **`ai/AbstractAIPanelManager.ts`** (395 lines): Abstract AI panel base class
- **`codex/codexPanelManager.ts`** (403 lines): Codex panel lifecycle
- **`claude/claudePanelManager.ts`** (135 lines): Claude panel lifecycle

**Frontend Hooks** (`frontend/src/hooks/`):
- **`useSessionView.ts`** (1,694 lines): Session view logic and state management
- **`useClaudePanel.ts`** (475 lines): Claude panel state management
- **`useCliPanel.ts`** (452 lines): CLI panel state management
- **`useIPCEvents.ts`** (349 lines): IPC event handling
- **`useCodexPanel.ts`** (343 lines): Codex panel state management
- **`useAIInputPanel.ts`** (311 lines): AI input panel logic
- **`useNotifications.ts`** (212 lines): Notification system

**Frontend Stores** (`frontend/src/stores/`):
- **`sessionStore.ts`** (699 lines): Session state management with Zustand
- **`sessionPreferencesStore.ts`** (154 lines): User session preferences
- **`panelStore.ts`** (109 lines): Panel state management
- **`sessionHistoryStore.ts`** (93 lines): Session history tracking

**Major Frontend Components** (`frontend/src/components/`):
- **`DraggableProjectTreeView.tsx`** (2,565 lines): Main project/session tree UI
- **`CreateSessionDialog.tsx`** (1,293 lines): Session creation dialog
- **`ProjectTreeView.tsx`** (612 lines): Project tree display
- **`Settings.tsx`** (589 lines): Settings management UI
- **`SessionView.tsx`** (587 lines): Session display (uses useSessionView hook)

This modular structure improves maintainability and makes it easier to locate and modify specific functionality.

## API Endpoints

### Session Management
- `GET /api/sessions` - List all sessions with status
- `POST /api/sessions` - Create new session(s) with templates
- `GET /api/sessions/:id` - Get specific session details
- `DELETE /api/sessions/:id` - Archive session and cleanup worktree

### Session Interaction  
- `POST /api/sessions/:id/input` - Send input to Claude Code instance
- `POST /api/sessions/:id/continue` - Continue conversation with full history
- `GET /api/sessions/:id/output` - Retrieve session output history
- `GET /api/sessions/:id/conversation` - Get conversation message history

### Configuration
- `GET /api/config` - Get current application configuration
- `POST /api/config` - Update configuration settings

### Project Management
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project (with automatic directory/git init)
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project settings
- `POST /api/projects/:id/activate` - Set active project
- `DELETE /api/projects/:id` - Delete project

### Prompt Management
- `GET /api/prompts` - Get all prompts with associated sessions
- `GET /api/prompts/:sessionId/:lineNumber` - Navigate to specific prompt

## Development Workflow

1. **Session Creation**: User provides prompt and worktree template via dialog
2. **Worktree Setup**: Backend creates new git worktree using `git worktree add`
3. **Claude Instance**: Spawns Claude Code process in worktree using node-pty
4. **Database Storage**: Session metadata and output stored in SQLite
5. **Real-time Updates**: IPC streams session status and terminal output
6. **Session Management**: Users can switch between sessions, continue conversations

## Available Commands

### Setup & Installation
```bash
pnpm run setup         # One-time setup (install, build, and rebuild native modules)
```

### Development
```bash
pnpm electron-dev      # Run as Electron app in development mode
pnpm run dev           # Shorthand for electron-dev
pnpm dev               # Run frontend only (without Electron shell)
```

**Note:** You must run `pnpm run build:main` at least once before running `pnpm electron-dev` to compile the main process.

### Building
```bash
pnpm build             # Build for production (all platforms)
pnpm build:main        # Build main process only
pnpm build:frontend    # Build frontend only
```

### Building Packaged Electron App
```bash
pnpm build:mac         # Build for macOS (universal)
pnpm build:mac:x64     # Build for macOS (Intel only)
pnpm build:mac:arm64   # Build for macOS (Apple Silicon only)
pnpm build:linux       # Build for Linux
```

### Testing
```bash
pnpm test              # Run Playwright tests
pnpm test:ui           # Run tests with Playwright UI
pnpm test:headed       # Run tests in headed browser mode
```

### Code Quality
```bash
pnpm typecheck         # Type checking across all workspaces
pnpm lint              # Linting across all workspaces
```

## Project Structure

```javascript
crystal/
├── frontend/         # React renderer process
│   ├── src/
│   │   ├── components/      # React components (50+ files)
│   │   │   ├── panels/     # Panel components (Terminal, Claude, Codex, Diff, Editor, Logs, Dashboard, SetupTasks)
│   │   │   ├── Help.tsx    # Help dialog
│   │   │   ├── DraggableProjectTreeView.tsx  # Main project/session tree UI
│   │   │   └── ...         # Other UI components
│   │   ├── hooks/          # Custom React hooks (9 hooks)
│   │   │   ├── useSessionView.ts     # Session view logic (1,694 lines)
│   │   │   ├── useClaudePanel.ts     # Claude panel state
│   │   │   ├── useCodexPanel.ts      # Codex panel state
│   │   │   └── ...                   # Other hooks
│   │   ├── stores/         # Zustand state stores
│   │   │   ├── sessionStore.ts       # Session state (699 lines)
│   │   │   ├── panelStore.ts         # Panel state
│   │   │   └── ...                   # Other stores
│   │   ├── contexts/       # React context providers
│   │   ├── services/       # Frontend services
│   │   └── utils/          # Utility functions
│   │       └── timestampUtils.ts  # Timestamp handling
├── main/            # Electron main process
│   ├── src/
│   │   ├── index.ts         # Main entry point (776 lines)
│   │   ├── preload.ts       # Preload script
│   │   ├── events.ts        # Event handling (1,108 lines)
│   │   ├── database/        # SQLite database
│   │   │   └── migrations/  # Database migration files
│   │   ├── ipc/            # IPC handlers (23 handlers)
│   │   │   ├── git.ts      # Git operations (1,391 lines)
│   │   │   ├── session.ts  # Session management (1,872 lines)
│   │   │   ├── file.ts     # File operations (865 lines)
│   │   │   ├── claudePanel.ts  # Claude panel management
│   │   │   ├── codexPanel.ts   # Codex panel management
│   │   │   └── ...         # 18 more IPC handlers
│   │   ├── services/        # Business logic services (33 modules)
│   │   │   ├── sessionManager.ts      # Core session lifecycle (1,598 lines)
│   │   │   ├── worktreeManager.ts     # Git worktree operations (931 lines)
│   │   │   ├── panelManager.ts        # Panel lifecycle coordinator
│   │   │   ├── terminalPanelManager.ts # Terminal panel processes
│   │   │   ├── taskQueue.ts           # Bull queue
│   │   │   └── panels/                # Panel-specific services
│   │   │       ├── claude/            # Claude CLI integration
│   │   │       ├── codex/             # Codex CLI integration
│   │   │       ├── cli/               # Abstract CLI manager
│   │   │       └── ai/                # Abstract AI panel base
│   │   ├── polyfills/       # Node.js polyfills
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Utility functions
│   │       └── timestampUtils.ts  # Timestamp handling
│   └── dist/               # Compiled output
├── shared/          # Shared TypeScript types
│   └── types/
│       └── panels.ts       # Panel type definitions
├── tests/           # E2E tests (Playwright)
├── scripts/         # Build and utility scripts
├── docs/            # Documentation
│   ├── troubleshooting/    # Troubleshooting guides
│   ├── ADDING_NEW_CLI_TOOLS.md
│   └── IMPLEMENTING_NEW_CLI_AGENTS.md
├── dist-electron/   # Packaged Electron app (generated during build)
├── package.json     # Root workspace configuration
└── pnpm-workspace.yaml
```

## User Guide

### Quick Start
1. **Create/Select Project**: Choose a project directory or create a new one
2. **Create Session**: Click "Create Session" and enter a prompt
3. **Parallel Sessions**: Run multiple sessions for different approaches
4. **View Results**: Switch between Output, View Diff, and Terminal views

### Using the Help System
- Click the **?** button in the sidebar to open the comprehensive help dialog
- The help dialog covers all features, keyboard shortcuts, and tips

### Session States Explained
- 🟢 **Initializing**: Setting up git worktree
- 🟢 **Running**: Claude is actively processing
- 🟡 **Waiting**: Needs your input
- ⚪ **Completed**: Task finished successfully
- 🔵 **New Activity**: Session has new unviewed results
- 🔴 **Error**: Something went wrong

### Git Operations
- **Rebase from main**: Updates your worktree with latest main branch changes
- **Squash and rebase**: Combines all commits and rebases onto main
- Always preview commands with tooltips before executing

### Best Practices
1. Use descriptive prompts for better AI-generated session names
2. Create multiple sessions to explore different solutions
3. Review View Diff tab before git operations
4. Use Terminal tab to run tests after changes
5. Archive completed sessions to keep the list manageable
6. Set up project-specific prompts for consistency

## Troubleshooting

### Common Issues
1. **Session won't start**: Check if git repository is initialized
2. **Git operations fail**: Ensure no uncommitted changes conflict
3. **Terminal not responding**: Check if Claude Code is installed correctly
4. **Notifications not working**: Grant permission when prompted

### Debug Mode
Enable verbose logging in Settings to see detailed logs for troubleshooting.

### Frontend Console Debugging (Development Only)

In development mode, Crystal automatically captures all frontend console logs and writes them to a file that Claude Code can read for debugging purposes.

**Location**: `crystal-frontend-debug.log` and `crystal-backend-debug.log`in the project root directory


**Usage for Claude Code debugging**:
1. Add debug console.log statements to frontend components
2. Reproduce the issue in the Crystal app
3. Read `crystal-frontend-debug.log` and `crystal-backend-debug.log` to see what happened
4. No need to manually check Chrome DevTools or ask humans to copy logs

`crystal-frontend-debug.log` and `crystal-backend-debug.log` are reset every time the user runs in development mode, so if they report that a change is not working, you can look at those logs and they will represent the session they tested the change.

**IMPORTANT** Logs are best investigated in a sub-agent

**File rotation**: The log file grows continuously during development. Delete or truncate it manually if it gets too large.

**Note**: This feature is only active in development mode and will not affect production builds.

## TypeScript Coding Standards

### NO 'ANY' TYPE USAGE

**IMPORTANT**: This codebase enforces a strict no-any policy. The TypeScript 'any' type is NOT allowed.

- ❌ **NEVER use \****`any`**\*\* type** - ESLint will error and CI/CD will fail
- ✅ Use `unknown` when the type is truly unknown (requires type guards before use)
- ✅ Use specific types or interfaces whenever possible
- ✅ Use generics with type constraints for flexible but type-safe code


**Enforcement**:
- ESLint rule `@typescript-eslint/no-explicit-any` is set to `'error'`
- GitHub Actions quality workflow enforces this on all PRs
- Local development will show errors immediately

## Disclaimer

Crystal is an independent project created by [Stravu](https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1). Claude™ is a trademark of Anthropic, PBC. Crystal is not affiliated with, endorsed by, or sponsored by Anthropic. This tool is designed to work with Claude Code, which must be installed separately.

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
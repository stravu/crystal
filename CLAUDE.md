# Crystal - Multi-Session Claude Code Manager

Created by [Stravu](https://stravu.com/)

## Project Overview

Crystal is a fully-implemented Electron desktop application for managing multiple Claude Code instances against a single directory using git worktrees. It provides a streamlined interface for running parallel Claude Code sessions with different approaches to the same problem.

## References
Use these reference pages for more information:
- How to invoke Claude Code through the command line as an SDK: https://docs.anthropic.com/en/docs/claude-code/sdk
- How to run multiple Claude Code instances with Git Worktrees: https://docs.anthropic.com/en/docs/claude-code/tutorials#run-parallel-claude-code-sessions-with-git-worktrees

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
- **Professional terminal**: XTerm.js with 50,000 line scrollback buffer
- **Multiple view modes**:
  - Output View: Formatted terminal output with syntax highlighting
  - Messages View: Raw JSON message inspection for debugging
  - Changes View: Git diff viewer with file statistics
  - Terminal View: Dedicated terminal for running project scripts
- **Sidebar navigation**: Session list, project selector, prompt history
- **Real-time updates**: WebSocket-based live output streaming
- **Status indicators**: Color-coded badges with animations
- **Unread indicators**: Activity tracking across views

### Prompt Management
- **Prompt history**: Complete history of all prompts across sessions
- **Search functionality**: Search prompts and session names
- **Quick reuse**: One-click prompt reuse for new sessions
- **Prompt navigation**: Jump to specific prompts within session output
- **Clipboard support**: Copy prompts to clipboard

### Advanced Terminal Features
- **Multi-line input**: Auto-resizing textarea with keyboard shortcuts
- **Smart formatting**: Automatic formatting of JSON messages
- **Tool call display**: Clear visual structure for Claude's tool usage
- **Script execution**: Run project scripts with real-time output
- **Process management**: Start/stop script processes

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
  - `projects`: Project configurations and paths
  - `sessions`: Core session metadata
  - `session_outputs`: Terminal output history
  - `conversation_messages`: Conversation history for continuations
  - `execution_diffs`: Git diff tracking per execution
  - `prompt_markers`: Navigation markers for prompts
- **Automatic initialization**: `~/.crystal` directory created on first run
- **Migration system**: SQL migrations for schema evolution
- **Electron Store**: Application configuration persistence

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
  - Electron Store for configuration persistence
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
- **API Server**: Express.js embedded server on port 3001
- **Database**: Better-SQLite3 for synchronous operations
- **Task Queue**: Bull with in-memory queue for Electron
- **Claude Integration**: @anthropic-ai/claude-code SDK
- **Process Management**: node-pty for PTY processes
- **Git Integration**: Command-line git worktree management

### Communication
- **Electron IPC**: Secure inter-process communication
- **WebSockets**: Socket.io for real-time updates (development mode)
- **RESTful API**: Express endpoints for CRUD operations

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Electron Desktop Application                │
├─────────────────────────────────────────────────────────┤
│             Renderer Process (Frontend)                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐  │
│  │    Sidebar      │ │   Terminal      │ │   Help     │  │
│  │   (Sessions)    │ │   (XTerm.js)    │ │  Dialog    │  │
│  └─────────────────┘ └─────────────────┘ └────────────┘  │
├─────────────────────────────────────────────────────────┤
│          IPC Communication / WebSocket (dev)             │
├─────────────────────────────────────────────────────────┤
│              Main Process (Electron + Node.js)           │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│ │   Express    │ │  Task Queue  │ │   Session        │  │
│ │   Server     │ │    (Bull)    │ │   Manager        │  │
│ └──────────────┘ └──────────────┘ └───────────────────┘  │
│ ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│ │  Worktree    │ │ Claude Code  │ │   Config         │  │
│ │  Manager     │ │   Manager    │ │   Manager        │  │
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

### Session Output Handling (DO NOT MODIFY WITHOUT EXPLICIT PERMISSION)

⚠️ **WARNING**: The session output handling system is complex and fragile. Modifying it frequently causes issues like duplicate messages, disappearing content, or blank screens. Any changes require explicit user permission.

#### How It Works:

1. **Database Storage**:
   - Raw JSON messages from Claude are stored as-is in the database
   - Stdout/stderr outputs are stored directly
   - No formatting or transformation happens at storage time

2. **Real-time Streaming**:
   - When Claude outputs data, it's saved to the database immediately
   - For JSON messages, a formatted stdout version is sent to the frontend for the Output view
   - The original JSON is also sent for the Messages view
   - This provides immediate visual feedback during active sessions

3. **Session Loading**:
   - When navigating to a session, outputs are loaded from the database
   - The `sessions:get-output` handler transforms JSON messages to formatted stdout on-the-fly
   - Uses `setSessionOutputs` for atomic updates to prevent race conditions

4. **Frontend Display**:
   - The SessionView component formats outputs for terminal display
   - A mutex lock (`loadingRef`) prevents concurrent loads
   - Timing is carefully managed with `requestAnimationFrame` and delays
   - The `formattedOutput` state is NOT cleared on session switch - it updates naturally

5. **Key Principles**:
   - Database is the single source of truth
   - Transformations happen on-the-fly, not at storage time
   - Real-time updates supplement but don't replace database data
   - Session switches always reload from database to ensure consistency

#### Common Issues and Solutions:

- **Duplicate messages**: Usually caused by sending both formatted and raw versions
- **Disappearing content**: Often due to clearing output states at the wrong time
- **Black screens**: Typically from race conditions during session switching
- **Content only loads once**: Results from improper state management or missing dependencies

The current implementation carefully balances real-time updates with data persistence to provide a smooth user experience.

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
5. **Real-time Updates**: WebSocket streams session status and terminal output
6. **Session Management**: Users can switch between sessions, continue conversations

## Available Commands

```bash
# One-time setup (install, build, and rebuild native modules)
pnpm run setup

# Run as Electron app in development mode
pnpm electron-dev
# Or use the shorthand:
pnpm run dev

# Run frontend only (without Electron shell)
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

**Note:** You must run `pnpm run build:main` at least once before running `pnpm electron-dev` to compile the main process.

### Building Packaged Electron App

```bash
# Build for macOS
pnpm build:mac    # macOS (only works on macOS)
```

## Project Structure

```
crystal/
├── frontend/         # React renderer process
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── Help.tsx    # Help dialog
│   │   │   └── ...        # Other UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── stores/         # Zustand state stores
│   │   └── utils/          # Utility functions
├── main/            # Electron main process
│   ├── src/
│   │   ├── index.ts         # Main entry point
│   │   ├── preload.ts       # Preload script
│   │   ├── database/        # SQLite database
│   │   ├── services/        # Business logic services
│   │   │   ├── taskQueue.ts # Bull queue for async tasks
│   │   │   └── ...         # Other service modules
│   │   ├── routes/          # API routes
│   │   └── types/           # TypeScript types
│   └── dist/               # Compiled output
├── shared/          # Shared TypeScript types
├── dist-electron/   # Packaged Electron app
├── package.json     # Root workspace configuration
└── pnpm-workspace.yaml
```

## User Guide

### Quick Start
1. **Create/Select Project**: Choose a project directory or create a new one
2. **Create Session**: Click "Create Session" and enter a prompt
3. **Parallel Sessions**: Run multiple sessions for different approaches
4. **View Results**: Switch between Output, Changes, and Terminal views

### Using the Help System
- Click the **?** button in the sidebar to open the comprehensive help dialog
- The help dialog covers all features, keyboard shortcuts, and tips

### Session States Explained
- 🔵 **Initializing**: Setting up git worktree
- 🟢 **Running**: Claude is actively processing
- 🟡 **Waiting**: Needs your input
- ⚪ **Stopped**: Session completed or stopped
- 🔴 **Error**: Something went wrong

### Git Operations
- **Rebase from main**: Updates your worktree with latest main branch changes
- **Squash and rebase**: Combines all commits and rebases onto main
- Always preview commands with tooltips before executing

### Best Practices
1. Use descriptive prompts for better AI-generated session names
2. Create multiple sessions to explore different solutions
3. Review Changes tab before git operations
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

## Disclaimer

Crystal is an independent project created by [Stravu](https://stravu.com/). Claude™ is a trademark of Anthropic, PBC. Crystal is not affiliated with, endorsed by, or sponsored by Anthropic. This tool is designed to work with Claude Code, which must be installed separately.

## important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
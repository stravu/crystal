# Claude Code Commander

## Project Overview

Claude Code Commander (CCC) is a fully-implemented Electron desktop application for managing multiple Claude Code instances against a single directory using git worktrees. It provides a streamlined interface for running parallel Claude Code sessions with different approaches to the same problem.

## References
Use these reference pages for more information:
- How to invoke Claude Code through the command line as an SDK: https://docs.anthropic.com/en/docs/claude-code/sdk
- How to run multiple Claude Code instances with Git Worktrees: https://docs.anthropic.com/en/docs/claude-code/tutorials#run-parallel-claude-code-sessions-with-git-worktrees

## Implementation Status: ✅ COMPLETE

All core features have been successfully implemented with significant enhancements beyond the original requirements.

## ✅ Implemented Features

### Session Management
- **Multi-session support**: ✅ Run multiple Claude Code instances simultaneously
- **Sidebar interface**: ✅ Left sidebar with session list and status indicators
- **Session templates**: ✅ Create single or multiple sessions with numbered templates
- **Visual indicators**: ✅ Real-time status indicators (initializing, running, waiting, stopped, error)
- **Session persistence**: ✅ SQLite database for persistent sessions across restarts
- **Session archiving**: ✅ Archive sessions instead of permanent deletion
- **Conversation continuation**: ✅ Resume conversations with full history context

### Git Worktree Integration
- ✅ Each Claude Code session operates in its own git worktree
- ✅ Prevents conflicts between parallel development efforts
- ✅ Automatic worktree cleanup when sessions are deleted
- ✅ Proper error handling for worktree operations

### Advanced Terminal Interface
- **Professional terminal**: ✅ XTerm.js terminal with full theme support
- **Dual view system**: ✅ Switch between Terminal and JSON Messages views
- **Real-time streaming**: ✅ Live output streaming via WebSocket
- **History preservation**: ✅ Complete terminal output history stored in database

### User Interface
- **Left sidebar**: ✅ Lists all sessions with comprehensive status indicators
- **Main terminal area**: ✅ Professional terminal interface with theme support
- **Session creation dialog**: ✅ Modal with prompt, worktree template, and count options
- **Settings panel**: ✅ Configuration management interface
- **Responsive design**: ✅ Works across different screen sizes

## Technical Stack

### Electron Application
- **Main Process**: Electron main process with IPC communication
  - Window management with native OS integration
  - Electron Store for configuration persistence
  - IPC handlers for renderer communication

### Frontend (React 19 + TypeScript)
- **Framework**: React 19 with TypeScript
  - Modern React features and strong typing
  - Component-based architecture
- **State Management**: Zustand
  - Lightweight, reactive state management
- **UI Styling**: Tailwind CSS
  - Utility-first CSS framework
- **Terminal**: @xterm/xterm
  - Professional terminal emulator with theme support
- **Build Tool**: Vite
  - Fast development server with hot reload
- **Communication**: Dual mode support
  - Electron IPC for production
  - WebSockets for development

### Backend Services (Integrated in Main Process)
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js embedded server
  - RESTful API endpoints
  - Comprehensive route structure
- **Database**: Better-SQLite3
  - Synchronous SQLite operations
  - Session persistence and history
- **Task Queue**: Bull with optional Redis
  - Async task processing for session creation
  - In-memory queue for standalone Electron
- **Claude Integration**: @anthropic-ai/claude-code
  - Official Claude Code SDK
- **Process Management**: node-pty
  - PTY processes for Claude Code instances
- **Git Integration**: Command-line git worktree management

### Communication
- **Electron IPC**: Inter-process communication
  - Main-to-renderer messaging
  - Secure context isolation
- **WebSockets**: Socket.io (development mode)
  - Real-time bidirectional communication
  - Session status updates
  - Live terminal output streaming
- **API Server**: Embedded Express server
  - Runs on port 3001
  - Serves API endpoints

### Data Persistence
- **Database**: Better-SQLite3 with synchronous operations
  - `sessions` table: Core session metadata
  - `session_outputs` table: Terminal output history  
  - `conversation_messages` table: Conversation history for continuations
  - `execution_diffs` table: Git diff tracking
  - `prompt_markers` table: Prompt execution markers
- **Migrations**: SQL migration system for schema evolution
- **Electron Store**: Application configuration

### Development Tools
- **Package Manager**: pnpm with workspace configuration
- **Monorepo Structure**: Frontend, main process, and shared types
- **TypeScript**: Comprehensive type safety across all packages
- **Electron Builder**: Cross-platform desktop app packaging

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Electron Desktop Application                │
├─────────────────────────────────────────────────────────┤
│             Renderer Process (Frontend)                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌────────────┐  │
│  │    Sidebar      │ │   Terminal      │ │  Settings  │  │
│  │   (Sessions)    │ │   (XTerm.js)    │ │  (Config)  │  │
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
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
│  ┌─────────────┐ ┌─────────────┐                         │
│  │execution_   │ │prompt_      │                         │
│  │diffs        │ │markers      │                         │
│  └─────────────┘ └─────────────┘                         │
├─────────────────────────────────────────────────────────┤
│         Claude Code SDK Instances (node-pty)             │
│              ┌─────────────────────────────┐              │
│              │     Git Worktrees           │              │
│              └─────────────────────────────┘              │
└─────────────────────────────────────────────────────────┘
```

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

## Development Workflow

1. **Session Creation**: User provides prompt and worktree template via dialog
2. **Worktree Setup**: Backend creates new git worktree using `git worktree add`
3. **Claude Instance**: Spawns Claude Code process in worktree using node-pty
4. **Database Storage**: Session metadata and output stored in SQLite
5. **Real-time Updates**: WebSocket streams session status and terminal output
6. **Session Management**: Users can switch between sessions, continue conversations

## Available Commands

All commands are working and tested:
- `npm run dev` - Start Electron app in development mode
- `npm run build` - Build Electron app for production
- `npm run build:main` - Build main process only
- `npm run build:renderer` - Build renderer process only
- `npm run build:electron` - Package Electron app for distribution
- `npm run preview` - Preview Electron app
- `npm run lint` - Run linting across all packages
- `npm run typecheck` - Run TypeScript checking across all packages

## Project Structure

```
ccc/
├── frontend/         # React renderer process
├── main/            # Electron main process
│   ├── src/
│   │   ├── index.ts         # Main entry point
│   │   ├── preload.ts       # Preload script
│   │   ├── server.ts        # Embedded Express server
│   │   ├── database/        # SQLite database
│   │   ├── services/        # Business logic services
│   │   │   ├── taskQueue.ts # Bull queue for async tasks
│   │   │   └── ...         # Other service modules
│   │   ├── routes/          # API routes
│   │   └── types/           # TypeScript types
│   └── dist/               # Compiled output
├── backend/          # Legacy backend (for reference)
├── shared/          # Shared TypeScript types
├── dist-electron/   # Packaged Electron app
├── package.json     # Root workspace configuration
└── pnpm-workspace.yaml
```
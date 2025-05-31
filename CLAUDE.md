# Claude Code Commander

## Project Overview

Claude Code Commander (CCC) is a locally-run web application designed to manage multiple Claude Code instances against a single directory using git worktrees. It provides a streamlined interface for running parallel Claude Code sessions with different approaches to the same problem.

## References
Use these reference pages for more information:
How to invoke Claude Code through the command line as an SDK: https://docs.anthropic.com/en/docs/claude-code/sdk
How to run multiple Claude Code instances with Git Worktrees: https://docs.anthropic.com/en/docs/claude-code/tutorials#run-parallel-claude-code-sessions-with-git-worktrees


## Original Prompt

I want to build 'Claude Code Commander', a locally-run web application for managing multiple Claude Code instances against a single directory using git worktrees.

It should be a single-page application that allows me to tab between Claude Code sessions. I want a left bar listing all my existing sessions, and controls to add new sessions by providing a prompt and a worktree name template. When I make a new session, I can make one session or I can make multiple. If I make multiple, it will append a number to the worktree name template. There should be icons in the left pane so I know when sessions are ready for my next input.

## Core Features

### Session Management
- **Multi-session support**: Run multiple Claude Code instances simultaneously
- **Tab-based interface**: Switch between sessions easily
- **Session templates**: Create single or multiple sessions with customizable naming patterns
- **Visual indicators**: Icons show when sessions are ready for user input

### Git Worktree Integration
- Each Claude Code session operates in its own git worktree
- Prevents conflicts between parallel development efforts
- Easy comparison and merging of different approaches

### User Interface
- **Left sidebar**: Lists all active sessions with status indicators
- **Main area**: Displays the current session's Claude Code interface
- **Session creation**: Controls for adding new sessions with:
  - Custom prompt input
  - Worktree name template
  - Option to create multiple numbered sessions

## Technical Stack

### Frontend
- **Framework**: React with TypeScript
  - Component-based architecture for UI modularity
  - Strong typing for reliability
- **State Management**: Zustand
  - Lightweight and simple state management
- **UI Library**: Tailwind CSS + shadcn/ui
  - Rapid styling with utility classes
  - Pre-built accessible components
- **Build Tool**: Vite
  - Fast development server
  - Optimized production builds

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
  - RESTful API endpoints
  - WebSocket support for real-time updates
- **Claude Code SDK**: @anthropic-ai/claude-code
  - Programmatic control of Claude Code sessions
- **Process Management**: node-pty
  - Terminal emulation for Claude Code instances

### Communication
- **WebSockets**: Socket.io
  - Real-time bidirectional communication
  - Session status updates
  - Terminal output streaming

### Development Tools
- **Package Manager**: pnpm
  - Efficient dependency management
- **Linting**: ESLint + Prettier
  - Code quality and consistency
- **Testing**: Vitest + React Testing Library
  - Unit and integration tests

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React SPA)                   │
├─────────────────────────────────────────────────────────┤
│                  WebSocket Connection                    │
├─────────────────────────────────────────────────────────┤
│                 Backend (Node.js/Express)                │
├──────────────────────┬──────────────────────────────────┤
│  Session Manager     │        Git Worktree Manager      │
├──────────────────────┴──────────────────────────────────┤
│              Claude Code SDK Instances                   │
└─────────────────────────────────────────────────────────┘
```

## Development Workflow

1. **Session Creation**: User provides prompt and worktree template
2. **Worktree Setup**: Backend creates new git worktree
3. **Claude Instance**: Spawns new Claude Code process in worktree
4. **Real-time Updates**: WebSocket streams session output to frontend
5. **Session Management**: User can switch between tabs, monitor progress

## Key Commands

When implementing, ensure the following commands are available:
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run linting checks
- `npm run typecheck` - Run TypeScript type checking
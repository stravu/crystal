# Crystal - Build Instructions

## Prerequisites

- Node.js 22.15.1
- pnpm (`npm install -g pnpm`)
- Git (for repository management)

## Build Steps

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

## Building Packaged Electron App

### Build for Current Platform
```bash
pnpm build
```

### Build for All Platforms
```bash
# Build for macOS
pnpm build:mac

# Build for Windows
pnpm build:win

# Build for Linux
pnpm build:linux

# Build for all platforms at once
pnpm build:all
```

**Note:** Cross-platform builds have limitations:
- Windows apps can be built on any platform
- macOS apps can only be built on macOS
- Linux apps can be built on any platform

## Build Output

After building, packaged applications will be in the `dist-electron` directory:
- macOS: `Crystal-1.0.0-arm64.dmg` and `Crystal-1.0.0-arm64-mac.zip`
- Windows: `Crystal Setup 1.0.0.exe`
- Linux: `Crystal-1.0.0.AppImage`

## Features

### Automatic Directory Creation
- Crystal automatically creates the `~/.ccc` directory for configuration and database storage on first run
- When creating a new project, Crystal will:
  - Create the project directory if it doesn't exist
  - Initialize a Git repository if the directory isn't already a Git repo
  - This ensures all projects are properly set up for worktree management

### Project Management
- Projects represent Git repositories where Claude Code sessions will be created
- Each session runs in its own Git worktree to enable parallel development
- Multiple sessions can work on the same codebase without conflicts
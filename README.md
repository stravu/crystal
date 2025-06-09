# Crystal - Multi-Session Claude Code Manager

Crystal is an Electron desktop application that lets you run multiple Claude Code instances simultaneously using git worktrees. Perfect for exploring different solutions to the same problem in parallel.

![Crystal Logo](frontend/src/assets/crystal-logo.svg)

## ✨ Key Features

- **🚀 Parallel Sessions** - Run multiple Claude Code instances at once
- **🌳 Git Worktree Isolation** - Each session gets its own branch
- **💾 Session Persistence** - Resume conversations anytime
- **🎯 Smart UI** - Professional terminal with real-time updates
- **🔧 Git Integration** - Built-in rebase and squash operations
- **📊 Change Tracking** - View diffs and track modifications
- **🔔 Notifications** - Desktop alerts when sessions need input

## 🚀 Quick Start

### Prerequisites
- Node.js 22+ and pnpm
- Claude Code CLI installed
- Git repository (Crystal will initialize one if needed)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ccc.git
cd ccc

# One-time setup
pnpm run setup

# Run in development
pnpm run dev
```

### Building for Production

```bash
# Build for your current platform
pnpm build

# Platform-specific builds
pnpm build:mac    # macOS
pnpm build:win    # Windows  
pnpm build:linux  # Linux
```

## 📖 How to Use

### 1. Create a Session
Click "Create Session" and enter:
- **Prompt**: What you want Claude to do
- **Worktree Name**: Branch name (optional)
- **Count**: Number of parallel sessions

### 2. Manage Sessions
- **🟢 Running**: Claude is working
- **🟡 Waiting**: Needs your input
- **⚪ Stopped**: Completed or paused
- Click any session to view or continue it

### 3. View Your Work
- **Output**: Formatted terminal output
- **Changes**: Git diffs of all modifications
- **Terminal**: Run tests or build scripts
- **Messages**: Raw JSON for debugging

### 4. Git Operations
- **Rebase from main**: Pull latest changes
- **Squash and rebase**: Combine commits
- Preview commands before executing

## ⚙️ Configuration

### Global Settings
Access via the ⚙️ button:
- Verbose logging
- Anthropic API key
- System prompts
- Notifications

### Project Settings
Per-project configuration:
- Custom prompts
- Test/build scripts
- Main branch name

## 🎯 Tips & Tricks

1. **Parallel Development**: Create multiple sessions with different prompts to explore various solutions
2. **Quick Testing**: Use the Terminal tab to run tests after Claude makes changes
3. **Change Review**: Always check the Changes tab before git operations
4. **Session Names**: Use descriptive prompts for auto-generated session names
5. **Keyboard Shortcut**: `Cmd/Ctrl + Enter` to send input

## 🛠️ Development

### Project Structure
```
ccc/
├── frontend/     # React UI
├── main/         # Electron main process
├── shared/       # Shared types
└── backend/      # Legacy (reference only)
```

### Commands
```bash
pnpm dev          # Run in development
pnpm typecheck    # Type checking
pnpm lint         # Linting
pnpm build        # Build for production
```

## 📝 Documentation

- **In-App Help**: Click the **?** button for comprehensive help
- **Technical Docs**: See [CLAUDE.md](CLAUDE.md) for architecture details

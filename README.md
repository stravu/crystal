# Crystal - Multi-Session Claude Code Manager

**Version 0.1.0**

Crystal is an Electron desktop application that lets you run multiple Claude Code instances simultaneously using git worktrees. Perfect for exploring different solutions to the same problem in parallel. Crystal is an independent project created by [Stravu](https://stravu.com/). Stravu is the way AI-first teams collaborate.

<div align="center">
  <img src="frontend/src/assets/crystal-logo.svg" width="30%">
</div>


## ✨ Key Features

- **🚀 Parallel Sessions** - Run multiple Claude Code instances at once
- **🌳 Git Worktree Isolation** - Each session gets its own branch
- **💾 Session Persistence** - Resume conversations anytime
- **🔧 Git Integration** - Built-in rebase and squash operations
- **📊 Change Tracking** - View diffs and track modifications
- **🔔 Notifications** - Desktop alerts when sessions need input
- **🏗️ Run Scripts** - Test changes instantly without leaving Crystal

## 🚀 Quick Start

### Prerequisites
- Node.js 22+ and pnpm
- Claude Code installed and logged in or API key provided
- Git installed
- Git repository (Crystal will initialize one if needed)

### Linux-specific Requirements
- Required build tools for native modules:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install build-essential python3
  
  # Fedora/RHEL
  sudo dnf install gcc-c++ make python3
  
  # Arch
  sudo pacman -S base-devel python
  ```

### Installation

```bash
# Clone the repository
git clone https://github.com/stravu/crystal.git
cd crystal

# One-time setup
pnpm run setup

# Run in development
pnpm run electron-dev
```

### Building for Production

```bash
# Build for your current platform
pnpm build

# Platform-specific builds
pnpm build:mac    # macOS
pnpm build:linux  # Linux (has not been tested)
```

### Installing Pre-built Releases

See [INSTALL_INSTRUCTIONS.md](INSTALL_INSTRUCTIONS.md) for detailed installation instructions for macOS and Linux pre-built releases.

## 📖 How to Use

### 1. Create a Project
You must create a project before you can proceed. A project should point to a git repository. If there is no repo in the folder you select one will be created.

### 2. Create a Session
Click "Create Session" and enter:
- **Prompt**: What you want Claude to do
- **Worktree Name**: Branch name (optional)
- **Count**: Number of parallel sessions

### 3. Manage Sessions
- **🟢 Running**: Claude is working
- **🟡 Waiting**: Needs your input
- **⚪ Stopped**: Completed or paused
- Click any session to view or continue it

### 4. View Your Work
- **Output**: Formatted terminal output
- **Changes**: Git diffs of all modifications
- **Terminal**: Run tests or build scripts
- **Messages**: Raw JSON for debugging

### 5. Run Scripts
Configure project-specific scripts in the project settings:
- **Run scripts**: Execute dev servers, test watchers, or any continuous processes
- Scripts run in the Terminal tab while Claude is working
- Each line runs sequentially - perfect for setup commands followed by servers
- All scripts stop automatically when the session ends

### 6. Git Operations
- **Rebase from main**: Pull latest changes
- **Squash and rebase**: Combine commits
- Preview commands before executing

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License

Crystal is open source software licensed under the [MIT License](LICENSE).

## Disclaimer

Crystal is an independent project created by [Stravu](https://stravu.com/). Claude™ is a trademark of Anthropic, PBC. Crystal is not affiliated with, endorsed by, or sponsored by Anthropic. This tool is designed to work with Claude Code, which must be installed separately.

---

<div align="center">
  <img src="frontend/public/stravu-logo.png" alt="Stravu Logo" width="80" height="80">
  <br>
  Made with ❤️ by <a href="https://stravu.com/">Stravu</a>
</div>

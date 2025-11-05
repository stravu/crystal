# Crystal - Multi-Session AI Code Assistant Manager

<div align="center">
  <h3><a href="https://github.com/stravu/crystal/releases/latest">**Get the Latest Release Here**</a></h3>
</div>

<div align="center">

[![Build](https://github.com/stravu/crystal/actions/workflows/build.yml/badge.svg)](https://github.com/stravu/crystal/actions/workflows/build.yml)
[![Quality](https://github.com/stravu/crystal/actions/workflows/quality.yml/badge.svg)](https://github.com/stravu/crystal/actions/workflows/quality.yml)
[![Join our Discord](https://img.shields.io/badge/Join%20our-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/XrVa6q7DPY)

</div>

<div align="center">
  <strong>Crystal lets you use AI on isolated copies of your code so you can work on multiple tasks instead of waiting for your agents to finish.</strong>
</div>

<br>
<br>

<div align="center">
  <img src="https://github.com/user-attachments/assets/45ca7166-e69a-4ed2-8ef5-ef83dc52ffd6" alt="Run one or more sessions with Claude Code, Codex, or both" width="400"/>
  <p><em>Run one or more sessions with Claude Code, Codex, or both</em></p>
</div>

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <img src="https://github.com/user-attachments/assets/e180691e-aaa3-4171-bdae-3b0459dcc495" alt="Rich output for your agents" width="400"/>
        <p><em>Rich output for your agents</em></p>
      </td>
      <td align="center" width="50%">
        <img src="https://github.com/user-attachments/assets/1f64ac92-9158-4e83-997e-6650a9bc9072" alt="Run your code and test before merging" width="400"/>
        <p><em>Run your code and test before merging</em></p>
      </td>
    </tr>
  </table>
</div>

<div align="center" style="max-width: 600px; margin: 0 auto;">

https://github.com/user-attachments/assets/5ca66e5b-8d05-4570-8417-5e8dcd7726ef

</div>

---

## The Crystal Workflow

1. Create sessions from prompts, each in an isolated git worktree
2. Iterate with your AI assistant (Claude Code or Codex) inside your sessions. Each iteration will make a commit so you can always go back.
3. Review the diff changes and make manual edits as needed
4. Squash your commits together with a new message and merge to your main branch.

---

## 🚀 Quick Start

### Prerequisites
- **For Claude Code**: Claude Code installed and logged in or API key provided
- **For Codex**: Codex installed (via npm: `@openai/codex` or Homebrew) with ChatGPT account or API key
- Git installed
- Git repository (Crystal will initialize one if needed)

### 1. Create a Project
Create a new project if you haven't already. This can be an empty folder or an existing git repository. Crystal will initialize git if needed.

### 2. Create Sessions from a Prompt
For any feature you're working on, create one or multiple new sessions:
- Each session will be an isolated git worktree

### 3. Monitor and Test Your Changes
As sessions complete:
- **Configure run scripts** in project settings to test your application without leaving Crystal
- **Use the diff viewer** to review all changes and make manual edits as needed
- **Continue conversations** with your AI assistant if you need additional changes

### 4. Finalize Your Changes
When everything looks good:
- Click **"Rebase to main"** to squash all commits with a new message and rebase them to your main branch
- This creates a clean commit history on your main branch

### Git Operations
- **Rebase from main**: Pull latest changes from main into your worktree
- **Squash and rebase to main**: Combine all commits and rebase onto main
- Always preview commands with tooltips before executing

---

## Installation

### Download Pre-built Binaries

- **macOS**: Download `Crystal-{version}.dmg` from the [latest release](https://github.com/stravu/crystal/releases/latest)
  - Open the DMG file and drag Crystal to your Applications folder
  - On first launch, you may need to right-click and select "Open" due to macOS security settings

- **Windows**: Windows is supported but requires building from source
  - Follow the "Building from Source" instructions below
  - Requires Visual Studio 2022 with Spectre-mitigated libraries
  - Official installer coming in future releases

### Homebrew
```bash
brew install --cask stravu-crystal
```

---

## Building from Source

### Prerequisites

- **macOS/Linux**: Xcode Command Line Tools or build-essential
- **Windows**: Visual Studio 2022 with Spectre-mitigated libraries ([see detailed instructions](docs/troubleshooting/SETUP_TROUBLESHOOTING.md#windows-build-requirements))

### Build Steps

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
# Build for macOS
pnpm build:mac

# Build for Windows
pnpm build:win

# Build for Linux
pnpm build:linux
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Developing Crystal with Crystal

If you're using Crystal to develop Crystal itself, you need to use a separate data directory to avoid conflicts with your main Crystal instance:

```bash
# Set the run script in your Crystal project settings to:
pnpm run setup && pnpm run build:main && CRYSTAL_DIR=~/.crystal_test pnpm electron-dev
```

This ensures:
- Your development Crystal instance uses `~/.crystal_test` for its data
- Your main Crystal instance continues using `~/.crystal` 
- Worktrees won't conflict between the two instances
- You can safely test changes without affecting your primary Crystal setup

### Using with Third-Party Deployments

To use Crystal with cloud providers or via corporate infrastructure, you should create a [settings](https://docs.anthropic.com/en/docs/claude-code/settings) file with `ENV` values to correctly connect to the provider.

For example, here is a minimal configuration to use Amazon Bedrock via an AWS Profile:

```json5
{
  "env": {
    "CLAUDE_CODE_USE_BEDROCK": "1",
    "AWS_REGION": "us-east-2", // Replace with your AWS region
    "AWS_PROFILE": "my-aws-profile" // Replace with your profile
  },
}
```

Check the [deployment documentation](https://docs.anthropic.com/en/docs/claude-code/third-party-integrations) for more information on getting setup with your particular deployment.

---

## Additional Documentation

For a full project overview, see [CLAUDE.md](CLAUDE.md). Additional diagrams, database schema details, release instructions, and license notes can be found in the [docs](./docs) directory.

## 📄 License

Crystal is open source software licensed under the [MIT License](LICENSE).

### Third-Party Licenses

Crystal includes third-party software components. All third-party licenses are documented in the [NOTICES](NOTICES) file. This file is automatically generated and kept up-to-date with our dependencies.

To regenerate the NOTICES file after updating dependencies:
```bash
pnpm run generate-notices
```

## Disclaimer

Crystal is an independent project created by [Stravu](https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1). Claude™ is a trademark of Anthropic, PBC. Codex™ is a trademark of OpenAI, Inc. Crystal is not affiliated with, endorsed by, or sponsored by Anthropic or OpenAI. This tool is designed to work with Claude Code and Codex, which must be installed separately.

---

<div align="center">
  <img src="frontend/public/stravu-logo.png" alt="Stravu Logo" width="80" height="80">
  <br>
  Made with ❤️ by <a href="https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1">Stravu</a>
</div>

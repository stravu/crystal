# Crystal

Crystal is a cross-platform Electron desktop application for managing multiple Claude Code instances against a single directory using git worktrees. It provides a streamlined interface for running parallel Claude Code sessions with different approaches to the same problem.

## Architecture

Crystal is built as an Electron desktop application with:
- **Main Process**: Handles system operations, Claude Code spawning, and database management
- **Renderer Process**: React-based UI with real-time terminal output
- **Async Task Processing**: Bull queue for managing concurrent Claude Code sessions
- **Local Database**: SQLite for session persistence and history

## Prerequisites

- Node.js 18+ with npm
- pnpm package manager (`npm install -g pnpm`)
- Git
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- macOS, Linux, or Windows with WSL

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd crystal
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the project:
```bash
pnpm run build
```

4. Rebuild native modules for Electron:
```bash
npx electron-rebuild -f -w better-sqlite3
npx electron-rebuild -f -w @homebridge/node-pty-prebuilt-multiarch
```

## Running the Application

### Development Mode

Start the Electron app in development mode with hot reloading:

```bash
pnpm run dev
```

### Production Mode

1. Build the project:
```bash
pnpm run build
```

2. Run the built Electron app:
```bash
pnpm run preview
```

### Building for Distribution

To create platform-specific installers:

```bash
pnpm run build:electron
```

This will create:
- **macOS**: DMG installer in `dist-electron/`
- **Windows**: NSIS installer in `dist-electron/`
- **Linux**: AppImage in `dist-electron/`

## Configuration

CCC stores its configuration in `~/.ccc/config.json`. The configuration can be managed through the web interface or by editing the file directly.

### Configuration Options

| Option | Type | Default | Description                                                     |
|--------|------|---------|-----------------------------------------------------------------|
| `gitRepoPath` | string | Home directory | The path to your git repository where worktrees will be created |
| `verbose` | boolean | false | Enable verbose logging for debugging                            |
| `openaiApiKey` | string | undefined | OpenAI API key (used to name sessions)                          |
| `systemPromptAppend` | string | undefined | Additional system prompt to append to Claude Code sessions      |
| `runScript` | string[] | undefined | A script that runs your project and starts its servers          |

### Environment Variables

The following environment variables can be used to configure the application:

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | undefined | Redis URL for Bull queue (optional) |
| `NODE_ENV` | development | Environment mode |

The Electron app uses Electron Store for configuration persistence, storing data in:
- **macOS**: `~/Library/Application Support/Claude Code Commander/`
- **Windows**: `%APPDATA%/Claude Code Commander/`
- **Linux**: `~/.config/Claude Code Commander/`

## Usage

### Creating a Session

1. Click the "Create New Session" button in the sidebar
2. Enter your prompt for Claude Code
3. Optionally specify:
   - Worktree template name (defaults to "session")
   - Number of sessions to create (for running multiple parallel sessions)
4. Click "Create" to start the session(s)

### Managing Sessions

- **View Output**: Click on any session in the sidebar to view its terminal output
- **Send Input**: Type in the input field at the bottom of the terminal to send commands to Claude Code
- **Continue Conversation**: Use the "Continue" button to resume a conversation with full history context
- **Archive Session**: Click the delete button to archive a session (this also removes its git worktree)


## Advanced Configuration

### Custom System Prompts

Add custom instructions to all Claude Code sessions:

```json
{
  "systemPromptAppend": "Always use TypeScript. Follow the team's coding standards."
}
```

### Run Scripts

Execute scripts after each Claude Code prompt completion:

```json
{
  "runScript": ["npm run lint", "npm run test"]
}
```

### Verbose Logging

Enable detailed logging for debugging:

```json
{
  "verbose": true
}
```

## Troubleshooting

### Electron Installation Issues

If Electron fails to install:

```bash
cd node_modules/.pnpm/electron@*/node_modules/electron
node install.js
```

### Native Module Issues

If you encounter native module errors (node-pty, better-sqlite3):

```bash
npx electron-rebuild -f -w better-sqlite3
npx electron-rebuild -f -w @homebridge/node-pty-prebuilt-multiarch
```

### Database Issues

If you encounter database errors, you can reset the database:

```bash
rm ~/.ccc/sessions.db
```

### Worktree Cleanup

If worktrees aren't cleaned up properly:

```bash
cd <your-git-repo>
git worktree list
git worktree remove <worktree-path>
```

## Development

### Available Scripts

- `pnpm run dev` - Start Electron app in development mode
- `pnpm run build` - Build all components for production
- `pnpm run build:main` - Build main process only
- `pnpm run build:renderer` - Build renderer process only
- `pnpm run build:electron` - Package Electron app for distribution
- `pnpm run preview` - Run built Electron app
- `pnpm run lint` - Run linting across all packages
- `pnpm run typecheck` - Run TypeScript type checking


## API Reference

The embedded Express server provides a REST API for session management on port 3001:

- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session(s)
- `GET /api/sessions/:id` - Get session details
- `DELETE /api/sessions/:id` - Archive a session
- `POST /api/sessions/:id/input` - Send input to session
- `POST /api/sessions/:id/continue` - Continue conversation
- `GET /api/sessions/:id/executions` - Get execution diffs
- `GET /api/config` - Get configuration
- `POST /api/config` - Update configuration

Communication between renderer and main process uses:
- **Production**: Electron IPC for secure communication
- **Development**: WebSocket for hot reload support
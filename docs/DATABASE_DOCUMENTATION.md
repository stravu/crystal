# Crystal Database Documentation

This document provides a comprehensive overview of all SQLite database tables and local storage mechanisms used in the Crystal application.

## Overview

Crystal uses a SQLite database located at `~/.crystal/crystal.db` for persistent data storage. The database is managed using Better-SQLite3 for synchronous operations and includes a migration system for schema evolution.

## Database Tables

### 1. `projects` Table

Stores project configurations and metadata.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Unique project identifier | PRIMARY KEY AUTOINCREMENT |
| `name` | TEXT | Project display name | NOT NULL |
| `path` | TEXT | Absolute path to project directory | NOT NULL UNIQUE |
| `created_at` | DATETIME | Project creation timestamp | DEFAULT CURRENT_TIMESTAMP |
| `is_active` | INTEGER | Whether this is the active project (0 or 1) | DEFAULT 0 |
| `custom_prompt` | TEXT | Project-specific system prompt | Optional |
| `run_script` | TEXT | Script command for testing/building | Optional |
| `main_branch` | TEXT | Main branch name (e.g., 'main', 'master') | DEFAULT 'main' |

**Purpose**: Manages multiple project directories, allowing users to switch between different codebases. Only one project can be active at a time.

### 2. `sessions` Table

Core session metadata for Claude Code instances.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Unique session identifier | PRIMARY KEY AUTOINCREMENT |
| `project_id` | INTEGER | Associated project | FOREIGN KEY REFERENCES projects(id) |
| `worktree_name` | TEXT | Git worktree branch name | NOT NULL |
| `prompt` | TEXT | Initial user prompt | NOT NULL |
| `status` | TEXT | Session state | NOT NULL |
| `created_at` | DATETIME | Session creation timestamp | DEFAULT CURRENT_TIMESTAMP |
| `updated_at` | DATETIME | Last update timestamp | DEFAULT CURRENT_TIMESTAMP |
| `archived` | INTEGER | Whether session is archived (0 or 1) | DEFAULT 0 |
| `ai_generated_name` | TEXT | AI-generated descriptive name | Optional |
| `worktree_path` | TEXT | Absolute path to git worktree | Optional |
| `last_execution_index` | INTEGER | Index of last command execution | DEFAULT 0 |

**Status Values**:
- `initializing` - Setting up git worktree
- `running` - Claude is actively processing
- `waiting` - Needs user input
- `completed` - Task finished successfully
- `error` - Something went wrong
- `stopped` - Session was manually stopped

**Purpose**: Tracks all Claude Code sessions, their states, and metadata for session management and recovery.

### 3. `session_outputs` Table

Stores terminal output history for each session.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Unique output identifier | PRIMARY KEY AUTOINCREMENT |
| `session_id` | INTEGER | Associated session | FOREIGN KEY REFERENCES sessions(id) |
| `type` | TEXT | Output type | NOT NULL |
| `data` | TEXT | Output content | NOT NULL |
| `timestamp` | DATETIME | When output was generated | DEFAULT CURRENT_TIMESTAMP |
| `formatted_data` | TEXT | Pre-formatted version for display | Optional |

**Type Values**:
- `stdout` - Standard output text
- `stderr` - Error output text
- `json` - JSON messages from Claude
- `system` - System messages

**Purpose**: Maintains complete history of all session outputs for replay and debugging. Raw JSON messages are stored as-is, with formatting done on-the-fly during retrieval.

### 4. `conversation_messages` Table

Stores conversation history for session continuation.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Unique message identifier | PRIMARY KEY AUTOINCREMENT |
| `session_id` | INTEGER | Associated session | FOREIGN KEY REFERENCES sessions(id) |
| `role` | TEXT | Message sender | NOT NULL |
| `content` | TEXT | Message content | NOT NULL |
| `timestamp` | DATETIME | Message timestamp | DEFAULT CURRENT_TIMESTAMP |

**Role Values**:
- `user` - User input messages
- `assistant` - Claude's responses
- `system` - System prompts

**Purpose**: Enables conversation continuation by preserving the full message history context when resuming a session.

### 5. `execution_diffs` Table

Tracks git diffs for each execution round.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Unique diff identifier | PRIMARY KEY AUTOINCREMENT |
| `session_id` | INTEGER | Associated session | FOREIGN KEY REFERENCES sessions(id) |
| `execution_index` | INTEGER | Execution round number | NOT NULL |
| `diff_data` | TEXT | Git diff output (JSON) | NOT NULL |
| `created_at` | DATETIME | When diff was captured | DEFAULT CURRENT_TIMESTAMP |

**Purpose**: Maintains a history of code changes per execution round, allowing users to see what changed at each step of the session.

### 6. `prompt_markers` Table

Navigation markers for prompts within session output.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Unique marker identifier | PRIMARY KEY AUTOINCREMENT |
| `session_id` | INTEGER | Associated session | FOREIGN KEY REFERENCES sessions(id) |
| `prompt_text` | TEXT | The prompt content | NOT NULL |
| `output_index` | INTEGER | Position in session_outputs | NOT NULL |
| `timestamp` | DATETIME | When prompt was sent | DEFAULT CURRENT_TIMESTAMP |
| `completion_timestamp` | DATETIME | When prompt finished processing | Optional |

**Purpose**: Enables quick navigation to specific prompts within long session outputs and tracks execution duration.

### 7. `migrations` Table

Tracks applied database migrations.

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | INTEGER | Migration version number | PRIMARY KEY |
| `applied_at` | DATETIME | When migration was applied | DEFAULT CURRENT_TIMESTAMP |

**Purpose**: Ensures database schema can be safely evolved over time by tracking which migrations have been applied.

## Database Indexes

The database includes several indexes for performance optimization:

- `idx_sessions_project_id` - Fast lookup of sessions by project
- `idx_session_outputs_session_id` - Fast retrieval of outputs for a session
- `idx_conversation_messages_session_id` - Quick access to conversation history
- `idx_execution_diffs_session_id_execution_index` - Efficient diff lookups
- `idx_prompt_markers_session_id` - Fast prompt navigation

## Local Storage (Non-Database)

### 1. Electron Store

Location: Platform-specific (handled by electron-store)
- macOS: `~/Library/Application Support/Crystal/config.json`
- Windows: `%APPDATA%/Crystal/config.json`
- Linux: `~/.config/Crystal/config.json`

**Stored Data**:
```json
{
  "verboseLogging": boolean,
  "anthropicApiKey": "string (encrypted)",
  "globalSystemPrompt": "string",
  "claudeExecutablePath": "string",
  "notifications": {
    "enabled": boolean,
    "sound": boolean,
    "statusChanges": boolean,
    "waiting": boolean,
    "completion": boolean,
    "errors": boolean
  }
}
```

### 2. Application Directory

Location: `~/.crystal/`

**Contents**:
- `crystal.db` - Main SQLite database
- Automatically created on first application run

### 3. Git Worktrees

Location: `<project_path>/.git/worktrees/`

**Structure**:
- Each session creates a worktree named after its branch
- Worktrees are cleaned up when sessions are deleted
- Contains isolated git working directory for each Claude session

## Data Flow and Relationships

```
projects (1) ─────┬──── (∞) sessions
                  │           │
                  │           ├──── (∞) session_outputs
                  │           ├──── (∞) conversation_messages
                  │           ├──── (∞) execution_diffs
                  │           └──── (∞) prompt_markers
                  │
                  └──── git worktrees (file system)
```

## Important Implementation Notes

1. **Timestamp Handling**: All timestamps are stored in UTC format. The frontend utilities handle proper timezone conversion for display.

2. **Transaction Safety**: Database operations use transactions where appropriate to maintain data integrity.

3. **Cascade Deletion**: When a project is deleted, all associated sessions and their related data are automatically removed through foreign key constraints.

4. **Archive vs Delete**: Sessions are typically archived (`archived = 1`) rather than deleted to preserve history. True deletion only occurs when explicitly requested.

5. **Performance Considerations**: 
   - Session outputs can grow large; pagination may be needed for very long sessions
   - Indexes are crucial for responsive UI with many sessions
   - The `formatted_data` column in session_outputs is used sparingly to balance storage vs computation

## Migration System

The application uses a simple migration system located in `main/src/database/migrations/`. Each migration is a SQL file numbered sequentially (e.g., `001_initial_schema.sql`, `002_add_prompt_markers.sql`).

Migrations are applied automatically on application startup if the database version is behind the latest migration.

## Backup Recommendations

Users should periodically backup:
1. `~/.crystal/crystal.db` - Contains all session data
2. The Electron Store config file - Contains application settings
3. Project directories - Contains the actual code and git history

## Security Considerations

1. **API Keys**: The Anthropic API key is stored in the Electron Store with platform-specific encryption
2. **File Paths**: All file paths are stored as absolute paths; care should be taken when sharing databases
3. **Sensitive Data**: Session outputs may contain sensitive information and should be treated accordingly
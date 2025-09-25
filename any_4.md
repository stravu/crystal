# 'any' Usage Report - File 4

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/database/database.ts | 77 | `const hasLastViewedAtColumn = tableInfo.some((col: any) => col.name === 'last_viewed_at');` | Yes | Already used SqliteTableInfo interface |
| main/src/database/database.ts | 87 | `const hasPromptColumn = tableInfo.some((col: any) => col.name === 'prompt');` | Yes | Replaced with SqliteTableInfo |
| main/src/database/database.ts | 129 | `const hasOutputLineColumn = promptMarkersInfo.some((col: any) => col.name === 'output_line');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 130 | `const hasTerminalLineColumn = promptMarkersInfo.some((col: any) => col.name === 'terminal_line');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 174 | `const hasCommitMessageColumn = executionDiffsTableInfo.some((col: any) => col.name === 'commit_message');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 181 | `const hasClaudeSessionIdColumn = sessionTableInfoClaude.some((col: any) => col.name === 'claude_session_id');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 189 | `const hasPermissionModeColumn = sessionTableInfoClaude.some((col: any) => col.name === 'permission_mode');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 216 | `const hasProjectIdColumn = sessionsTableInfoProjects.some((col: any) => col.name === 'project_id');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 253 | `const hasIsMainRepoColumn = sessionTableInfoForMainRepo.some((col: any) => col.name === 'is_main_repo');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 262 | `const hasMainBranchColumn = projectsTableInfo.some((col: any) => col.name === 'main_branch');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 269 | `const hasBuildScriptColumn = projectsTableInfo.some((col: any) => col.name === 'build_script');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 276 | `const hasDefaultPermissionModeColumn = projectsTableInfo.some((col: any) => col.name === 'default_permission_mode');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 283 | `const hasOpenIdeCommandColumn = projectsTableInfo.some((col: any) => col.name === 'open_ide_command');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 320 | `const hasProjectsDisplayOrder = projectsTableInfo2.some((col: any) => col.name === 'display_order');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 321 | `const hasSessionsDisplayOrder = sessionsTableInfo2.some((col: any) => col.name === 'display_order');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 363 | `const lastViewedAtColumn = sessionTableInfoTimestamp.find((col: any) => col.name === 'last_viewed_at') as any;` | Yes | Replaced with SqliteTableInfo and removed 'as any' cast |
| main/src/database/database.ts | 366 | `const hasLastViewedAtNew = sessionTableInfoTimestamp.some((col: any) => col.name === 'last_viewed_at_new');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 373 | `const hasLastViewedAtNew = sessionTableInfoTimestamp.some((col: any) => col.name === 'last_viewed_at_new');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 374 | `const hasRunStartedAtNew = sessionTableInfoTimestamp.some((col: any) => col.name === 'run_started_at_new');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
| main/src/database/database.ts | 442 | `const hasCompletionTimestamp = promptMarkersInfo.some((col: any) => col.name === 'completion_timestamp');` | Yes | Replaced with SqliteTableInfo and added cast to .all() |
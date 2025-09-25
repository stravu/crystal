# 'any' Usage Report - File 5

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/database/database.ts | 450 | `const hasIsFavoriteColumn = sessionTableInfoFavorite.some((col: any) => col.name === 'is_favorite');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 458 | `const hasAutoCommitColumn = sessionTableInfoFavorite.some((col: any) => col.name === 'auto_commit');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 466 | `const hasSkipContinueNextColumn = sessionTableInfoFavorite.some((col: any) => col.name === 'skip_continue_next');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 484 | `const idColumn = foldersInfo.find((col: any) => col.name === 'id') as any;` | Fixed | Replaced `any` with `SqliteTableInfo` and removed `as any` cast |
| main/src/database/database.ts | 507 | `const projectFolders = this.db.prepare('SELECT * FROM project_folders').all() as any[];` | Fixed | Replaced `any[]` with `LegacyProjectFolder[]` (created interface for migration) |
| main/src/database/database.ts | 531 | `const folderIdColumn = sessionTableInfo.find((col: any) => col.name === 'folder_id') as any;` | Fixed | Replaced `any` with `SqliteTableInfo` and removed `as any` cast |
| main/src/database/database.ts | 611 | `const hasFolderIdColumn = sessionTableInfoFavorite.some((col: any) => col.name === 'folder_id');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 626 | `const hasParentFolderIdColumn = foldersTableInfo.some((col: any) => col.name === 'parent_folder_id');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 671 | `const hasModelColumn = sessionTableInfoModel.some((col: any) => col.name === 'model');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 681 | `const hasToolTypeColumn = sessionTableInfoToolType.some((col: any) => col.name === 'tool_type');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 736 | `const hasWorktreeFolderColumn = projectsTableInfoWorktree.some((col: any) => col.name === 'worktree_folder');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 745 | `const hasLastUsedModelColumn = projectsTableInfoModel.some((col: any) => col.name === 'lastUsedModel');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 754 | `const hasBaseCommitColumn = sessionsTableInfoBase.some((col: any) => col.name === 'base_commit');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 755 | `const hasBaseBranchColumn = sessionsTableInfoBase.some((col: any) => col.name === 'base_branch');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 769 | `const hasCommitModeColumn = projectsTableInfoCommit.some((col: any) => col.name === 'commit_mode');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 770 | `const hasCommitStructuredPromptTemplateColumn = projectsTableInfoCommit.some((col: any) => col.name === 'commit_structured_prompt_template');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 771 | `const hasCommitCheckpointPrefixColumn = projectsTableInfoCommit.some((col: any) => col.name === 'commit_checkpoint_prefix');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 790 | `const hasSessionCommitModeColumn = sessionsTableInfoCommit.some((col: any) => col.name === 'commit_mode');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 791 | `const hasSessionCommitModeSettingsColumn = sessionsTableInfoCommit.some((col: any) => col.name === 'commit_mode_settings');` | Fixed | Replaced `any` with `SqliteTableInfo` |
| main/src/database/database.ts | 854 | `const hasActivePanelIdColumn = sessionsTableInfoPanel.some((col: any) => col.name === 'active_panel_id');` | Fixed | Replaced `any` with `SqliteTableInfo` |
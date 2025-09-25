# 'any' Usage Report - File 6

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/database/database.ts | 873 | `const hasSessionOutputsPanelId = sessionOutputsInfo.some((col: any) => col.name === 'panel_id');` | Fixed | Replaced with `SqliteTableInfo` type |
| main/src/database/database.ts | 874 | `const hasConversationMessagesPanelId = conversationMessagesInfo.some((col: any) => col.name === 'panel_id');` | Fixed | Replaced with `SqliteTableInfo` type |
| main/src/database/database.ts | 875 | `const hasPromptMarkersPanelId = promptMarkersInfo.some((col: any) => col.name === 'panel_id');` | Fixed | Replaced with `SqliteTableInfo` type |
| main/src/database/database.ts | 876 | `const hasExecutionDiffsPanelId = executionDiffsInfo.some((col: any) => col.name === 'panel_id');` | Fixed | Replaced with `SqliteTableInfo` type |
| main/src/database/database.ts | 1070 | `const hasSettingsColumn = toolPanelsInfo.some((col: any) => col.name === 'settings');` | Fixed | Replaced with `SqliteTableInfo` type |
| main/src/services/panelEventBus.ts | 6 | `private panelListenerMap = new Map<string, Map<PanelEventType \| string, (...args: any[]) => void>>();` | Fixed | Replaced with `(event: PanelEvent) => void` |
| main/src/services/panelManager.ts | 280 | `async emitPanelEvent(panelId: string, eventType: PanelEventType, data: any): Promise<void> {` | Fixed | Replaced with `unknown` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 29 | `} as any;` | Fixed | Replaced with `Partial<SessionManager> as SessionManager` |
| main/src/services/__tests__/gitStatusManager.test.ts | 33 | `} as any;` | Fixed | Replaced with `Partial<WorktreeManager> as WorktreeManager` |
| main/src/services/__tests__/gitStatusManager.test.ts | 39 | `} as any;` | Fixed | Replaced with `Partial<GitDiffManager> as GitDiffManager` |
| main/src/services/__tests__/gitStatusManager.test.ts | 47 | `} as any;` | Fixed | Replaced with `Partial<Logger> as Logger` |
| main/src/services/__tests__/gitStatusManager.test.ts | 63 | `const result = (gitStatusManager as any).executeGitCommand('git status', '/test/path');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 74 | `const result = (gitStatusManager as any).executeGitCommand('git status', '/test/path');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 85 | `const result = (gitStatusManager as any).getUntrackedFiles('/test/path');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 94 | `const result = (gitStatusManager as any).getUntrackedFiles('/test/path');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 105 | `const result = (gitStatusManager as any).getRevListCount('/test/path', 'main');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 114 | `const result = (gitStatusManager as any).getRevListCount('/test/path', 'main');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 125 | `const result = (gitStatusManager as any).getDiffStats('/test/path', 'main');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 138 | `const result = (gitStatusManager as any).getDiffStats('/test/path', 'main');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
| main/src/services/__tests__/gitStatusManager.test.ts | 153 | `const result = (gitStatusManager as any).checkMergeConflicts('/test/path');` | Fixed | Replaced with `GitStatusManagerWithPrivates` type |
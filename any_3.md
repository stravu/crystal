# 'any' Usage Report - File 3

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/utils/toolFormatter.ts | 68 | `function makePathsRelative(content: any, gitRepoPath?: string): string {` | Fixed | Changed to `unknown` type |
| main/src/utils/toolFormatter.ts | 156 | `toolCall.input.todos.forEach((todo: any) => {` | Fixed | Changed to proper `TodoItem[]` type with cast |
| main/src/utils/toolFormatter.ts | 375 | `export function formatJsonForOutputEnhanced(jsonMessage: any, gitRepoPath?: string): string {` | Fixed | Changed to `Record<string, unknown>` type |
| main/src/utils/toolFormatter.ts | 403 | `const thinkingItems = content.filter((item: any) => item.type === 'thinking');` | Fixed | Changed to type predicate with `ThinkingItem` |
| main/src/utils/toolFormatter.ts | 405 | `thinkingItems.forEach((item: any) => {` | Fixed | Changed to proper `ThinkingItem` type |
| main/src/utils/toolFormatter.ts | 429 | `const toolUses = content.filter((item: any) => item.type === 'tool_use');` | Fixed | Changed to type predicate with `ToolCall` |
| main/src/utils/toolFormatter.ts | 449 | `.filter((item: any) => item.type === 'text')` | Fixed | Changed to type predicate with `TextItem` |
| main/src/utils/toolFormatter.ts | 450 | `.map((item: any) => item.text)` | Fixed | Changed to proper `TextItem` type |
| main/src/utils/toolFormatter.ts | 478 | `const toolResults = content.filter((item: any) => item.type === 'tool_result');` | Fixed | Changed to type predicate with `ToolResult` |
| main/src/utils/toolFormatter.ts | 530 | `.filter((item: any) => item.type === 'text')` | Fixed | Changed to type predicate with `TextItem` |
| main/src/utils/toolFormatter.ts | 531 | `.map((item: any) => item.text)` | Fixed | Changed to proper `TextItem` type |
| main/src/utils/logger.ts | 198 | `private handleWriteError(error: any) {` | Fixed | Changed to `NodeJS.ErrnoException` type |
| main/src/utils/logger.ts | 224 | `} catch (consoleError: any) {` | Fixed | Changed to `unknown` with proper casting |
| shared/types/cliPanels.ts | 59 | `toolConfig?: Record<string, any>;` | Fixed | Changed to `Record<string, unknown>` |
| shared/types/cliPanels.ts | 179 | `toolOptions?: Record<string, any>;` | Fixed | Changed to `Record<string, unknown>` |
| shared/types/cliPanels.ts | 242 | `metadata?: Record<string, any>;` | Fixed | Changed to `Record<string, unknown>` |
| shared/types/cliPanels.ts | 288 | `toolSettings?: Record<string, any>;` | Fixed | Changed to `Record<string, unknown>` |
| shared/types/cliPanels.ts | 305 | `data: any;` | Fixed | Changed to `unknown` type |
| main/src/database/database.ts | 75 | `const hasArchivedColumn = tableInfo.some((col: any) => col.name === 'archived');` | Fixed | Added `SqliteTableInfo` interface |
| main/src/database/database.ts | 76 | `const hasInitialPromptColumn = tableInfo.some((col: any) => col.name === 'initial_prompt');` | Fixed | Changed to proper `SqliteTableInfo` type |
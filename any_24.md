# 'any' Usage Report - File 24

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| shared/types/panels.ts | 131 | `cachedData?: any;                // Cached dashboard data` | No |  |
| shared/types/panels.ts | 145 | `initialState?: any;` | No |  |
| shared/types/panels.ts | 162 | `data: any;` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 28 | `protected sessionManager: any,` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 44 | `protected abstract extractAgentConfig(config: AIPanelConfig): any[];` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 58 | `this.cliManager.on('output', (data: any) => {` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 84 | `this.cliManager.on('spawned', (data: any) => {` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 95 | `this.cliManager.on('exit', (data: any) => {` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 119 | `this.cliManager.on('error', (data: any) => {` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 311 | `getPanelProcess(panelId: string): any {` | No |  |
| main/src/utils/promptEnhancer.ts | 18 | `enhancePromptForStructuredCommit(prompt: string, dbSession: any): string {` | No |  |
| main/src/utils/promptEnhancer.ts | 67 | `export function enhancePromptForStructuredCommit(prompt: string, dbSession: any, logger?: Logger): string {` | No |  |
| main/src/ipc/config.ts | 15 | `ipcMain.handle('config:update', async (_event, updates: any) => {` | No |  |
| main/src/ipc/config.ts | 47 | `ipcMain.handle('config:update-session-preferences', async (_event, preferences: any) => {` | No |  |
| main/src/services/panels/logPanel/logsManager.ts | 314 | `} catch (error: any) {` | No |  |
| main/src/services/executionTracker.ts | 25 | `private sessionManager: any,` | No |  |
| main/src/services/executionTracker.ts | 284 | `filteredExecutions = executions.filter((exec: any) => executionIds.includes(exec.id));` | No |  |
| main/src/services/executionTracker.ts | 289 | `.filter((exec: any) => exec.git_diff) // Only include executions with actual diffs` | No |  |
| main/src/services/executionTracker.ts | 290 | `.map((exec: any) => ({` | No |  |
| main/src/ipc/script.ts | 57 | `const logsPanel = panels?.find((p: any) => p.type === 'logs');` | No |  |
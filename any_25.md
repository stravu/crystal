# 'any' Usage Report - File 25

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/ipc/script.ts | 157 | `(error: any, stdout: string, stderr: string) => {` | No |  |
| main/src/index.ts | 152 | `ipcMain.handle = function(channel: string, listener: any) {` | No |  |
| main/src/index.ts | 153 | `const wrappedListener = async (event: any, ...args: any[]) => {` | No |  |
| main/src/index.ts | 241 | `console.log = (...args: any[]) => {` | No |  |
| main/src/services/cliManagerFactory.ts | 26 | `additionalOptions?: Record<string, any>;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 257 | `const sessionInfoMessage: Record<string, any> = {` | No |  |
| main/src/services/panels/codex/codexManager.ts | 1118 | `async getDebugState(panelId: string): Promise<any> {` | No |  |
| main/src/database/database.ts | 2550 | `getPanelSettings(panelId: string): Record<string, any> {` | No |  |
| main/src/database/database.ts | 2571 | `updatePanelSettings(panelId: string, settings: Record<string, any>): void {` | No |  |
| main/src/database/database.ts | 2593 | `setPanelSettings(panelId: string, settings: Record<string, any>): void {` | No |  |
| main/src/database/database.ts | 2662 | `const updateObj: Record<string, any> = {};` | No |  |
| main/src/ipc/baseAIPanelHandler.ts | 218 | `this.ipcMain.handle(\`\${this.config.ipcPrefix}:set-settings\`, async (_event, panelId: string, settings: Record<string, any>) => {` | No |  |
| main/src/ipc/baseAIPanelHandler.ts | 306 | `protected applySettingsDefaults(settings: Record<string, any>): Record<string, any> {` | No |  |
| main/src/ipc/claudePanel.ts | 26 | `protected applySettingsDefaults(settings: Record<string, any>): Record<string, any> {` | No |  |
| main/src/ipc/codexPanel.ts | 37 | `protected applySettingsDefaults(settings: Record<string, any>): Record<string, any> {` | No |  |
| main/src/ipc/codexPanel.ts | 195 | `const settingsToUpdate: Record<string, any> = {` | No |  |
| main/src/ipc/codexPanel.ts | 419 | `this.ipcMain.handle('codexPanel:setSettings', async (_event, panelId: string, settings: Record<string, any>) => {` | No |  |
| frontend/src/components/panels/ai/transformers/ClaudeMessageTransformer.ts | 7 | `constructor(private gitRepoPath?: string, private debugMode?: boolean, private formatOptions: any = {}) {}` | No |  |
| frontend/src/components/panels/ai/transformers/ClaudeMessageTransformer.ts | 9 | `transform(messages: any[]): string {` | No |  |
| frontend/src/components/panels/ai/transformers/ClaudeMessageTransformer.ts | 13 | `private transformMessage(message: any): string {` | No |  |
# 'any' Usage Report - File 2

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/types/session.ts | 95 | `data: string \| any;` | Cannot Fix | Complex union type used throughout codebase - can be string, JSON objects with various shapes. Extensive refactoring needed |
| main/src/utils/consoleWrapper.ts | 4 | `const isDevelopment = process.env.NODE_ENV !== 'production' && !(global as any).isPackaged;` | Fixed | Replaced with `(global as { isPackaged?: boolean }).isPackaged` for proper type safety |
| main/src/utils/consoleWrapper.ts | 16 | `function shouldLog(level: 'log' \| 'info' \| 'debug', args: any[]): boolean {` | Fixed | Replaced with `unknown[]` as console can accept arbitrary arguments |
| main/src/utils/consoleWrapper.ts | 54 | `console.log = (...args: any[]) => {` | Fixed | Replaced with `unknown[]` for console method arguments |
| main/src/utils/consoleWrapper.ts | 60 | `console.info = (...args: any[]) => {` | Fixed | Replaced with `unknown[]` for console method arguments |
| main/src/utils/consoleWrapper.ts | 66 | `console.debug = (...args: any[]) => {` | Fixed | Replaced with `unknown[]` for console method arguments |
| shared/types/aiPanelConfig.ts | 22 | `[key: string]: any;` | Fixed | Replaced with `[key: string]: string \| number \| boolean \| undefined` for extensible config values |
| shared/types/aiPanelConfig.ts | 38 | `conversationHistory: any[];` | Fixed | Replaced with typed array for conversation messages: `Array<{message_type: 'user' \| 'assistant'; content: string; timestamp?: string}>` |
| main/src/services/stravuAuthManager.ts | 56 | `private getStoreData(): any {` | Fixed | Replaced with `Record<string, unknown>` for key-value store data |
| main/src/services/stravuAuthManager.ts | 61 | `private setStoreData(data: any): void {` | Fixed | Replaced with `Record<string, unknown>` for store data parameter |
| main/src/services/stravuAuthManager.ts | 83 | `const status: any = await response.json();` | Fixed | Replaced with proper interface for API response: `{status: string; jwt_token?: string; member_id?: string; ...}` |
| main/src/ipc/editorPanel.ts | 74 | `const editorPanel = panels.find((p: any) => p.type === 'editor' && !p.state?.customState?.filePath);` | Fixed | Removed any type, rely on proper panel typing from panelManager |
| main/src/ipc/editorPanel.ts | 138 | `ipcMain.handle('editor:updatePanelState', async (_, panelId: string, state: any) => {` | Fixed | Replaced with `Record<string, unknown>` for editor panel state |
| main/src/utils/claudeCodeTest.ts | 205 | `console.error(\`[ClaudeTest] Error code: \${(error as any).code}\`);` | Fixed | Replaced with proper Node.js error type: `(error as NodeJS.ErrnoException).code` |
| main/src/utils/claudeCodeTest.ts | 210 | `output: error instanceof Error && 'stdout' in error ? String((error as any).stdout) + String((error as any).stderr) : undefined` | Fixed | Replaced with proper error type extension: `(error as Error & {stdout?: string; stderr?: string})` |
| main/src/utils/sessionValidation.ts | 113 | `export function validateEventContext(eventData: any, expectedSessionId?: string): ValidationResult {` | Fixed | Replaced with `Record<string, unknown>` for event data |
| main/src/utils/sessionValidation.ts | 151 | `eventData: any,` | Fixed | Replaced with `Record<string, unknown>` for panel event data |
| main/src/utils/toolFormatter.ts | 8 | `input: any;` | Fixed | Replaced with `Record<string, unknown>` for tool call input parameters |
| main/src/utils/toolFormatter.ts | 28 | `function filterBase64Data(obj: any): any {` | Fixed | Replaced with `unknown` parameters for recursive object filtering |
| main/src/utils/toolFormatter.ts | 40 | `const filtered: any = {};` | Fixed | Replaced with `Record<string, unknown>` for filtered object result |
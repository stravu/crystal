# 'any' Usage Report - File 8

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/stravuNotebookService.ts | 124 | `const data: any = await response.json();` | N/A | Line not found - may have been already fixed or file changed |
| main/src/services/permissionManager.ts | 8 | `input: any;` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/permissionManager.ts | 14 | `updatedInput?: any;` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/permissionManager.ts | 51 | `async requestPermission(sessionId: string, toolName: string, input: any): Promise<PermissionResponse> {` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/mcpPermissionBridge.ts | 29 | `let pendingRequests = new Map<string, (response: any) => void>();` | Fixed | Replaced with `PermissionResponse` type |
| main/src/services/mcpPermissionBridge.ts | 62 | `async function requestPermission(toolName: string, input: any): Promise<any> {` | Fixed | Replaced with proper types `Record<string, unknown>` and `Promise<PermissionResponse>` |
| main/src/services/mcpPermissionBridge.ts | 128 | `const { tool_name, input } = request.params.arguments as { tool_name: string; input: any };` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/cliToolRegistry.ts | 111 | `sessionManager: any,` | Fixed | Replaced with `SessionManager \| null` |
| main/src/services/cliToolRegistry.ts | 114 | `additionalOptions?: any` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/cliToolRegistry.ts | 148 | `metadata?: Record<string, any>;` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/cliToolRegistry.ts | 304 | `sessionManager: any,` | Fixed | Replaced with `SessionManager` |
| main/src/services/cliToolRegistry.ts | 305 | `additionalOptions?: any` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/cliToolRegistry.ts | 377 | `const result = await (tempManager as any).testCliAvailability();` | Partial | Kept type assertion due to protected method access |
| main/src/services/cliToolRegistry.ts | 444 | `((b as any).priority || 0) - ((a as any).priority || 0)` | Fixed | Replaced with proper intersection type |
| frontend/src/services/panelApi.ts | 28 | `async emitPanelEvent(panelId: string, eventType: string, data: any): Promise<void> {` | Fixed | Replaced with `Record<string, unknown>` |
| main/src/services/simpleTaskQueue.ts | 7 | `result?: any;` | Fixed | Replaced with generic type `R` |
| main/src/services/simpleTaskQueue.ts | 8 | `error?: any;` | Fixed | Replaced with `Error` type |
| main/src/services/simpleTaskQueue.ts | 16 | `private processor?: (job: Job<T>) => Promise<any>;` | Fixed | Replaced with generic type `R` |
| main/src/services/simpleTaskQueue.ts | 25 | `process(concurrency: number, processor: (job: Job<T>) => Promise<any>) {` | Fixed | Replaced with generic type `R` |
| main/src/services/simpleTaskQueue.ts | 102 | `on(event: 'active' \| 'completed' \| 'failed' \| 'waiting' \| 'error', listener: (...args: any[]) => void): this {` | Fixed | Replaced with `unknown[]` |
| main/src/services/taskQueue.ts | 117 | `this.sessionQueue.on('active', (job: any) => {` | Kept | Due to union type (Bull.Queue \| SimpleQueue) having different event signatures |
# 'any' Usage Report - File 20

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/preload.ts | 395 | `const wrappedCallback = (_event: any, info: any) => callback(info);` | No |  |
| main/src/preload.ts | 399 | `onUpdaterDownloadProgress: (callback: (progressInfo: any) => void) => {` | No |  |
| main/src/preload.ts | 400 | `const wrappedCallback = (_event: any, progressInfo: any) => callback(progressInfo);` | No |  |
| main/src/preload.ts | 404 | `onUpdaterUpdateDownloaded: (callback: (info: any) => void) => {` | No |  |
| main/src/preload.ts | 405 | `const wrappedCallback = (_event: any, info: any) => callback(info);` | No |  |
| main/src/preload.ts | 409 | `onUpdaterError: (callback: (error: any) => void) => {` | No |  |
| main/src/preload.ts | 410 | `const wrappedCallback = (_event: any, error: any) => callback(error);` | No |  |
| main/src/preload.ts | 416 | `onZombieProcessesDetected: (callback: (data: any) => void) => {` | No |  |
| main/src/preload.ts | 417 | `const wrappedCallback = (_event: any, data: any) => callback(data);` | No |  |
| main/src/preload.ts | 442 | `setSettings: (panelId: string, settings: Record<string, any>): Promise<IPCResponse> => ipcRenderer.invoke('codexPanel:set-settings', panelId, settings),` | No |  |
| main/src/preload.ts | 461 | `invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),` | No |  |
| main/src/preload.ts | 462 | `on: (channel: string, callback: (...args: any[]) => void) => {` | No |  |
| main/src/preload.ts | 474 | `off: (channel: string, callback: (...args: any[]) => void) => {` | No |  |
| main/src/services/sessionManager.ts | 78 | `const claudeSessionId = (panel as any)?.state?.customState?.agentSessionId \|\|` | No |  |
| main/src/services/sessionManager.ts | 79 | `(panel as any)?.state?.customState?.claudeSessionId;` | No |  |
| main/src/services/sessionManager.ts | 92 | `const codexSessionId = (panel as any)?.state?.customState?.agentSessionId \|\|` | No |  |
| main/src/services/sessionManager.ts | 93 | `(panel as any)?.state?.customState?.codexSessionId;` | No |  |
| main/src/services/sessionManager.ts | 105 | `const customState = (panel as any)?.state?.customState;` | No |  |
| main/src/services/sessionManager.ts | 143 | `const toolTypeFromDb = (dbSession as any).tool_type as 'claude' \| 'codex' \| 'none' \| null \| undefined;` | No |  |
| main/src/services/sessionManager.ts | 526 | `const textContent = content.find((item: any) => item.type === 'text');` | No |  |
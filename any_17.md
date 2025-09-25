# 'any' Usage Report - File 17

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/commitManager.ts | 109 | `} catch (error: any) {` | No |  |
| main/src/services/commitManager.ts | 163 | `} catch (error: any) {` | No |  |
| main/src/services/commitManager.ts | 220 | `} catch (error: any) {` | No |  |
| main/src/preload.ts | 18 | `(console as any)[level] = (...args: any[]) => {` | No |  |
| main/src/preload.ts | 20 | `(originalConsole as any)[level](...args);` | No |  |
| main/src/preload.ts | 48 | `interface IPCResponse<T = any> {` | No |  |
| main/src/preload.ts | 56 | `invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),` | No |  |
| main/src/preload.ts | 83 | `create: (request: any): Promise<IPCResponse> => ipcRenderer.invoke('sessions:create', request),` | No |  |
| main/src/preload.ts | 154 | `addLog: (sessionId: string, entry: any): Promise<IPCResponse> => ipcRenderer.invoke('sessions:add-log', sessionId, entry),` | No |  |
| main/src/preload.ts | 161 | `create: (projectData: any): Promise<IPCResponse> => ipcRenderer.invoke('projects:create', projectData),` | No |  |
| main/src/preload.ts | 163 | `update: (projectId: string, updates: any): Promise<IPCResponse> => ipcRenderer.invoke('projects:update', projectId, updates),` | No |  |
| main/src/preload.ts | 191 | `update: (updates: any): Promise<IPCResponse> => ipcRenderer.invoke('config:update', updates),` | No |  |
| main/src/preload.ts | 193 | `updateSessionPreferences: (preferences: any): Promise<IPCResponse> => ipcRenderer.invoke('config:update-session-preferences', preferences),` | No |  |
| main/src/preload.ts | 210 | `openFile: (options?: any): Promise<IPCResponse<string \| null>> => ipcRenderer.invoke('dialog:open-file', options),` | No |  |
| main/src/preload.ts | 211 | `openDirectory: (options?: any): Promise<IPCResponse<string \| null>> => ipcRenderer.invoke('dialog:open-directory', options),` | No |  |
| main/src/preload.ts | 216 | `respond: (requestId: string, response: any): Promise<IPCResponse> => ipcRenderer.invoke('permission:respond', requestId, response),` | No |  |
| main/src/preload.ts | 235 | `onUpdate: (callback: (data: any) => void) => {` | No |  |
| main/src/preload.ts | 236 | `const subscription = (_event: any, data: any) => callback(data);` | No |  |
| main/src/preload.ts | 240 | `onSessionUpdate: (callback: (data: any) => void) => {` | No |  |
| main/src/preload.ts | 241 | `const subscription = (_event: any, data: any) => callback(data);` | No |  |
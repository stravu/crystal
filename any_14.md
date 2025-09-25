# 'any' Usage Report - File 14

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| frontend/src/types/electron.d.ts | 221 | `onProjectUpdated: (callback: (project: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 224 | `onFolderCreated: (callback: (folder: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 225 | `onFolderUpdated: (callback: (folder: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 229 | `onPanelCreated: (callback: (panel: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 230 | `onPanelUpdated: (callback: (panel: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 234 | `onTerminalOutput: (callback: (output: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 236 | `onVersionUpdateAvailable: (callback: (versionInfo: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 240 | `onUpdaterUpdateAvailable: (callback: (info: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 241 | `onUpdaterUpdateNotAvailable: (callback: (info: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 242 | `onUpdaterDownloadProgress: (callback: (progressInfo: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 243 | `onUpdaterUpdateDownloaded: (callback: (info: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 244 | `onUpdaterError: (callback: (error: any) => void) => () => void;` | No |  |
| frontend/src/types/electron.d.ts | 255 | `createPanel: (sessionId: string, type: string, name: string, config?: any) => Promise<IPCResponse>;` | No |  |
| frontend/src/types/electron.d.ts | 279 | `setSettings: (panelId: string, settings: Record<string, any>) => Promise<IPCResponse>;` | No |  |
| frontend/src/types/electron.d.ts | 297 | `dflt_value: any;` | No |  |
| frontend/src/types/electron.d.ts | 322 | `invoke: (channel: string, ...args: any[]) => Promise<any>;` | No |  |
| frontend/src/types/electron.d.ts | 323 | `on: (channel: string, callback: (...args: any[]) => void) => void;` | No |  |
| frontend/src/types/electron.d.ts | 324 | `off: (channel: string, callback: (...args: any[]) => void) => void;` | No |  |
| frontend/src/utils/api.ts | 4 | `export interface IPCResponse<T = any> {` | No |  |
| frontend/src/utils/api.ts | 41 | `async create(request: any) {` | No |  |
# 'any' Usage Report - File 19

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/preload.ts | 317 | `onPanelCreated: (callback: (panel: any) => void) => {` | No |  |
| main/src/preload.ts | 318 | `const wrappedCallback = (_event: any, panel: any) => callback(panel);` | No |  |
| main/src/preload.ts | 322 | `onPanelUpdated: (callback: (panel: any) => void) => {` | No |  |
| main/src/preload.ts | 323 | `const wrappedCallback = (_event: any, panel: any) => callback(panel);` | No |  |
| main/src/preload.ts | 329 | `onFolderCreated: (callback: (folder: any) => void) => {` | No |  |
| main/src/preload.ts | 330 | `const wrappedCallback = (_event: any, folder: any) => callback(folder);` | No |  |
| main/src/preload.ts | 334 | `onFolderUpdated: (callback: (folder: any) => void) => {` | No |  |
| main/src/preload.ts | 335 | `const wrappedCallback = (_event: any, folder: any) => callback(folder);` | No |  |
| main/src/preload.ts | 340 | `const wrappedCallback = (_event: any, folderId: string) => callback(folderId);` | No |  |
| main/src/preload.ts | 347 | `const wrappedCallback = (_event: any, data: { panelId: string; content: string }) => callback(data);` | No |  |
| main/src/preload.ts | 353 | `const wrappedCallback = (_event: any, data: { panelId: string; content: string }) => callback(data);` | No |  |
| main/src/preload.ts | 358 | `onTerminalOutput: (callback: (output: any) => void) => {` | No |  |
| main/src/preload.ts | 359 | `const wrappedCallback = (_event: any, output: any) => callback(output);` | No |  |
| main/src/preload.ts | 371 | `const wrappedCallback = (_event: any, level: string, message: string) => callback(level, message);` | No |  |
| main/src/preload.ts | 377 | `onVersionUpdateAvailable: (callback: (versionInfo: any) => void) => {` | No |  |
| main/src/preload.ts | 378 | `const wrappedCallback = (_event: any, versionInfo: any) => callback(versionInfo);` | No |  |
| main/src/preload.ts | 385 | `const wrappedCallback = (_event: any) => callback();` | No |  |
| main/src/preload.ts | 389 | `onUpdaterUpdateAvailable: (callback: (info: any) => void) => {` | No |  |
| main/src/preload.ts | 390 | `const wrappedCallback = (_event: any, info: any) => callback(info);` | No |  |
| main/src/preload.ts | 394 | `onUpdaterUpdateNotAvailable: (callback: (info: any) => void) => {` | No |  |
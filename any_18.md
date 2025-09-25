# 'any' Usage Report - File 18

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/preload.ts | 258 | `onSessionCreated: (callback: (session: any) => void) => {` | No |  |
| main/src/preload.ts | 259 | `const wrappedCallback = (_event: any, session: any) => callback(session);` | No |  |
| main/src/preload.ts | 263 | `onSessionUpdated: (callback: (session: any) => void) => {` | No |  |
| main/src/preload.ts | 264 | `const wrappedCallback = (_event: any, session: any) => callback(session);` | No |  |
| main/src/preload.ts | 268 | `onSessionDeleted: (callback: (session: any) => void) => {` | No |  |
| main/src/preload.ts | 269 | `const wrappedCallback = (_event: any, session: any) => callback(session);` | No |  |
| main/src/preload.ts | 273 | `onSessionsLoaded: (callback: (sessions: any[]) => void) => {` | No |  |
| main/src/preload.ts | 274 | `const wrappedCallback = (_event: any, sessions: any[]) => callback(sessions);` | No |  |
| main/src/preload.ts | 278 | `onGitStatusUpdated: (callback: (data: { sessionId: string; gitStatus: any }) => void) => {` | No |  |
| main/src/preload.ts | 279 | `const wrappedCallback = (_event: any, data: { sessionId: string; gitStatus: any }) => callback(data);` | No |  |
| main/src/preload.ts | 284 | `const wrappedCallback = (_event: any, data: { sessionId: string }) => callback(data);` | No |  |
| main/src/preload.ts | 288 | `onSessionOutput: (callback: (output: any) => void) => {` | No |  |
| main/src/preload.ts | 289 | `const wrappedCallback = (_event: any, output: any) => callback(output);` | No |  |
| main/src/preload.ts | 293 | `onSessionLog: (callback: (data: any) => void) => {` | No |  |
| main/src/preload.ts | 294 | `const wrappedCallback = (_event: any, data: any) => callback(data);` | No |  |
| main/src/preload.ts | 299 | `const wrappedCallback = (_event: any, data: { sessionId: string }) => callback(data);` | No |  |
| main/src/preload.ts | 303 | `onSessionOutputAvailable: (callback: (info: any) => void) => {` | No |  |
| main/src/preload.ts | 304 | `const wrappedCallback = (_event: any, info: any) => callback(info);` | No |  |
| main/src/preload.ts | 310 | `onProjectUpdated: (callback: (project: any) => void) => {` | No |  |
| main/src/preload.ts | 311 | `const wrappedCallback = (_event: any, project: any) => callback(project);` | No |  |
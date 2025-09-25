# 'any' Usage Report - File 13

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| frontend/src/types/electron.d.ts | 40 | `create: (request: any) => Promise<IPCResponse>;` | Yes | Fixed with CreateSessionData type |
| frontend/src/types/electron.d.ts | 110 | `addLog: (sessionId: string, entry: any) => Promise<IPCResponse>;` | Yes | Fixed with LogEntry interface |
| frontend/src/types/electron.d.ts | 120 | `create: (projectData: any) => Promise<IPCResponse>;` | Yes | Fixed with Omit<Project, 'id' \| 'created_at' \| 'updated_at'> |
| frontend/src/types/electron.d.ts | 122 | `update: (projectId: string, updates: any) => Promise<IPCResponse>;` | Yes | Fixed with Partial<Project> |
| frontend/src/types/electron.d.ts | 149 | `update: (updates: any) => Promise<IPCResponse>;` | Yes | Fixed with Record<string, any> for config updates |
| frontend/src/types/electron.d.ts | 151 | `updateSessionPreferences: (preferences: any) => Promise<IPCResponse>;` | Yes | Fixed with SessionCreationPreferences type |
| frontend/src/types/electron.d.ts | 168 | `openFile: (options?: any) => Promise<IPCResponse<string \| null>>;` | Yes | Fixed with Electron.OpenDialogOptions |
| frontend/src/types/electron.d.ts | 169 | `openDirectory: (options?: any) => Promise<IPCResponse<string \| null>>;` | Yes | Fixed with Electron.OpenDialogOptions |
| frontend/src/types/electron.d.ts | 174 | `respond: (requestId: string, response: any) => Promise<IPCResponse>;` | Yes | Fixed with PermissionResponse interface |
| frontend/src/types/electron.d.ts | 193 | `onUpdate: (callback: (data: any) => void) => () => void;` | Yes | Fixed with Record<string, any> |
| frontend/src/types/electron.d.ts | 194 | `onSessionUpdate: (callback: (data: any) => void) => () => void;` | Yes | Fixed with Session type |
| frontend/src/types/electron.d.ts | 207 | `onSessionCreated: (callback: (session: any) => void) => () => void;` | Yes | Fixed with Session type |
| frontend/src/types/electron.d.ts | 208 | `onSessionUpdated: (callback: (session: any) => void) => () => void;` | Yes | Fixed with Session type |
| frontend/src/types/electron.d.ts | 209 | `onSessionDeleted: (callback: (session: any) => void) => () => void;` | Yes | Fixed with Session type |
| frontend/src/types/electron.d.ts | 210 | `onSessionsLoaded: (callback: (sessions: any[]) => void) => () => void;` | Yes | Fixed with Session[] type |
| frontend/src/types/electron.d.ts | 211 | `onSessionOutput: (callback: (output: any) => void) => () => void;` | Yes | Fixed with SessionOutput type |
| frontend/src/types/electron.d.ts | 212 | `onSessionLog: (callback: (data: any) => void) => () => void;` | Yes | Fixed with {sessionId: string; entry: LogEntry} |
| frontend/src/types/electron.d.ts | 214 | `onSessionOutputAvailable: (callback: (info: any) => void) => () => void;` | Yes | Fixed with {sessionId: string; hasNewOutput: boolean} |
| frontend/src/types/electron.d.ts | 215 | `onGitStatusUpdated: (callback: (data: { sessionId: string; gitStatus: any }) => void) => () => void;` | Yes | Fixed with GitStatus type |
| frontend/src/types/electron.d.ts | 218 | `onGitStatusUpdatedBatch?: (callback: (updates: Array<{ sessionId: string; status: any }>) => void) => () => void;` | Yes | Fixed with GitStatus type |
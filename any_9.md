# 'any' Usage Report - File 9

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/taskQueue.ts | 121 | `this.sessionQueue.on('completed', (job: any, result: any) => {` | Fixed | Replaced with union types for Bull.Job and SimpleQueue job types |
| main/src/services/taskQueue.ts | 125 | `this.sessionQueue.on('failed', (job: any, err: any) => {` | Fixed | Replaced with union types for Bull.Job and SimpleQueue job types, err as Error |
| main/src/services/taskQueue.ts | 129 | `this.sessionQueue.on('error', (error: any) => {` | Fixed | Replaced with Error type |
| main/src/services/taskQueue.ts | 239 | `(session as any).codexConfig = codexConfig;` | Fixed | Used intersection type Session & { codexConfig?: typeof codexConfig } |
| main/src/services/taskQueue.ts | 244 | `(session as any).claudeConfig = claudeConfig;` | Fixed | Used intersection type Session & { claudeConfig?: typeof claudeConfig } |
| main/src/services/taskQueue.ts | 312 | `codexPanel = existingPanels.find((p: any) => p.type === 'codex');` | Fixed | Replaced with ToolPanel type |
| main/src/services/taskQueue.ts | 366 | `claudePanel = existingPanels.find((p: any) => p.type === 'claude');` | Fixed | Replaced with ToolPanel type |
| main/src/services/taskQueue.ts | 428 | `const claudePanel = existingPanels.find((p: any) => p.type === 'claude');` | Fixed | Replaced with ToolPanel type |
| main/src/services/taskQueue.ts | 456 | `const claudePanel = existingPanels.find((p: any) => p.type === 'claude');` | Fixed | Replaced with ToolPanel type |
| main/src/services/taskQueue.ts | 478 | `async createSession(data: CreateSessionJob): Promise<Bull.Job<CreateSessionJob> \| any> {` | Fixed | Replaced with union of Bull.Job and SimpleQueue job types |
| main/src/services/taskQueue.ts | 509 | `): Promise<(Bull.Job<CreateSessionJob> \| any)[]> {` | Fixed | Replaced with union of Bull.Job and SimpleQueue job types |
| main/src/services/taskQueue.ts | 528 | `const db = (sessionManager as any).db;` | Fixed | Used intersection type SessionManager & { db: DatabaseService } |
| main/src/services/versionChecker.ts | 93 | `(process as any).emit('version-update-available', versionInfo);` | Fixed | Used intersection type with custom emit signature |
| main/src/services/versionChecker.ts | 139 | `(process as any).emit('version-update-available', versionInfo);` | Fixed | Used intersection type with custom emit signature |
| main/src/services/worktreeManager.ts | 177 | `} catch (error: any) {` | Fixed | Replaced with Error & { stderr?: string; stdout?: string } |
| main/src/services/worktreeManager.ts | 404 | `} catch (error: any) {` | Fixed | Replaced with Error & { stderr?: string; stdout?: string } |
| main/src/services/worktreeManager.ts | 450 | `} catch (error: any) {` | Fixed | Replaced with Error & { stderr?: string; stdout?: string } |
| main/src/services/worktreeManager.ts | 475 | `} catch (error: any) {` | Fixed | Replaced with Error & { stderr?: string; stdout?: string } |
| main/src/services/worktreeManager.ts | 479 | `const gitError = new Error(\`Failed to rebase \${mainBranch} into worktree\`) as any;` | Fixed | Used intersection type with proper git error properties |
| main/src/services/worktreeManager.ts | 507 | `} catch (error: any) {` | Fixed | Replaced with Error & { stderr?: string; stdout?: string } |
# 'any' Usage Report - File 10

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/worktreeManager.ts | 575 | `} catch (error: any) {` | Fixed | Changed to `error: unknown` with proper error casting |
| main/src/services/worktreeManager.ts | 579 | `const gitError = new Error(\`Failed to squash and rebase worktree to \${mainBranch}\`) as any;` | Fixed | Replaced with proper intersection type for git errors |
| main/src/services/worktreeManager.ts | 630 | `} catch (error: any) {` | Fixed | Changed to `error: unknown` with proper error casting |
| main/src/services/worktreeManager.ts | 634 | `const gitError = new Error(\`Failed to rebase worktree to \${mainBranch}\`) as any;` | Fixed | Replaced with proper intersection type for git errors |
| main/src/services/worktreeManager.ts | 673 | `} catch (error: any) {` | Fixed | Changed to `error: unknown` with proper error casting |
| main/src/services/worktreeManager.ts | 675 | `const gitError = new Error(error.message \|\| 'Git pull failed') as any;` | Fixed | Replaced with proper intersection type for git errors |
| main/src/services/worktreeManager.ts | 695 | `} catch (error: any) {` | Fixed | Changed to `error: unknown` with proper error casting |
| main/src/services/worktreeManager.ts | 697 | `const gitError = new Error(error.message \|\| 'Git push failed') as any;` | Fixed | Replaced with proper intersection type for git errors |
| main/src/services/worktreeManager.ts | 706 | `async getLastCommits(worktreePath: string, count: number = 20): Promise<any[]> {` | Fixed | Changed to `Promise<RawCommitData[]>` with proper interface |
| main/src/services/worktreeManager.ts | 718 | `const commits: any[] = [];` | Fixed | Changed to `RawCommitData[]` with proper interface |
| main/src/services/worktreeManager.ts | 735 | `const commit: any = {` | Fixed | Changed to `RawCommitData` with proper interface |
| main/src/services/worktreeManager.ts | 760 | `} catch (error: any) {` | Fixed | Changed to `error: unknown` with proper error casting |
| main/src/services/worktreeManager.ts | 762 | `const gitError = new Error(error.message \|\| 'Failed to get commits') as any;` | Fixed | Replaced with proper intersection type for git errors |
| main/src/services/simpleTaskQueue.ts | 7 | `result?: any;` | Fixed | Changed to generic type `R` |
| main/src/services/simpleTaskQueue.ts | 8 | `error?: any;` | Fixed | Changed to proper `Error` type |
| main/src/services/simpleTaskQueue.ts | 16 | `private processor?: (job: Job<T>) => Promise<any>;` | Fixed | Changed to proper generic `(job: Job<T, R>) => Promise<R>` |
| main/src/services/simpleTaskQueue.ts | 25 | `process(concurrency: number, processor: (job: Job<T>) => Promise<any>) {` | Fixed | Changed to proper generic `(job: Job<T, R>) => Promise<R>` |
| main/src/services/simpleTaskQueue.ts | 102 | `on(event: 'active' \| 'completed' \| 'failed' \| 'waiting' \| 'error', listener: (...args: any[]) => void): this {` | Fixed | Changed to `(...args: unknown[]) => void` |
| main/src/ipc/git.ts | 15 | `const emitGitOperationToProject = (sessionId: string, eventType: PanelEventType, message: string, details?: any) => {` | Fixed | Changed to `Record<string, unknown>` |
| main/src/ipc/git.ts | 30 | `panelType: 'git' as any, // Virtual panel type` | Fixed | Changed to proper union type `'git' as SystemPanelType` |
# 'any' Usage Report - File 1

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/mcpPermissionServer.ts | 59 | `const { tool_name, input } = request.params.arguments as { tool_name: string; input: any };` | Fixed | Changed `input: any` to `input: unknown` for better type safety with MCP tool inputs |
| main/src/ipc/git.ts | 15 | `const emitGitOperationToProject = (sessionId: string, eventType: PanelEventType, message: string, details?: any) => {` | Fixed | Changed `details?: any` to `details?: Record<string, unknown>` since it's spread into an object |
| main/src/ipc/git.ts | 30 | `panelType: 'git' as any, // Virtual panel type` | Fixed | Created `SystemPanelType` union type and cast to `SystemPanelType` instead of `any` |
| main/src/ipc/git.ts | 135 | `commits = fallbackCommits.map((commit: any) => ({` | Fixed | Created `RawCommitData` interface to type the raw commit data from worktreeManager |
| main/src/ipc/git.ts | 281 | `} catch (commitError: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 288 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 615 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 748 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 818 | `} catch (abortError: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 871 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 892 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 963 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 1038 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 1103 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 1182 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/ipc/git.ts | 1236 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/utils/commandExecutor.ts | 29 | `const result = nodeExecSync(command, enhancedOptions as any);` | Fixed | Changed `as any` to `as ExecSyncOptions` - the enhanced options are compatible with ExecSyncOptions |
| main/src/utils/commandExecutor.ts | 41 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/utils/commandExecutor.ts | 84 | `} catch (error: any) {` | No | Kept as `any` - catch clause variable types in TypeScript conventionally use `any` for error handling |
| main/src/types/session.ts | 11 | `jsonMessages: any[];` | Fixed | Changed `any[]` to `unknown[]` for better type safety while preserving flexibility for JSON data |
# 'any' Usage Report - File 7

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/__tests__/gitStatusManager.test.ts | 162 | `const result = (gitStatusManager as any).checkMergeConflicts('/test/path');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 198 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 219 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 240 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 262 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 281 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 300 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 318 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 340 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 350 | `const status = await (gitStatusManager as any).fetchGitStatus('test-session');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 360 | `const pollSpy = vi.spyOn(gitStatusManager as any, 'pollAllSessions').mockImplementation(() => {});` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 380 | `const pollSpy = vi.spyOn(gitStatusManager as any, 'pollAllSessions').mockImplementation(() => {});` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 399 | `(gitStatusManager as any).cache['test-session'] = {` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 404 | `const fetchSpy = vi.spyOn(gitStatusManager as any, 'fetchGitStatus');` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 416 | `(gitStatusManager as any).cache['test-session'] = {` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/__tests__/gitStatusManager.test.ts | 421 | `vi.spyOn(gitStatusManager as any, 'fetchGitStatus').mockResolvedValue(newStatus);` | Fixed | Already using proper GitStatusManagerWithPrivates interface |
| main/src/services/stravuNotebookService.ts | 26 | `private cache = new Map<string, any>();` | Fixed | Replaced with Map<string, CacheValue> using proper union type |
| main/src/services/stravuNotebookService.ts | 53 | `const data: any = await response.json();` | Fixed | Replaced with NotebooksApiResponse interface |
| main/src/services/stravuNotebookService.ts | 55 | `const notebooks: Notebook[] = data.notebooks.map((nb: any) => ({` | Fixed | Replaced with NotebookSearchResult interface |
| main/src/services/stravuNotebookService.ts | 93 | `const notebook: any = await response.json();` | Fixed | Replaced with NotebookSearchResult interface |
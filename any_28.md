# 'any' Usage Report - File 28

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/database/database.ts | 1171 | `const values: any[] = [];` | No |  |
| main/src/database/database.ts | 1335 | `const values: any[] = [];` | No |  |
| main/src/database/database.ts | 1469 | `const values: any[] = [];` | No |  |
| main/src/database/database.ts | 1589 | `const values: any[] = [];` | No |  |
| main/src/database/database.ts | 2387 | `const values: any[] = [];` | No |  |
| main/src/database/database.ts | 2472 | `const rows = this.db.prepare('SELECT * FROM tool_panels WHERE session_id = ? ORDER BY created_at').all(sessionId) as any[];` | No |  |
| main/src/database/database.ts | 2485 | `const rows = this.db.prepare('SELECT * FROM tool_panels ORDER BY created_at').all() as any[];` | No |  |
| main/src/database/database.ts | 2503 | `).all() as any[];` | No |  |
| frontend/src/types/ansi-to-html.d.ts | 5 | `constructor(options?: any);` | No |  |
| frontend/src/types/ansi-to-html.d.ts | 6 | `toHtml(text: string): any;` | No |  |
| frontend/src/hooks/useCodexPanel.ts | 124 | `const handleSendInput = async (attachedImages?: any[], attachedTexts?: any[]) => {` | No |  |
| frontend/src/hooks/useCodexPanel.ts | 187 | `const handleStravuFileSelect = (file: any, content: string) => {` | No |  |
| main/src/services/stravuNotebookService.ts | 26 | `private cache = new Map<string, any>();` | No |  |
| main/src/services/stravuNotebookService.ts | 53 | `const data: any = await response.json();` | No |  |
| main/src/services/stravuNotebookService.ts | 55 | `const notebooks: Notebook[] = data.notebooks.map((nb: any) => ({` | No |  |
| main/src/services/stravuNotebookService.ts | 93 | `const notebook: any = await response.json();` | No |  |
| main/src/services/stravuNotebookService.ts | 124 | `const data: any = await response.json();` | No |  |
| main/src/services/permissionManager.ts | 8 | `input: any;` | No |  |
| main/src/services/permissionManager.ts | 14 | `updatedInput?: any;` | No |  |
| main/src/services/permissionManager.ts | 51 | `async requestPermission(sessionId: string, toolName: string, input: any): Promise<PermissionResponse> {` | No |  |
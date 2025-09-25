# 'any' Usage Report - File 27

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/panels/claude/claudePanelManager.ts | 73 | `async continuePanel(panelId: string, worktreePath: string, prompt: string, conversationHistory: any[], model?: string): Promise<void>;` | No |  |
| main/src/services/panels/claude/claudePanelManager.ts | 79 | `conversationHistory?: any[],` | No |  |
| main/src/ipc/codexPanel.ts | 165 | `this.ipcMain.handle('codexPanel:continue', async (_, panelId: string, worktreePath: string, prompt: string, conversationHistory: any[], options?: {` | No |  |
| frontend/src/hooks/useSessionView.ts | 1106 | `const handleSendInput = async (attachedImages?: any[], attachedTexts?: any[]) => {` | No |  |
| frontend/src/hooks/useSessionView.ts | 1182 | `attachedImages?: any[],` | No |  |
| frontend/src/hooks/useSessionView.ts | 1183 | `attachedTexts?: any[],` | No |  |
| frontend/src/hooks/useCodexPanel.ts | 20 | `const conversationHistoryRef = useRef<any[]>([]);` | No |  |
| frontend/src/hooks/useCodexPanel.ts | 134 | `const history: any[] = [];` | No |  |
| frontend/src/components/panels/ai/RichOutputView.tsx | 201 | `const userPrompts: any[] = [];` | No |  |
| main/src/events.ts | 538 | `let commits: any[] = [];` | No |  |
| main/src/events.ts | 665 | `let commits: any[] = [];` | No |  |
| frontend/src/components/panels/diff/MonacoDiffViewer.tsx | 306 | `const disposables: any[] = [];` | No |  |
| frontend/src/components/panels/ai/transformers/ClaudeMessageTransformer.ts | 20 | `tools?: any[];` | No |  |
| frontend/src/components/panels/ai/transformers/ClaudeMessageTransformer.ts | 21 | `mcp_servers?: any[];` | No |  |
| frontend/src/components/panels/ai/transformers/CodexMessageTransformer.ts | 117 | `transform(rawOutputs: any[]): UnifiedMessage[] {` | No |  |
| frontend/src/components/panels/ai/transformers/MessageTransformer.ts | 49 | `transform(rawMessages: any[]): UnifiedMessage[];` | No |  |
| main/src/services/worktreeManager.ts | 706 | `async getLastCommits(worktreePath: string, count: number = 20): Promise<any[]> {` | No |  |
| main/src/services/worktreeManager.ts | 718 | `const commits: any[] = [];` | No |  |
| main/src/services/executionTracker.ts | 307 | `async getExecutionDiffs(sessionId: string): Promise<any[]> {` | No |  |
| main/src/database/database.ts | 1084 | `const claudeSettings = this.db.prepare("SELECT * FROM claude_panel_settings").all() as any[];` | No |  |
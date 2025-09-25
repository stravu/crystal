# 'any' Usage Report - File 26

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/index.ts | 265 | `console.error = (...args: any[]) => {` | No |  |
| main/src/index.ts | 317 | `console.warn = (...args: any[]) => {` | No |  |
| main/src/index.ts | 352 | `console.info = (...args: any[]) => {` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 320 | `abstract startPanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, ...args: any[]): Promise<void>;` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 326 | `abstract continuePanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, conversationHistory: any[], ...args: any[]): Promise<void>;` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 338 | `abstract restartPanelWithHistory(panelId: string, sessionId: string, worktreePath: string, initialPrompt: string, conversationHistory: any[]): Promise<void>;` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 346 | `async startSession(sessionId: string, worktreePath: string, prompt: string, ...args: any[]): Promise<void> {` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 355 | `async continueSession(sessionId: string, worktreePath: string, prompt: string, conversationHistory: any[], ...args: any[]): Promise<void> {` | No |  |
| frontend/src/hooks/useIPCEvents.ts | 25 | `function throttle<T extends (...args: any[]) => any>(` | No |  |
| main/src/utils/contextCompactor.ts | 58 | `private analyzePrompts(promptMarkers: PromptMarker[], outputs: SessionOutput[]): any[] {` | No |  |
| main/src/utils/contextCompactor.ts | 164 | `private extractTodos(outputs: SessionOutput[]): any[] {` | No |  |
| main/src/utils/contextCompactor.ts | 165 | `const todos: any[] = [];` | No |  |
| main/src/utils/contextCompactor.ts | 245 | `promptAnalysis: any[];` | No |  |
| main/src/utils/contextCompactor.ts | 247 | `todos: any[];` | No |  |
| main/src/services/panels/codex/codexPanelManager.ts | 54 | `protected extractAgentConfig(config: AIPanelConfig): any[] {` | No |  |
| main/src/services/panels/codex/codexPanelManager.ts | 337 | `conversationHistory: any[],` | No |  |
| main/src/services/panels/codex/codexPanelManager.ts | 350 | `conversationHistory?: any[],` | No |  |
| main/src/services/panels/claude/claudeCodeManager.ts | 399 | `conversationHistory: any[],` | No |  |
| main/src/services/panels/codex/codexManager.ts | 903 | `conversationHistory: any[],` | No |  |
| main/src/services/panels/claude/claudePanelManager.ts | 34 | `protected extractAgentConfig(config: AIPanelConfig): any[] {` | No |  |
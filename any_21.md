# 'any' Usage Report - File 21

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/services/sessionManager.ts | 552 | `.filter((item: any) => item.type === 'text')` | No |  |
| main/src/services/sessionManager.ts | 553 | `.map((item: any) => item.text)` | No |  |
| main/src/services/sessionManager.ts | 662 | `const data: any = output.data;` | No |  |
| main/src/services/sessionManager.ts | 685 | `.filter((item: any) => item.type === 'text')` | No |  |
| main/src/services/sessionManager.ts | 686 | `.map((item: any) => item.text)` | No |  |
| main/src/services/sessionManager.ts | 726 | `const textContent = content.find((item: any) => item.type === 'text');` | No |  |
| main/src/services/sessionManager.ts | 750 | `const data: any = output.data;` | No |  |
| main/src/services/sessionManager.ts | 755 | `const currentState = (panel as any).state \|\| {};` | No |  |
| main/src/services/sessionManager.ts | 1072 | `} catch (cmdError: any) {` | No |  |
| main/src/index.ts | 267 | `if ((console.error as any).__isHandlingError) {` | No |  |
| main/src/index.ts | 271 | `(console.error as any).__isHandlingError = true;` | No |  |
| main/src/index.ts | 313 | `(console.error as any).__isHandlingError = false;` | No |  |
| main/src/services/panels/ai/AbstractAIPanelManager.ts | 174 | `eventTypes: ['git:operation' as any],  // Listen for git events` | No |  |
| main/src/ipc/project.ts | 126 | `const cmdError = error as any;` | No |  |
| main/src/ipc/claudePanel.ts | 203 | `sessionOutputs: sessionOutputs as any // Type conversion needed` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 420 | `const db = (this.sessionManager as any).db;` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 584 | `if (spawnAttempt === 0 && !(global as any)[needsNodeFallbackKey]) {` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 639 | `if (spawnAttempt === 1 && !(global as any)[needsNodeFallbackKey]) {` | No |  |
| main/src/services/panels/cli/AbstractCliManager.ts | 649 | `(global as any)[needsNodeFallbackKey] = true;` | No |  |
| main/src/ipc/panels.ts | 157 | `const customState = panel.state.customState as any;` | No |  |
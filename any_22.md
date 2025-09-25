# 'any' Usage Report - File 22

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/ipc/panels.ts | 162 | `const customState = panel.state.customState as any;` | No |  |
| main/src/services/panels/codex/codexPanelManager.ts | 12 | `const signals = (os.constants as any)?.signals as Record<string, number> \| undefined;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 129 | `(global as any).codexNeedsNodeFallback = true;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 303 | `const config = this.configManager?.getConfig() as any;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 358 | `const db = (this.sessionManager as any).db;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 401 | `const db = (this.sessionManager as any).db;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 485 | `const config = this.configManager?.getConfig() as any;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 768 | `const db = (this.sessionManager as any).db;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 796 | `const verifyCustomState = verifyPanel?.state?.customState as any;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 846 | `const db = (this.sessionManager as any).db;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 875 | `const verifyCustomState = verifyPanel?.state?.customState as any;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 926 | `const db = (this.sessionManager as any).db;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 1149 | `const panelState = panel?.state?.customState as any;` | No |  |
| main/src/services/panels/codex/codexManager.ts | 1160 | `const db = (this.sessionManager as any).db;` | No |  |
| frontend/src/hooks/useSessionView.ts | 1337 | `if ((response as any).gitError) {` | No |  |
| frontend/src/hooks/useSessionView.ts | 1338 | `const gitError = (response as any).gitError;` | No |  |
| frontend/src/hooks/useSessionView.ts | 1427 | `if ((response as any).gitError) {` | No |  |
| frontend/src/hooks/useSessionView.ts | 1428 | `const gitError = (response as any).gitError;` | No |  |
| main/src/ipc/session.ts | 212 | `const gitError = error as any;` | No |  |
| main/src/ipc/session.ts | 431 | `type: sessionToolType as any,` | No |  |
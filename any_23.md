# 'any' Usage Report - File 23

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| main/src/ipc/session.ts | 1281 | `sessionOutputs: sessionOutputs as any // Type conversion needed` | No |  |
| main/src/utils/contextCompactor.ts | 103 | `const message = output.data as any;` | No |  |
| main/src/utils/contextCompactor.ts | 145 | `const message = output.data as any;` | No |  |
| main/src/utils/contextCompactor.ts | 171 | `const message = output.data as any;` | No |  |
| main/src/utils/contextCompactor.ts | 225 | `const message = output.data as any;` | No |  |
| frontend/src/hooks/useNotifications.ts | 49 | `const audioContext = new (window.AudioContext \|\| (window as any).webkitAudioContext)();` | No |  |
| main/src/events.ts | 188 | `const codexConfig = (session as any).codexConfig \|\| {};` | No |  |
| main/src/events.ts | 200 | `const claudeConfig = (session as any).claudeConfig \|\| {};` | No |  |
| main/src/events.ts | 213 | `type: panelType as any,` | No |  |
| main/src/services/panels/claude/claudeCodeManager.ts | 224 | `const mcpConfigPath = (global as any)[\`mcp_config_\${sessionId}\`];` | No |  |
| main/src/services/panels/claude/claudeCodeManager.ts | 232 | `delete (global as any)[\`mcp_config_\${sessionId}\`];` | No |  |
| main/src/services/panels/claude/claudeCodeManager.ts | 240 | `const mcpScriptPath = (global as any)[\`mcp_script_\${sessionId}\`];` | No |  |
| main/src/services/panels/claude/claudeCodeManager.ts | 248 | `delete (global as any)[\`mcp_script_\${sessionId}\`];` | No |  |
| main/src/services/panels/claude/claudeCodeManager.ts | 674 | `(global as any)[\`mcp_config_\${sessionId}\`] = mcpConfigPath;` | No |  |
| main/src/services/panels/claude/claudeCodeManager.ts | 676 | `(global as any)[\`mcp_script_\${sessionId}\`] = mcpBridgePath;` | No |  |
| main/src/test-updater.ts | 18 | `(autoUpdater.logger as any).transports.file.level = 'debug';` | No |  |
| main/src/utils/shellPath.ts | 120 | `const isPackaged = process.env.NODE_ENV === 'production' \|\| (process as any).pkg \|\| app?.isPackaged;` | No |  |
| frontend/src/hooks/useIPCEvents.ts | 200 | `detail: { sessionId: output.sessionId, panelId: (output as any).panelId }` | No |  |
| frontend/src/components/Settings.tsx | 561 | `onClick={activeTab === 'notifications' ? (e) => handleSubmit(e as any) : undefined}` | No |  |
| frontend/src/components/panels/editor/FileEditor.tsx | 241 | `onFileSelect(null as any);` | No |  |
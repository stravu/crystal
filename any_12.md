# 'any' Usage Report - File 12

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| frontend/src/utils/formatters.ts | 35 | `.map((item: any) => {` | Fixed | Already using correct MessageContent type |
| frontend/src/utils/formatters.ts | 58 | `.map((item: any) => {` | Fixed | Already using correct MessageContent type |
| frontend/src/components/dialog/BaseAIToolConfig.tsx | 8 | `attachedImages?: any[];` | Fixed | Changed to AttachedImage[] |
| frontend/src/components/dialog/BaseAIToolConfig.tsx | 9 | `attachedTexts?: any[];` | Fixed | Changed to AttachedText[] |
| frontend/src/hooks/useCliPanel.ts | 397 | `const handlePanelOutput = (_event: any, data: any) => {` | Skipped | Commented out code |
| frontend/src/utils/toolFormatter.ts | 2 | `function formatJsonForOutput(jsonMessage: any): string {` | Fixed | Changed to ClaudeJsonMessage |
| frontend/src/utils/toolFormatter.ts | 26 | `input: any;` | No | Kept as any for flexibility with tool inputs |
| frontend/src/utils/toolFormatter.ts | 46 | `function filterBase64Data(obj: any): any {` | No | Kept as any for recursive object filtering |
| frontend/src/utils/toolFormatter.ts | 58 | `const filtered: any = {};` | No | Kept as any for dynamic object construction |
| frontend/src/utils/toolFormatter.ts | 86 | `function makePathsRelative(content: any): string {` | No | Kept as any to handle mixed content types |
| frontend/src/utils/toolFormatter.ts | 154 | `toolCall.input.todos.forEach((todo: any) => {` | Fixed | Changed to specific todo type |
| frontend/src/utils/toolFormatter.ts | 362 | `export function formatJsonForOutputEnhanced(jsonMessage: any): string {` | Fixed | Changed to ClaudeJsonMessage |
| frontend/src/utils/toolFormatter.ts | 370 | `const toolUses = content.filter((item: any) => item.type === 'tool_use');` | Fixed | Added type assertion to ToolCall[] |
| frontend/src/utils/toolFormatter.ts | 391 | `.filter((item: any) => item.type === 'text')` | No | Kept as any due to mixed content array |
| frontend/src/utils/toolFormatter.ts | 392 | `.map((item: any) => item.text)` | No | Kept as any due to mixed content array |
| frontend/src/utils/toolFormatter.ts | 408 | `const toolResults = content.filter((item: any) => item.type === 'tool_result');` | Fixed | Added type assertion to ToolResult[] |
| frontend/src/utils/toolFormatter.ts | 452 | `.filter((item: any) => item.type === 'text')` | No | Kept as any due to mixed content array |
| frontend/src/utils/toolFormatter.ts | 453 | `.map((item: any) => item.text)` | No | Kept as any due to mixed content array |
| frontend/src/types/electron.d.ts | 3 | `interface IPCResponse<T = any> {` | No | Kept as any for IPC flexibility |
| frontend/src/types/electron.d.ts | 13 | `invoke: (channel: string, ...args: any[]) => Promise<any>;` | No | Kept as any for IPC flexibility |
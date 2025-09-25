# 'any' Usage Report - File 11

| File Path | Line Number | Code Snippet | Fixed | Explanation |
|-----------|-------------|--------------|-------|-------------|
| frontend/src/utils/performanceUtils.ts | 13 | `export const throttle = <T extends (...args: any[]) => any>(` | No | Intentionally kept as 'any' - generic utility function needs to work with any function signature |
| frontend/src/utils/performanceUtils.ts | 41 | `export const debounce = <T extends (...args: any[]) => any>(` | No | Intentionally kept as 'any' - generic utility function needs to work with any function signature |
| frontend/src/contexts/ContextMenuContext.tsx | 11 | `payload: any;` | Yes | Replaced with `ContextMenuPayload \| null` using union type of Session and Folder |
| frontend/src/contexts/ContextMenuContext.tsx | 16 | `openMenu: (type: 'session' \| 'folder', payload: any, position: ContextMenuPosition) => void;` | Yes | Replaced with proper `ContextMenuPayload` type |
| frontend/src/contexts/ContextMenuContext.tsx | 42 | `const openMenu = useCallback((type: 'session' \| 'folder', payload: any, position: ContextMenuPosition) => {` | Yes | Replaced with proper `ContextMenuPayload` type |
| frontend/src/stores/sessionStore.ts | 344 | `const jsonMessages: any[] = [];` | Yes | Replaced with `ClaudeJsonMessage[]` using proper message interface |
| frontend/src/App.tsx | 27 | `input: any;` | Yes | Replaced with `PermissionInput` interface |
| frontend/src/App.tsx | 36 | `const [updateVersionInfo, setUpdateVersionInfo] = useState<any>(null);` | Yes | Replaced with `VersionUpdateInfo \| null` |
| frontend/src/App.tsx | 263 | `const handleVersionUpdate = (versionInfo: any) => {` | Yes | Replaced with proper `VersionUpdateInfo` type |
| frontend/src/App.tsx | 300 | `const handlePermissionResponse = async (requestId: string, behavior: 'allow' \| 'deny', updatedInput?: any, message?: string) => {` | Yes | Replaced with `PermissionInput` interface |
| frontend/src/components/dialog/ClaudeCodeConfig.tsx | 12 | `attachedImages?: any[];` | Yes | Replaced with `AttachedImage[]` interface |
| frontend/src/components/dialog/ClaudeCodeConfig.tsx | 13 | `attachedTexts?: any[];` | Yes | Replaced with `AttachedText[]` interface |
| frontend/src/components/dialog/ClaudeCodeConfig.tsx | 37 | `const processFile = async (file: File): Promise<any \| null> => {` | Yes | Replaced with `Promise<AttachedImage \| null>` |
| frontend/src/utils/debounce.ts | 1 | `export interface DebouncedFunction<T extends (...args: any[]) => any> {` | No | Intentionally kept as 'any' - generic utility function needs to work with any function signature |
| frontend/src/utils/debounce.ts | 6 | `export function debounce<T extends (...args: any[]) => any>(` | No | Intentionally kept as 'any' - generic utility function needs to work with any function signature |
| frontend/src/contexts/SessionContext.tsx | 13 | `icon: any;` | Yes | Replaced with `LucideIcon` type from lucide-react |
| frontend/src/contexts/SessionContext.tsx | 31 | `icon: any;` | Yes | Replaced with `LucideIcon` type from lucide-react |
| frontend/src/types/session.ts | 11 | `jsonMessages: any[];` | Yes | Replaced with `ClaudeJsonMessage[]` using proper message interface |
| frontend/src/types/session.ts | 84 | `data: string \| any;` | Yes | Replaced with `string \| ClaudeJsonMessage` union type |
| frontend/src/utils/formatters.ts | 9 | `export function formatJsonForWeb(jsonMessage: any): string {` | Yes | Replaced with `ClaudeJsonMessage` interface |
// Type definitions for Electron preload API
import type { Session, SessionOutput, GitStatus, VersionUpdateInfo } from './session';
import type { Project } from './project';
import type { Folder } from './folder';
import type { SessionCreationPreferences } from '../stores/sessionPreferencesStore';
import type { ToolPanel } from '../../../shared/types/panels';
import type { CreateSessionRequest } from './session';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

interface PermissionResponse {
  allow: boolean;
  reason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic type parameter default for flexible API responses
interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  command?: string;
}

interface ElectronAPI {
  // Generic invoke method for direct IPC calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic IPC bridge that returns different types based on channel
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
  
  // Basic app info
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  isPackaged: () => Promise<boolean>;

  // Version checking
  checkForUpdates: () => Promise<IPCResponse>;
  getVersionInfo: () => Promise<IPCResponse>;
  
  // Auto-updater
  updater: {
    checkAndDownload: () => Promise<IPCResponse>;
    downloadUpdate: () => Promise<IPCResponse>;
    installUpdate: () => Promise<IPCResponse>;
  };

  // System utilities
  openExternal: (url: string) => Promise<void>;

  // Session management
  sessions: {
    getAll: () => Promise<IPCResponse>;
    getAllWithProjects: () => Promise<IPCResponse>;
    getArchivedWithProjects: () => Promise<IPCResponse>;
    get: (sessionId: string) => Promise<IPCResponse>;
    create: (request: CreateSessionRequest) => Promise<IPCResponse>;
    delete: (sessionId: string) => Promise<IPCResponse>;
    sendInput: (sessionId: string, input: string) => Promise<IPCResponse>;
    continue: (sessionId: string, prompt?: string, model?: string) => Promise<IPCResponse>;
    getOutput: (sessionId: string, limit?: number) => Promise<IPCResponse>;
    getJsonMessages: (sessionId: string) => Promise<IPCResponse>;
    getStatistics: (sessionId: string) => Promise<IPCResponse>;
    getConversation: (sessionId: string) => Promise<IPCResponse>;
    getConversationMessages: (sessionId: string) => Promise<IPCResponse>;
    generateCompactedContext: (sessionId: string) => Promise<IPCResponse>;
    markViewed: (sessionId: string) => Promise<IPCResponse>;
    stop: (sessionId: string) => Promise<IPCResponse>;
    
    // Execution and Git operations
    getExecutions: (sessionId: string) => Promise<IPCResponse>;
    getExecutionDiff: (sessionId: string, executionId: string) => Promise<IPCResponse>;
    gitCommit: (sessionId: string, message: string) => Promise<IPCResponse>;
    gitDiff: (sessionId: string) => Promise<IPCResponse>;
    getCombinedDiff: (sessionId: string, executionIds?: number[]) => Promise<IPCResponse>;
    
    // Script operations
    hasRunScript: (sessionId: string) => Promise<IPCResponse>;
    getRunningSession: () => Promise<IPCResponse>;
    runScript: (sessionId: string) => Promise<IPCResponse>;
    stopScript: (sessionId?: string) => Promise<IPCResponse>;
    runTerminalCommand: (sessionId: string, command: string) => Promise<IPCResponse>;
    sendTerminalInput: (sessionId: string, data: string) => Promise<IPCResponse>;
    preCreateTerminal: (sessionId: string) => Promise<IPCResponse>;
    resizeTerminal: (sessionId: string, cols: number, rows: number) => Promise<IPCResponse>;
    
    // Prompt operations
    getPrompts: (sessionId: string) => Promise<IPCResponse>;
    
    // Git merge operations
    mergeMainToWorktree: (sessionId: string) => Promise<IPCResponse>;
    mergeWorktreeToMain: (sessionId: string) => Promise<IPCResponse>;
    
    // Git rebase operations
    rebaseMainIntoWorktree: (sessionId: string) => Promise<IPCResponse>;
    abortRebaseAndUseClaude: (sessionId: string) => Promise<IPCResponse>;
    squashAndRebaseToMain: (sessionId: string, commitMessage: string) => Promise<IPCResponse>;
    rebaseToMain: (sessionId: string) => Promise<IPCResponse>;
    hasChangesToRebase: (sessionId: string) => Promise<IPCResponse>;
    getGitCommands: (sessionId: string) => Promise<IPCResponse>;
    generateName: (prompt: string) => Promise<IPCResponse>;
    rename: (sessionId: string, newName: string) => Promise<IPCResponse>;
    toggleFavorite: (sessionId: string) => Promise<IPCResponse>;
    toggleAutoCommit: (sessionId: string) => Promise<IPCResponse>;

    // Main repo session
    getOrCreateMainRepoSession: (projectId: number) => Promise<IPCResponse>;

    // Git pull/push operations
    gitPull: (sessionId: string) => Promise<IPCResponse>;
    gitPush: (sessionId: string) => Promise<IPCResponse>;
    getGitStatus: (sessionId: string, nonBlocking?: boolean, isInitialLoad?: boolean) => Promise<IPCResponse>;
    getLastCommits: (sessionId: string, count: number) => Promise<IPCResponse>;

    // IDE operations
    openIDE: (sessionId: string) => Promise<IPCResponse>;
    
    // Reorder operations
    reorder: (sessionOrders: Array<{ id: string; displayOrder: number }>) => Promise<IPCResponse>;
    
    // Image operations
    saveImages: (sessionId: string, images: Array<{ name: string; dataUrl: string; type: string }>) => Promise<string[]>;
    
    // Log operations
    getLogs: (sessionId: string) => Promise<IPCResponse>;
    clearLogs: (sessionId: string) => Promise<IPCResponse>;
    addLog: (sessionId: string, entry: LogEntry) => Promise<IPCResponse>;
    
    // Large text operations
    saveLargeText: (sessionId: string, text: string) => Promise<string>;
  };

  // Project management
  projects: {
    getAll: () => Promise<IPCResponse>;
    getActive: () => Promise<IPCResponse>;
    create: (projectData: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => Promise<IPCResponse>;
    activate: (projectId: string) => Promise<IPCResponse>;
    update: (projectId: string, updates: Partial<Project>) => Promise<IPCResponse>;
    delete: (projectId: string) => Promise<IPCResponse>;
    detectBranch: (path: string) => Promise<IPCResponse>;
    reorder: (projectOrders: Array<{ id: number; displayOrder: number }>) => Promise<IPCResponse>;
    listBranches: (projectId: string) => Promise<IPCResponse>;
    refreshGitStatus: (projectId: number) => Promise<IPCResponse>;
    runScript: (projectId: number) => Promise<IPCResponse>;
    getRunningScript: () => Promise<IPCResponse>;
    stopScript: (projectId?: number) => Promise<IPCResponse>;
  };

  // Git operations
  git: {
    detectBranch: (path: string) => Promise<IPCResponse<string>>;
    cancelStatusForProject: (projectId: number) => Promise<{ success: boolean; error?: string }>;
    executeProject: (projectId: number, args: string[]) => Promise<IPCResponse>;
  };

  // Folders
  folders: {
    getByProject: (projectId: number) => Promise<IPCResponse>;
    create: (name: string, projectId: number, parentFolderId?: string | null) => Promise<IPCResponse>;
    update: (folderId: string, updates: { name?: string; display_order?: number; parent_folder_id?: string | null }) => Promise<IPCResponse>;
    delete: (folderId: string) => Promise<IPCResponse>;
    reorder: (projectId: number, folderOrders: Array<{ id: string; displayOrder: number }>) => Promise<IPCResponse>;
    moveSession: (sessionId: string, folderId: string | null) => Promise<IPCResponse>;
    move: (folderId: string, parentFolderId: string | null) => Promise<IPCResponse>;
  };

  // Configuration
  config: {
    get: () => Promise<IPCResponse>;
    update: (updates: Record<string, unknown>) => Promise<IPCResponse>;
    getSessionPreferences: () => Promise<IPCResponse>;
    updateSessionPreferences: (preferences: SessionCreationPreferences) => Promise<IPCResponse>;
  };

  // Prompts
  prompts: {
    getAll: () => Promise<IPCResponse>;
    getByPromptId: (promptId: string) => Promise<IPCResponse>;
  };

  // File operations
  file: {
    listProject: (projectId: number, path?: string) => Promise<IPCResponse>;
    readProject: (projectId: number, filePath: string) => Promise<IPCResponse>;
    writeProject: (projectId: number, filePath: string, content: string) => Promise<IPCResponse>;
  };

  // Dialog
  dialog: {
    openFile: (options?: Electron.OpenDialogOptions) => Promise<IPCResponse<string | null>>;
    openDirectory: (options?: Electron.OpenDialogOptions) => Promise<IPCResponse<string | null>>;
  };

  // Permissions
  permissions: {
    respond: (requestId: string, response: PermissionResponse) => Promise<IPCResponse>;
    getPending: () => Promise<IPCResponse>;
  };

  // Stravu MCP integration with OAuth
  stravu: {
    getConnectionStatus: () => Promise<IPCResponse>;
    initiateAuth: () => Promise<IPCResponse>;
    checkAuthStatus: (sessionId: string) => Promise<IPCResponse>;
    disconnect: () => Promise<IPCResponse>;
    getNotebooks: () => Promise<IPCResponse>;
    getNotebook: (notebookId: string) => Promise<IPCResponse>;
    searchNotebooks: (query: string, limit?: number) => Promise<IPCResponse>;
  };

  // Dashboard
  dashboard: {
    getProjectStatus: (projectId: number) => Promise<IPCResponse>;
    getProjectStatusProgressive: (projectId: number) => Promise<IPCResponse>;
    onUpdate: (callback: (data: Record<string, unknown>) => void) => () => void;
    onSessionUpdate: (callback: (data: { type: string; projectId?: number; sessionId?: string; data: unknown }) => void) => () => void;
  };

  // UI State management
  uiState: {
    getExpanded: () => Promise<IPCResponse<{ expandedProjects: number[]; expandedFolders: string[]; sessionSortAscending: boolean }>>;
    saveExpanded: (projectIds: number[], folderIds: string[]) => Promise<IPCResponse>;
    saveExpandedProjects: (projectIds: number[]) => Promise<IPCResponse>;
    saveExpandedFolders: (folderIds: string[]) => Promise<IPCResponse>;
    saveSessionSortAscending: (ascending: boolean) => Promise<IPCResponse>;
  };

  // Event listeners for real-time updates
  events: {
    onSessionCreated: (callback: (session: Session) => void) => () => void;
    onSessionUpdated: (callback: (session: Session) => void) => () => void;
    onSessionDeleted: (callback: (session: Session) => void) => () => void;
    onSessionsLoaded: (callback: (sessions: Session[]) => void) => () => void;
    onSessionOutput: (callback: (output: SessionOutput) => void) => () => void;
    onSessionLog: (callback: (data: { sessionId: string; entry: LogEntry }) => void) => () => void;
    onSessionLogsCleared: (callback: (data: { sessionId: string }) => void) => () => void;
    onSessionOutputAvailable: (callback: (info: { sessionId: string; hasNewOutput: boolean }) => void) => () => void;
    onGitStatusUpdated: (callback: (data: { sessionId: string; gitStatus: GitStatus }) => void) => () => void;
    onGitStatusLoading: (callback: (data: { sessionId: string }) => void) => () => void;
    onGitStatusLoadingBatch?: (callback: (sessionIds: string[]) => void) => () => void;
    onGitStatusUpdatedBatch?: (callback: (updates: Array<{ sessionId: string; status: GitStatus }>) => void) => () => void;
    
    // Project events
    onProjectUpdated: (callback: (project: Project) => void) => () => void;
    
    // Folder events
    onFolderCreated: (callback: (folder: Folder) => void) => () => void;
    onFolderUpdated: (callback: (folder: Folder) => void) => () => void;
    onFolderDeleted: (callback: (folderId: string) => void) => () => void;
    
    // Panel events
    onPanelCreated: (callback: (panel: ToolPanel) => void) => () => void;
    onPanelUpdated: (callback: (panel: ToolPanel) => void) => () => void;
    onPanelPromptAdded: (callback: (data: { panelId: string; content: string }) => void) => () => void;
    onPanelResponseAdded: (callback: (data: { panelId: string; content: string }) => void) => () => void;
    
    onTerminalOutput: (callback: (output: { sessionId: string; data: string; type: 'stdout' | 'stderr' }) => void) => () => void;
    onMainLog: (callback: (level: string, message: string) => void) => () => void;
    onVersionUpdateAvailable: (callback: (versionInfo: VersionUpdateInfo) => void) => () => void;
    
    // Auto-updater events
    onUpdaterCheckingForUpdate: (callback: () => void) => () => void;
    onUpdaterUpdateAvailable: (callback: (info: { version: string; releaseDate: string; releaseName?: string; releaseNotes?: string }) => void) => () => void;
    onUpdaterUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void;
    onUpdaterDownloadProgress: (callback: (progressInfo: { bytesPerSecond: number; percent: number; transferred: number; total: number }) => void) => () => void;
    onUpdaterUpdateDownloaded: (callback: (info: { version: string; files: string[]; path: string; sha512: string; releaseDate: string }) => void) => () => void;
    onUpdaterError: (callback: (error: Error) => void) => () => void;
    
    // Process management events
    onZombieProcessesDetected: (callback: (data: { sessionId?: string | null; pids?: number[]; message: string }) => void) => () => void;
    
    removeAllListeners: (channel: string) => void;
  };

  // Panel operations
  panels: {
    getSessionPanels: (sessionId: string) => Promise<IPCResponse>;
    createPanel: (sessionId: string, type: string, name: string, config?: Record<string, unknown>) => Promise<IPCResponse>;
    deletePanel: (panelId: string) => Promise<IPCResponse>;
    renamePanel: (panelId: string, name: string) => Promise<IPCResponse>;
    setActivePanel: (sessionId: string, panelId: string) => Promise<IPCResponse>;
    sendInput: (panelId: string, input: string, images?: Array<{ name: string; dataUrl: string; type: string }>) => Promise<IPCResponse>;
    getOutput: (panelId: string, limit?: number) => Promise<IPCResponse>;
    getConversationMessages: (panelId: string) => Promise<IPCResponse>;
    getJsonMessages: (panelId: string) => Promise<IPCResponse>;
    getPrompts: (panelId: string) => Promise<IPCResponse>;
    continue: (panelId: string, input: string, model?: string) => Promise<IPCResponse>;
    stop: (panelId: string) => Promise<IPCResponse>;
    resizeTerminal: (panelId: string, cols: number, rows: number) => Promise<IPCResponse>;
    sendTerminalInput: (panelId: string, data: string) => Promise<IPCResponse>;
  };

  // Claude Panels - specific API for Claude panels
  claudePanels: {
    getModel: (panelId: string) => Promise<IPCResponse>;
    setModel: (panelId: string, model: string) => Promise<IPCResponse>;
  };

  // Codex panel operations
  codexPanels: {
    getSettings: (panelId: string) => Promise<IPCResponse>;
    setSettings: (panelId: string, settings: Record<string, unknown>) => Promise<IPCResponse>;
  };

  // Logs panel operations
  logs: {
    runScript: (sessionId: string, command: string, cwd: string) => Promise<IPCResponse>;
    stopScript: (panelId: string) => Promise<IPCResponse>;
    isRunning: (sessionId: string) => Promise<IPCResponse>;
  };

  // Debug utilities
  debug: {
    getTableStructure: (tableName: 'folders' | 'sessions') => Promise<IPCResponse<{
      columns: Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | number | boolean | null;
        pk: number;
      }>;
      foreignKeys: Array<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }>;
      indexes: Array<{
        name: string;
        tbl_name: string;
        sql: string;
      }>;
    }>>;
  };

  // Nimbalyst integration
  nimbalyst: {
    checkInstalled: () => Promise<IPCResponse<boolean>>;
    openWorktree: (worktreePath: string) => Promise<IPCResponse>;
  };

  // Analytics tracking
  analytics: {
    trackUIEvent: (eventData: {
      event: string;
      properties: Record<string, string | number | boolean | string[] | undefined>;
    }) => Promise<IPCResponse>;
    categorizeResultCount: (count: number) => Promise<IPCResponse<string>>;
    hashSessionId: (sessionId: string) => Promise<IPCResponse<string>>;
  };
}

// Additional electron interface for IPC event listeners
interface ElectronInterface {
  openExternal: (url: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic IPC bridge that returns different types based on channel
  invoke: (channel: string, ...args: unknown[]) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic IPC event callback that receives different argument types
  on: (channel: string, callback: (...args: any[]) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic IPC event callback that receives different argument types
  off: (channel: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    electron?: ElectronInterface;
  }
}

export {};

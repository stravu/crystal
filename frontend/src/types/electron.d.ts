// Type definitions for Electron preload API

interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  command?: string;
}

interface ElectronAPI {
  // Generic invoke method for direct IPC calls
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  
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
    create: (request: any) => Promise<IPCResponse>;
    delete: (sessionId: string) => Promise<IPCResponse>;
    sendInput: (sessionId: string, input: string) => Promise<IPCResponse>;
    continue: (sessionId: string, prompt?: string, model?: string) => Promise<IPCResponse>;
    getOutput: (sessionId: string) => Promise<IPCResponse>;
    getConversation: (sessionId: string) => Promise<IPCResponse>;
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
    stopScript: () => Promise<IPCResponse>;
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
    getLastCommits: (sessionId: string, count: number) => Promise<IPCResponse>;

    // IDE operations
    openIDE: (sessionId: string) => Promise<IPCResponse>;
    
    // Reorder operations
    reorder: (sessionOrders: Array<{ id: string; displayOrder: number }>) => Promise<IPCResponse>;
    
    // Image operations
    saveImages: (sessionId: string, images: Array<{ name: string; dataUrl: string; type: string }>) => Promise<string[]>;
  };

  // Project management
  projects: {
    getAll: () => Promise<IPCResponse>;
    getActive: () => Promise<IPCResponse>;
    create: (projectData: any) => Promise<IPCResponse>;
    activate: (projectId: string) => Promise<IPCResponse>;
    update: (projectId: string, updates: any) => Promise<IPCResponse>;
    delete: (projectId: string) => Promise<IPCResponse>;
    detectBranch: (path: string) => Promise<IPCResponse>;
    reorder: (projectOrders: Array<{ id: number; displayOrder: number }>) => Promise<IPCResponse>;
    listBranches: (projectId: string) => Promise<IPCResponse>;
  };

  // Git operations
  git: {
    detectBranch: (path: string) => Promise<IPCResponse<string>>;
  };

  // Folders
  folders: {
    getByProject: (projectId: number) => Promise<IPCResponse>;
    create: (name: string, projectId: number) => Promise<IPCResponse>;
    update: (folderId: string, updates: { name?: string; display_order?: number }) => Promise<IPCResponse>;
    delete: (folderId: string) => Promise<IPCResponse>;
    reorder: (projectId: number, folderIds: string[]) => Promise<IPCResponse>;
    moveSession: (sessionId: string, folderId: string | null) => Promise<IPCResponse>;
  };

  // Configuration
  config: {
    get: () => Promise<IPCResponse>;
    update: (updates: any) => Promise<IPCResponse>;
  };

  // Prompts
  prompts: {
    getAll: () => Promise<IPCResponse>;
    getByPromptId: (promptId: string) => Promise<IPCResponse>;
  };

  // Dialog
  dialog: {
    openFile: (options?: any) => Promise<IPCResponse<string | null>>;
    openDirectory: (options?: any) => Promise<IPCResponse<string | null>>;
  };

  // Permissions
  permissions: {
    respond: (requestId: string, response: any) => Promise<IPCResponse>;
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

  // UI State management
  uiState: {
    getExpanded: () => Promise<IPCResponse<{ expandedProjects: number[]; expandedFolders: string[] }>>;
    saveExpanded: (projectIds: number[], folderIds: string[]) => Promise<IPCResponse>;
    saveExpandedProjects: (projectIds: number[]) => Promise<IPCResponse>;
    saveExpandedFolders: (folderIds: string[]) => Promise<IPCResponse>;
  };

  // Event listeners for real-time updates
  events: {
    onSessionCreated: (callback: (session: any) => void) => () => void;
    onSessionUpdated: (callback: (session: any) => void) => () => void;
    onSessionDeleted: (callback: (session: any) => void) => () => void;
    onSessionsLoaded: (callback: (sessions: any[]) => void) => () => void;
    onSessionOutput: (callback: (output: any) => void) => () => void;
    onSessionOutputAvailable: (callback: (info: any) => void) => () => void;
    
    // Project events
    onProjectUpdated: (callback: (project: any) => void) => () => void;
    
    // Folder events
    onFolderCreated: (callback: (folder: any) => void) => () => void;
    onFolderUpdated: (callback: (folder: any) => void) => () => void;
    onFolderDeleted: (callback: (folderId: string) => void) => () => void;
    
    onScriptOutput: (callback: (output: any) => void) => () => void;
    onMainLog: (callback: (level: string, message: string) => void) => () => void;
    onVersionUpdateAvailable: (callback: (versionInfo: any) => void) => () => void;
    
    // Auto-updater events
    onUpdaterCheckingForUpdate: (callback: () => void) => () => void;
    onUpdaterUpdateAvailable: (callback: (info: any) => void) => () => void;
    onUpdaterUpdateNotAvailable: (callback: (info: any) => void) => () => void;
    onUpdaterDownloadProgress: (callback: (progressInfo: any) => void) => () => void;
    onUpdaterUpdateDownloaded: (callback: (info: any) => void) => () => void;
    onUpdaterError: (callback: (error: any) => void) => () => void;
    
    // Process management events
    onZombieProcessesDetected: (callback: (data: { sessionId?: string | null; pids?: number[]; message: string }) => void) => () => void;
    
    removeAllListeners: (channel: string) => void;
  };

  // Debug utilities
  debug: {
    getTableStructure: (tableName: 'folders' | 'sessions') => Promise<IPCResponse<{
      columns: Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: any;
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
}

// Additional electron interface for IPC event listeners
interface ElectronInterface {
  openExternal: (url: string) => Promise<void>;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    electron?: ElectronInterface;
  }
}

export {};
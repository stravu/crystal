import { contextBridge, ipcRenderer } from 'electron';

// Response type for IPC calls
interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Basic app info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Version checking
  checkForUpdates: (): Promise<IPCResponse> => ipcRenderer.invoke('version:check-for-updates'),
  getVersionInfo: (): Promise<IPCResponse> => ipcRenderer.invoke('version:get-info'),

  // System utilities
  openExternal: (url: string): Promise<IPCResponse> => ipcRenderer.invoke('openExternal', url),

  // Session management
  sessions: {
    getAll: (): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-all'),
    get: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get', sessionId),
    create: (request: any): Promise<IPCResponse> => ipcRenderer.invoke('sessions:create', request),
    delete: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:delete', sessionId),
    sendInput: (sessionId: string, input: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:input', sessionId, input),
    continue: (sessionId: string, prompt?: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:continue', sessionId, prompt),
    getOutput: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-output', sessionId),
    getConversation: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-conversation', sessionId),
    markViewed: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:mark-viewed', sessionId),
    stop: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:stop', sessionId),
    
    // Execution and Git operations
    getExecutions: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-executions', sessionId),
    getExecutionDiff: (sessionId: string, executionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-execution-diff', sessionId, executionId),
    gitCommit: (sessionId: string, message: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:git-commit', sessionId, message),
    gitDiff: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:git-diff', sessionId),
    getCombinedDiff: (sessionId: string, executionIds?: number[]): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-combined-diff', sessionId, executionIds),
    
    // Script operations
    hasRunScript: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:has-run-script', sessionId),
    getRunningSession: (): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-running-session'),
    runScript: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:run-script', sessionId),
    stopScript: (): Promise<IPCResponse> => ipcRenderer.invoke('sessions:stop-script'),
    
    // Prompt operations
    getPrompts: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-prompts', sessionId),
    
    // Git rebase operations
    rebaseMainIntoWorktree: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:rebase-main-into-worktree', sessionId),
    squashAndRebaseToMain: (sessionId: string, commitMessage: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:squash-and-rebase-to-main', sessionId, commitMessage),
    
    // Git operation helpers
    hasChangesToRebase: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:has-changes-to-rebase', sessionId),
    getGitCommands: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-git-commands', sessionId),
    generateName: (prompt: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:generate-name', prompt),
  },

  // Project management
  projects: {
    getAll: (): Promise<IPCResponse> => ipcRenderer.invoke('projects:get-all'),
    getActive: (): Promise<IPCResponse> => ipcRenderer.invoke('projects:get-active'),
    create: (projectData: any): Promise<IPCResponse> => ipcRenderer.invoke('projects:create', projectData),
    activate: (projectId: string): Promise<IPCResponse> => ipcRenderer.invoke('projects:activate', projectId),
    update: (projectId: string, updates: any): Promise<IPCResponse> => ipcRenderer.invoke('projects:update', projectId, updates),
    delete: (projectId: string): Promise<IPCResponse> => ipcRenderer.invoke('projects:delete', projectId),
    detectBranch: (path: string): Promise<IPCResponse> => ipcRenderer.invoke('projects:detect-branch', path),
  },

  // Configuration
  config: {
    get: (): Promise<IPCResponse> => ipcRenderer.invoke('config:get'),
    update: (updates: any): Promise<IPCResponse> => ipcRenderer.invoke('config:update', updates),
  },

  // Prompts
  prompts: {
    getAll: (): Promise<IPCResponse> => ipcRenderer.invoke('prompts:get-all'),
    getByPromptId: (promptId: string): Promise<IPCResponse> => ipcRenderer.invoke('prompts:get-by-id', promptId),
  },

  // Dialog
  dialog: {
    openFile: (options?: any): Promise<IPCResponse<string | null>> => ipcRenderer.invoke('dialog:open-file', options),
    openDirectory: (options?: any): Promise<IPCResponse<string | null>> => ipcRenderer.invoke('dialog:open-directory', options),
  },

  // Permissions
  permissions: {
    respond: (requestId: string, response: any): Promise<IPCResponse> => ipcRenderer.invoke('permission:respond', requestId, response),
    getPending: (): Promise<IPCResponse> => ipcRenderer.invoke('permission:getPending'),
  },

  // Stravu OAuth integration
  stravu: {
    getConnectionStatus: (): Promise<IPCResponse> => ipcRenderer.invoke('stravu:get-connection-status'),
    initiateAuth: (): Promise<IPCResponse> => ipcRenderer.invoke('stravu:initiate-auth'),
    checkAuthStatus: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('stravu:check-auth-status', sessionId),
    disconnect: (): Promise<IPCResponse> => ipcRenderer.invoke('stravu:disconnect'),
    getNotebooks: (): Promise<IPCResponse> => ipcRenderer.invoke('stravu:get-notebooks'),
    getNotebook: (notebookId: string): Promise<IPCResponse> => ipcRenderer.invoke('stravu:get-notebook', notebookId),
    searchNotebooks: (query: string, limit?: number): Promise<IPCResponse> => ipcRenderer.invoke('stravu:search-notebooks', query, limit),
  },

  // Event listeners for real-time updates
  events: {
    // Session events
    onSessionCreated: (callback: (session: any) => void) => {
      ipcRenderer.on('session:created', (_event, session) => callback(session));
      return () => ipcRenderer.removeAllListeners('session:created');
    },
    onSessionUpdated: (callback: (session: any) => void) => {
      ipcRenderer.on('session:updated', (_event, session) => callback(session));
      return () => ipcRenderer.removeAllListeners('session:updated');
    },
    onSessionDeleted: (callback: (session: any) => void) => {
      ipcRenderer.on('session:deleted', (_event, session) => callback(session));
      return () => ipcRenderer.removeAllListeners('session:deleted');
    },
    onSessionsLoaded: (callback: (sessions: any[]) => void) => {
      ipcRenderer.on('sessions:loaded', (_event, sessions) => callback(sessions));
      return () => ipcRenderer.removeAllListeners('sessions:loaded');
    },
    onSessionOutput: (callback: (output: any) => void) => {
      ipcRenderer.on('session:output', (_event, output) => callback(output));
      return () => ipcRenderer.removeAllListeners('session:output');
    },
    onSessionOutputAvailable: (callback: (info: any) => void) => {
      ipcRenderer.on('session:output-available', (_event, info) => callback(info));
      return () => ipcRenderer.removeAllListeners('session:output-available');
    },
    onScriptOutput: (callback: (output: any) => void) => {
      ipcRenderer.on('script:output', (_event, output) => callback(output));
      return () => ipcRenderer.removeAllListeners('script:output');
    },

    // Generic event cleanup
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
    
    // Main process logging
    onMainLog: (callback: (level: string, message: string) => void) => {
      ipcRenderer.on('main-log', (_event, level, message) => callback(level, message));
      return () => ipcRenderer.removeAllListeners('main-log');
    },

    // Version updates
    onVersionUpdateAvailable: (callback: (versionInfo: any) => void) => {
      ipcRenderer.on('version:update-available', (_event, versionInfo) => callback(versionInfo));
      return () => ipcRenderer.removeAllListeners('version:update-available');
    },
  },
});

// Expose electron event listeners and utilities for permission requests
contextBridge.exposeInMainWorld('electron', {
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = ['permission:request'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = ['permission:request'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
});
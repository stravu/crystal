import { contextBridge, ipcRenderer } from 'electron';
import type { CreateSessionRequest, Session } from './types/session';
import type { AppConfig, UpdateConfigRequest } from './types/config';
import type { CreateProjectRequest, UpdateProjectRequest, Project } from '../../frontend/src/types/project';
import type { ToolPanel } from '../../shared/types/panels';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

interface DialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: string[];
}

interface DashboardUpdateData {
  type: 'status' | 'session' | 'project';
  projectId?: number;
  sessionId?: string;
  data: unknown;
}

interface GitStatusUpdateData {
  sessionId: string;
  gitStatus: {
    state: string;
    ahead?: number;
    behind?: number;
    additions?: number;
    deletions?: number;
    filesChanged?: number;
  };
}

interface SessionOutputData {
  sessionId: string;
  type: 'stdout' | 'stderr' | 'json' | 'error';
  data: unknown;
  timestamp: string;
  panelId?: string;
}

interface Folder {
  id: string;
  name: string;
  project_id: number;
  parent_folder_id?: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  releaseNotes?: string;
}

interface UpdaterInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
  path?: string;
  sha512?: string;
  size?: number;
}

interface CodexPanelSettings {
  model?: string;
  modelProvider?: string;
  approvalPolicy?: 'auto' | 'manual';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  webSearch?: boolean;
  thinkingLevel?: 'low' | 'medium' | 'high';
  lastPrompt?: string;
  lastActivityTime?: string;
}

// Increase max listeners for ipcRenderer to prevent warnings when many components listen to events
ipcRenderer.setMaxListeners(50);

// Bridge panel events from main process to renderer window as DOM CustomEvents
// This allows React components to listen with `window.addEventListener('panel:event', ...)`
try {
  ipcRenderer.on('panel:event', (_event, data) => {
    try {
      window.dispatchEvent(new CustomEvent('panel:event', { detail: data }));
    } catch (e) {
      // Do not let event dispatch failures break the app
      console.error('Failed to dispatch panel:event to window:', e);
    }
  });

  // Bridge project script events
  ipcRenderer.on('project-script-changed', (_event, data) => {
    try {
      window.dispatchEvent(new CustomEvent('project-script-changed', { detail: data }));
    } catch (e) {
      console.error('Failed to dispatch project-script-changed to window:', e);
    }
  });

  ipcRenderer.on('project-script-closing', (_event, data) => {
    try {
      window.dispatchEvent(new CustomEvent('project-script-closing', { detail: data }));
    } catch (e) {
      console.error('Failed to dispatch project-script-closing to window:', e);
    }
  });

  // Bridge session script events (for consistency)
  ipcRenderer.on('script-session-changed', (_event, data) => {
    try {
      window.dispatchEvent(new CustomEvent('script-session-changed', { detail: data }));
    } catch (e) {
      console.error('Failed to dispatch script-session-changed to window:', e);
    }
  });

  ipcRenderer.on('script-closing', (_event, data) => {
    try {
      window.dispatchEvent(new CustomEvent('script-closing', { detail: data }));
    } catch (e) {
      console.error('Failed to dispatch script-closing to window:', e);
    }
  });
} catch (e) {
  // Ignore if IPC is not available for some reason
}

// In development mode, capture console logs and send them to main process for Claude Code debugging
if (process.env.NODE_ENV !== 'production') {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  // Override console methods to capture frontend logs
  (['log', 'warn', 'error', 'info', 'debug'] as const).forEach(level => {
    (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
      // Call original console first so they still appear in DevTools
      (originalConsole as unknown as Record<string, (...args: unknown[]) => void>)[level](...args);
      
      // Send to main process for file logging
      try {
        ipcRenderer.invoke('console:log', {
          level,
          args: args.map(arg => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg, null, 2);
              } catch (e) {
                return String(arg);
              }
            }
            return String(arg);
          }),
          timestamp: new Date().toISOString(),
          source: 'renderer'
        });
      } catch (error) {
        // Don't break if IPC fails
        originalConsole.error('Failed to send console log to main process:', error);
      }
    };
  });
}

// Response type for IPC calls
interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Generic invoke method for direct IPC calls
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  
  // Basic app info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  isPackaged: () => ipcRenderer.invoke('is-packaged'),

  // Version checking
  checkForUpdates: (): Promise<IPCResponse> => ipcRenderer.invoke('version:check-for-updates'),
  getVersionInfo: (): Promise<IPCResponse> => ipcRenderer.invoke('version:get-info'),
  
  // Auto-updater
  updater: {
    checkAndDownload: (): Promise<IPCResponse> => ipcRenderer.invoke('updater:check-and-download'),
    downloadUpdate: (): Promise<IPCResponse> => ipcRenderer.invoke('updater:download-update'),
    installUpdate: (): Promise<IPCResponse> => ipcRenderer.invoke('updater:install-update'),
  },

  // System utilities
  openExternal: (url: string): Promise<IPCResponse> => ipcRenderer.invoke('openExternal', url),

  // Session management
  sessions: {
    getAll: (): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-all'),
    getAllWithProjects: (): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-all-with-projects'),
    getArchivedWithProjects: (): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-archived-with-projects'),
    get: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get', sessionId),
    create: (request: CreateSessionRequest): Promise<IPCResponse> => ipcRenderer.invoke('sessions:create', request),
    delete: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:delete', sessionId),
    sendInput: (sessionId: string, input: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:input', sessionId, input),
    continue: (sessionId: string, prompt?: string, model?: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:continue', sessionId, prompt, model),
    getOutput: (sessionId: string, limit?: number): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-output', sessionId, limit),
    getJsonMessages: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-json-messages', sessionId),
    getStatistics: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-statistics', sessionId),
    getConversation: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-conversation', sessionId),
    getConversationMessages: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-conversation-messages', sessionId),
    generateCompactedContext: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:generate-compacted-context', sessionId),
    markViewed: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:mark-viewed', sessionId),
    stop: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:stop', sessionId),
    
    // Execution and Git operations
    getExecutions: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-executions', sessionId),
    getExecutionDiff: (sessionId: string, executionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-execution-diff', sessionId, executionId),
    gitCommit: (sessionId: string, message: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:git-commit', sessionId, message),
    gitDiff: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:git-diff', sessionId),
    getCombinedDiff: (sessionId: string, executionIds?: number[]): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-combined-diff', sessionId, executionIds),
    
    // Main repo session
    getOrCreateMainRepoSession: (projectId: number): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-or-create-main-repo', projectId),
    
    // Script operations
    hasRunScript: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:has-run-script', sessionId),
    getRunningSession: (): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-running-session'),
    runScript: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:run-script', sessionId),
    stopScript: (sessionId?: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:stop-script', sessionId),
    runTerminalCommand: (sessionId: string, command: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:run-terminal-command', sessionId, command),
    sendTerminalInput: (sessionId: string, data: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:send-terminal-input', sessionId, data),
    preCreateTerminal: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:pre-create-terminal', sessionId),
    resizeTerminal: (sessionId: string, cols: number, rows: number): Promise<IPCResponse> => ipcRenderer.invoke('sessions:resize-terminal', sessionId, cols, rows),
    
    // Prompt operations
    getPrompts: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-prompts', sessionId),
    
    // Git rebase operations
    rebaseMainIntoWorktree: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:rebase-main-into-worktree', sessionId),
    abortRebaseAndUseClaude: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:abort-rebase-and-use-claude', sessionId),
    squashAndRebaseToMain: (sessionId: string, commitMessage: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:squash-and-rebase-to-main', sessionId, commitMessage),
    rebaseToMain: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:rebase-to-main', sessionId),
    
    // Git pull/push operations
    gitPull: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:git-pull', sessionId),
    gitPush: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:git-push', sessionId),
    getGitStatus: (sessionId: string, nonBlocking?: boolean, isInitialLoad?: boolean): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-git-status', sessionId, nonBlocking, isInitialLoad),
    getLastCommits: (sessionId: string, count: number): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-last-commits', sessionId, count),
    
    // Git operation helpers
    hasChangesToRebase: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:has-changes-to-rebase', sessionId),
    getGitCommands: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-git-commands', sessionId),
    generateName: (prompt: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:generate-name', prompt),
    rename: (sessionId: string, newName: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:rename', sessionId, newName),
    toggleFavorite: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:toggle-favorite', sessionId),
    toggleAutoCommit: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:toggle-auto-commit', sessionId),
    
    // IDE operations
    openIDE: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:open-ide', sessionId),
    
    // Reorder operations
    reorder: (sessionOrders: Array<{ id: string; displayOrder: number }>): Promise<IPCResponse> => ipcRenderer.invoke('sessions:reorder', sessionOrders),
    
    // Image operations
    saveImages: (sessionId: string, images: Array<{ name: string; dataUrl: string; type: string }>): Promise<string[]> => ipcRenderer.invoke('sessions:save-images', sessionId, images),
    
    // Text file operations
    saveLargeText: (sessionId: string, text: string): Promise<string> => ipcRenderer.invoke('sessions:save-large-text', sessionId, text),
    
    // Log operations
    getLogs: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:get-logs', sessionId),
    clearLogs: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('sessions:clear-logs', sessionId),
    addLog: (sessionId: string, entry: LogEntry): Promise<IPCResponse> => ipcRenderer.invoke('sessions:add-log', sessionId, entry),
  },

  // Project management
  projects: {
    getAll: (): Promise<IPCResponse> => ipcRenderer.invoke('projects:get-all'),
    getActive: (): Promise<IPCResponse> => ipcRenderer.invoke('projects:get-active'),
    create: (projectData: CreateProjectRequest): Promise<IPCResponse> => ipcRenderer.invoke('projects:create', projectData),
    activate: (projectId: string): Promise<IPCResponse> => ipcRenderer.invoke('projects:activate', projectId),
    update: (projectId: string, updates: UpdateProjectRequest): Promise<IPCResponse> => ipcRenderer.invoke('projects:update', projectId, updates),
    delete: (projectId: string): Promise<IPCResponse> => ipcRenderer.invoke('projects:delete', projectId),
    detectBranch: (path: string): Promise<IPCResponse> => ipcRenderer.invoke('projects:detect-branch', path),
    reorder: (projectOrders: Array<{ id: number; displayOrder: number }>): Promise<IPCResponse> => ipcRenderer.invoke('projects:reorder', projectOrders),
    listBranches: (projectId: string): Promise<IPCResponse> => ipcRenderer.invoke('projects:list-branches', projectId),
    refreshGitStatus: (projectId: number): Promise<IPCResponse> => ipcRenderer.invoke('projects:refresh-git-status', projectId),
    runScript: (projectId: number): Promise<IPCResponse> => ipcRenderer.invoke('projects:run-script', projectId),
    getRunningScript: (): Promise<IPCResponse> => ipcRenderer.invoke('projects:get-running-script'),
    stopScript: (projectId?: number): Promise<IPCResponse> => ipcRenderer.invoke('projects:stop-script', projectId),
  },

  // Git operations
  git: {
    detectBranch: (path: string): Promise<IPCResponse<string>> => ipcRenderer.invoke('projects:detect-branch', path),
    cancelStatusForProject: (projectId: number): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('git:cancel-status-for-project', projectId),
    executeProject: (projectId: number, args: string[]): Promise<IPCResponse> => ipcRenderer.invoke('git:execute-project', { projectId, args }),
  },

  // Folders
  folders: {
    getByProject: (projectId: number): Promise<IPCResponse> => ipcRenderer.invoke('folders:get-by-project', projectId),
    create: (name: string, projectId: number, parentFolderId?: string | null): Promise<IPCResponse> => ipcRenderer.invoke('folders:create', name, projectId, parentFolderId),
    update: (folderId: string, updates: { name?: string; display_order?: number; parent_folder_id?: string | null }): Promise<IPCResponse> => ipcRenderer.invoke('folders:update', folderId, updates),
    delete: (folderId: string): Promise<IPCResponse> => ipcRenderer.invoke('folders:delete', folderId),
    reorder: (projectId: number, folderOrders: Array<{ id: string; displayOrder: number }>): Promise<IPCResponse> => ipcRenderer.invoke('folders:reorder', projectId, folderOrders),
    moveSession: (sessionId: string, folderId: string | null): Promise<IPCResponse> => ipcRenderer.invoke('folders:move-session', sessionId, folderId),
    move: (folderId: string, parentFolderId: string | null): Promise<IPCResponse> => ipcRenderer.invoke('folders:move', folderId, parentFolderId),
  },

  // Configuration
  config: {
    get: (): Promise<IPCResponse> => ipcRenderer.invoke('config:get'),
    update: (updates: UpdateConfigRequest): Promise<IPCResponse> => ipcRenderer.invoke('config:update', updates),
    getSessionPreferences: (): Promise<IPCResponse> => ipcRenderer.invoke('config:get-session-preferences'),
    updateSessionPreferences: (preferences: AppConfig['sessionCreationPreferences']): Promise<IPCResponse> => ipcRenderer.invoke('config:update-session-preferences', preferences),
  },

  // Prompts
  prompts: {
    getAll: (): Promise<IPCResponse> => ipcRenderer.invoke('prompts:get-all'),
    getByPromptId: (promptId: string): Promise<IPCResponse> => ipcRenderer.invoke('prompts:get-by-id', promptId),
  },

  // File operations
  file: {
    listProject: (projectId: number, path?: string): Promise<IPCResponse> => ipcRenderer.invoke('file:list-project', { projectId, path }),
    readProject: (projectId: number, filePath: string): Promise<IPCResponse> => ipcRenderer.invoke('file:read-project', { projectId, filePath }),
    writeProject: (projectId: number, filePath: string, content: string): Promise<IPCResponse> => ipcRenderer.invoke('file:write-project', { projectId, filePath, content }),
  },

  // Dialog
  dialog: {
    openFile: (options?: DialogOptions): Promise<IPCResponse<string | null>> => ipcRenderer.invoke('dialog:open-file', options),
    openDirectory: (options?: DialogOptions): Promise<IPCResponse<string | null>> => ipcRenderer.invoke('dialog:open-directory', options),
  },

  // Permissions
  permissions: {
    respond: (requestId: string, response: boolean | { approved: boolean; remember?: boolean }): Promise<IPCResponse> => ipcRenderer.invoke('permission:respond', requestId, response),
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

  // Dashboard
  dashboard: {
    getProjectStatus: (projectId: number): Promise<IPCResponse> => ipcRenderer.invoke('dashboard:get-project-status', projectId),
    getProjectStatusProgressive: (projectId: number): Promise<IPCResponse> => ipcRenderer.invoke('dashboard:get-project-status-progressive', projectId),
    onUpdate: (callback: (data: DashboardUpdateData) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: DashboardUpdateData) => callback(data);
      ipcRenderer.on('dashboard:update', subscription);
      return () => ipcRenderer.removeListener('dashboard:update', subscription);
    },
    onSessionUpdate: (callback: (data: DashboardUpdateData) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, data: DashboardUpdateData) => callback(data);
      ipcRenderer.on('dashboard:session-update', subscription);
      return () => ipcRenderer.removeListener('dashboard:session-update', subscription);
    },
  },

  // UI State management
  uiState: {
    getExpanded: (): Promise<IPCResponse> => ipcRenderer.invoke('ui-state:get-expanded'),
    saveExpanded: (projectIds: number[], folderIds: string[]): Promise<IPCResponse> => ipcRenderer.invoke('ui-state:save-expanded', projectIds, folderIds),
    saveExpandedProjects: (projectIds: number[]): Promise<IPCResponse> => ipcRenderer.invoke('ui-state:save-expanded-projects', projectIds),
    saveExpandedFolders: (folderIds: string[]): Promise<IPCResponse> => ipcRenderer.invoke('ui-state:save-expanded-folders', folderIds),
    saveSessionSortAscending: (ascending: boolean): Promise<IPCResponse> => ipcRenderer.invoke('ui-state:save-session-sort-ascending', ascending),
  },

  // Event listeners for real-time updates
  events: {
    // Session events
    onSessionCreated: (callback: (session: Session) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, session: Session) => callback(session);
      ipcRenderer.on('session:created', wrappedCallback);
      return () => ipcRenderer.removeListener('session:created', wrappedCallback);
    },
    onSessionUpdated: (callback: (session: Session) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, session: Session) => callback(session);
      ipcRenderer.on('session:updated', wrappedCallback);
      return () => ipcRenderer.removeListener('session:updated', wrappedCallback);
    },
    onSessionDeleted: (callback: (session: Session) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, session: Session) => callback(session);
      ipcRenderer.on('session:deleted', wrappedCallback);
      return () => ipcRenderer.removeListener('session:deleted', wrappedCallback);
    },
    onSessionsLoaded: (callback: (sessions: Session[]) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, sessions: Session[]) => callback(sessions);
      ipcRenderer.on('sessions:loaded', wrappedCallback);
      return () => ipcRenderer.removeListener('sessions:loaded', wrappedCallback);
    },
    onGitStatusUpdated: (callback: (data: GitStatusUpdateData) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: GitStatusUpdateData) => callback(data);
      ipcRenderer.on('git-status-updated', wrappedCallback);
      return () => ipcRenderer.removeListener('git-status-updated', wrappedCallback);
    },
    onGitStatusLoading: (callback: (data: { sessionId: string }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: { sessionId: string }) => callback(data);
      ipcRenderer.on('git-status-loading', wrappedCallback);
      return () => ipcRenderer.removeListener('git-status-loading', wrappedCallback);
    },
    onSessionOutput: (callback: (output: SessionOutputData) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, output: SessionOutputData) => callback(output);
      ipcRenderer.on('session:output', wrappedCallback);
      return () => ipcRenderer.removeListener('session:output', wrappedCallback);
    },
    onSessionLog: (callback: (data: LogEntry) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: LogEntry) => callback(data);
      ipcRenderer.on('session-log', wrappedCallback);
      return () => ipcRenderer.removeListener('session-log', wrappedCallback);
    },
    onSessionLogsCleared: (callback: (data: { sessionId: string }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: { sessionId: string }) => callback(data);
      ipcRenderer.on('session-logs-cleared', wrappedCallback);
      return () => ipcRenderer.removeListener('session-logs-cleared', wrappedCallback);
    },
    onSessionOutputAvailable: (callback: (info: { sessionId: string; hasNewOutput: boolean }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, info: { sessionId: string; hasNewOutput: boolean }) => callback(info);
      ipcRenderer.on('session:output-available', wrappedCallback);
      return () => ipcRenderer.removeListener('session:output-available', wrappedCallback);
    },
    
    // Project events
    onProjectUpdated: (callback: (project: Project) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, project: Project) => callback(project);
      ipcRenderer.on('project:updated', wrappedCallback);
      return () => ipcRenderer.removeListener('project:updated', wrappedCallback);
    },
    
    // Panel events
    onPanelCreated: (callback: (panel: ToolPanel) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, panel: ToolPanel) => callback(panel);
      ipcRenderer.on('panel:created', wrappedCallback);
      return () => ipcRenderer.removeListener('panel:created', wrappedCallback);
    },
    onPanelUpdated: (callback: (panel: ToolPanel) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, panel: ToolPanel) => callback(panel);
      ipcRenderer.on('panel:updated', wrappedCallback);
      return () => ipcRenderer.removeListener('panel:updated', wrappedCallback);
    },
    
    // Folder events
    onFolderCreated: (callback: (folder: Folder) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, folder: Folder) => callback(folder);
      ipcRenderer.on('folder:created', wrappedCallback);
      return () => ipcRenderer.removeListener('folder:created', wrappedCallback);
    },
    onFolderUpdated: (callback: (folder: Folder) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, folder: Folder) => callback(folder);
      ipcRenderer.on('folder:updated', wrappedCallback);
      return () => ipcRenderer.removeListener('folder:updated', wrappedCallback);
    },
    onFolderDeleted: (callback: (folderId: string) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, folderId: string) => callback(folderId);
      ipcRenderer.on('folder:deleted', wrappedCallback);
      return () => ipcRenderer.removeListener('folder:deleted', wrappedCallback);
    },
    
    // Panel events
    onPanelPromptAdded: (callback: (data: { panelId: string; content: string }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: { panelId: string; content: string }) => callback(data);
      ipcRenderer.on('panel:prompt-added', wrappedCallback);
      return () => ipcRenderer.removeListener('panel:prompt-added', wrappedCallback);
    },
    
    onPanelResponseAdded: (callback: (data: { panelId: string; content: string }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: { panelId: string; content: string }) => callback(data);
      ipcRenderer.on('panel:response-added', wrappedCallback);
      return () => ipcRenderer.removeListener('panel:response-added', wrappedCallback);
    },
    
    onTerminalOutput: (callback: (output: SessionOutputData) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, output: SessionOutputData) => callback(output);
      ipcRenderer.on('terminal:output', wrappedCallback);
      return () => ipcRenderer.removeListener('terminal:output', wrappedCallback);
    },

    // Generic event cleanup
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
    
    // Main process logging
    onMainLog: (callback: (level: string, message: string) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, level: string, message: string) => callback(level, message);
      ipcRenderer.on('main-log', wrappedCallback);
      return () => ipcRenderer.removeListener('main-log', wrappedCallback);
    },

    // Version updates
    onVersionUpdateAvailable: (callback: (versionInfo: VersionInfo) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, versionInfo: VersionInfo) => callback(versionInfo);
      ipcRenderer.on('version:update-available', wrappedCallback);
      return () => ipcRenderer.removeListener('version:update-available', wrappedCallback);
    },
    
    // Auto-updater events
    onUpdaterCheckingForUpdate: (callback: () => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent) => callback();
      ipcRenderer.on('updater:checking-for-update', wrappedCallback);
      return () => ipcRenderer.removeListener('updater:checking-for-update', wrappedCallback);
    },
    onUpdaterUpdateAvailable: (callback: (info: UpdaterInfo) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, info: UpdaterInfo) => callback(info);
      ipcRenderer.on('updater:update-available', wrappedCallback);
      return () => ipcRenderer.removeListener('updater:update-available', wrappedCallback);
    },
    onUpdaterUpdateNotAvailable: (callback: (info: UpdaterInfo) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, info: UpdaterInfo) => callback(info);
      ipcRenderer.on('updater:update-not-available', wrappedCallback);
      return () => ipcRenderer.removeListener('updater:update-not-available', wrappedCallback);
    },
    onUpdaterDownloadProgress: (callback: (progressInfo: { percent: number; bytesPerSecond: number; total: number; transferred: number }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, progressInfo: { percent: number; bytesPerSecond: number; total: number; transferred: number }) => callback(progressInfo);
      ipcRenderer.on('updater:download-progress', wrappedCallback);
      return () => ipcRenderer.removeListener('updater:download-progress', wrappedCallback);
    },
    onUpdaterUpdateDownloaded: (callback: (info: UpdaterInfo) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, info: UpdaterInfo) => callback(info);
      ipcRenderer.on('updater:update-downloaded', wrappedCallback);
      return () => ipcRenderer.removeListener('updater:update-downloaded', wrappedCallback);
    },
    onUpdaterError: (callback: (error: Error) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, error: Error) => callback(error);
      ipcRenderer.on('updater:error', wrappedCallback);
      return () => ipcRenderer.removeListener('updater:error', wrappedCallback);
    },
    
    // Process management events
    onZombieProcessesDetected: (callback: (data: { count: number; processes: string[] }) => void) => {
      const wrappedCallback = (_event: Electron.IpcRendererEvent, data: { count: number; processes: string[] }) => callback(data);
      ipcRenderer.on('zombie-processes-detected', wrappedCallback);
      return () => ipcRenderer.removeListener('zombie-processes-detected', wrappedCallback);
    },
  },

  // Panels API for Claude panels and other panel types
  panels: {
    createPanel: (sessionId: string, type: string, name: string, config?: Record<string, unknown>): Promise<IPCResponse> => 
      ipcRenderer.invoke('panels:create', { sessionId, type, title: name, initialState: config }),
    getSessionPanels: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:list', sessionId),
    deletePanel: (panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:delete', panelId),
    renamePanel: (panelId: string, name: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:update', panelId, { name }),
    setActivePanel: (sessionId: string, panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:set-active', sessionId, panelId),
    resizeTerminal: (panelId: string, cols: number, rows: number): Promise<IPCResponse> => ipcRenderer.invoke('panels:resize-terminal', panelId, cols, rows),
    sendTerminalInput: (panelId: string, data: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:send-terminal-input', panelId, data),
    getOutput: (panelId: string, limit?: number): Promise<IPCResponse> => ipcRenderer.invoke('panels:get-output', panelId, limit),
    getConversationMessages: (panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:get-conversation-messages', panelId),
    getJsonMessages: (panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:get-json-messages', panelId),
    getPrompts: (panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:get-prompts', panelId),
    sendInput: (panelId: string, input: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:send-input', panelId, input),
    continue: (panelId: string, input: string, model?: string): Promise<IPCResponse> => ipcRenderer.invoke('panels:continue', panelId, input, model),
  },

  // Claude Panels - specific API for Claude panels
  claudePanels: {
    getModel: (panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('claude-panels:get-model', panelId),
    setModel: (panelId: string, model: string): Promise<IPCResponse> => ipcRenderer.invoke('claude-panels:set-model', panelId, model),
  },

  // Codex panel operations
  codexPanels: {
    getSettings: (panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('codexPanel:get-settings', panelId),
    setSettings: (panelId: string, settings: CodexPanelSettings): Promise<IPCResponse> => ipcRenderer.invoke('codexPanel:set-settings', panelId, settings),
  },

  // Logs panel operations
  logs: {
    runScript: (sessionId: string, command: string, cwd: string): Promise<IPCResponse> => ipcRenderer.invoke('logs:runScript', sessionId, command, cwd),
    stopScript: (panelId: string): Promise<IPCResponse> => ipcRenderer.invoke('logs:stopScript', panelId),
    isRunning: (sessionId: string): Promise<IPCResponse> => ipcRenderer.invoke('logs:isRunning', sessionId),
  },

  // Debug utilities
  debug: {
    getTableStructure: (tableName: 'folders' | 'sessions'): Promise<IPCResponse> => ipcRenderer.invoke('debug:get-table-structure', tableName),
  },

  // Nimbalyst integration
  nimbalyst: {
    checkInstalled: (): Promise<IPCResponse> => ipcRenderer.invoke('nimbalyst:check-installed'),
    openWorktree: (worktreePath: string): Promise<IPCResponse> => ipcRenderer.invoke('nimbalyst:open-worktree', worktreePath),
  },

  // Analytics tracking
  analytics: {
    trackUIEvent: (eventData: {
      event: 'view_switched' | 'help_dialog_opened' | 'settings_opened' | 'settings_saved' | 'sidebar_toggled' | 'search_used';
      properties: Record<string, string | number | boolean | string[]>;
    }): Promise<IPCResponse> => ipcRenderer.invoke('analytics:track-ui-event', eventData),
    categorizeResultCount: (count: number): Promise<IPCResponse<string>> => ipcRenderer.invoke('analytics:categorize-result-count', count),
    hashSessionId: (sessionId: string): Promise<IPCResponse<string>> => ipcRenderer.invoke('analytics:hash-session-id', sessionId),
  },
});

// Expose electron event listeners and utilities for permission requests
contextBridge.exposeInMainWorld('electron', {
  openExternal: (url: string) => ipcRenderer.invoke('openExternal', url),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'permission:request',
      'codexPanel:output',
      'codexPanel:spawned',
      'codexPanel:exit',
      'codexPanel:error'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  off: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'permission:request',
      'codexPanel:output',
      'codexPanel:spawned',
      'codexPanel:exit',
      'codexPanel:error'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
});

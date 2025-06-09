// Type definitions for Electron preload API

interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ElectronAPI {
  // Basic app info
  getAppVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;

  // Session management
  sessions: {
    getAll: () => Promise<IPCResponse>;
    get: (sessionId: string) => Promise<IPCResponse>;
    create: (request: any) => Promise<IPCResponse>;
    delete: (sessionId: string) => Promise<IPCResponse>;
    sendInput: (sessionId: string, input: string) => Promise<IPCResponse>;
    continue: (sessionId: string, prompt?: string) => Promise<IPCResponse>;
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
    
    // Prompt operations
    getPrompts: (sessionId: string) => Promise<IPCResponse>;
    
    // Git merge operations
    mergeMainToWorktree: (sessionId: string) => Promise<IPCResponse>;
    mergeWorktreeToMain: (sessionId: string) => Promise<IPCResponse>;
  };

  // Project management
  projects: {
    getAll: () => Promise<IPCResponse>;
    getActive: () => Promise<IPCResponse>;
    create: (projectData: any) => Promise<IPCResponse>;
    activate: (projectId: string) => Promise<IPCResponse>;
    update: (projectId: string, updates: any) => Promise<IPCResponse>;
    delete: (projectId: string) => Promise<IPCResponse>;
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

  // Event listeners for real-time updates
  events: {
    onSessionCreated: (callback: (session: any) => void) => () => void;
    onSessionUpdated: (callback: (session: any) => void) => () => void;
    onSessionDeleted: (callback: (session: any) => void) => () => void;
    onSessionsLoaded: (callback: (sessions: any[]) => void) => () => void;
    onSessionOutput: (callback: (output: any) => void) => () => void;
    onScriptOutput: (callback: (output: any) => void) => () => void;
    removeAllListeners: (channel: string) => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
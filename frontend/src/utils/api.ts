// Utility for making API calls using Electron IPC

// Type for IPC response
export interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  command?: string;
}

// Check if we're running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI;
};

// Wrapper class for API calls that provides error handling and consistent interface
export class API {
  // Session management
  static sessions = {
    async getAll() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getAll();
    },

    async get(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.get(sessionId);
    },

    async create(request: any) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.create(request);
    },

    async delete(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.delete(sessionId);
    },

    async sendInput(sessionId: string, input: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.sendInput(sessionId, input);
    },

    async continue(sessionId: string, prompt?: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.continue(sessionId, prompt);
    },

    async getOutput(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getOutput(sessionId);
    },

    async getConversation(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getConversation(sessionId);
    },

    async markViewed(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.markViewed(sessionId);
    },

    async stop(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.stop(sessionId);
    },

    async getExecutions(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getExecutions(sessionId);
    },

    async getExecutionDiff(sessionId: string, executionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getExecutionDiff(sessionId, executionId);
    },

    async gitCommit(sessionId: string, message: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.gitCommit(sessionId, message);
    },

    async gitDiff(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.gitDiff(sessionId);
    },

    async getCombinedDiff(sessionId: string, executionIds?: number[]) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getCombinedDiff(sessionId, executionIds);
    },

    // Script operations
    async hasRunScript(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.hasRunScript(sessionId);
    },

    async getRunningSession() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getRunningSession();
    },

    async runScript(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.runScript(sessionId);
    },

    async stopScript() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.stopScript();
    },

    // Prompt operations
    async getPrompts(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getPrompts(sessionId);
    },

    // Git rebase operations
    async rebaseMainIntoWorktree(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.rebaseMainIntoWorktree(sessionId);
    },

    async squashAndRebaseToMain(sessionId: string, commitMessage: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.squashAndRebaseToMain(sessionId, commitMessage);
    },

    // Git operation helpers
    async hasChangesToRebase(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.hasChangesToRebase(sessionId);
    },

    async generateName(prompt: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.generateName(prompt);
    },

    async getGitCommands(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.sessions.getGitCommands(sessionId);
    },
  };

  // Project management
  static projects = {
    async getAll() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.projects.getAll();
    },

    async getActive() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.projects.getActive();
    },

    async create(projectData: any) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.projects.create(projectData);
    },

    async activate(projectId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.projects.activate(projectId);
    },

    async update(projectId: string, updates: any) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.projects.update(projectId, updates);
    },

    async delete(projectId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.projects.delete(projectId);
    },

    async detectBranch(path: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.projects.detectBranch(path);
    },
  };

  // Configuration
  static config = {
    async get() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.config.get();
    },

    async update(updates: any) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.config.update(updates);
    },
  };

  // Prompts
  static prompts = {
    async getAll() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.prompts.getAll();
    },
    
    async getByPromptId(promptId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.prompts.getByPromptId(promptId);
    },
  };

  // Dialog
  static dialog = {
    async openFile(options?: any) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.dialog.openFile(options);
    },

    async openDirectory(options?: any) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.dialog.openDirectory(options);
    },
  };

  // Permissions
  static permissions = {
    async respond(requestId: string, response: any) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.permissions.respond(requestId, response);
    },

    async getPending() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.permissions.getPending();
    },
  };

  // Stravu MCP integration with OAuth
  static stravu = {
    async getConnectionStatus() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.stravu.getConnectionStatus();
    },

    async initiateAuth() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.stravu.initiateAuth();
    },

    async checkAuthStatus(sessionId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.stravu.checkAuthStatus(sessionId);
    },

    async disconnect() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.stravu.disconnect();
    },

    async getNotebooks() {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.stravu.getNotebooks();
    },

    async getNotebook(notebookId: string) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.stravu.getNotebook(notebookId);
    },

    async searchNotebooks(query: string, limit?: number) {
      if (!isElectron()) throw new Error('Electron API not available');
      return window.electronAPI.stravu.searchNotebooks(query, limit);
    },
  };
}

// Legacy support - removed as migration is complete
// All HTTP API calls have been migrated to IPC via the API class
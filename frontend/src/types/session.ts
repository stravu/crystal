export interface Session {
  id: string;
  name: string;
  worktreePath: string;
  prompt: string;
  status: 'initializing' | 'ready' | 'running' | 'waiting' | 'stopped' | 'completed_unviewed' | 'error';
  pid?: number;
  createdAt: string;
  lastActivity?: string;
  output: string[];
  jsonMessages: any[];
  error?: string;
  isRunning?: boolean;
  lastViewedAt?: string;
  projectId?: number;
  folderId?: string;
  permissionMode?: 'approve' | 'ignore';
  runStartedAt?: string;
  isMainRepo?: boolean;
  displayOrder?: number;
  isFavorite?: boolean;
  autoCommit?: boolean;
  model?: string;
  archived?: boolean;
}

export interface CreateSessionRequest {
  prompt: string;
  worktreeTemplate?: string;
  count?: number;
  permissionMode?: 'approve' | 'ignore';
  projectId?: number;
  isMainRepo?: boolean;
  baseBranch?: string;
  autoCommit?: boolean;
  model?: string;
}

export interface SessionOutput {
  sessionId: string;
  type: 'stdout' | 'stderr' | 'json';
  data: string | any;
  timestamp: string;
}

export interface GitCommands {
  rebaseCommands: string[];
  squashCommands: string[];
  mainBranch?: string;
  currentBranch?: string;
}

export interface GitErrorDetails {
  title: string;
  message: string;
  command?: string;
  commands?: string[];
  output: string;
  workingDirectory?: string;
  projectPath?: string;
  isRebaseConflict?: boolean;
}
export interface Session {
  id: string;
  name: string;
  worktreePath: string;
  prompt: string;
  status: 'initializing' | 'ready' | 'running' | 'waiting' | 'stopped' | 'completed_unviewed' | 'error';
  pid?: number;
  createdAt: Date;
  lastActivity?: Date;
  output: string[];
  jsonMessages: any[];
  error?: string;
  isRunning?: boolean;
  lastViewedAt?: string;
  permissionMode?: 'approve' | 'ignore';
  runStartedAt?: string;
  isMainRepo?: boolean;
  displayOrder?: number;
  projectId?: number;
  folderId?: string;
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
  baseBranch?: string;
  autoCommit?: boolean;
  model?: string;
}

export interface SessionUpdate {
  status?: Session['status'];
  lastActivity?: Date;
  error?: string;
  run_started_at?: string | null;
  model?: string;
}

export interface SessionOutput {
  sessionId: string;
  type: 'stdout' | 'stderr' | 'json';
  data: string | any;
  timestamp: Date;
}
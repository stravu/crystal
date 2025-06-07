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
}

export interface CreateSessionRequest {
  prompt: string;
  worktreeTemplate?: string;
  count?: number;
}

export interface SessionOutput {
  sessionId: string;
  type: 'stdout' | 'stderr' | 'json';
  data: string | any;
  timestamp: string;
}
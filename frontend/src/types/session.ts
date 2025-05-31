export interface Session {
  id: string;
  name: string;
  worktreePath: string;
  prompt: string;
  status: 'initializing' | 'ready' | 'running' | 'waiting' | 'stopped' | 'error';
  pid?: number;
  createdAt: string;
  lastActivity?: string;
  output: string[];
  error?: string;
}

export interface CreateSessionRequest {
  prompt: string;
  worktreeTemplate: string;
  count?: number;
}

export interface SessionOutput {
  sessionId: string;
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: string;
}
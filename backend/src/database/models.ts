export interface Session {
  id: string;
  name: string;
  prompt: string;
  worktree_name: string;
  worktree_path: string;
  status: 'pending' | 'running' | 'stopped' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  last_output?: string;
  exit_code?: number;
  pid?: number;
}

export interface SessionOutput {
  id: number;
  session_id: string;
  type: 'stdout' | 'stderr' | 'system' | 'json';
  data: string;
  timestamp: string;
}

export interface CreateSessionData {
  id: string;
  name: string;
  prompt: string;
  worktree_name: string;
  worktree_path: string;
}

export interface UpdateSessionData {
  status?: Session['status'];
  last_output?: string;
  exit_code?: number;
  pid?: number;
}
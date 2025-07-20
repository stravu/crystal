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
  gitStatus?: GitStatus;
}

export interface GitStatus {
  state: 'clean' | 'modified' | 'untracked' | 'ahead' | 'behind' | 'diverged' | 'conflict' | 'unknown';
  ahead?: number;
  behind?: number;
  additions?: number; // Uncommitted additions
  deletions?: number; // Uncommitted deletions
  filesChanged?: number; // Uncommitted files changed
  lastChecked?: string;
  // Enhanced status information
  isReadyToMerge?: boolean; // True when ahead with no uncommitted changes
  hasUncommittedChanges?: boolean;
  hasUntrackedFiles?: boolean;
  // Allow tracking multiple states for better clarity
  secondaryStates?: Array<'modified' | 'untracked' | 'ahead' | 'behind'>;
  // Commit statistics (for all commits ahead of main)
  commitAdditions?: number;
  commitDeletions?: number;
  commitFilesChanged?: number;
  // Total commits in branch (not just ahead of main)
  totalCommits?: number;
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
  gitStatus?: GitStatus;
}

export interface SessionOutput {
  sessionId: string;
  type: 'stdout' | 'stderr' | 'json';
  data: string | any;
  timestamp: Date;
}
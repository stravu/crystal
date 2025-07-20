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
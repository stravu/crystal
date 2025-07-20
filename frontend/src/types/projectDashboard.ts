export interface MainBranchStatus {
  status: 'up-to-date' | 'behind' | 'ahead' | 'diverged';
  aheadCount?: number;
  behindCount?: number;
  lastFetched: string;
}

export interface RemoteStatus {
  name: string;
  url: string;
  branch: string;
  status: 'up-to-date' | 'behind' | 'ahead' | 'diverged';
  aheadCount: number;
  behindCount: number;
  isUpstream?: boolean;
  isFork?: boolean;
}

export interface SessionBranchInfo {
  sessionId: string;
  sessionName: string;
  branchName: string;
  worktreePath: string;
  baseCommit: string;
  baseBranch: string;
  isStale: boolean;
  staleSince?: string;
  hasUncommittedChanges: boolean;
  pullRequest?: {
    number: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
    url: string;
  };
  commitsAhead: number;
  commitsBehind: number;
}

export interface ProjectDashboardData {
  projectId: number;
  projectName: string;
  projectPath: string;
  mainBranch: string;
  mainBranchStatus: MainBranchStatus;
  remotes?: RemoteStatus[];
  sessionBranches: SessionBranchInfo[];
  lastRefreshed: string;
}

export interface ProjectDashboardError {
  message: string;
  details?: string;
}
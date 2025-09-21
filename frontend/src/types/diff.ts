export interface ExecutionDiff {
  id: number;
  session_id: string;
  prompt_marker_id?: number;
  prompt_text?: string;
  execution_sequence: number;
  git_diff?: string;
  files_changed?: string[];
  stats_additions: number;
  stats_deletions: number;
  stats_files_changed: number;
  before_commit_hash?: string;
  after_commit_hash?: string;
  commit_message?: string;
  timestamp: string;
  author?: string;
  comparison_branch?: string;
  history_source?: 'remote' | 'local' | 'branch';
  history_limit_reached?: boolean;
}

export interface GitDiffStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface GitDiffResult {
  diff: string;
  stats: GitDiffStats;
  changedFiles: string[];
  beforeHash?: string;
  afterHash?: string;
}

export interface FileDiff {
  path: string;
  oldPath: string;
  oldValue: string;
  newValue: string;
  type: 'added' | 'deleted' | 'modified' | 'renamed';
  isBinary: boolean;
  additions: number;
  deletions: number;
}

export interface DiffViewerProps {
  diff: string;
  className?: string;
  sessionId?: string;
  onFileSave?: (filePath: string) => void;
  isAllCommitsSelected?: boolean;
  mainBranch?: string;
}

export interface ExecutionListProps {
  sessionId: string;
  executions: ExecutionDiff[];
  selectedExecutions: number[];
  onSelectionChange: (selectedIds: number[]) => void;
  onCommit?: () => void;
  onRevert?: (commitHash: string) => void;
  onRestore?: () => void;
  historyLimitReached?: boolean;
  historyLimit?: number;
}

export interface CombinedDiffViewProps {
  sessionId: string;
  selectedExecutions: number[];
  isGitOperationRunning?: boolean;
  isMainRepo?: boolean;
  isVisible?: boolean;
}

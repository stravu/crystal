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
  timestamp: string;
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

export interface DiffViewerProps {
  diff: string;
  className?: string;
}

export interface ExecutionListProps {
  sessionId: string;
  executions: ExecutionDiff[];
  selectedExecutions: number[];
  onSelectionChange: (selectedIds: number[]) => void;
}

export interface CombinedDiffViewProps {
  sessionId: string;
  selectedExecutions: number[];
  isGitOperationRunning?: boolean;
}
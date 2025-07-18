export interface Project {
  id: number;
  name: string;
  path: string;
  system_prompt?: string;
  run_script?: string;
  build_script?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  default_permission_mode?: 'approve' | 'ignore';
  open_ide_command?: string;
  display_order?: number;
  worktree_folder?: string;
  lastUsedModel?: string;
}

export interface ProjectRunCommand {
  id: number;
  project_id: number;
  command: string;
  display_name?: string;
  order_index: number;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  project_id: number;
  parent_folder_id?: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  name: string;
  initial_prompt: string;
  worktree_name: string;
  worktree_path: string;
  status: 'pending' | 'running' | 'stopped' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  last_output?: string;
  exit_code?: number;
  pid?: number;
  archived?: boolean;
  last_viewed_at?: string;
  project_id?: number;
  folder_id?: string;
  claude_session_id?: string;
  permission_mode?: 'approve' | 'ignore';
  run_started_at?: string;
  is_main_repo?: boolean;
  display_order?: number;
  is_favorite?: boolean;
  auto_commit?: boolean;
  model?: string;
}

export interface SessionOutput {
  id: number;
  session_id: string;
  type: 'stdout' | 'stderr' | 'system' | 'json';
  data: string;
  timestamp: string;
}

export interface ConversationMessage {
  id: number;
  session_id: string;
  message_type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CreateSessionData {
  id: string;
  name: string;
  initial_prompt: string;
  worktree_name: string;
  worktree_path: string;
  project_id: number;
  folder_id?: string;
  permission_mode?: 'approve' | 'ignore';
  is_main_repo?: boolean;
  display_order?: number;
  auto_commit?: boolean;
  model?: string;
}

export interface UpdateSessionData {
  name?: string;
  status?: Session['status'];
  last_output?: string;
  exit_code?: number;
  pid?: number;
  folder_id?: string | null;
  claude_session_id?: string;
  run_started_at?: string;
  is_favorite?: boolean;
  auto_commit?: boolean;
  model?: string;
}

export interface PromptMarker {
  id: number;
  session_id: string;
  prompt_text: string;
  output_index: number;
  output_line?: number;
  timestamp: string;
  completion_timestamp?: string;
}

export interface ExecutionDiff {
  id: number;
  session_id: string;
  prompt_marker_id?: number;
  execution_sequence: number;
  git_diff?: string;
  files_changed?: string[]; // JSON array of changed file paths
  stats_additions: number;
  stats_deletions: number;
  stats_files_changed: number;
  before_commit_hash?: string;
  after_commit_hash?: string;
  timestamp: string;
}

export interface CreateExecutionDiffData {
  session_id: string;
  prompt_marker_id?: number;
  execution_sequence: number;
  git_diff?: string;
  files_changed?: string[];
  stats_additions?: number;
  stats_deletions?: number;
  stats_files_changed?: number;
  before_commit_hash?: string;
  after_commit_hash?: string;
}
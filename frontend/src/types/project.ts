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
  open_ide_command?: string;
  displayOrder?: number;
  worktree_folder?: string;
  lastUsedModel?: string;
  commit_mode?: 'structured' | 'checkpoint' | 'disabled';
  commit_structured_prompt_template?: string;
  commit_checkpoint_prefix?: string;
  commit_allow_claude_tools?: boolean;
}

export interface ProjectRunCommand {
  id: number;
  project_id: number;
  command: string;
  display_name?: string;
  order_index: number;
  created_at: string;
}

export interface CreateProjectRequest {
  name: string;
  path: string;
  systemPrompt?: string;
  runScript?: string;
  buildScript?: string;
  openIdeCommand?: string;
  commitMode?: 'structured' | 'checkpoint' | 'disabled';
  commitStructuredPromptTemplate?: string;
  commitCheckpointPrefix?: string;
  commitAllowClaudeTools?: boolean;
}

export interface UpdateProjectRequest {
  name?: string;
  path?: string;
  system_prompt?: string;
  run_script?: string;
  build_script?: string;
  active?: boolean;
  open_ide_command?: string;
  worktree_folder?: string;
  lastUsedModel?: string;
  commit_mode?: 'structured' | 'checkpoint' | 'disabled';
  commit_structured_prompt_template?: string;
  commit_checkpoint_prefix?: string;
  commit_allow_claude_tools?: boolean;
}
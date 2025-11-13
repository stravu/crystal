export interface Project {
  id: number;
  name: string;
  path: string;
  system_prompt?: string | null;
  run_script?: string | null;
  build_script?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  open_ide_command?: string | null;
  displayOrder?: number;
  worktree_folder?: string | null;
  lastUsedModel?: string;
  commit_mode?: 'structured' | 'checkpoint' | 'disabled';
  commit_structured_prompt_template?: string;
  commit_checkpoint_prefix?: string;
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
  groupId?: number;
}

export interface UpdateProjectRequest {
  name?: string;
  path?: string;
  system_prompt?: string | null;
  run_script?: string | null;
  build_script?: string | null;
  active?: boolean;
  open_ide_command?: string | null;
  worktree_folder?: string | null;
  lastUsedModel?: string;
  commit_mode?: 'structured' | 'checkpoint' | 'disabled';
  commit_structured_prompt_template?: string;
  commit_checkpoint_prefix?: string;
}

export interface ProjectGroup {
  id: number;
  name: string;
  description?: string | null;
  system_prompt?: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectGroupMember {
  id: number;
  group_id: number;
  project_id: number;
  include_in_context: boolean;
  role_description?: string | null;
  display_order: number;
  created_at: string;
}

export interface CreateProjectGroupRequest {
  name: string;
  description?: string;
  system_prompt?: string;
}

export interface UpdateProjectGroupRequest {
  name?: string;
  description?: string | null;
  system_prompt?: string | null;
  display_order?: number;
}

export interface AddProjectToGroupRequest {
  group_id: number;
  project_id: number;
  include_in_context?: boolean;
  role_description?: string;
}

export interface ProjectGroupWithProjects extends ProjectGroup {
  projects: Project[];
}
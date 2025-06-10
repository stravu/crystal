export interface Project {
  id: number;
  name: string;
  path: string;
  system_prompt?: string;
  run_script?: string;
  build_script?: string;
  main_branch?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
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
  mainBranch?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  path?: string;
  system_prompt?: string;
  run_script?: string;
  build_script?: string;
  main_branch?: string;
  active?: boolean;
}
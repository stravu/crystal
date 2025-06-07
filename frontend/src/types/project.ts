export interface Project {
  id: number;
  name: string;
  path: string;
  system_prompt?: string;
  run_script?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  path: string;
  systemPrompt?: string;
  runScript?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  path?: string;
  system_prompt?: string;
  run_script?: string;
  active?: boolean;
}
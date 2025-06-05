export interface AppConfig {
  gitRepoPath: string;
  verbose?: boolean;
  openaiApiKey?: string;
  systemPromptAppend?: string;
  runScript?: string[];
}

export interface UpdateConfigRequest {
  gitRepoPath?: string;
  verbose?: boolean;
  openaiApiKey?: string;
  systemPromptAppend?: string;
  runScript?: string[];
}
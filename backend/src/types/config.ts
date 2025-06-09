export interface AppConfig {
  gitRepoPath: string;
  verbose?: boolean;
  anthropicApiKey?: string;
  systemPromptAppend?: string;
  runScript?: string[];
}

export interface UpdateConfigRequest {
  gitRepoPath?: string;
  verbose?: boolean;
  anthropicApiKey?: string;
  systemPromptAppend?: string;
  runScript?: string[];
}
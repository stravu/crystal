export interface AppConfig {
  gitRepoPath: string;
  verbose?: boolean;
  openaiApiKey?: string;
}

export interface UpdateConfigRequest {
  gitRepoPath?: string;
  verbose?: boolean;
  openaiApiKey?: string;
}
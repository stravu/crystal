export interface AppConfig {
  gitRepoPath: string;
  verbose?: boolean;
}

export interface UpdateConfigRequest {
  gitRepoPath?: string;
  verbose?: boolean;
}
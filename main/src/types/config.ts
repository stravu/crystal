export interface AppConfig {
  verbose?: boolean;
  openaiApiKey?: string;
  // Legacy fields for backward compatibility
  gitRepoPath?: string;
  systemPromptAppend?: string;
  runScript?: string[];
}

export interface UpdateConfigRequest {
  verbose?: boolean;
  openaiApiKey?: string;
}
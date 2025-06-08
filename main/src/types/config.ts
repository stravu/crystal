export interface AppConfig {
  verbose?: boolean;
  openaiApiKey?: string;
  // Legacy fields for backward compatibility
  gitRepoPath?: string;
  systemPromptAppend?: string;
  runScript?: string[];
  // Custom claude executable path (for when it's not in PATH)
  claudeExecutablePath?: string;
}

export interface UpdateConfigRequest {
  verbose?: boolean;
  openaiApiKey?: string;
  claudeExecutablePath?: string;
}
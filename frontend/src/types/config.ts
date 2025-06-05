export interface AppConfig {
  gitRepoPath: string;
  verbose?: boolean;
  openaiApiKey?: string;
  systemPromptAppend?: string;
  runScript?: string[];
}
// Shared types between frontend and backend

export type CommitMode = 'structured' | 'checkpoint' | 'disabled';

export interface CommitModeSettings {
  mode: CommitMode;
  structuredPromptTemplate?: string;
  checkpointPrefix?: string;
  allowClaudeTools?: boolean;
}

export interface ProjectCharacteristics {
  hasHusky: boolean;
  hasChangeset: boolean;
  hasConventionalCommits: boolean;
  suggestedMode: CommitMode;
}

export interface CommitResult {
  success: boolean;
  commitHash?: string;
  error?: string;
}

export interface FinalizeSessionOptions {
  squashCommits?: boolean;
  commitMessage?: string;
  runPostProcessing?: boolean;
  postProcessingCommands?: string[];
}

// Default commit mode settings
export const DEFAULT_COMMIT_MODE_SETTINGS: CommitModeSettings = {
  mode: 'checkpoint',
  checkpointPrefix: 'checkpoint: ',
};

// Default structured prompt template
export const DEFAULT_STRUCTURED_PROMPT_TEMPLATE = `
After completing the requested changes, please create a git commit with an appropriate message. Follow these guidelines:
- Use Conventional Commits format (feat:, fix:, docs:, style:, refactor:, test:, chore:)
- Include a clear, concise description of the changes
- Only commit files that are directly related to this task
- If this project uses changesets and you've made a user-facing change, you may run 'pnpm changeset' if appropriate
`.trim();
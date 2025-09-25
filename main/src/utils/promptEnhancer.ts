import { DEFAULT_STRUCTURED_PROMPT_TEMPLATE } from '../../../shared/types';
import type { Logger } from './logger';

/**
 * Utility class for enhancing prompts with additional instructions
 * This is used by various CLI tools to add context-specific instructions to prompts
 */
export class PromptEnhancer {
  constructor(private logger?: Logger) {}

  /**
   * Enhance prompt with structured commit instructions if session has structured commit mode
   * This is shared logic between different CLI tool implementations
   * @param prompt The original prompt
   * @param dbSession The database session object
   * @returns The enhanced prompt with structured commit instructions if applicable
   */
  enhancePromptForStructuredCommit(prompt: string, dbSession: { id: string; commit_mode?: string; commit_mode_settings?: string }): string {
    // Check if session has structured commit mode
    if (dbSession?.commit_mode === 'structured') {
      this.logger?.verbose(`Session ${dbSession.id} uses structured commit mode, enhancing prompt`);

      let commitModeSettings;
      if (dbSession.commit_mode_settings) {
        try {
          commitModeSettings = JSON.parse(dbSession.commit_mode_settings);
        } catch (e) {
          this.logger?.error(`Failed to parse commit mode settings: ${e}`);
        }
      }

      // Get structured prompt template from settings or use default
      const structuredPromptTemplate = commitModeSettings?.structuredPromptTemplate || DEFAULT_STRUCTURED_PROMPT_TEMPLATE;

      // Add structured commit instructions to the prompt
      const enhancedPrompt = `${prompt}\n\n${structuredPromptTemplate}`;
      this.logger?.verbose(`Added structured commit instructions to prompt`);
      return enhancedPrompt;
    }

    return prompt;
  }
}

// Singleton instance for convenience
let defaultEnhancer: PromptEnhancer | null = null;

/**
 * Get the default prompt enhancer instance
 * @param logger Optional logger to use
 * @returns The default PromptEnhancer instance
 */
export function getPromptEnhancer(logger?: Logger): PromptEnhancer {
  if (!defaultEnhancer) {
    defaultEnhancer = new PromptEnhancer(logger);
  }
  return defaultEnhancer;
}

/**
 * Convenience function to enhance a prompt for structured commit
 * @param prompt The original prompt
 * @param dbSession The database session object
 * @param logger Optional logger
 * @returns The enhanced prompt
 */
export function enhancePromptForStructuredCommit(prompt: string, dbSession: { id: string; commit_mode?: string; commit_mode_settings?: string }, logger?: Logger): string {
  const enhancer = getPromptEnhancer(logger);
  return enhancer.enhancePromptForStructuredCommit(prompt, dbSession);
}
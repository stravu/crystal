import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger';
import { execSync } from '../utils/commandExecutor';
import { buildGitCommitCommand, escapeShellArg } from '../utils/shellEscape';
import {
  validateCommitModeSettings,
  validateFinalizeSessionOptions,
  sanitizeCommitModeSettings,
} from '../utils/commitModeValidation';
import {
  CommitModeSettings,
  CommitResult,
  FinalizeSessionOptions,
  DEFAULT_COMMIT_MODE_SETTINGS,
  DEFAULT_STRUCTURED_PROMPT_TEMPLATE,
} from '../../../shared/types';

export class CommitManager extends EventEmitter {
  constructor(private logger?: Logger) {
    super();
  }

  /**
   * Handle post-prompt commit based on the configured mode
   */
  async handlePostPromptCommit(
    sessionId: string,
    worktreePath: string,
    settings: CommitModeSettings,
    promptText?: string,
    executionSequence?: number
  ): Promise<CommitResult> {
    this.logger?.verbose(`Handling post-prompt commit for session ${sessionId} with mode: ${settings.mode}`);

    // Validate and sanitize settings first
    const validation = validateCommitModeSettings(settings);
    if (!validation.isValid) {
      this.logger?.error(`Invalid commit mode settings: ${validation.errors.join(', ')}`);
      return {
        success: false,
        error: `Invalid commit mode settings: ${validation.errors.join(', ')}`
      };
    }

    // Sanitize settings to ensure they're safe
    const sanitizedSettings = sanitizeCommitModeSettings(settings);

    switch (sanitizedSettings.mode) {
      case 'checkpoint':
        return this.handleCheckpointCommit(sessionId, worktreePath, sanitizedSettings, promptText, executionSequence);
      
      case 'structured':
        // In structured mode, Claude handles the commit
        this.logger?.verbose(`Structured mode: Claude will handle the commit`);
        return { success: true };
      
      case 'disabled':
        // No auto-commit in disabled mode
        this.logger?.verbose(`Disabled mode: No auto-commit`);
        return { success: true };
      
      default: {
        const exhaustiveCheck: never = sanitizedSettings.mode;
        throw new Error(`Unknown commit mode: ${exhaustiveCheck}`);
      }
    }
  }

  /**
   * Handle checkpoint mode auto-commit
   */
  private async handleCheckpointCommit(
    sessionId: string,
    worktreePath: string,
    settings: CommitModeSettings,
    promptText?: string,
    executionSequence?: number
  ): Promise<CommitResult> {
    try {
      // Check if there are uncommitted changes
      const statusOutput = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf8',
      }).trim();

      if (!statusOutput) {
        this.logger?.verbose(`No uncommitted changes found`);
        return { success: true };
      }

      this.logger?.verbose(`Found uncommitted changes, creating checkpoint commit...`);

      // Stage all changes
      execSync('git add -A', { cwd: worktreePath });

      // Create commit message with safe prefix
      const prefix = settings.checkpointPrefix || DEFAULT_COMMIT_MODE_SETTINGS.checkpointPrefix || 'checkpoint: ';
      let commitMessage = promptText || `execution ${executionSequence || 'unknown'}`;

      // Truncate long prompts
      const MAX_MESSAGE_LENGTH = 50;
      if (commitMessage.length > MAX_MESSAGE_LENGTH) {
        commitMessage = commitMessage.substring(0, MAX_MESSAGE_LENGTH - 3) + '...';
      }

      const fullMessage = prefix + commitMessage;

      // SECURITY: Use the secure buildGitCommitCommand function instead of manual escaping
      // This prevents command injection attacks
      const commitCommand = buildGitCommitCommand(fullMessage) + ' --no-verify';
      const result = execSync(commitCommand, { cwd: worktreePath, encoding: 'utf8' });

      // Extract commit hash from output
      const commitHashMatch = result.match(/\[[\w-]+ ([a-f0-9]+)\]/);
      const commitHash = commitHashMatch ? commitHashMatch[1] : undefined;

      this.logger?.verbose(`Created checkpoint commit: ${commitHash}`);
      this.emit('commit-created', { sessionId, commitHash, mode: 'checkpoint' });

      return { success: true, commitHash };
    } catch (error: any) {
      const errorMessage = error.stderr || error.stdout || error.message || 'Unknown error';
      this.logger?.error(`Failed to create checkpoint commit:`, error);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Monitor for structured mode commit (polling git status)
   */
  async waitForStructuredCommit(
    sessionId: string,
    worktreePath: string,
    timeoutMs: number = 30000
  ): Promise<CommitResult> {
    const startTime = Date.now();
    const pollInterval = 1000; // Check every second

    return new Promise((resolve) => {
      const checkForCommit = async () => {
        try {
          // Check if there are uncommitted changes
          const statusOutput = execSync('git status --porcelain', {
            cwd: worktreePath,
            encoding: 'utf8',
          }).trim();

          if (!statusOutput) {
            // No uncommitted changes, assume Claude committed
            const lastCommit = execSync('git log -1 --format=%H', {
              cwd: worktreePath,
              encoding: 'utf8',
            }).trim();

            this.logger?.verbose(`Detected structured mode commit: ${lastCommit}`);
            this.emit('commit-created', { sessionId, commitHash: lastCommit, mode: 'structured' });
            
            resolve({ success: true, commitHash: lastCommit });
            return;
          }

          // Check for timeout
          if (Date.now() - startTime > timeoutMs) {
            this.logger?.warn(`Timeout waiting for structured commit in session ${sessionId}`);
            resolve({ success: false, error: 'Timeout waiting for commit' });
            return;
          }

          // Continue polling
          setTimeout(checkForCommit, pollInterval);
        } catch (error: any) {
          this.logger?.error(`Error checking for structured commit:`, error instanceof Error ? error : undefined);
          resolve({ success: false, error: error.message });
        }
      };

      // Start polling
      setTimeout(checkForCommit, pollInterval);
    });
  }

  /**
   * Finalize a session (squash commits, etc.)
   */
  async finalizeSession(
    sessionId: string,
    worktreePath: string,
    mainBranch: string,
    options: FinalizeSessionOptions
  ): Promise<CommitResult> {
    try {
      this.logger?.verbose(`Finalizing session ${sessionId}`);

      // SECURITY: Validate finalize options to prevent command injection
      const validation = validateFinalizeSessionOptions(options);
      if (!validation.isValid) {
        this.logger?.error(`Invalid finalize session options: ${validation.errors.join(', ')}`);
        return {
          success: false,
          error: `Invalid finalize session options: ${validation.errors.join(', ')}`
        };
      }

      if (options.squashCommits) {
        // Get the merge base with main (escape branch name for security)
        const escapedMainBranch = escapeShellArg(mainBranch);
        const mergeBase = execSync(`git merge-base HEAD ${escapedMainBranch}`, {
          cwd: worktreePath,
          encoding: 'utf8',
        }).trim();

        // Reset to merge base keeping changes (escape merge base hash)
        const escapedMergeBase = escapeShellArg(mergeBase);
        execSync(`git reset --soft ${escapedMergeBase}`, { cwd: worktreePath });

        // Commit with final message
        const commitMessage = options.commitMessage || 'Finalized session changes';
        const commitCommand = buildGitCommitCommand(commitMessage);
        execSync(commitCommand, { cwd: worktreePath });

        const commitHash = execSync('git log -1 --format=%H', {
          cwd: worktreePath,
          encoding: 'utf8',
        }).trim();

        this.logger?.verbose(`Created final commit: ${commitHash}`);

        // Run post-processing if requested (SECURITY: commands already validated above)
        if (options.runPostProcessing && options.postProcessingCommands) {
          for (const cmd of options.postProcessingCommands) {
            this.logger?.verbose(`Running validated post-processing command: ${cmd}`);
            // Commands were already validated in validateFinalizeSessionOptions
            // But add an extra safety check here
            try {
              execSync(cmd, { cwd: worktreePath, timeout: 30000 }); // 30 second timeout
            } catch (error: any) {
              this.logger?.error(`Post-processing command failed: ${cmd}`, error);
              // Continue with other commands even if one fails
            }
          }
        }

        return { success: true, commitHash };
      }

      return { success: true };
    } catch (error: any) {
      const errorMessage = error.stderr || error.stdout || error.message || 'Unknown error';
      this.logger?.error(`Failed to finalize session:`, error);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the appropriate commit mode prompt enhancement
   */
  getPromptEnhancement(settings: CommitModeSettings): string {
    if (settings.mode !== 'structured') {
      return '';
    }

    const template = settings.structuredPromptTemplate || DEFAULT_STRUCTURED_PROMPT_TEMPLATE;
    
    return `\n\n${template}`;
  }

  /**
   * Check if a project has pre-commit hooks that might conflict with checkpoint mode
   */
  async shouldWarnAboutCheckpointMode(worktreePath: string): Promise<{
    shouldWarn: boolean;
    reason?: string;
  }> {
    try {
      // Check for .husky directory
      const huskyExists = await this.checkPathExists(`${worktreePath}/.husky`);
      if (huskyExists) {
        return { shouldWarn: true, reason: 'This project uses pre-commit hooks (.husky)' };
      }

      // Check for .changeset directory
      const changesetExists = await this.checkPathExists(`${worktreePath}/.changeset`);
      if (changesetExists) {
        return { shouldWarn: true, reason: 'This project uses changesets' };
      }

      return { shouldWarn: false };
    } catch (error) {
      this.logger?.error(`Error checking for pre-commit warnings:`, error instanceof Error ? error : undefined);
      return { shouldWarn: false };
    }
  }

  private async checkPathExists(path: string): Promise<boolean> {
    try {
      // SECURITY: Properly escape the path to prevent injection
      const escapedPath = escapeShellArg(path);
      execSync(`test -e ${escapedPath}`, { encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const commitManager = new CommitManager();
import { execSync } from '../utils/commandExecutor';
import type { Logger } from '../utils/logger';
import type { AnalyticsManager } from './analyticsManager';

export interface GitDiffStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

export interface GitDiffResult {
  diff: string;
  stats: GitDiffStats;
  changedFiles: string[];
  beforeHash?: string;
  afterHash?: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  date: Date;
  author: string;
  stats: GitDiffStats;
}

export class GitDiffManager {
  constructor(
    private logger?: Logger,
    private analyticsManager?: AnalyticsManager
  ) {}

  /**
   * Capture git diff for a worktree directory
   */
  async captureWorkingDirectoryDiff(worktreePath: string): Promise<GitDiffResult> {
    try {
      console.log(`captureWorkingDirectoryDiff called for: ${worktreePath}`);
      this.logger?.verbose(`Capturing git diff in ${worktreePath}`);
      
      // Get current commit hash
      const beforeHash = this.getCurrentCommitHash(worktreePath);
      
      // Get diff of working directory vs HEAD
      const diff = this.getGitDiffString(worktreePath);
      console.log(`Captured diff length: ${diff.length}`);
      
      // Get changed files
      const changedFiles = this.getChangedFiles(worktreePath);
      
      // Get diff stats
      const stats = this.getDiffStats(worktreePath);
      
      this.logger?.verbose(`Captured diff: ${stats.filesChanged} files, +${stats.additions} -${stats.deletions}`);
      console.log(`Diff stats:`, stats);
      
      return {
        diff,
        stats,
        changedFiles,
        beforeHash,
        afterHash: undefined // No after hash for working directory changes
      };
    } catch (error) {
      this.logger?.error(`Failed to capture git diff in ${worktreePath}:`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Capture git diff between two commits or between commit and working directory
   */
  async captureCommitDiff(worktreePath: string, fromCommit: string, toCommit?: string): Promise<GitDiffResult> {
    try {
      const to = toCommit || 'HEAD';
      this.logger?.verbose(`Capturing git diff in ${worktreePath} from ${fromCommit} to ${to}`);
      
      // Get diff between commits
      const diff = this.getGitCommitDiff(worktreePath, fromCommit, to);
      
      // Get changed files between commits
      const changedFiles = this.getChangedFilesBetweenCommits(worktreePath, fromCommit, to);
      
      // Get diff stats between commits
      const stats = this.getCommitDiffStats(worktreePath, fromCommit, to);
      
      return {
        diff,
        stats,
        changedFiles,
        beforeHash: fromCommit,
        afterHash: to === 'HEAD' ? this.getCurrentCommitHash(worktreePath) : to
      };
    } catch (error) {
      this.logger?.error(`Failed to capture commit diff in ${worktreePath}:`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get git commit history for a worktree (only commits unique to this branch)
   */
  getCommitHistory(worktreePath: string, limit: number = 50, mainBranch: string = 'main'): GitCommit[] {
    try {
      // Get commit log with stats, excluding commits that are in main branch
      // This shows only commits unique to the current branch
      // Using --cherry-pick to also exclude commits that have equivalent patches on main
      // (e.g., commits that were cherry-picked or rebased to main)
      const logFormat = '%H|%s|%ai|%an';
      const gitCommand = `git log --format="${logFormat}" --numstat -n ${limit} --cherry-pick --left-only HEAD...${mainBranch} --`;
      
      console.log(`[GitDiffManager] Getting commit history for worktree: ${worktreePath}`);
      console.log(`[GitDiffManager] Main branch: ${mainBranch}`);
      console.log(`[GitDiffManager] Git command: ${gitCommand}`);
      
      const logOutput = execSync(gitCommand, { cwd: worktreePath, encoding: 'utf8' });
      console.log(`[GitDiffManager] Git log output length: ${logOutput.length} characters`);

      const commits: GitCommit[] = [];
      const lines = logOutput.trim().split('\n');
      console.log(`[GitDiffManager] Total lines to parse: ${lines.length}`);
      
      let currentCommit: GitCommit | null = null;
      let statsLines: string[] = [];

      for (const line of lines) {
        if (line.includes('|')) {
          // Process previous commit's stats if any
          if (currentCommit && statsLines.length > 0) {
            const stats = this.parseNumstatOutput(statsLines);
            currentCommit.stats = stats;
          }

          // Start new commit
          const [hash, message, date, author] = line.split('|');
          
          // Validate and parse the date
          let parsedDate: Date;
          try {
            parsedDate = new Date(date);
            // Check if the date is valid
            if (isNaN(parsedDate.getTime())) {
              throw new Error('Invalid date');
            }
          } catch {
            // Fall back to current date if parsing fails
            parsedDate = new Date();
            this.logger?.warn(`Invalid date format in git log: "${date}". Using current date as fallback.`);
          }
          
          currentCommit = {
            hash,
            message,
            date: parsedDate,
            author,
            stats: { additions: 0, deletions: 0, filesChanged: 0 }
          };
          commits.push(currentCommit);
          statsLines = [];
        } else if (line.trim() && currentCommit) {
          // Collect stat lines
          statsLines.push(line);
        }
      }

      // Process last commit's stats
      if (currentCommit && statsLines.length > 0) {
        const stats = this.parseNumstatOutput(statsLines);
        currentCommit.stats = stats;
      }

      console.log(`[GitDiffManager] Found ${commits.length} commits unique to this branch`);
      if (commits.length === 0) {
        console.log(`[GitDiffManager] No unique commits found. This could mean:`);
        console.log(`[GitDiffManager]   - The branch is up-to-date with ${mainBranch}`);
        console.log(`[GitDiffManager]   - The branch has been rebased onto ${mainBranch}`);
        console.log(`[GitDiffManager]   - The ${mainBranch} branch doesn't exist in this worktree`);
      }

      return commits;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to get commit history', error instanceof Error ? error : undefined);
      console.error(`[GitDiffManager] Error getting commit history: ${errorMessage}`);
      console.error(`[GitDiffManager] Full error:`, error);
      
      // If it's a git command error, throw it so the caller can handle it appropriately
      if (errorMessage.includes('fatal:') || errorMessage.includes('error:')) {
        console.error(`[GitDiffManager] Git command failed. This might happen if the ${mainBranch} branch doesn't exist.`);
        throw new Error(`Git error: ${errorMessage}`);
      }
      
      // For other errors, return empty array as fallback
      return [];
    }
  }

  /**
   * Parse numstat output to get diff statistics
   */
  private parseNumstatOutput(lines: string[]): GitDiffStats {
    let additions = 0;
    let deletions = 0;
    let filesChanged = 0;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const added = parts[0] === '-' ? 0 : parseInt(parts[0], 10);
        const deleted = parts[1] === '-' ? 0 : parseInt(parts[1], 10);
        
        if (!isNaN(added) && !isNaN(deleted)) {
          additions += added;
          deletions += deleted;
          filesChanged++;
        }
      }
    }

    return { additions, deletions, filesChanged };
  }

  /**
   * Get diff for a specific commit
   */
  getCommitDiff(worktreePath: string, commitHash: string): GitDiffResult {
    try {
      const diff = execSync(`git show --format= ${commitHash}`, {
        cwd: worktreePath,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });

      const stats = this.getCommitStats(worktreePath, commitHash);
      const changedFiles = this.getCommitChangedFiles(worktreePath, commitHash);

      return {
        diff,
        stats,
        changedFiles,
        beforeHash: `${commitHash}~1`,
        afterHash: commitHash
      };
    } catch (error) {
      this.logger?.error(`Failed to get commit diff for ${commitHash}`, error instanceof Error ? error : undefined);
      return {
        diff: '',
        stats: { additions: 0, deletions: 0, filesChanged: 0 },
        changedFiles: []
      };
    }
  }

  /**
   * Get stats for a specific commit
   */
  private getCommitStats(worktreePath: string, commitHash: string): GitDiffStats {
    try {
      const fullOutput = execSync(
        `git show --stat --format= ${commitHash}`,
        { cwd: worktreePath, encoding: 'utf8' }
      );
      // Get the last line manually instead of using tail
      const lines = fullOutput.trim().split('\n');
      const statsOutput = lines[lines.length - 1];
      return this.parseDiffStats(statsOutput);
    } catch {
      return { additions: 0, deletions: 0, filesChanged: 0 };
    }
  }

  /**
   * Get changed files for a specific commit
   */
  private getCommitChangedFiles(worktreePath: string, commitHash: string): string[] {
    try {
      const output = execSync(
        `git show --name-only --format= ${commitHash}`,
        { cwd: worktreePath, encoding: 'utf8' }
      );
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Combine multiple diffs into a single diff
   */
  combineDiffs(diffs: GitDiffResult[]): GitDiffResult {
    const combinedDiff = diffs.map(d => d.diff).join('\n\n');
    
    // Aggregate stats
    const stats: GitDiffStats = {
      additions: diffs.reduce((sum, d) => sum + d.stats.additions, 0),
      deletions: diffs.reduce((sum, d) => sum + d.stats.deletions, 0),
      filesChanged: 0 // Will be calculated from unique files
    };
    
    // Get unique changed files
    const allFiles = new Set<string>();
    diffs.forEach(d => d.changedFiles.forEach(f => allFiles.add(f)));
    const changedFiles = Array.from(allFiles);
    stats.filesChanged = changedFiles.length;
    
    return {
      diff: combinedDiff,
      stats,
      changedFiles,
      beforeHash: diffs[0]?.beforeHash,
      afterHash: diffs[diffs.length - 1]?.afterHash
    };
  }

  getCurrentCommitHash(worktreePath: string): string {
    try {
      return execSync('git rev-parse HEAD', { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      }).trim();
    } catch (error) {
      this.logger?.warn(`Could not get current commit hash in ${worktreePath}`);
      return '';
    }
  }

  async getGitDiff(worktreePath: string): Promise<GitDiffResult> {
    const result = await this.captureWorkingDirectoryDiff(worktreePath);

    // Track git diff viewed
    if (this.analyticsManager) {
      const fileCountCategory = this.analyticsManager.categorizeNumber(result.stats.filesChanged, [1, 5, 10, 25, 50]);
      const hasUncommitted = this.hasChanges(worktreePath);

      this.analyticsManager.track('git_diff_viewed', {
        file_count_category: fileCountCategory,
        has_uncommitted: hasUncommitted
      });
    }

    return result;
  }

  async getCombinedDiff(worktreePath: string, mainBranch: string): Promise<GitDiffResult> {
    // Get diff against main branch
    try {

      // Get diff between current branch and main
      const diff = execSync(`git diff origin/${mainBranch}...HEAD`, {
        cwd: worktreePath,
        encoding: 'utf8'
      });

      // Get changed files
      const changedFiles = execSync(`git diff --name-only origin/${mainBranch}...HEAD`, {
        cwd: worktreePath,
        encoding: 'utf8'
      }).trim().split('\n').filter((f: string) => f.length > 0);

      // Get stats
      const statsOutput = execSync(`git diff --stat origin/${mainBranch}...HEAD`, {
        cwd: worktreePath,
        encoding: 'utf8'
      });

      const stats = this.parseDiffStats(statsOutput);

      return {
        diff,
        stats,
        changedFiles,
        beforeHash: `origin/${mainBranch}`,
        afterHash: 'HEAD'
      };
    } catch (error) {
      this.logger?.warn(`Could not get combined diff in ${worktreePath}:`, error instanceof Error ? error : undefined);
      // Fallback to working directory diff
      return this.captureWorkingDirectoryDiff(worktreePath);
    }
  }

  private getGitDiffString(worktreePath: string): string {
    try {
      // First check if we're in a valid git repository
      try {
        execSync('git rev-parse --git-dir', { cwd: worktreePath, encoding: 'utf8' });
      } catch {
        console.error(`Not a git repository: ${worktreePath}`);
        return '';
      }

      // Check git status to see what files have changes
      const status = execSync('git status --porcelain', { cwd: worktreePath, encoding: 'utf8' });
      console.log(`Git status in ${worktreePath}:`, status || '(no changes)');

      // Get diff of both staged and unstaged changes against HEAD
      // Using 'git diff HEAD' to include both staged and unstaged changes
      let diff = execSync('git diff HEAD', { 
        cwd: worktreePath, 
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
      });
      console.log(`Git diff in ${worktreePath}: ${diff.length} characters`);
      
      // Get untracked files and create diff-like output for them
      const untrackedFiles = this.getUntrackedFiles(worktreePath);
      if (untrackedFiles.length > 0) {
        console.log(`Found ${untrackedFiles.length} untracked files`);
        const untrackedDiff = this.createDiffForUntrackedFiles(worktreePath, untrackedFiles);
        if (untrackedDiff) {
          diff = diff ? diff + '\n' + untrackedDiff : untrackedDiff;
        }
      }
      
      return diff;
    } catch (error) {
      this.logger?.warn(`Could not get git diff in ${worktreePath}`, error instanceof Error ? error : undefined);
      console.error(`Error getting git diff:`, error);
      return '';
    }
  }

  private getGitCommitDiff(worktreePath: string, fromCommit: string, toCommit: string): string {
    try {
      return execSync(`git diff ${fromCommit}..${toCommit}`, { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
    } catch (error) {
      this.logger?.warn(`Could not get git commit diff in ${worktreePath}`);
      return '';
    }
  }

  private getChangedFiles(worktreePath: string): string[] {
    try {
      // Get tracked changed files
      const trackedOutput = execSync('git diff --name-only HEAD', { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
      const trackedFiles = trackedOutput.trim().split('\n').filter((f: string) => f.length > 0);
      
      // Get untracked files
      const untrackedFiles = this.getUntrackedFiles(worktreePath);
      
      // Combine both lists
      return [...trackedFiles, ...untrackedFiles];
    } catch (error) {
      this.logger?.warn(`Could not get changed files in ${worktreePath}`);
      return [];
    }
  }

  private getChangedFilesBetweenCommits(worktreePath: string, fromCommit: string, toCommit: string): string[] {
    try {
      const output = execSync(`git diff --name-only ${fromCommit}..${toCommit}`, { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
      return output.trim().split('\n').filter((f: string) => f.length > 0);
    } catch (error) {
      this.logger?.warn(`Could not get changed files between commits in ${worktreePath}`);
      return [];
    }
  }

  private getDiffStats(worktreePath: string): GitDiffStats {
    try {
      const output = execSync('git diff --stat HEAD', { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
      
      const trackedStats = this.parseDiffStats(output);
      
      // Add stats for untracked files
      const untrackedFiles = this.getUntrackedFiles(worktreePath);
      if (untrackedFiles.length > 0) {
        let untrackedAdditions = 0;
        for (const file of untrackedFiles) {
          // Skip invalid filenames
          if (!file || file.trim().length === 0) {
            continue;
          }
          
          try {
            const cleanFile = file.trim();
            const filePath = `${worktreePath}/${cleanFile}`;
            const lines = execSync(`wc -l < "${filePath}"`, { 
              encoding: 'utf8',
              cwd: worktreePath
            });
            untrackedAdditions += parseInt(lines.trim()) || 0;
          } catch {
            // Skip files that can't be counted
          }
        }
        
        return {
          additions: trackedStats.additions + untrackedAdditions,
          deletions: trackedStats.deletions,
          filesChanged: trackedStats.filesChanged + untrackedFiles.length
        };
      }
      
      return trackedStats;
    } catch (error) {
      this.logger?.warn(`Could not get diff stats in ${worktreePath}`);
      return { additions: 0, deletions: 0, filesChanged: 0 };
    }
  }

  private getCommitDiffStats(worktreePath: string, fromCommit: string, toCommit: string): GitDiffStats {
    try {
      const output = execSync(`git diff --stat ${fromCommit}..${toCommit}`, { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
      
      return this.parseDiffStats(output);
    } catch (error) {
      this.logger?.warn(`Could not get commit diff stats in ${worktreePath}`);
      return { additions: 0, deletions: 0, filesChanged: 0 };
    }
  }

  parseDiffStats(statsOutput: string): GitDiffStats {
    const lines = statsOutput.trim().split('\n');
    const summaryLine = lines[lines.length - 1];
    
    // Parse summary line like: "3 files changed, 45 insertions(+), 12 deletions(-)"
    const fileMatch = summaryLine.match(/(\d+) files? changed/);
    const addMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
    const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);
    
    return {
      filesChanged: fileMatch ? parseInt(fileMatch[1]) : 0,
      additions: addMatch ? parseInt(addMatch[1]) : 0,
      deletions: delMatch ? parseInt(delMatch[1]) : 0
    };
  }

  /**
   * Check if there are any changes in the working directory
   */
  hasChanges(worktreePath: string): boolean {
    try {
      const output = execSync('git status --porcelain', { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
      return output.trim().length > 0;
    } catch (error) {
      this.logger?.warn(`Could not check git status in ${worktreePath}`);
      return false;
    }
  }

  /**
   * Get list of untracked files
   */
  private getUntrackedFiles(worktreePath: string): string[] {
    try {
      const output = execSync('git ls-files --others --exclude-standard', { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
      
      // Handle empty output case
      if (!output || output.trim().length === 0) {
        return [];
      }
      
      return output.trim().split('\n').filter((f: string) => f && f.trim().length > 0);
    } catch (error) {
      this.logger?.warn(`Could not get untracked files in ${worktreePath}`);
      return [];
    }
  }

  /**
   * Create diff-like output for untracked files
   */
  private createDiffForUntrackedFiles(worktreePath: string, untrackedFiles: string[]): string {
    let diffOutput = '';
    
    for (const file of untrackedFiles) {
      // Skip invalid filenames
      if (!file || file.trim().length === 0) {
        continue;
      }
      
      try {
        const cleanFile = file.trim();
        const filePath = `${worktreePath}/${cleanFile}`;
        const fileContent = execSync(`cat "${filePath}"`, { 
          encoding: 'utf8',
          maxBuffer: 1024 * 1024 // 1MB max per file
        });
        
        // Create a diff-like format for the new file
        diffOutput += `diff --git a/${cleanFile} b/${cleanFile}\n`;
        diffOutput += `new file mode 100644\n`;
        diffOutput += `index 0000000..0000000\n`;
        diffOutput += `--- /dev/null\n`;
        diffOutput += `+++ b/${cleanFile}\n`;
        
        // Add the file content with '+' prefix for each line
        const lines = fileContent.split('\n');
        if (lines.length > 0) {
          diffOutput += `@@ -0,0 +1,${lines.length} @@\n`;
          for (const line of lines) {
            diffOutput += `+${line}\n`;
          }
        }
      } catch (error) {
        // Skip files that can't be read (binary files, etc.)
        const cleanFile = file.trim();
        this.logger?.verbose(`Could not read untracked file ${cleanFile}: ${error}`);
      }
    }
    
    return diffOutput;
  }
}
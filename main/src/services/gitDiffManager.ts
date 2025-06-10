import { execSync } from '../utils/commandExecutor';
import type { Logger } from '../utils/logger';

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
  constructor(private logger?: Logger) {}

  /**
   * Capture git diff for a worktree directory
   */
  async captureWorkingDirectoryDiff(worktreePath: string): Promise<GitDiffResult> {
    try {
      this.logger?.verbose(`Capturing git diff in ${worktreePath}`);
      
      // Get current commit hash
      const beforeHash = this.getCurrentCommitHash(worktreePath);
      
      // Get diff of working directory vs HEAD
      const diff = this.getGitDiffString(worktreePath);
      
      // Get changed files
      const changedFiles = this.getChangedFiles(worktreePath);
      
      // Get diff stats
      const stats = this.getDiffStats(worktreePath);
      
      this.logger?.verbose(`Captured diff: ${stats.filesChanged} files, +${stats.additions} -${stats.deletions}`);
      
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
      const logFormat = '%H|%s|%ai|%an';
      const logOutput = execSync(
        `git log --format="${logFormat}" --numstat -n ${limit} HEAD --not ${mainBranch}`,
        { cwd: worktreePath, encoding: 'utf8' }
      );

      const commits: GitCommit[] = [];
      const lines = logOutput.trim().split('\n');
      
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
          currentCommit = {
            hash,
            message,
            date: new Date(date),
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

      return commits;
    } catch (error) {
      this.logger?.error('Failed to get commit history', error instanceof Error ? error : undefined);
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
    return this.captureWorkingDirectoryDiff(worktreePath);
  }

  async getCombinedDiff(worktreePath: string): Promise<GitDiffResult> {
    // Get diff against main branch
    try {
      // Get the main branch name in a cross-platform way
      let mainBranch = 'main';
      try {
        const fullRef = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
          cwd: worktreePath,
          encoding: 'utf8'
        }).trim();
        
        // Remove the prefix manually instead of using sed
        if (fullRef.startsWith('refs/remotes/origin/')) {
          mainBranch = fullRef.substring('refs/remotes/origin/'.length);
        }
      } catch {
        // If symbolic-ref fails, fallback to 'main'
        mainBranch = 'main';
      }

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
      // Get diff of staged and unstaged changes
      return execSync('git diff HEAD', { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
    } catch (error) {
      this.logger?.warn(`Could not get git diff in ${worktreePath}`);
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
      const output = execSync('git diff --name-only HEAD', { 
        cwd: worktreePath, 
        encoding: 'utf8' 
      });
      return output.trim().split('\n').filter((f: string) => f.length > 0);
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
      
      return this.parseDiffStats(output);
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
}
import { execSync } from 'child_process';
import type { Logger } from '../utils/logger.js';

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
      const diff = this.getGitDiff(worktreePath);
      
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

  private getCurrentCommitHash(worktreePath: string): string {
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

  private getGitDiff(worktreePath: string): string {
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
      return output.trim().split('\n').filter(f => f.length > 0);
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
      return output.trim().split('\n').filter(f => f.length > 0);
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

  private parseDiffStats(statsOutput: string): GitDiffStats {
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
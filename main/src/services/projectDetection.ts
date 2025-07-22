import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics, CommitMode } from '../../../shared/types';

export class ProjectDetectionService {
  /**
   * Detect project characteristics to suggest appropriate commit mode
   */
  async detectProjectCharacteristics(projectPath: string): Promise<ProjectCharacteristics> {
    const hasHusky = await this.checkDirectoryExists(path.join(projectPath, '.husky'));
    const hasChangeset = await this.checkDirectoryExists(path.join(projectPath, '.changeset'));
    const hasConventionalCommits = await this.checkForConventionalCommits(projectPath);
    
    const suggestedMode = this.suggestCommitMode({
      hasHusky,
      hasChangeset,
      hasConventionalCommits,
    });

    return {
      hasHusky,
      hasChangeset,
      hasConventionalCommits,
      suggestedMode,
    };
  }

  private async checkDirectoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private async checkForConventionalCommits(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(packageJson);

      // Check for common conventional commit tools
      const devDeps = pkg.devDependencies || {};
      const deps = pkg.dependencies || {};
      const allDeps = { ...deps, ...devDeps };

      const conventionalCommitTools = [
        'commitizen',
        '@commitlint/cli',
        '@commitlint/config-conventional',
        'cz-conventional-changelog',
        'standard-version',
        'semantic-release',
      ];

      const hasConventionalCommitTool = conventionalCommitTools.some(
        tool => tool in allDeps
      );

      // Also check for commitlint config file
      const commitlintConfigExists = await this.checkFileExists(
        path.join(projectPath, 'commitlint.config.js')
      ) || await this.checkFileExists(
        path.join(projectPath, '.commitlintrc.js')
      ) || await this.checkFileExists(
        path.join(projectPath, '.commitlintrc.json')
      );

      return hasConventionalCommitTool || commitlintConfigExists;
    } catch {
      return false;
    }
  }

  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private suggestCommitMode(characteristics: {
    hasHusky: boolean;
    hasChangeset: boolean;
    hasConventionalCommits: boolean;
  }): CommitMode {
    // If project has pre-commit hooks or enforced commit conventions, suggest structured mode
    if (characteristics.hasHusky || characteristics.hasChangeset || characteristics.hasConventionalCommits) {
      return 'structured';
    }

    // Otherwise, default to checkpoint mode for simplicity
    return 'checkpoint';
  }

  /**
   * Get a human-readable explanation for why a mode was suggested
   */
  getModeRecommendationReason(characteristics: ProjectCharacteristics): string {
    const reasons: string[] = [];

    if (characteristics.hasHusky) {
      reasons.push('pre-commit hooks (.husky)');
    }
    if (characteristics.hasChangeset) {
      reasons.push('changesets');
    }
    if (characteristics.hasConventionalCommits) {
      reasons.push('conventional commits');
    }

    if (reasons.length === 0) {
      return 'No special commit requirements detected';
    }

    return `Project uses ${reasons.join(', ')}`;
  }
}

// Export singleton instance
export const projectDetectionService = new ProjectDetectionService();
import { app } from 'electron';
import { ConfigManager } from './configManager';
import { Logger } from '../utils/logger';

export interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

export class VersionChecker {
  private logger: Logger;
  private configManager: ConfigManager;
  private readonly checkIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
  private checkTimeout?: NodeJS.Timeout;

  constructor(configManager: ConfigManager, logger: Logger) {
    this.configManager = configManager;
    this.logger = logger;
  }

  public async checkForUpdates(): Promise<VersionInfo> {
    try {
      const currentVersion = app.getVersion();

      // Fetch latest release from GitHub API
      const response = await fetch('https://api.github.com/repos/stravu/crystal/releases/latest');
      
      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
      }

      const release = await response.json() as GitHubRelease;
      
      // Skip pre-releases and drafts
      if (release.prerelease || release.draft) {
        return {
          current: currentVersion,
          latest: currentVersion,
          hasUpdate: false
        };
      }

      const latestVersion = this.normalizeVersion(release.tag_name);
      const hasUpdate = this.isNewerVersion(latestVersion, currentVersion);

      return {
        current: currentVersion,
        latest: latestVersion,
        hasUpdate,
        releaseUrl: release.html_url,
        releaseNotes: release.body,
        publishedAt: release.published_at
      };
    } catch (error) {
      this.logger.error(`[Version Checker] Failed to check for updates:`, error as Error);
      
      // Return current version info without update on error
      return {
        current: app.getVersion(),
        latest: app.getVersion(),
        hasUpdate: false
      };
    }
  }

  public async checkOnStartup(): Promise<void> {
    try {
      const versionInfo = await this.checkForUpdates();
      
      if (versionInfo.hasUpdate) {
        this.logger.info(`[Version Checker] Update available on startup: ${versionInfo.latest}`);
        // Emit event for UI notification
        (process as NodeJS.Process & { emit(event: 'version-update-available', data: VersionInfo): boolean }).emit('version-update-available', versionInfo);
      }
    } catch (error) {
      this.logger.error(`[Version Checker] Startup check failed:`, error as Error);
    }
  }

  public startPeriodicCheck(): void {
    // Check if auto-updates are enabled in config
    const config = this.configManager.getConfig();
    if (config.autoCheckUpdates === false) {
      return;
    }
    
    // Set up periodic checks (don't check immediately since we do that on startup)
    this.checkTimeout = setInterval(() => {
      this.performCheck();
    }, this.checkIntervalMs);
  }

  public stopPeriodicCheck(): void {
    if (this.checkTimeout) {
      clearInterval(this.checkTimeout);
      this.checkTimeout = undefined;
    }
  }

  private async performCheck(): Promise<void> {
    try {
      // Check if auto-updates are still enabled (settings might have changed)
      const config = this.configManager.getConfig();
      if (config.autoCheckUpdates === false) {
        this.stopPeriodicCheck();
        return;
      }

      const versionInfo = await this.checkForUpdates();
      
      if (versionInfo.hasUpdate) {
        this.logger.info(`[Version Checker] Update available: ${versionInfo.latest}`);
        // Emit event for UI notification
        (process as NodeJS.Process & { emit(event: 'version-update-available', data: VersionInfo): boolean }).emit('version-update-available', versionInfo);
      }
    } catch (error) {
      this.logger.error(`[Version Checker] Periodic check failed:`, error as Error);
    }
  }

  private normalizeVersion(version: string): string {
    // Remove 'v' prefix if present
    return version.replace(/^v/, '');
  }

  private isNewerVersion(latest: string, current: string): boolean {
    try {
      const parseVersion = (v: string) => v.split('.').map(Number);
      
      const latestParts = parseVersion(latest);
      const currentParts = parseVersion(current);
      
      // Pad arrays to same length
      const maxLength = Math.max(latestParts.length, currentParts.length);
      while (latestParts.length < maxLength) latestParts.push(0);
      while (currentParts.length < maxLength) currentParts.push(0);
      
      // Compare version parts
      for (let i = 0; i < maxLength; i++) {
        if (latestParts[i] > currentParts[i]) {
          return true;
        } else if (latestParts[i] < currentParts[i]) {
          return false;
        }
      }
      
      return false; // Versions are equal
    } catch (error) {
      this.logger.error(`[Version Checker] Failed to compare versions ${latest} vs ${current}:`, error as Error);
      return false;
    }
  }
}
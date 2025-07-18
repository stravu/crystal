import { EventEmitter } from 'events';
import type { AppConfig } from '../types/config';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getCrystalDirectory } from '../utils/crystalDirectory';

export class ConfigManager extends EventEmitter {
  private config: AppConfig;
  private configPath: string;
  private configDir: string;

  constructor(defaultGitPath?: string) {
    super();
    this.configDir = getCrystalDirectory();
    this.configPath = path.join(this.configDir, 'config.json');
    this.config = {
      gitRepoPath: defaultGitPath || os.homedir(),
      verbose: false,
      anthropicApiKey: undefined,
      systemPromptAppend: undefined,
      runScript: undefined,
      defaultPermissionMode: 'ignore',
      defaultModel: 'claude-sonnet-4-20250514',
      stravuApiKey: undefined,
      stravuServerUrl: 'https://api.stravu.com',
      notifications: {
        enabled: true,
        playSound: true,
        notifyOnStatusChange: true,
        notifyOnWaiting: true,
        notifyOnComplete: true
      }
    };
  }

  async initialize(): Promise<void> {
    // Ensure the config directory exists
    await fs.mkdir(this.configDir, { recursive: true });
    
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const loadedConfig = JSON.parse(data);
      
      // Merge loaded config with defaults, ensuring notification settings exist
      this.config = {
        ...this.config,
        ...loadedConfig,
        notifications: {
          ...this.config.notifications,
          ...loadedConfig.notifications
        }
      };
    } catch (error) {
      // Config file doesn't exist, use defaults
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getConfig(): AppConfig {
    // Always return dark theme
    return { ...this.config, theme: 'dark' };
  }

  async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    // Filter out theme updates - always dark mode
    const { theme, ...filteredUpdates } = updates;
    this.config = { ...this.config, ...filteredUpdates };
    await this.saveConfig();
    this.emit('config-updated', this.config);
    return this.getConfig();
  }

  getGitRepoPath(): string {
    return this.config.gitRepoPath || '';
  }

  isVerbose(): boolean {
    return this.config.verbose || false;
  }

  getDatabasePath(): string {
    return path.join(this.configDir, 'sessions.db');
  }

  getAnthropicApiKey(): string | undefined {
    return this.config.anthropicApiKey;
  }

  getSystemPromptAppend(): string | undefined {
    return this.config.systemPromptAppend;
  }

  getRunScript(): string[] | undefined {
    return this.config.runScript;
  }

  getStravuApiKey(): string | undefined {
    return this.config.stravuApiKey;
  }

  getStravuServerUrl(): string {
    return this.config.stravuServerUrl || 'https://api.stravu.com';
  }

  getDefaultModel(): string {
    return this.config.defaultModel || 'claude-sonnet-4-20250514';
  }
}
import { EventEmitter } from 'events';
import type { AppConfig } from '../types/config.js';
import fs from 'fs/promises';
import path from 'path';

export class ConfigManager extends EventEmitter {
  private config: AppConfig;
  private configPath: string;

  constructor(defaultGitPath: string) {
    super();
    this.configPath = path.join(process.cwd(), '.ccc-config.json');
    this.config = {
      gitRepoPath: defaultGitPath
    };
  }

  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
    } catch (error) {
      // Config file doesn't exist, use defaults
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getConfig(): AppConfig {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    this.emit('config-updated', this.config);
    return this.getConfig();
  }

  getGitRepoPath(): string {
    return this.config.gitRepoPath;
  }
}
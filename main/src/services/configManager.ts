import { EventEmitter } from 'events';
import type { AppConfig } from '../types/config';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getCrystalDirectory } from '../utils/crystalDirectory';
import { safeStorage } from 'electron';

export class ConfigManager extends EventEmitter {
  private config: AppConfig;
  private configPath: string;
  private configDir: string;
  private readonly ENCRYPTED_PREFIX = 'enc:';

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
      stravuApiKey: undefined,
      stravuServerUrl: 'https://api.stravu.com'
    };
    
    // Log encryption availability
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[ConfigManager] Secure storage is not available on this system. API keys will be stored in plain text.');
    }
  }

  private encryptValue(value: string | undefined): string | undefined {
    if (!value || !safeStorage.isEncryptionAvailable()) {
      return value;
    }
    
    // If already encrypted, return as is
    if (value.startsWith(this.ENCRYPTED_PREFIX)) {
      return value;
    }
    
    try {
      const encrypted = safeStorage.encryptString(value);
      // Convert Buffer to base64 string and add prefix
      return this.ENCRYPTED_PREFIX + encrypted.toString('base64');
    } catch (error) {
      console.error('Failed to encrypt value:', error);
      return value;
    }
  }

  private decryptValue(value: string | undefined): string | undefined {
    if (!value || !safeStorage.isEncryptionAvailable()) {
      return value;
    }
    
    // Check if value is encrypted
    if (!value.startsWith(this.ENCRYPTED_PREFIX)) {
      return value;
    }
    
    try {
      // Remove prefix and convert base64 back to Buffer
      const encrypted = value.substring(this.ENCRYPTED_PREFIX.length);
      const buffer = Buffer.from(encrypted, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (error) {
      console.error('Failed to decrypt value:', error);
      return undefined;
    }
  }

  async initialize(): Promise<void> {
    // Ensure the config directory exists
    await fs.mkdir(this.configDir, { recursive: true });
    
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const savedConfig = JSON.parse(data);
      
      // Check if we need to migrate plain text API keys
      let needsMigration = false;
      
      // Decrypt sensitive fields
      this.config = {
        ...savedConfig,
        anthropicApiKey: this.decryptValue(savedConfig.anthropicApiKey),
        stravuApiKey: this.decryptValue(savedConfig.stravuApiKey)
      };
      
      // Check if API keys exist but are not encrypted
      if (savedConfig.anthropicApiKey && !savedConfig.anthropicApiKey.startsWith(this.ENCRYPTED_PREFIX)) {
        needsMigration = true;
        console.log('[ConfigManager] Migrating plain text anthropicApiKey to encrypted storage');
      }
      
      if (savedConfig.stravuApiKey && !savedConfig.stravuApiKey.startsWith(this.ENCRYPTED_PREFIX)) {
        needsMigration = true;
        console.log('[ConfigManager] Migrating plain text stravuApiKey to encrypted storage');
      }
      
      // Save the config to encrypt any plain text API keys
      if (needsMigration && safeStorage.isEncryptionAvailable()) {
        await this.saveConfig();
        console.log('[ConfigManager] API keys have been encrypted and saved');
      }
    } catch (error) {
      // Config file doesn't exist, use defaults
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    
    // Create a copy of config with encrypted sensitive fields
    const configToSave = {
      ...this.config,
      anthropicApiKey: this.encryptValue(this.config.anthropicApiKey),
      stravuApiKey: this.encryptValue(this.config.stravuApiKey)
    };
    
    await fs.writeFile(this.configPath, JSON.stringify(configToSave, null, 2));
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
}
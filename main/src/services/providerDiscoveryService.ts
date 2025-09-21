import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PROVIDERS } from '../data/providers';
import { ProviderEnvironment, DiscoveredProvider, ProviderAvailability, ProviderConfig } from '../../../shared/types/providerConfig';

export class ProviderDiscoveryService {

  private configPriority = [
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(process.cwd(), '.claude', 'settings.json'),
    path.join(os.homedir(), '.claude.json'),
    path.join(os.homedir(), '.claude', 'settings.local.json'),
    path.join(process.cwd(), '.claude', 'settings.local.json')
  ];

  async discoverAvailableProviders(): Promise<DiscoveredProvider[]> {
    const available: DiscoveredProvider[] = [];

    for (const provider of PROVIDERS) {
      const config = await this.discoverProviderConfig(provider);
      if (config.isAvailable) {
        available.push({
          providerId: provider.id,
          ...config
        });
      }
    }

    return available;
  }

  private async discoverProviderConfig(provider: ProviderConfig): Promise<ProviderAvailability> {
    // Check each config file in priority order
    for (const configPath of this.configPriority) {
      try {
        const config = await this.loadConfigFile(configPath);
        const envConfig = this.extractEnvironmentVariables(config, provider.envPrefix);

        if (envConfig.API_KEY || envConfig.AUTH_TOKEN) {
          return {
            isAvailable: true,
            config: envConfig,
            configPath,
            detectedModels: this.detectModels(envConfig, provider)
          };
        }
      } catch {
        // File doesn't exist or can't be read, continue to next
        continue;
      }
    }

    return { isAvailable: false, detectedModels: [] };
  }

  private async loadConfigFile(configPath: string): Promise<unknown> {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as unknown;
  }

  private extractEnvironmentVariables(config: unknown, prefix: string): ProviderEnvironment {
    const env: ProviderEnvironment = {};

    Object.keys((config as any).env || {}).forEach(key => {
      if (key.startsWith(prefix)) {
        const cleanKey = key.substring(prefix.length);
        env[cleanKey] = (config as any).env[key];
      }
    });

    return env;
  }

  private detectModels(env: ProviderEnvironment, provider: ProviderConfig): string[] {
    const detectedModels: string[] = [];

    // Check for MODEL (standard)
    if (env.MODEL && provider.models.find(m => m.id === env.MODEL)) {
      detectedModels.push(env.MODEL);
    }

    // Check for SMALL_FAST_MODEL (for providers that support it)
    if (env.SMALL_FAST_MODEL && provider.models.find(m => m.id === env.SMALL_FAST_MODEL)) {
      detectedModels.push(env.SMALL_FAST_MODEL);
    }

    // If no specific models found, return all available models as fallback
    if (detectedModels.length === 0) {
      return provider.models.map(m => m.id);
    }

    return detectedModels;
  }

  async getProviderConfig(providerId: string): Promise<ProviderConfig | null> {
    const provider = PROVIDERS.find(p => p.id === providerId);
    if (!provider) {
      return null;
    }

    const discovery = await this.discoverProviderConfig(provider);
    if (!discovery.isAvailable) {
      return null;
    }

    return {
      ...provider,
      // Update models based on discovered configuration
      models: provider.models.filter(m =>
        discovery.detectedModels.includes(m.id)
      )
    };
  }
}
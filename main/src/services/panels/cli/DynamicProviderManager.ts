import { AbstractCliManager } from './AbstractCliManager';
import { PROVIDERS } from '../../../data/providers';
import { ProviderDiscoveryService } from '../../providerDiscoveryService';
import type { Logger } from '../../../utils/logger';
import type { ConfigManager } from '../../configManager';

// Inline types to avoid import resolution issues
export interface ProviderEnvironment {
  [key: string]: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  description: string;
  default: boolean;
}

export interface ProviderCapabilities {
  supportsResume: boolean;
  supportsMultipleModels: boolean;
  supportsFileOperations: boolean;
  supportsGitIntegration: boolean;
  supportsSystemPrompts: boolean;
  outputFormats: string[];
}

export interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  envPrefix: string;
  models: ProviderModel[];
  capabilities: ProviderCapabilities;
  command: {
    executable: string;
    args: string[];
    env?: ProviderEnvironment;
  };
  ui: {
    configComponent: string;
    statsComponent: string;
  };
  costTracking?: {
    enabled: boolean;
    currency: string;
    prices: Record<string, unknown>;
  };
}

export interface DiscoveredProvider {
  providerId: string;
  isAvailable: boolean;
  config?: ProviderEnvironment;
  configPath?: string;
  detectedModels: string[];
}

interface DynamicProviderOptions {
  panelId: string;
  sessionId: string;
  worktreePath: string;
  prompt: string;
  providerId?: string;
  model?: string;
}

export class DynamicProviderManager extends AbstractCliManager {
  private providerDiscoveryService: ProviderDiscoveryService;
  private availableProviders: Map<string, DiscoveredProvider> = new Map();
  private currentProvider?: ProviderConfig;

  constructor(
    sessionManager: unknown,
    logger?: Logger,
    configManager?: ConfigManager
  ) {
    super(sessionManager, logger, configManager);
    this.providerDiscoveryService = new ProviderDiscoveryService();
  }

  // Abstract method implementations

  protected getCliToolName(): string {
    return this.currentProvider?.name || 'Dynamic Provider';
  }

  protected async testCliAvailability(_customPath?: string): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
    // Discover available providers
    const providers = await this.providerDiscoveryService.discoverAvailableProviders();

    // Update available providers cache
    this.availableProviders.clear();
    providers.forEach(provider => {
      this.availableProviders.set(provider.providerId, provider);
    });

    // Set current provider if not already set
    if (!this.currentProvider && providers.length > 0) {
      this.currentProvider = PROVIDERS.find(p => p.id === providers[0].providerId) || PROVIDERS[0];
    }

    // If still no provider, use Anthropic as default
    if (!this.currentProvider) {
      this.currentProvider = PROVIDERS.find(p => p.id === 'anthropic') || PROVIDERS[0];
    }

    // Test the current provider's CLI availability
    if (this.currentProvider) {
      const providerConfig = this.availableProviders.get(this.currentProvider.id);
      if (providerConfig) {
        // Special handling for OpenAI provider - it uses the existing Codex infrastructure
        if (this.currentProvider.id === 'openai') {
          try {
            // Test if the existing Codex infrastructure is available by checking if we can import the CodexManager
            const { CodexManager } = await import('../../panels/codex/codexManager');
            if (CodexManager) {
              return {
                available: true,
                version: 'Uses existing Codex infrastructure',
                path: 'codex-manager'
              };
            }
          } catch (error) {
            return {
              available: false,
              error: 'Codex infrastructure not available'
            };
          }
        }

        // Test if the CLI executable is available for other providers
        try {
          const { execSync } = await import('child_process');
          execSync(`which ${this.currentProvider.command.executable}`, { stdio: 'pipe' });
          return {
            available: true,
            version: 'Unknown',
            path: this.currentProvider.command.executable
          };
        } catch {
          return {
            available: false,
            error: `${this.currentProvider.command.executable} not found in PATH`
          };
        }
      }
    }

    return {
      available: false,
      error: 'No provider available'
    };
  }

  protected buildCommandArgs(options: DynamicProviderOptions): string[] {
    const args: string[] = [];

    // Add provider-specific arguments
    if (this.currentProvider) {
      args.push(...this.currentProvider.command.args);
    }

    // Add model if specified
    if (options.model && options.model !== 'auto') {
      args.push('--model', options.model);
    }

    return args;
  }

  protected async getCliExecutablePath(): Promise<string> {
    if (!this.currentProvider) {
      throw new Error('No provider available');
    }

    // Try to find the executable in PATH
    const { findExecutableInPath } = await import('../../../utils/shellPath');
    const path = await findExecutableInPath(this.currentProvider.command.executable);

    if (path) {
      return path;
    }

    // Fallback to the command name
    return this.currentProvider.command.executable;
  }

  protected parseCliOutput(data: string, panelId: string, sessionId: string) {
    return [{
      panelId,
      sessionId,
      type: 'stdout' as const,
      data,
      timestamp: new Date()
    }];
  }

  protected async initializeCliEnvironment(_options: DynamicProviderOptions): Promise<{ [key: string]: string }> {
    const env: { [key: string]: string } = {};

    if (!this.currentProvider) {
      return env;
    }

    const providerConfig = this.availableProviders.get(this.currentProvider.id);
    if (providerConfig && providerConfig.config) {
      // Add provider-specific environment variables
      Object.entries(providerConfig.config).forEach(([key, value]) => {
        env[`${this.currentProvider!.envPrefix}${key}`] = String(value);
      });
    }

    return env;
  }

  protected async cleanupCliResources(_sessionId: string): Promise<void> {
    // No specific cleanup needed for dynamic providers
  }

  protected async getCliEnvironment(options: DynamicProviderOptions): Promise<{ [key: string]: string }> {
    return this.initializeCliEnvironment(options);
  }

  // Required abstract method implementations
  async startPanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, ...args: unknown[]): Promise<void> {
    const options = args[0] as { providerId?: string; model?: string } | undefined;
    await this.spawnCliProcess({
      panelId,
      sessionId,
      worktreePath,
      prompt,
      providerId: options?.providerId,
      model: options?.model
    } as DynamicProviderOptions);
  }

  async continuePanel(panelId: string, sessionId: string, worktreePath: string, prompt: string, conversationHistory: unknown[], ...args: unknown[]): Promise<void> {
    const options = args[0] as { providerId?: string; model?: string } | undefined;
    await this.spawnCliProcess({
      panelId,
      sessionId,
      worktreePath,
      prompt,
      providerId: options?.providerId,
      model: options?.model
    } as DynamicProviderOptions);
  }

  async stopPanel(panelId: string): Promise<void> {
    const cliProcess = this.processes.get(panelId);
    if (cliProcess) {
      cliProcess.process.kill();
      this.processes.delete(panelId);
    }
  }

  async restartPanelWithHistory(panelId: string, sessionId: string, worktreePath: string, initialPrompt: string, conversationHistory: unknown[]): Promise<void> {
    await this.stopPanel(panelId);
    await this.startPanel(panelId, sessionId, worktreePath, initialPrompt, { conversationHistory });
  }

  // Provider-specific methods

  async getAvailableProviders(): Promise<DiscoveredProvider[]> {
    // Refresh provider discovery
    const providers = await this.providerDiscoveryService.discoverAvailableProviders();

    // Update cache
    this.availableProviders.clear();
    providers.forEach(provider => {
      this.availableProviders.set(provider.providerId, provider);
    });

    return Array.from(this.availableProviders.values());
  }

  async switchProvider(providerId: string): Promise<boolean> {
    const provider = PROVIDERS.find(p => p.id === providerId);
    const providerConfig = this.availableProviders.get(providerId);

    if (!provider || !providerConfig) {
      this.logger?.error(`Provider ${providerId} not available`);
      return false;
    }

    // Stop current processes if any are running
    const activeProcesses = Array.from(this.processes.values());
    for (const cliProcess of activeProcesses) {
      try {
        cliProcess.process.kill();
      } catch {
        this.logger?.warn(`Failed to kill process for panel ${cliProcess.panelId}`);
      }
    }
    this.processes.clear();

    // Update provider
    this.currentProvider = provider;
    this.logger?.info(`Switched to provider: ${provider.name}`);

    return true;
  }

  async getProviderModels(providerId?: string): Promise<string[]> {
    const targetProviderId = providerId || this.currentProvider?.id;
    if (!targetProviderId) {
      return [];
    }

    const providerConfig = this.availableProviders.get(targetProviderId);
    if (providerConfig) {
      return providerConfig.detectedModels;
    }

    const provider = PROVIDERS.find(p => p.id === targetProviderId);
    return provider?.models.map(m => m.id) || [];
  }

  getCurrentProvider(): ProviderConfig | undefined {
    return this.currentProvider;
  }

  getCurrentProviderConfig(): DiscoveredProvider | undefined {
    if (!this.currentProvider) {
      return undefined;
    }
    return this.availableProviders.get(this.currentProvider.id);
  }
}
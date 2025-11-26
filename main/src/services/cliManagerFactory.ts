import type { Logger } from '../utils/logger';
import type { ConfigManager } from './configManager';
import type { SessionManager } from './sessionManager';
import { AbstractCliManager } from './panels/cli/AbstractCliManager';
import { ClaudeCodeManager } from './panels/claude/claudeCodeManager';
import { 
  CliToolRegistry, 
  CliToolDefinition, 
  CliManagerFactory as ManagerFactoryFunction,
  CLI_OUTPUT_FORMATS 
} from './cliToolRegistry';

/**
 * Factory configuration for CLI manager creation
 */
export interface CliManagerFactoryConfig {
  /** Session manager instance */
  sessionManager: unknown;

  /** Logger instance */
  logger?: Logger;

  /** Configuration manager instance */
  configManager?: ConfigManager;

  /** Additional tool-specific options */
  additionalOptions?: Record<string, unknown>;

  /** Skip tool availability validation (useful for startup) */
  skipValidation?: boolean;
}

/**
 * Factory for creating CLI tool managers
 * 
 * This factory provides a centralized way to create and configure
 * CLI tool managers (Claude, Aider, Continue, etc.) with proper
 * dependency injection and configuration validation.
 */
export class CliManagerFactory {
  private static instance: CliManagerFactory | null = null;
  private readonly registry: CliToolRegistry;

  private constructor(
    private logger?: Logger,
    private configManager?: ConfigManager
  ) {
    this.registry = CliToolRegistry.getInstance(logger, configManager);
    this.registerBuiltInTools();
  }

  /**
   * Get the singleton instance of the CLI manager factory
   */
  public static getInstance(logger?: Logger, configManager?: ConfigManager): CliManagerFactory {
    if (!CliManagerFactory.instance) {
      CliManagerFactory.instance = new CliManagerFactory(logger, configManager);
    }
    return CliManagerFactory.instance;
  }

  /**
   * Create a CLI manager for the specified tool
   */
  public async createManager(
    toolId: string,
    config: CliManagerFactoryConfig
  ): Promise<AbstractCliManager> {
    try {
      this.validateConfig(config);

      const manager = await this.registry.createManager(
        toolId,
        config.sessionManager as SessionManager,
        config.additionalOptions,
        config.skipValidation
      );

      this.logger?.info(`[CliManagerFactory] Created ${toolId} manager successfully`);
      return manager;
    } catch (error) {
      this.logger?.error(`[CliManagerFactory] Failed to create ${toolId} manager:`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get an existing manager instance
   */
  public getManager(toolId: string): AbstractCliManager | undefined {
    return this.registry.getManager(toolId);
  }

  /**
   * Get the default CLI manager (first available tool)
   */
  public async getDefaultManager(config: CliManagerFactoryConfig): Promise<AbstractCliManager> {
    const defaultTool = await this.registry.getDefaultTool();
    
    if (!defaultTool) {
      throw new Error('No CLI tools are available on this system');
    }

    return this.createManager(defaultTool.id, config);
  }

  /**
   * Get all available CLI tools
   */
  public async getAvailableTools(): Promise<CliToolDefinition[]> {
    return this.registry.getAvailableTools();
  }

  /**
   * Check if a specific tool is available
   */
  public async isToolAvailable(toolId: string): Promise<boolean> {
    const result = await this.registry.checkToolAvailability(toolId);
    return result.available;
  }

  /**
   * Discover all available CLI tools on the system
   */
  public async discoverTools() {
    return this.registry.discoverTools();
  }

  /**
   * Register a custom CLI tool
   */
  public registerTool(definition: CliToolDefinition): void {
    this.registry.registerTool(definition);
  }

  /**
   * Clear availability cache
   */
  public clearCache(toolId?: string): void {
    this.registry.clearAvailabilityCache(toolId);
  }

  /**
   * Shutdown all managers
   */
  public async shutdown(): Promise<void> {
    await this.registry.shutdown();
    CliManagerFactory.instance = null;
  }

  /**
   * Register built-in CLI tools
   */
  private registerBuiltInTools(): void {
    // Register Claude Code
    this.registerClaudeTool();
    
    // Future tools can be registered here:
    // this.registerAiderTool();
    // this.registerContinueTool();
    // this.registerCursorTool();
    
    this.logger?.info('[CliManagerFactory] Registered built-in CLI tools');
  }

  /**
   * Register Claude Code CLI tool
   */
  private registerClaudeTool(): void {
    const claudeManagerFactory: ManagerFactoryFunction = (
      sessionManager: unknown,
      logger?: Logger,
      configManager?: ConfigManager,
      additionalOptions?: unknown
    ) => {
      // Extract Claude-specific options
      const options = additionalOptions as Record<string, unknown> | undefined;
      const permissionIpcPath = options?.permissionIpcPath || null;
      
      return new ClaudeCodeManager(
        sessionManager as SessionManager,
        logger,
        configManager,
        (typeof permissionIpcPath === 'string' ? permissionIpcPath : null) as string | null
      );
    };

    const claudeDefinition: CliToolDefinition = {
      id: 'claude',
      name: 'Claude Code',
      description: 'Anthropic\'s Claude AI coding assistant with advanced tool calling capabilities',
      version: '1.0.0',
      capabilities: {
        supportsResume: true,
        supportsMultipleModels: true,
        supportsPermissions: true,
        supportsFileOperations: true,
        supportsGitIntegration: true,
        supportsSystemPrompts: true,
        supportsStructuredOutput: true,
        outputFormats: [
          CLI_OUTPUT_FORMATS.TEXT,
          CLI_OUTPUT_FORMATS.JSON,
          CLI_OUTPUT_FORMATS.STREAM_JSON
        ],
        supportedPanelTypes: ['claude']
      },
      config: {
        requiredEnvVars: [],
        optionalEnvVars: [
          'ANTHROPIC_API_KEY',
          'MCP_SOCKET_PATH',
          'MCP_DEBUG'
        ],
        requiredConfigKeys: [],
        optionalConfigKeys: [
          'claudeExecutablePath',
          'defaultPermissionMode',
          'systemPromptAppend',
          'verbose'
        ],
        defaultExecutable: 'claude',
        alternativeExecutables: ['claude-code', 'claude.exe'],
        minimumVersion: undefined // Claude doesn't expose version in a standard way
      },
      managerFactory: claudeManagerFactory
    };

    this.registry.registerTool(claudeDefinition, {
      priority: 100, // Highest priority as it's the primary tool
      validateOnRegister: false // Skip validation on startup for performance
    });
  }

  /**
   * Future: Register Aider CLI tool
   * 
   * Example of how other tools would be registered:
   */
  private registerAiderTool(): void {
    // Implementation would be similar to Claude but with Aider-specific capabilities
    // const aiderDefinition: CliToolDefinition = { ... };
    // this.registry.registerTool(aiderDefinition);
  }

  /**
   * Validate factory configuration
   */
  private validateConfig(config: CliManagerFactoryConfig): void {
    if (!config.sessionManager) {
      throw new Error('Session manager is required for CLI manager creation');
    }

    // Additional validation can be added here
  }
}

/**
 * Convenience function to get the factory instance
 */
export const getCliManagerFactory = (logger?: Logger, configManager?: ConfigManager) => 
  CliManagerFactory.getInstance(logger, configManager);

/**
 * Convenience function to create a Claude manager (backward compatibility)
 */
export const createClaudeManager = async (config: CliManagerFactoryConfig): Promise<AbstractCliManager> => {
  const factory = CliManagerFactory.getInstance(config.logger, config.configManager);
  return factory.createManager('claude', config);
};

/**
 * Example of how future tools would be created:
 */
export const createAiderManager = async (config: CliManagerFactoryConfig): Promise<AbstractCliManager> => {
  const factory = CliManagerFactory.getInstance(config.logger, config.configManager);
  return factory.createManager('aider', config);
};

export const createContinueManager = async (config: CliManagerFactoryConfig): Promise<AbstractCliManager> => {
  const factory = CliManagerFactory.getInstance(config.logger, config.configManager);
  return factory.createManager('continue', config);
};
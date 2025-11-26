import { EventEmitter } from 'events';
import type { Logger } from '../utils/logger';
import type { ConfigManager } from './configManager';
import { AbstractCliManager } from './panels/cli/AbstractCliManager';
import type { SessionManager } from './sessionManager';

/**
 * Defines the capabilities and features of a CLI tool
 */
export interface CliToolDefinition {
  /** Unique identifier for the CLI tool (e.g., 'claude', 'aider', 'continue') */
  id: string;
  
  /** Display name for the tool */
  name: string;
  
  /** Short description of the tool */
  description: string;
  
  /** Version of the tool definition schema */
  version: string;
  
  /** Tool capabilities and features */
  capabilities: CliToolCapabilities;
  
  /** Configuration requirements */
  config: CliToolConfig;
  
  /** Factory function to create the CLI manager instance */
  managerFactory: CliManagerFactory;
}

/**
 * Defines what a CLI tool can do
 */
export interface CliToolCapabilities {
  /** Can handle conversation continuations */
  supportsResume: boolean;
  
  /** Can work with multiple models */
  supportsMultipleModels: boolean;
  
  /** Supports permission management */
  supportsPermissions: boolean;
  
  /** Can handle file operations */
  supportsFileOperations: boolean;
  
  /** Can work in git repositories */
  supportsGitIntegration: boolean;
  
  /** Supports custom system prompts */
  supportsSystemPrompts: boolean;
  
  /** Can generate structured output */
  supportsStructuredOutput: boolean;
  
  /** Available output formats */
  outputFormats: CliOutputFormat[];
  
  /** Panel types this tool can create */
  supportedPanelTypes: string[];
}

/**
 * Configuration requirements for a CLI tool
 */
export interface CliToolConfig {
  /** Required environment variables */
  requiredEnvVars: string[];
  
  /** Optional environment variables */
  optionalEnvVars: string[];
  
  /** Required configuration keys */
  requiredConfigKeys: string[];
  
  /** Optional configuration keys */
  optionalConfigKeys: string[];
  
  /** Default executable name */
  defaultExecutable: string;
  
  /** Alternative executable names to search for */
  alternativeExecutables: string[];
  
  /** Minimum version requirement (if detectable) */
  minimumVersion?: string;
}

/**
 * Output format support
 */
export interface CliOutputFormat {
  /** Format identifier */
  id: string;
  
  /** Human-readable name */
  name: string;
  
  /** Whether this format is structured (JSON) */
  isStructured: boolean;
  
  /** MIME type if applicable */
  mimeType?: string;
}

/**
 * Factory function type for creating CLI managers
 */
export type CliManagerFactory = (
  sessionManager: SessionManager | null,
  logger?: Logger,
  configManager?: ConfigManager,
  additionalOptions?: Record<string, unknown>
) => AbstractCliManager;

/**
 * Options for tool registration
 */
export interface ToolRegistrationOptions {
  /** Whether to override existing registration */
  override?: boolean;
  
  /** Whether to validate tool availability on registration */
  validateOnRegister?: boolean;
  
  /** Custom priority for tool selection */
  priority?: number;
}

/**
 * Result of tool availability check
 */
export interface ToolAvailabilityResult {
  /** Whether the tool is available */
  available: boolean;
  
  /** Error message if not available */
  error?: string;
  
  /** Detected version if available */
  version?: string;
  
  /** Path to executable if found */
  path?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool discovery result
 */
export interface ToolDiscoveryResult {
  /** Tool ID */
  toolId: string;
  
  /** Whether tool was discovered */
  found: boolean;
  
  /** Availability check result */
  availability: ToolAvailabilityResult;
  
  /** Discovery method used */
  method: 'path' | 'config' | 'registry' | 'manual';
}

/**
 * Central registry for managing CLI tools in Crystal
 * 
 * This singleton class manages the registration, discovery, and instantiation
 * of CLI tools (Claude, Aider, Continue, etc.) providing a unified interface
 * for creating and managing CLI tool instances.
 */
export class CliToolRegistry extends EventEmitter {
  private static instance: CliToolRegistry | null = null;
  private readonly tools: Map<string, CliToolDefinition> = new Map();
  private readonly managers: Map<string, AbstractCliManager> = new Map();
  private readonly availabilityCache: Map<string, { result: ToolAvailabilityResult; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor(
    private logger?: Logger,
    private configManager?: ConfigManager
  ) {
    super();
    this.setMaxListeners(50);
    this.logger?.info('[CliToolRegistry] Initialized CLI tool registry');
  }

  /**
   * Get the singleton instance of the CLI tool registry
   */
  public static getInstance(logger?: Logger, configManager?: ConfigManager): CliToolRegistry {
    if (!CliToolRegistry.instance) {
      CliToolRegistry.instance = new CliToolRegistry(logger, configManager);
    }
    return CliToolRegistry.instance;
  }

  /**
   * Register a CLI tool with the registry
   */
  public registerTool(definition: CliToolDefinition, options: ToolRegistrationOptions = {}): void {
    const { override = false, validateOnRegister = false, priority = 0 } = options;

    if (this.tools.has(definition.id) && !override) {
      throw new Error(`CLI tool '${definition.id}' is already registered. Use override: true to replace.`);
    }

    // Validate tool definition
    this.validateToolDefinition(definition);

    // Store tool definition with priority
    const extendedDefinition = { ...definition, priority };
    this.tools.set(definition.id, extendedDefinition);

    this.logger?.info(`[CliToolRegistry] Registered CLI tool: ${definition.name} (${definition.id})`);

    // Optionally validate tool availability on registration
    if (validateOnRegister) {
      this.checkToolAvailability(definition.id)
        .then(result => {
          if (result.available) {
            this.logger?.info(`[CliToolRegistry] Tool '${definition.id}' is available: ${result.version || 'version unknown'}`);
          } else {
            this.logger?.warn(`[CliToolRegistry] Tool '${definition.id}' is not available: ${result.error}`);
          }
        })
        .catch(error => {
          this.logger?.error(`[CliToolRegistry] Failed to validate tool '${definition.id}':`, error);
        });
    }

    // Emit registration event
    this.emit('tool:registered', { toolId: definition.id, definition: extendedDefinition });
  }

  /**
   * Unregister a CLI tool from the registry
   */
  public unregisterTool(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return false;
    }

    // Clean up any active managers
    const manager = this.managers.get(toolId);
    if (manager) {
      manager.killAllProcesses().catch(error => {
        this.logger?.error(`[CliToolRegistry] Error killing processes for unregistered tool '${toolId}':`, error);
      });
      this.managers.delete(toolId);
    }

    // Clear availability cache
    this.availabilityCache.delete(toolId);

    // Remove from registry
    this.tools.delete(toolId);

    this.logger?.info(`[CliToolRegistry] Unregistered CLI tool: ${toolId}`);
    this.emit('tool:unregistered', { toolId });

    return true;
  }

  /**
   * Get a CLI tool definition by ID
   */
  public getTool(toolId: string): CliToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all registered CLI tools
   */
  public getAllTools(): CliToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get available CLI tools (registered and available on system)
   */
  public async getAvailableTools(): Promise<CliToolDefinition[]> {
    const availableTools: CliToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      const availability = await this.checkToolAvailability(tool.id);
      if (availability.available) {
        availableTools.push(tool);
      }
    }

    return availableTools;
  }

  /**
   * Create a CLI manager instance for a specific tool
   */
  public async createManager(
    toolId: string,
    sessionManager: SessionManager,
    additionalOptions?: Record<string, unknown>,
    skipValidation = false
  ): Promise<AbstractCliManager> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`CLI tool '${toolId}' is not registered`);
    }

    // Check if we already have a manager instance
    const existingManager = this.managers.get(toolId);
    if (existingManager) {
      this.logger?.verbose(`[CliToolRegistry] Reusing existing manager for tool '${toolId}'`);
      return existingManager;
    }

    // Validate tool availability (unless skipValidation is true)
    if (!skipValidation) {
      const availability = await this.checkToolAvailability(toolId);
      if (!availability.available) {
        throw new Error(`CLI tool '${toolId}' is not available: ${availability.error}`);
      }
    }

    // Create new manager instance
    try {
      const manager = tool.managerFactory(
        sessionManager,
        this.logger,
        this.configManager,
        additionalOptions
      );

      // Store manager instance
      this.managers.set(toolId, manager);

      this.logger?.info(`[CliToolRegistry] Created manager for CLI tool: ${tool.name} (${toolId})`);
      this.emit('manager:created', { toolId, manager });

      return manager;
    } catch (error) {
      this.logger?.error(`[CliToolRegistry] Failed to create manager for tool '${toolId}':`, error instanceof Error ? error : undefined);
      throw new Error(`Failed to create manager for CLI tool '${toolId}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get an existing manager instance
   */
  public getManager(toolId: string): AbstractCliManager | undefined {
    return this.managers.get(toolId);
  }

  /**
   * Check if a CLI tool is available on the system
   */
  public async checkToolAvailability(toolId: string): Promise<ToolAvailabilityResult> {
    // Check cache first
    const cached = this.availabilityCache.get(toolId);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      this.logger?.verbose(`[CliToolRegistry] Using cached availability for tool '${toolId}'`);
      return cached.result;
    }

    const tool = this.tools.get(toolId);
    if (!tool) {
      const result: ToolAvailabilityResult = {
        available: false,
        error: `Tool '${toolId}' is not registered`
      };
      return result;
    }

    try {
      // Create a temporary manager instance to test availability
      const tempManager = tool.managerFactory(null, this.logger, this.configManager);
      // Access the protected method via type assertion as a temporary workaround
      const result = await (tempManager as AbstractCliManager & { getCachedAvailability(): Promise<ToolAvailabilityResult> }).getCachedAvailability();

      // Cache the result
      this.availabilityCache.set(toolId, {
        result,
        timestamp: Date.now()
      });

      this.logger?.verbose(`[CliToolRegistry] Checked availability for tool '${toolId}': ${result.available ? 'available' : 'not available'}`);
      return result;
    } catch (error) {
      const result: ToolAvailabilityResult = {
        available: false,
        error: error instanceof Error ? error.message : String(error)
      };

      // Cache negative results with shorter TTL
      this.availabilityCache.set(toolId, {
        result,
        timestamp: Date.now() - (this.CACHE_TTL * 0.8) // Cache for 20% of normal time
      });

      return result;
    }
  }

  /**
   * Discover available CLI tools on the system
   */
  public async discoverTools(): Promise<ToolDiscoveryResult[]> {
    const results: ToolDiscoveryResult[] = [];

    for (const tool of this.tools.values()) {
      const availability = await this.checkToolAvailability(tool.id);
      
      results.push({
        toolId: tool.id,
        found: availability.available,
        availability,
        method: 'registry'
      });
    }

    this.logger?.info(`[CliToolRegistry] Discovered ${results.filter(r => r.found).length}/${results.length} available CLI tools`);
    this.emit('tools:discovered', { results });

    return results;
  }

  /**
   * Clear availability cache for all tools or a specific tool
   */
  public clearAvailabilityCache(toolId?: string): void {
    if (toolId) {
      this.availabilityCache.delete(toolId);
      this.logger?.verbose(`[CliToolRegistry] Cleared availability cache for tool '${toolId}'`);
    } else {
      this.availabilityCache.clear();
      this.logger?.verbose(`[CliToolRegistry] Cleared all availability cache`);
    }
  }

  /**
   * Get the default CLI tool (first available tool with highest priority)
   */
  public async getDefaultTool(): Promise<CliToolDefinition | null> {
    const tools = Array.from(this.tools.values()).sort((a, b) => 
      ((b as CliToolDefinition & { priority?: number }).priority || 0) - ((a as CliToolDefinition & { priority?: number }).priority || 0)
    );

    for (const tool of tools) {
      const availability = await this.checkToolAvailability(tool.id);
      if (availability.available) {
        return tool;
      }
    }

    return null;
  }

  /**
   * Shutdown all managers and clean up resources
   */
  public async shutdown(): Promise<void> {
    this.logger?.info(`[CliToolRegistry] Shutting down ${this.managers.size} CLI tool managers`);

    const shutdownPromises = Array.from(this.managers.entries()).map(async ([toolId, manager]) => {
      try {
        await manager.killAllProcesses();
        this.logger?.verbose(`[CliToolRegistry] Shut down manager for tool '${toolId}'`);
      } catch (error) {
        this.logger?.error(`[CliToolRegistry] Error shutting down manager for tool '${toolId}':`, error instanceof Error ? error : undefined);
      }
    });

    await Promise.all(shutdownPromises);
    this.managers.clear();
    this.availabilityCache.clear();

    this.emit('registry:shutdown');
    this.logger?.info(`[CliToolRegistry] Registry shutdown complete`);
  }

  /**
   * Validate a tool definition for completeness and consistency
   */
  private validateToolDefinition(definition: CliToolDefinition): void {
    const required = ['id', 'name', 'description', 'version', 'capabilities', 'config', 'managerFactory'];
    
    for (const field of required) {
      if (!(field in definition) || definition[field as keyof CliToolDefinition] == null) {
        throw new Error(`CLI tool definition missing required field: ${field}`);
      }
    }

    if (typeof definition.managerFactory !== 'function') {
      throw new Error(`CLI tool definition managerFactory must be a function`);
    }

    if (!definition.config.defaultExecutable) {
      throw new Error(`CLI tool definition must specify a defaultExecutable`);
    }

    // Validate capabilities
    const capabilities = definition.capabilities;
    if (typeof capabilities !== 'object') {
      throw new Error(`CLI tool capabilities must be an object`);
    }

    // Validate output formats
    if (!Array.isArray(capabilities.outputFormats)) {
      throw new Error(`CLI tool capabilities.outputFormats must be an array`);
    }

    for (const format of capabilities.outputFormats) {
      if (!format.id || !format.name || typeof format.isStructured !== 'boolean') {
        throw new Error(`Invalid output format definition: ${JSON.stringify(format)}`);
      }
    }
  }
}

/**
 * Standard CLI output formats
 */
export const CLI_OUTPUT_FORMATS = {
  TEXT: { id: 'text', name: 'Plain Text', isStructured: false, mimeType: 'text/plain' },
  JSON: { id: 'json', name: 'JSON', isStructured: true, mimeType: 'application/json' },
  STREAM_JSON: { id: 'stream-json', name: 'Streaming JSON', isStructured: true, mimeType: 'application/x-ndjson' },
  MARKDOWN: { id: 'markdown', name: 'Markdown', isStructured: false, mimeType: 'text/markdown' },
  YAML: { id: 'yaml', name: 'YAML', isStructured: true, mimeType: 'application/x-yaml' }
} as const;

// Export default instance getter for convenience
export const getCliToolRegistry = () => CliToolRegistry.getInstance();
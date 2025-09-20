# Multi-Provider Support Plan for Crystal

## Objective

Extend Crystal to support multiple AI providers (Claude, Z.ai, and others) with automatic configuration detection from `~/.claude/settings.json`, while maintaining backward compatibility and leveraging existing infrastructure.

## 1. Current State Analysis

### ✅ Existing Infrastructure to Leverage

- **Tool Panel System**: `main/src/services/panelManager.ts` - already supports multiple panel types
- **Abstract CLI Manager**: `main/src/services/panels/cli/AbstractCliManager.ts` - base class for CLI tool management
- **Configuration System**: `main/src/services/configManager.ts` - handles priority-based config loading
- **Token Tracking**: `databaseService.getSessionTokenUsage()` in `main/src/ipc/session.ts:1697-1814`
- **Session Management**: Complete session lifecycle with git worktrees
- **IPC Communication**: Robust main/renderer communication
- **UI Components**: Modular React components for dialogs and panels

### 🎯 Current Provider Implementations

#### Claude Code (`main/src/services/panels/claude/claudeCodeManager.ts`)

```typescript
class ClaudeCodeManager extends AbstractCliManager {
  protected buildCommandArgs(options: ClaudeSpawnOptions): string[] {
    const args = ['--verbose', '--output-format', 'stream-json'];
    if (model && model !== 'auto') {
      args.push('--model', model);
    }
    return args;
  }
  // ... Claude-specific implementation with claude CLI
}
```

#### Codex (`main/src/services/panels/codex/codexManager.ts`)

```typescript
class CodexManager extends AbstractCliManager {
  protected buildCommandArgs(options: CodexSpawnOptions): string[] {
    const args = ['exec', '--json'];  // Different CLI: codex exec
    if (model && model !== 'auto') {
      args.push('-m', model);  // Different flag: -m vs --model
    }
    return args;
  }
  // ... Codex-specific implementation with codex CLI
}
```

#### Key Insight: Different CLI Tools
- **Claude Code**: Uses `claude` CLI with `--model` flag
- **Codex**: Uses `codex` CLI with `-m` flag
- **Z.ai**: Uses `claude` CLI (same as Claude) but with different endpoints/models

### 📊 Configuration Priority Order (Already Implemented)

1. `~/.claude/settings.json` (global user settings)
2. `~/.claude/settings.local.json` (local user settings)
3. `./.claude/settings.json` (project-specific settings)
4. `./.claude/settings.local.json` (project-specific local settings)
5. `~/.claude.json` (main global config)

## 2. Target Architecture

### 2.1 Provider Configuration System

**File**: `shared/types/providerConfig.ts` (new)

```typescript
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
    prices: Record<string, ModelPricing>;
  };
}

export interface ModelPricing {
  inputPricePer1m: number;
  outputPricePer1m: number;
  freeTier?: {
    amount: number;
    expires?: Date;
    description: string;
  };
}
```

**File**: `main/src/data/providers.ts` (new)

```typescript
import { ProviderConfig } from '../../../shared/types/providerConfig';

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: 'Anthropic\'s Claude AI coding assistant',
    envPrefix: 'ANTHROPIC_',
    models: [
      { id: 'claude-3-opus-20240229', name: 'Opus', default: true, description: 'Maximum capability' },
      { id: 'claude-3-5-sonnet', name: 'Sonnet', default: false, description: 'Balanced performance' },
      { id: 'claude-3-haiku-20240307', name: 'Haiku', default: false, description: 'Fastest responses' }
    ],
    capabilities: {
      supportsResume: true,
      supportsMultipleModels: true,
      supportsFileOperations: true,
      supportsGitIntegration: true,
      supportsSystemPrompts: true,
      outputFormats: ['stream-json']
    },
    command: {
      executable: 'claude',
      args: ['--verbose', '--output-format', 'stream-json']
    },
    ui: {
      configComponent: 'ClaudeCodeConfig',
      statsComponent: 'SessionStats'
    },
    costTracking: {
      enabled: true,
      currency: 'USD',
      prices: {
        'claude-3-opus-20240229': { inputPricePer1m: 15.00, outputPricePer1m: 75.00 },
        'claude-3-5-sonnet': { inputPricePer1m: 3.00, outputPricePer1m: 15.00 },
        'claude-3-haiku-20240307': { inputPricePer1m: 0.25, outputPricePer1m: 1.25 }
      }
    }
  },
  {
    id: 'zai',
    name: 'Z.ai',
    description: 'Z.ai Claude-compatible API (uses claude CLI with different endpoint)',
    envPrefix: 'ZAI_',
    models: [
      { id: 'glm-4.5', name: 'GLM-4.5', default: true, description: 'High capability model' },
      { id: 'glm-4.5-air', name: 'GLM-4.5-Air', default: false, description: 'Fast and efficient' }
    ],
    capabilities: {
      supportsResume: true,
      supportsMultipleModels: true,
      supportsFileOperations: true,
      supportsGitIntegration: true,
      supportsSystemPrompts: true,
      outputFormats: ['stream-json']
    },
    command: {
      executable: 'claude', // Same CLI as Claude, different endpoint/config
      args: ['--verbose', '--output-format', 'stream-json']
    },
    ui: {
      configComponent: 'ClaudeCodeConfig', // Reuse existing UI
      statsComponent: 'SessionStats'
    },
    costTracking: {
      enabled: true,
      currency: 'USD',
      prices: {
        'glm-4.5': {
          inputPricePer1m: 0.6,
          outputPricePer1m: 2.2,
        },
        'glm-4.5-air': {
          inputPricePer1m: 0.2,
          outputPricePer1m: 1.1,
        }
      }
    }
  }
];
```

### 2.2 Provider Discovery Service

**File**: `main/src/services/providerDiscoveryService.ts` (new)

```typescript
export class ProviderDiscoveryService {
  private configPriority = [
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(os.homedir(), '.claude', 'settings.local.json'),
    path.join(process.cwd(), '.claude', 'settings.json'),
    path.join(process.cwd(), '.claude', 'settings.local.json'),
    path.join(os.homedir(), '.claude.json')
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
      } catch (error) {
        // File doesn't exist or can't be read, continue to next
        continue;
      }
    }

    return { isAvailable: false };
  }

  private extractEnvironmentVariables(config: any, prefix: string): ProviderEnvironment {
    const env: ProviderEnvironment = {};

    Object.keys(config.env || {}).forEach(key => {
      if (key.startsWith(prefix)) {
        const cleanKey = key.substring(prefix.length);
        env[cleanKey] = config.env[key];
      }
    });

    return env;
  }

  private detectModels(env: ProviderEnvironment, provider: ProviderConfig): string[] {
    if (env.MODEL && provider.models.find(m => m.id === env.MODEL)) {
      return [env.MODEL];
    }

    // Return all available models as fallback
    return provider.models.map(m => m.id);
  }
}
```

### 2.3 Dynamic Provider Manager

**File**: `main/src/services/panels/dynamicProviderManager.ts` (new)

```typescript
export class DynamicProviderManager extends AbstractCliManager {
  constructor(
    sessionManager: any,
    logger?: Logger,
    configManager?: ConfigManager,
    private providerConfig: ProviderConfig,
    private providerEnv: ProviderEnvironment
  ) {
    super(sessionManager, logger, configManager);
  }

  protected getCliToolName(): string {
    return this.providerConfig.name;
  }

  protected async testCliAvailability(): Promise<{ available: boolean; error?: string; version?: string; path?: string }> {
    const executable = this.providerConfig.command.executable;
    // Test using provider-specific environment
    const env = { ...process.env, ...this.providerEnv };

    try {
      const result = execSync(`"${executable}" --version`, {
        encoding: 'utf8',
        env,
        timeout: 5000
      });
      return { available: true, version: result.trim(), path: executable };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  protected buildCommandArgs(options: any): string[] {
    const args = [...this.providerConfig.command.args];

    // Add model selection if specified
    if (options.model && options.model !== 'auto') {
      // Different providers use different model flags
      if (this.providerConfig.id === 'codex') {
        args.push('-m', options.model);
      } else {
        args.push('--model', options.model);
      }
    }

    // Add provider-specific environment overrides (for Claude-compatible providers like Z.ai)
    if (this.providerEnv.BASE_URL) {
      args.push('--base-url', this.providerEnv.BASE_URL);
    }

    return args;
  }

  protected async initializeCliEnvironment(options: any): Promise<{ [key: string]: string }> {
    return {
      ...process.env,
      ...this.providerEnv,
      // Provider-specific environment setup
      ...(this.providerConfig.id === 'anthropic' ? { ANTHROPIC_API_KEY: this.providerEnv.API_KEY } : {}),
      ...(this.providerConfig.id === 'zai' ? { ZAI_API_KEY: this.providerEnv.API_KEY } : {})
    };
  }
}
```

### 2.4 Enhanced CLI Manager Factory

**File**: `main/src/services/cliManagerFactory.ts` (extend existing)

```typescript
export class CliManagerFactory {
  private providerDiscovery: ProviderDiscoveryService;

  constructor(logger?: Logger, configManager?: ConfigManager) {
    this.providerDiscovery = new ProviderDiscoveryService();
    this.registry = CliToolRegistry.getInstance(logger, configManager);
    this.registerBuiltInTools();
    this.registerDynamicProviders();
  }

  private async registerDynamicProviders(): Promise<void> {
    try {
      const availableProviders = await this.providerDiscovery.discoverAvailableProviders();

      for (const providerInfo of availableProviders) {
        const providerConfig = PROVIDERS.find(p => p.id === providerInfo.providerId);
        if (!providerConfig) continue;

        const managerFactory: ManagerFactoryFunction = (
          sessionManager: any,
          logger?: Logger,
          configManager?: ConfigManager
        ) => {
          return new DynamicProviderManager(
            sessionManager,
            logger,
            configManager,
            providerConfig,
            providerInfo.config
          );
        };

        const definition: CliToolDefinition = {
          id: providerConfig.id,
          name: providerConfig.name,
          description: providerConfig.description,
          capabilities: providerConfig.capabilities,
          config: {
            requiredEnvVars: [`${providerConfig.envPrefix}API_KEY`],
            optionalEnvVars: [`${providerConfig.envPrefix}BASE_URL`],
            defaultExecutable: providerConfig.command.executable
          },
          managerFactory
        };

        this.registry.registerTool(definition);
        this.logger?.info(`[CliManagerFactory] Registered dynamic provider: ${providerConfig.name}`);
      }
    } catch (error) {
      this.logger?.error('[CliManagerFactory] Failed to register dynamic providers:', error);
    }
  }
}
```

### 2.5 Enhanced Session Management

**File**: `main/src/database/migrations/005_add_provider_support.sql` (new)

```sql
-- Add provider information to sessions table
ALTER TABLE sessions ADD COLUMN provider_id TEXT DEFAULT 'anthropic';
ALTER TABLE sessions ADD COLUMN provider_model TEXT DEFAULT 'claude-3-opus-20240229';
ALTER TABLE sessions ADD COLUMN provider_config TEXT; -- JSON string of provider-specific config

-- Add provider information to panels table
ALTER TABLE tool_panels ADD COLUMN provider_id TEXT DEFAULT 'anthropic';
ALTER TABLE tool_panels ADD COLUMN provider_model TEXT DEFAULT 'claude-3-opus-20240229';

-- Create index for provider queries
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_panels_provider ON tool_panels(provider_id);
```

## 3. Implementation Plan

### Phase 1: Core Provider Infrastructure (2-3 days)

- [ ] Create `shared/types/providerConfig.ts`
- [ ] Create `main/src/data/providers.ts` with provider definitions
- [ ] Create `main/src/services/providerDiscoveryService.ts`
- [ ] Create `main/src/services/panels/dynamicProviderManager.ts`
- [ ] Extend `CliManagerFactory` to support dynamic providers
- [ ] Database migration 005

### Phase 2: Provider Detection and Configuration (1-2 days)

- [ ] Implement automatic provider discovery from ~/.claude/settings.json
- [ ] Add provider selection to session creation dialog
- [ ] Update session creation flow to use selected provider
- [ ] Test provider configuration persistence

### Phase 3: UI Integration (1-2 days)

- [ ] Update `CreateSessionDialog.tsx` to show available providers
- [ ] Add provider-specific model selection UI
- [ ] Update session stats to show provider-specific information
- [ ] Add provider configuration to settings

### Phase 4: Testing and Documentation (1 day)

- [ ] Test all providers work correctly
- [ ] Test provider switching and compatibility
- [ ] Update documentation (CLAUDE.md)
- [ ] Create user guide for multi-provider setup

## 4. Key Integration Points

### Backend Modifications

- **`main/src/services/sessionManager.ts`**: Add provider/model to session creation
- **`main/src/ipc/session.ts`**: Extend session responses with provider info
- **`main/src/database/models.ts`**: Add provider fields to session types
- **`main/src/services/panelManager.ts`**: Support provider-specific panel creation

### Frontend Modifications

- **`frontend/src/components/dialog/CreateSessionDialog.tsx`**: Provider selection UI
- **`frontend/src/components/panels/ai/AbstractAIPanel.tsx`**: Provider-aware panel logic
- **`frontend/src/stores/sessionStore.ts`**: Track provider information
- **`frontend/src/components/Settings.tsx`**: Provider configuration management

## 5. Benefits and Capabilities

### Multi-Provider Support

- **Automatic Detection**: Discovers available providers from ~/.claude/settings.json
- **Dynamic Loading**: Providers are loaded at runtime based on availability
- **Consistent Interface**: All providers use the same abstract interface via AbstractCliManager
- **CLI-Specific Handling**: Different CLI tools (claude vs codex) with proper flag mapping
- **Claude-Compatible Support**: Special handling for providers using claude CLI with different endpoints (like Z.ai)
- **Provider-Specific Features**: Each provider can have unique capabilities and configurations

### Cost Management (Secondary Feature)

- **Provider-Specific Pricing**: Different pricing models per provider
- **Free Tier Support**: Automatic detection and application of free tiers
- **Cost Tracking**: Session-level cost tracking across providers
- **Budget Alerts**: Optional cost monitoring and warnings

### Extensibility

- **Easy Addition**: New providers can be added by configuration only
- **Plugin Architecture**: Providers can be loaded as plugins
- **Version Management**: Support for different provider API versions
- **Fallback Support**: Graceful handling of provider unavailability

## 6. Risk Mitigation

### Backward Compatibility

- All existing sessions continue to work
- Default provider remains Anthropic Claude
- Existing configuration files remain valid
- No breaking changes to public APIs

### Performance Considerations

- Provider discovery happens once at startup
- Lazy loading of provider-specific components
- Caching of provider configurations
- Minimal overhead for provider switching

### Error Handling

- Graceful degradation when providers are unavailable
- Clear error messages for configuration issues
- Automatic fallback to default provider
- Validation of provider configurations

## 7. Success Metrics

- ✅ Support for multiple providers (Claude, Z.ai, others)
- ✅ Automatic detection from ~/.claude/settings.json
- ✅ Seamless provider switching in UI
- ✅ Provider-specific model selection
- ✅ Cost tracking per provider (where applicable)
- ✅ Backward compatibility maintained
- ✅ No performance regression

## 8. Next Steps

1. **Phase 1 Setup**: Begin with core provider infrastructure
2. **Testing Strategy**: Test each provider independently
3. **User Feedback**: Get early feedback on provider selection UX
4. **Documentation**: Update user guides with multi-provider setup
5. **Community Testing**: Enable beta testing for new providers

## 9. Future Enhancements

- Provider-specific tool panels
- Advanced cost management and budgeting
- Provider performance comparison
- Automatic provider selection based on task type
- Community-contributed provider configurations

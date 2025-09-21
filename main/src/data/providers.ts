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
    envPrefix: 'ANTHROPIC_',
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
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
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI API for GPT models and Codex (uses existing Codex infrastructure)',
    envPrefix: 'OPENAI_',
    models: [
      { id: 'gpt-5', name: 'GPT-5', default: true, description: 'Most capable model' },
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', default: false, description: 'Latest GPT-5 model for code' },
      { id: 'gpt-4', name: 'GPT-4', default: false, description: 'Fast and cost-effective' }
    ],
    capabilities: {
      supportsResume: true, // Codex infrastructure supports resume
      supportsMultipleModels: true,
      supportsFileOperations: true,
      supportsGitIntegration: false,
      supportsSystemPrompts: true,
      outputFormats: ['json']
    },
    command: {
      executable: 'codex', // This will be handled by the existing CodexManager
      args: ['exec', '--json'] // Standard Codex arguments
    },
    ui: {
      configComponent: 'CodexConfig', // Use existing Codex config component
      statsComponent: 'SessionStats'
    },
    costTracking: {
      enabled: true,
      currency: 'USD',
      prices: {
        'gpt-5': { inputPricePer1m: 1.25, outputPricePer1m: 10 },
        'gpt-5-codex': { inputPricePer1m: 1.25, outputPricePer1m: 10 },
        'gpt-4.1': { inputPricePer1m: 2, outputPricePer1m: 8 },
        'gpt-4': { inputPricePer1m: 2, outputPricePer1m: 8 },
        'gpt-4-turbo': { inputPricePer1m: 10, outputPricePer1m: 30 },
        'gpt-3.5-turbo': { inputPricePer1m: 0.5, outputPricePer1m: 1.50 }
      }
    }
  }
];
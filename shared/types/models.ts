/**
 * Centralized model configurations for OpenAI Codex
 * These models became available after GPT-5's release on August 7, 2025
 */

export type OpenAICodexModel = 
  | 'auto'
  | 'gpt-5'
  | 'gpt-5-codex';

export interface CodexModelConfig {
  id: OpenAICodexModel;
  label: string;
  description: string;
}

export const CODEX_MODELS: Record<OpenAICodexModel, CodexModelConfig> = {
  'auto': {
    id: 'auto',
    label: 'Auto',
    description: 'Let Codex choose the best model automatically'
  },
  'gpt-5': {
    id: 'gpt-5',
    label: 'GPT-5',
    description: 'Standard GPT-5 model for general use'
  },
  'gpt-5-codex': {
    id: 'gpt-5-codex',
    label: 'GPT-5 Codex',
    description: 'GPT-5 optimized for coding tasks'
  }
};

// Helper function to get model configuration
export function getCodexModelConfig(model: string): CodexModelConfig | undefined {
  return CODEX_MODELS[model as OpenAICodexModel];
}

// Helper to get the model list as an array
export function getCodexModelList(): CodexModelConfig[] {
  return Object.values(CODEX_MODELS);
}

// Default model if none specified
export const DEFAULT_CODEX_MODEL: OpenAICodexModel = 'gpt-5-codex';

// Codex input options interface
export interface CodexInputOptions {
  model: OpenAICodexModel;
  modelProvider: 'openai';
  sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
  webSearch: boolean;
  attachedImages?: Array<{
    id: string;
    name: string;
    dataUrl: string;
    size: number;
    type: string;
  }>;
  attachedTexts?: Array<{
    id: string;
    name: string;
    content: string;
    size: number;
  }>;
  [key: string]: unknown;
}
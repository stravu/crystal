/**
 * Model Context Window Configuration
 * Defines the context window sizes for different Claude models
 */

export interface ModelInfo {
  name: string;
  displayName: string;
  contextWindow: number;
}

// Model context window sizes (in tokens)
export const MODEL_CONTEXT_WINDOWS: Record<string, ModelInfo> = {
  'claude-3-5-haiku-20241022': {
    name: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    contextWindow: 200000
  },
  'claude-sonnet-4-20250514': {
    name: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    contextWindow: 200000
  },
  'claude-opus-4-20250514': {
    name: 'claude-opus-4-20250514',
    displayName: 'Claude Opus 4',
    contextWindow: 200000
  }
};

// Default context window if model is not found
export const DEFAULT_CONTEXT_WINDOW = 200000;

/**
 * Get the context window size for a given model
 * @param modelName The name of the Claude model
 * @returns The context window size in tokens
 */
export function getModelContextWindow(modelName: string): number {
  const modelInfo = MODEL_CONTEXT_WINDOWS[modelName];
  return modelInfo ? modelInfo.contextWindow : DEFAULT_CONTEXT_WINDOW;
}

/**
 * Get the display name for a given model
 * @param modelName The name of the Claude model
 * @returns The human-friendly display name
 */
export function getModelDisplayName(modelName: string): string {
  const modelInfo = MODEL_CONTEXT_WINDOWS[modelName];
  return modelInfo ? modelInfo.displayName : modelName;
}

/**
 * Get all available models
 * @returns Array of model information
 */
export function getAllModels(): ModelInfo[] {
  return Object.values(MODEL_CONTEXT_WINDOWS);
}

/**
 * Check if a model name is valid
 * @param modelName The name of the Claude model
 * @returns True if the model is recognized
 */
export function isValidModel(modelName: string): boolean {
  return modelName in MODEL_CONTEXT_WINDOWS;
}
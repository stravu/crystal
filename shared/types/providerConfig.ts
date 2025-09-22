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

export interface DiscoveredProvider {
  providerId: string;
  isAvailable: boolean;
  config?: ProviderEnvironment;
  configPath?: string;
  detectedModels: string[];
}

export interface ProviderAvailability {
  isAvailable: boolean;
  config?: ProviderEnvironment;
  configPath?: string;
  detectedModels: string[];
}
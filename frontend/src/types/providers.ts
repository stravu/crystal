// Provider types for the new multi-provider architecture

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

// UI-specific types for provider selection
export interface ProviderSelection {
  providerId: string;
  modelId: string;
  config?: Record<string, any>;
}

// Extended session interface with provider support
export interface SessionWithProvider {
  id: string;
  name: string;
  worktreePath: string;
  prompt: string;
  status: 'initializing' | 'ready' | 'running' | 'waiting' | 'stopped' | 'completed_unviewed' | 'error';
  pid?: number;
  createdAt: string;
  lastActivity?: string;
  output: string[];
  jsonMessages: any[];
  error?: string;
  isRunning?: boolean;
  lastViewedAt?: string;
  projectId?: number;
  folderId?: string;
  permissionMode?: 'approve' | 'ignore';
  runStartedAt?: string;
  isMainRepo?: boolean;
  displayOrder?: number;
  isFavorite?: boolean;
  autoCommit?: boolean;
  // Legacy support - deprecated in favor of provider architecture
  toolType?: 'claude' | 'codex' | 'none';
  // New provider architecture
  providerId?: string;
  providerModel?: string;
  providerConfig?: string; // JSON string of provider-specific config
  archived?: boolean;
  gitStatus?: any;
  baseCommit?: string;
  baseBranch?: string;
  commitMode?: 'structured' | 'checkpoint' | 'disabled';
  commitModeSettings?: string;
}

// Extended create session request with provider support
export interface CreateSessionWithProviderRequest {
  prompt: string;
  worktreeTemplate?: string;
  count?: number;
  permissionMode?: 'approve' | 'ignore';
  projectId?: number;
  isMainRepo?: boolean;
  baseBranch?: string;
  autoCommit?: boolean;
  // Legacy support
  toolType?: 'claude' | 'codex' | 'none';
  // New provider architecture
  providerSelection?: ProviderSelection;
  commitMode?: 'structured' | 'checkpoint' | 'disabled';
  commitModeSettings?: string;
  codexConfig?: {
    model?: string;
    modelProvider?: string;
    approvalPolicy?: 'auto' | 'manual';
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
    webSearch?: boolean;
    thinkingLevel?: 'low' | 'medium' | 'high';
  };
}
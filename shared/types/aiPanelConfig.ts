/**
 * Unified configuration for AI panels (Claude, Codex, etc.)
 * Each panel type can use the fields it needs and ignore others
 */
export interface AIPanelConfig {
  // Common configuration
  model?: string;
  prompt: string;
  worktreePath: string;
  
  // Claude-specific
  permissionMode?: 'approve' | 'ignore';
  
  // Codex-specific
  modelProvider?: string;
  approvalPolicy?: 'auto' | 'manual';
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  webSearch?: boolean;
  thinkingLevel?: 'low' | 'medium' | 'high';
  
  // Future extensibility - specific config values can be added here
  [key: string]: string | number | boolean | Array<unknown> | undefined;
}

/**
 * Configuration for starting a panel
 */
export interface StartPanelConfig extends AIPanelConfig {
  panelId: string;
  sessionId?: string;
}

/**
 * Configuration for continuing a panel conversation
 */
export interface ContinuePanelConfig extends AIPanelConfig {
  panelId: string;
  conversationHistory: Array<{id?: number; session_id?: string; message_type: 'user' | 'assistant'; content: string; timestamp?: string}>;
}

/**
 * Panel-specific state that can be stored
 */
export interface AIPanelState {
  isInitialized?: boolean;
  resumeId?: string;
  lastActivityTime?: string;
  lastPrompt?: string;
  config?: Partial<AIPanelConfig>;
}

/**
 * Factory for creating default configurations
 */
export class AIPanelConfigFactory {
  static createClaudeConfig(
    worktreePath: string,
    prompt: string,
    model?: string,
    permissionMode?: 'approve' | 'ignore'
  ): AIPanelConfig {
    return {
      worktreePath,
      prompt,
      model,
      permissionMode
    };
  }
  
  static createCodexConfig(
    worktreePath: string,
    prompt: string,
    options?: {
      model?: string;
      modelProvider?: string;
      approvalPolicy?: 'auto' | 'manual';
      sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
      webSearch?: boolean;
      thinkingLevel?: 'low' | 'medium' | 'high';
    }
  ): AIPanelConfig {
    return {
      worktreePath,
      prompt,
      ...options
    };
  }
}
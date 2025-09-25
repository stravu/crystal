import { ToolPanel, ToolPanelState } from './panels';

/**
 * Base interface for all CLI panel types
 */
export interface CliPanel extends ToolPanel {
  type: CliPanelType;
  cliToolId: string; // Which CLI tool this panel uses (e.g., claude)
  state: CliPanelState;
}

/**
 * CLI-specific panel types
 */
export type CliPanelType = 'claude';

/**
 * CLI panel state extending the base ToolPanelState
 */
export interface CliPanelState extends ToolPanelState {
  customState?: CliPanelCustomState;
}

/**
 * CLI-specific state information
 */
export interface CliPanelCustomState {
  /** Whether the CLI process has been initialized */
  isInitialized?: boolean;
  
  /** Current status of the CLI process */
  processStatus?: CliProcessStatus;
  
  /** Last user input/prompt */
  lastPrompt?: string;
  
  /** CLI tool version being used */
  toolVersion?: string;
  
  /** Current working directory for the CLI process */
  workingDirectory?: string;
  
  /** Process ID of the CLI tool */
  processId?: number;
  
  /** Whether the CLI supports conversation continuation */
  supportsResume?: boolean;
  
  /** CLI tool's internal session ID for resuming */
  resumeSessionId?: string;
  
  /** Model being used (if applicable) */
  model?: string;
  
  /** Permission mode (if applicable) */
  permissionMode?: 'approve' | 'ignore';
  
  /** Configuration specific to the CLI tool */
  toolConfig?: Record<string, unknown>;
  
  /** Feature flags for what this CLI instance supports */
  capabilities?: CliToolCapabilities;
  
  /** Last activity timestamp */
  lastActivityTime?: string;
  
  /** Error information if CLI is in error state */
  errorInfo?: CliErrorInfo;
  
  /** Output format being used */
  outputFormat?: string;
  
  /** Whether structured output is enabled */
  structuredOutput?: boolean;
}

/**
 * Status of a CLI process
 */
export type CliProcessStatus = 
  | 'initializing'  // Setting up CLI environment
  | 'ready'         // CLI ready to accept input
  | 'processing'    // CLI is processing a request
  | 'waiting'       // CLI is waiting for user input
  | 'error'         // CLI encountered an error
  | 'stopped'       // CLI process has stopped
  | 'restarting';   // CLI is being restarted

/**
 * CLI tool capabilities - what features the tool supports
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
  
  /** Available models (if applicable) */
  availableModels?: string[];
  
  /** Supported file types for operations */
  supportedFileTypes?: string[];
  
  /** Maximum context length */
  maxContextLength?: number;
  
  /** Supported output formats */
  outputFormats?: string[];
}

/**
 * Error information for CLI panels
 */
export interface CliErrorInfo {
  /** Error type */
  type: 'startup' | 'runtime' | 'permission' | 'network' | 'configuration' | 'unknown';
  
  /** Error message */
  message: string;
  
  /** Detailed error information */
  details?: string;
  
  /** Error code (if applicable) */
  code?: string | number;
  
  /** Timestamp when error occurred */
  timestamp: string;
  
  /** Whether the error is recoverable */
  recoverable: boolean;
  
  /** Suggested recovery actions */
  recoveryActions?: string[];
}

/**
 * Input options for CLI panels
 */
export interface CliInputOptions {
  /** The input text/prompt */
  text: string;
  
  /** Whether this is a continuation of previous conversation */
  isContinuation?: boolean;
  
  /** Model to use for this input (if tool supports multiple models) */
  model?: string;
  
  /** Permission mode for this request */
  permissionMode?: 'approve' | 'ignore';
  
  /** Additional files to include in context */
  files?: CliInputFile[];
  
  /** Images to include in input (if supported) */
  images?: CliInputImage[];
  
  /** System prompt additions */
  systemPrompt?: string;
  
  /** Tool-specific options */
  toolOptions?: Record<string, unknown>;
  
  /** Output format preference */
  outputFormat?: string;
  
  /** Whether to use structured output */
  structuredOutput?: boolean;
}

/**
 * File to include in CLI input
 */
export interface CliInputFile {
  /** File path */
  path: string;
  
  /** File content (if not reading from disk) */
  content?: string;
  
  /** Whether to include full content or just reference */
  includeContent: boolean;
  
  /** File type/language */
  type?: string;
}

/**
 * Image to include in CLI input
 */
export interface CliInputImage {
  /** Image data (base64 or blob) */
  data: string | Blob;
  
  /** Image type */
  type: 'base64' | 'blob' | 'url';
  
  /** Image format */
  format: 'png' | 'jpg' | 'jpeg' | 'gif' | 'webp';
  
  /** Alt text for the image */
  alt?: string;
}

/**
 * Output from CLI panels
 */
export interface CliOutput {
  /** Output type */
  type: 'text' | 'json' | 'error' | 'system' | 'tool_call' | 'thinking' | 'user' | 'assistant';
  
  /** Output content */
  content: string | object;
  
  /** Timestamp */
  timestamp: string;
  
  /** Whether this is the final output */
  final?: boolean;
  
  /** Tool that generated this output */
  source?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * View modes for CLI panels
 */
export type CliViewMode = 'output' | 'messages' | 'stats' | 'settings' | 'help';

/**
 * Settings for CLI panels
 */
export interface CliPanelSettings {
  /** Default model to use */
  defaultModel?: string;
  
  /** Default permission mode */
  defaultPermissionMode?: 'approve' | 'ignore';
  
  /** Whether to show tool calls */
  showToolCalls?: boolean;
  
  /** Whether to use compact mode */
  compactMode?: boolean;
  
  /** Whether to collapse tool sections */
  collapseTools?: boolean;
  
  /** Whether to show thinking process */
  showThinking?: boolean;
  
  /** Whether to show session initialization */
  showSessionInit?: boolean;
  
  /** Font size for output */
  fontSize?: number;
  
  /** Color theme */
  theme?: 'light' | 'dark' | 'auto';
  
  /** Auto-scroll behavior */
  autoScroll?: boolean;
  
  /** Maximum lines to keep in output */
  maxOutputLines?: number;
  
  /** Tool-specific settings */
  toolSettings?: Record<string, unknown>;
}

/**
 * CLI panel events
 */
export interface CliPanelEvent {
  /** Event type */
  type: CliPanelEventType;
  
  /** Panel that emitted the event */
  panelId: string;
  
  /** CLI tool ID */
  cliToolId: string;
  
  /** Event data */
  data: unknown;
  
  /** Timestamp */
  timestamp: string;
}

/**
 * Types of events that CLI panels can emit
 */
export type CliPanelEventType =
  | 'process:started'
  | 'process:stopped' 
  | 'process:error'
  | 'input:sent'
  | 'output:received'
  | 'status:changed'
  | 'model:changed'
  | 'settings:changed'
  | 'session:resumed'
  | 'session:ended'
  | 'files:changed'
  | 'permission:requested'
  | 'permission:granted'
  | 'permission:denied';

/**
 * CLI panel configuration for different tools
 */
export interface CliPanelConfig {
  /** CLI tool ID */
  toolId: string;
  
  /** Display configuration */
  display: {
    /** Panel title template */
    titleTemplate?: string;
    
    /** Default view mode */
    defaultViewMode?: CliViewMode;
    
    /** Available view modes */
    availableViewModes?: CliViewMode[];
    
    /** Whether to show model selector */
    showModelSelector?: boolean;
    
    /** Whether to show permission controls */
    showPermissionControls?: boolean;
    
    /** Custom CSS classes */
    customClasses?: string[];
  };
  
  /** Input configuration */
  input: {
    /** Whether to support file uploads */
    supportsFiles?: boolean;
    
    /** Whether to support image uploads */
    supportsImages?: boolean;
    
    /** Whether to support multi-line input */
    supportsMultiline?: boolean;
    
    /** Placeholder text */
    placeholder?: string;
    
    /** Maximum input length */
    maxLength?: number;
  };
  
  /** Output configuration */
  output: {
    /** Default output format */
    defaultFormat?: string;
    
    /** Whether to support syntax highlighting */
    syntaxHighlighting?: boolean;
    
    /** Whether to support markdown rendering */
    markdownRendering?: boolean;
    
    /** Whether to support JSON formatting */
    jsonFormatting?: boolean;
  };
  
  /** Feature flags */
  features: {
    /** Whether conversation history is supported */
    conversationHistory?: boolean;
    
    /** Whether settings panel is available */
    settingsPanel?: boolean;
    
    /** Whether stats view is available */
    statsView?: boolean;
    
    /** Whether help documentation is available */
    helpDocumentation?: boolean;
    
    /** Whether export functionality is available */
    exportSupport?: boolean;
  };
}

/**
 * Factory for creating CLI panel configurations
 */
export const createCliPanelConfig = (toolId: string, overrides?: Partial<CliPanelConfig>): CliPanelConfig => {
  const baseConfig: CliPanelConfig = {
    toolId,
    display: {
      titleTemplate: `${toolId} Panel`,
      defaultViewMode: 'output',
      availableViewModes: ['output', 'messages', 'stats', 'settings'],
      showModelSelector: false,
      showPermissionControls: false,
      customClasses: []
    },
    input: {
      supportsFiles: false,
      supportsImages: false,
      supportsMultiline: true,
      placeholder: `Enter your ${toolId} prompt...`,
      maxLength: 10000
    },
    output: {
      defaultFormat: 'text',
      syntaxHighlighting: true,
      markdownRendering: true,
      jsonFormatting: true
    },
    features: {
      conversationHistory: false,
      settingsPanel: true,
      statsView: false,
      helpDocumentation: true,
      exportSupport: false
    }
  };

  return { ...baseConfig, ...overrides };
};

/**
 * Pre-configured CLI panel configurations for supported tools
 */
export const CLI_PANEL_CONFIGS: Record<string, CliPanelConfig> = {
  claude: createCliPanelConfig('claude', {
    display: {
      titleTemplate: 'Claude Panel',
      defaultViewMode: 'output',
      availableViewModes: ['output', 'messages', 'stats', 'settings'],
      showModelSelector: true,
      showPermissionControls: true
    },
    input: {
      supportsFiles: true,
      supportsImages: true,
      supportsMultiline: true,
      placeholder: 'Enter your Claude prompt...'
    },
    features: {
      conversationHistory: true,
      settingsPanel: true,
      statsView: true,
      helpDocumentation: true,
      exportSupport: true
    }
  })
};

/**
 * Utility to get CLI panel config for a tool
 */
export const getCliPanelConfig = (toolId: string): CliPanelConfig => {
  return CLI_PANEL_CONFIGS[toolId] || createCliPanelConfig(toolId);
};
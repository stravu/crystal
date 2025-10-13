import { create } from 'zustand';
import { API } from '../utils/api';
import { DEFAULT_CODEX_MODEL } from '../../../shared/types/models';
import type { CommitModeSettings } from '../../../shared/types';

export interface SessionCreationPreferences {
  sessionCount: number;
  toolType: 'claude' | 'codex' | 'none';
  selectedTools: {
    claude: boolean;
    codex: boolean;
  };
  claudeConfig: {
    model: 'auto' | 'sonnet' | 'opus' | 'haiku';
    permissionMode: 'ignore' | 'approve';
    ultrathink: boolean;
  };
  codexConfig: {
    model: string;
    modelProvider: string;
    approvalPolicy: 'auto' | 'manual';
    sandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
    webSearch: boolean;
    thinkingLevel?: 'low' | 'medium' | 'high';
  };
  showAdvanced: boolean;
  baseBranch?: string;
  commitModeSettings: CommitModeSettings;
}

const defaultPreferences: SessionCreationPreferences = {
  sessionCount: 1,
  toolType: 'none',
  selectedTools: {
    claude: false,
    codex: false
  },
  claudeConfig: {
    model: 'auto',
    permissionMode: 'ignore',
    ultrathink: false
  },
  codexConfig: {
    model: DEFAULT_CODEX_MODEL,
    modelProvider: 'openai',
    approvalPolicy: 'auto',
    sandboxMode: 'workspace-write',
    webSearch: false,
    thinkingLevel: 'medium'
  },
  showAdvanced: false,
  commitModeSettings: {
    mode: 'checkpoint',
    checkpointPrefix: 'checkpoint: '
  }
};

interface SessionPreferencesStore {
  preferences: SessionCreationPreferences;
  isLoading: boolean;
  error: string | null;
  loadPreferences: () => Promise<void>;
  updatePreferences: (updates: Partial<SessionCreationPreferences>) => Promise<void>;
  resetPreferences: () => void;
}

export const useSessionPreferencesStore = create<SessionPreferencesStore>((set, get) => ({
  preferences: defaultPreferences,
  isLoading: false,
  error: null,

  loadPreferences: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await API.config.getSessionPreferences();
      if (response.success && response.data) {
        // Merge with defaults to ensure all fields are present
        const mergedPreferences: SessionCreationPreferences = {
          ...defaultPreferences,
          ...response.data,
          selectedTools: {
            ...defaultPreferences.selectedTools,
            ...response.data.selectedTools
          },
          claudeConfig: {
            ...defaultPreferences.claudeConfig,
            ...response.data.claudeConfig
          },
          codexConfig: {
            ...defaultPreferences.codexConfig,
            ...response.data.codexConfig
          },
          commitModeSettings: {
            ...defaultPreferences.commitModeSettings,
            ...response.data.commitModeSettings
          }
        };
        mergedPreferences.sessionCount = defaultPreferences.sessionCount;
        set({ preferences: mergedPreferences, isLoading: false });
      } else {
        set({ error: response.error || 'Failed to load session preferences', isLoading: false });
      }
    } catch (error) {
      set({ error: 'Failed to load session preferences', isLoading: false });
    }
  },

  updatePreferences: async (updates: Partial<SessionCreationPreferences>) => {
    const { sessionCount: _ignoredSessionCount, ...allowedUpdates } = updates;
    const currentPreferences = get().preferences;
    
    // Deep merge the updates while keeping session count at its default
    const newPreferences: SessionCreationPreferences = {
      ...currentPreferences,
      ...allowedUpdates,
      selectedTools: {
        ...currentPreferences.selectedTools,
        ...(allowedUpdates.selectedTools || {})
      },
      claudeConfig: {
        ...currentPreferences.claudeConfig,
        ...(allowedUpdates.claudeConfig || {})
      },
      codexConfig: {
        ...currentPreferences.codexConfig,
        ...(allowedUpdates.codexConfig || {})
      },
      commitModeSettings: {
        ...currentPreferences.commitModeSettings,
        ...(allowedUpdates.commitModeSettings || {})
      },
      sessionCount: defaultPreferences.sessionCount
    };

    // Update local state immediately
    set({ preferences: newPreferences });

    // Save to backend
    try {
      const response = await API.config.updateSessionPreferences(newPreferences);
      if (!response.success) {
        // Revert on failure
        set({ preferences: currentPreferences, error: response.error || 'Failed to save preferences' });
      }
    } catch (error) {
      // Revert on failure
      set({ preferences: currentPreferences, error: 'Failed to save preferences' });
    }
  },

  resetPreferences: () => {
    set({ preferences: defaultPreferences });
  }
}));

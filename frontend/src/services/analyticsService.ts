/**
 * Frontend Analytics Service
 *
 * Helper utilities for tracking UI interaction events from the frontend.
 * All tracking is routed through the backend's AnalyticsManager to ensure
 * consistent privacy protections and event formatting.
 */

/**
 * UI Interaction Event types
 */
export type UIEventName =
  | 'view_switched'
  | 'help_dialog_opened'
  | 'settings_opened'
  | 'settings_saved'
  | 'sidebar_toggled'
  | 'search_used'
  | 'notification_shown'
  | 'nimbalyst_button_clicked'
  | 'nimbalyst_install_dialog_shown'
  | 'nimbalyst_download_clicked'
  | 'nimbalyst_opened';

/**
 * Event property interfaces for type safety
 */
export interface ViewSwitchedProperties extends Record<string, string | number | boolean | string[] | undefined> {
  from_view: string;
  to_view: string;
  session_id_hash?: string;
}

export interface HelpDialogOpenedProperties extends Record<string, string | number | boolean | string[] | undefined> {
  from_location: string;
}

export interface SettingsOpenedProperties extends Record<string, string | number | boolean | string[] | undefined> {
  from_location: string;
}

export interface SettingsSavedProperties extends Record<string, string | number | boolean | string[] | undefined> {
  category: string;
  setting_keys: string[];
}

export interface SidebarToggledProperties extends Record<string, string | number | boolean | string[] | undefined> {
  is_visible: boolean;
}

export interface SearchUsedProperties extends Record<string, string | number | boolean | string[] | undefined> {
  search_type: string;
  result_count_category: string;
}

export interface NotificationShownProperties extends Record<string, string | number | boolean | string[] | undefined> {
  notification_type: string;
  trigger_event: string;
}

export interface NimbalystButtonClickedProperties extends Record<string, string | number | boolean | string[] | undefined> {
  session_id_hash?: string;
}

export interface NimbalystInstallDialogShownProperties extends Record<string, string | number | boolean | string[] | undefined> {
  session_id_hash?: string;
}

// Event type for Nimbalyst download clicked (no additional properties needed)
export type NimbalystDownloadClickedProperties = Record<string, string | number | boolean | string[] | undefined>;

export interface NimbalystOpenedProperties extends Record<string, string | number | boolean | string[] | undefined> {
  session_id_hash?: string;
}

/**
 * Analytics Service
 *
 * Provides type-safe methods for tracking UI events
 */
export class AnalyticsService {
  private static isEnabled(): boolean {
    // Check if analytics is available (electronAPI is exposed via preload script)
    return typeof window !== 'undefined' && 'electronAPI' in window &&
           window.electronAPI && 'analytics' in window.electronAPI;
  }

  /**
   * Track a view switch event
   */
  static async trackViewSwitched(properties: ViewSwitchedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'view_switched',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track view_switched:', error);
    }
  }

  /**
   * Track help dialog opened event
   */
  static async trackHelpDialogOpened(properties: HelpDialogOpenedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'help_dialog_opened',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track help_dialog_opened:', error);
    }
  }

  /**
   * Track settings opened event
   */
  static async trackSettingsOpened(properties: SettingsOpenedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'settings_opened',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track settings_opened:', error);
    }
  }

  /**
   * Track settings saved event
   */
  static async trackSettingsSaved(properties: SettingsSavedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'settings_saved',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track settings_saved:', error);
    }
  }

  /**
   * Track sidebar toggled event
   */
  static async trackSidebarToggled(properties: SidebarToggledProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'sidebar_toggled',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track sidebar_toggled:', error);
    }
  }

  /**
   * Track search used event
   */
  static async trackSearchUsed(properties: SearchUsedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'search_used',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track search_used:', error);
    }
  }

  /**
   * Track notification shown event
   */
  static async trackNotificationShown(properties: NotificationShownProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'notification_shown',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track notification_shown:', error);
    }
  }

  /**
   * Helper: Categorize search result count for privacy
   */
  static async categorizeResultCount(count: number): Promise<string> {
    if (!this.isEnabled()) return 'unknown';

    try {
      const response = await window.electronAPI.analytics.categorizeResultCount(count);
      return response.data || 'unknown';
    } catch (error) {
      console.error('[Analytics] Failed to categorize result count:', error);
      return 'unknown';
    }
  }

  /**
   * Helper: Hash session ID for privacy
   */
  static async hashSessionId(sessionId: string): Promise<string | undefined> {
    if (!this.isEnabled()) return undefined;

    try {
      const response = await window.electronAPI.analytics.hashSessionId(sessionId);
      return response.data;
    } catch (error) {
      console.error('[Analytics] Failed to hash session ID:', error);
      return undefined;
    }
  }

  /**
   * Track Nimbalyst button clicked event
   */
  static async trackNimbalystButtonClicked(properties: NimbalystButtonClickedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'nimbalyst_button_clicked',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track nimbalyst_button_clicked:', error);
    }
  }

  /**
   * Track Nimbalyst install dialog shown event
   */
  static async trackNimbalystInstallDialogShown(properties: NimbalystInstallDialogShownProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'nimbalyst_install_dialog_shown',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track nimbalyst_install_dialog_shown:', error);
    }
  }

  /**
   * Track Nimbalyst download clicked event
   */
  static async trackNimbalystDownloadClicked(properties: NimbalystDownloadClickedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'nimbalyst_download_clicked',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track nimbalyst_download_clicked:', error);
    }
  }

  /**
   * Track Nimbalyst successfully opened event
   */
  static async trackNimbalystOpened(properties: NimbalystOpenedProperties): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'nimbalyst_opened',
        properties,
      });
    } catch (error) {
      console.error('[Analytics] Failed to track nimbalyst_opened:', error);
    }
  }

  /**
   * Track analytics opted in event
   * Called when user accepts analytics in the consent dialog
   */
  static async trackAnalyticsOptedIn(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      await window.electronAPI.analytics.trackUIEvent({
        event: 'analytics_opted_in',
        properties: {},
      });
    } catch (error) {
      console.error('[Analytics] Failed to track analytics_opted_in:', error);
    }
  }

  /**
   * Track analytics opted out event
   * Called when user declines analytics in the consent dialog
   * Uses minimal tracking to ensure this event is captured even when disabling analytics
   */
  static async trackAnalyticsOptedOut(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      // Use the standard UI event tracking - the backend will use minimal tracking
      // for opt-out events to ensure they're captured
      await window.electronAPI.analytics.trackUIEvent({
        event: 'analytics_opted_out',
        properties: {},
      });
    } catch (error) {
      console.error('[Analytics] Failed to track analytics_opted_out:', error);
    }
  }
}

// Export the class as a singleton-like service for static method usage
export const analyticsService = AnalyticsService;

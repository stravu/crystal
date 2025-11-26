import { IpcMain } from 'electron';
import type { AppServices } from './types';

/**
 * UI Interaction Event properties
 */
interface ViewSwitchedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  from_view: string;
  to_view: string;
  session_id_hash?: string;
}

interface HelpDialogOpenedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  from_location: string;
}

interface SettingsOpenedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  from_location: string;
}

interface SettingsSavedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  category: string;
  setting_keys: string[];
}

interface SidebarToggledEvent extends Record<string, string | number | boolean | string[] | undefined> {
  is_visible: boolean;
}

interface SearchUsedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  search_type: string;
  result_count_category: string;
}

interface NotificationShownEvent extends Record<string, string | number | boolean | string[] | undefined> {
  notification_type: string;
  trigger_event: string;
}

// Event types for analytics opt-in/opt-out (no additional properties needed)
type AnalyticsOptedOutEvent = Record<string, string | number | boolean | string[] | undefined>;
type AnalyticsOptedInEvent = Record<string, string | number | boolean | string[] | undefined>;

interface NimbalystButtonClickedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  session_id_hash?: string;
}

interface NimbalystInstallDialogShownEvent extends Record<string, string | number | boolean | string[] | undefined> {
  session_id_hash?: string;
}

// Event type for Nimbalyst download clicked (no additional properties needed)
type NimbalystDownloadClickedEvent = Record<string, string | number | boolean | string[] | undefined>;

interface NimbalystOpenedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  session_id_hash?: string;
}

type AnalyticsEventData =
  | { event: 'view_switched'; properties: ViewSwitchedEvent }
  | { event: 'help_dialog_opened'; properties: HelpDialogOpenedEvent }
  | { event: 'settings_opened'; properties: SettingsOpenedEvent }
  | { event: 'settings_saved'; properties: SettingsSavedEvent }
  | { event: 'sidebar_toggled'; properties: SidebarToggledEvent }
  | { event: 'search_used'; properties: SearchUsedEvent }
  | { event: 'notification_shown'; properties: NotificationShownEvent }
  | { event: 'analytics_opted_out'; properties: AnalyticsOptedOutEvent }
  | { event: 'analytics_opted_in'; properties: AnalyticsOptedInEvent }
  | { event: 'nimbalyst_button_clicked'; properties: NimbalystButtonClickedEvent }
  | { event: 'nimbalyst_install_dialog_shown'; properties: NimbalystInstallDialogShownEvent }
  | { event: 'nimbalyst_download_clicked'; properties: NimbalystDownloadClickedEvent }
  | { event: 'nimbalyst_opened'; properties: NimbalystOpenedEvent };

/**
 * Register IPC handlers for analytics tracking
 */
export function registerAnalyticsHandlers(ipcMain: IpcMain, services: AppServices): void {
  const { analyticsManager } = services;

  if (!analyticsManager) {
    console.warn('[Analytics IPC] AnalyticsManager not available, analytics tracking disabled');
    return;
  }

  /**
   * Track UI interaction events from the frontend
   */
  ipcMain.handle('analytics:track-ui-event', async (_event, data: AnalyticsEventData) => {
    try {
      // Validate event data
      if (!data || !data.event || !data.properties) {
        console.error('[Analytics IPC] Invalid event data:', data);
        return { success: false, error: 'Invalid event data' };
      }

      // Special handling for opt-out event: use minimal tracking to ensure it's captured
      if (data.event === 'analytics_opted_out') {
        // Use minimal tracking for opt-out events (works even when analytics is disabled)
        analyticsManager.trackMinimalEvent(data.event, data.properties);
      } else {
        // Normal tracking (respects enabled/disabled state)
        analyticsManager.track(data.event, data.properties);
      }

      return { success: true };
    } catch (error) {
      console.error('[Analytics IPC] Failed to track UI event:', error);
      return { success: false, error: 'Failed to track event' };
    }
  });

  /**
   * Track minimal events (used for opt-out tracking and basic app opens when opted out)
   */
  ipcMain.handle('analytics:track-minimal-event', async (_event, eventName: string, properties?: Record<string, string | number | boolean | string[] | undefined>) => {
    try {
      analyticsManager.trackMinimalEvent(eventName, properties);
      return { success: true };
    } catch (error) {
      console.error('[Analytics IPC] Failed to track minimal event:', error);
      return { success: false, error: 'Failed to track minimal event' };
    }
  });

  /**
   * Helper to categorize search result counts
   */
  ipcMain.handle('analytics:categorize-result-count', async (_event, count: number) => {
    try {
      const category = analyticsManager.categorizeNumber(count, [0, 5, 10, 25, 50, 100]);
      return { success: true, data: category };
    } catch (error) {
      console.error('[Analytics IPC] Failed to categorize result count:', error);
      return { success: false, error: 'Failed to categorize result count' };
    }
  });

  /**
   * Helper to hash session IDs
   */
  ipcMain.handle('analytics:hash-session-id', async (_event, sessionId: string) => {
    try {
      const hash = analyticsManager.hashSessionId(sessionId);
      return { success: true, data: hash };
    } catch (error) {
      console.error('[Analytics IPC] Failed to hash session ID:', error);
      return { success: false, error: 'Failed to hash session ID' };
    }
  });

  console.log('[Analytics IPC] Analytics IPC handlers registered');
}

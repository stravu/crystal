import { PostHog } from 'posthog-node';
import { EventEmitter } from 'events';
import type { ConfigManager } from './configManager';
import { app } from 'electron';
import * as crypto from 'crypto';
import * as os from 'os'; // Still needed for platform info in track() method

export interface AnalyticsEvent {
  eventName: string;
  properties?: Record<string, string | number | boolean | string[] | undefined>;
}

export class AnalyticsManager extends EventEmitter {
  private client: PostHog | null = null;
  private configManager: ConfigManager;
  private distinctId: string;
  private isInitialized = false;
  private minimalClient: PostHog | null = null; // Separate client for minimal tracking when opted out

  constructor(configManager: ConfigManager) {
    super();
    this.configManager = configManager;
    this.distinctId = this.generateDistinctId();
  }

  /**
   * Generate a stable, anonymous distinct ID for this installation
   * Uses a random UUID stored in config for privacy
   */
  private generateDistinctId(): string {
    // Check if we already have a distinct ID stored
    const existingId = this.configManager.getAnalyticsDistinctId();
    if (existingId) {
      return existingId;
    }

    // Generate new random UUID for this installation
    const uuid = crypto.randomUUID();
    const distinctId = `crystal_${uuid}`;

    // Store it for future use (async, but don't wait)
    this.configManager.setAnalyticsDistinctId(distinctId).catch(err => {
      console.error('[Analytics] Failed to save distinct ID:', err);
    });

    return distinctId;
  }

  /**
   * Initialize PostHog client
   */
  async initialize(): Promise<void> {
    const settings = this.configManager.getAnalyticsSettings();

    // Always initialize minimal client for basic tracking (even when opted out)
    if (settings.posthogApiKey) {
      try {
        this.minimalClient = new PostHog(settings.posthogApiKey, {
          host: settings.posthogHost || 'https://app.posthog.com',
          flushAt: 1, // Flush immediately for minimal events
          flushInterval: 1000,
        });
        console.log('[Analytics] Minimal PostHog client initialized');
      } catch (error) {
        console.error('[Analytics] Failed to initialize minimal PostHog client:', error);
      }
    }

    // Don't initialize full client if analytics is disabled
    if (!settings.enabled || !settings.posthogApiKey) {
      console.log('[Analytics] Full analytics disabled or no API key configured');
      this.isInitialized = false;
      return;
    }

    try {
      this.client = new PostHog(settings.posthogApiKey, {
        host: settings.posthogHost || 'https://app.posthog.com',
        flushAt: 20, // Send batch after 20 events
        flushInterval: 10000, // Send batch every 10 seconds
      });

      this.isInitialized = true;
      console.log('[Analytics] PostHog initialized successfully');
    } catch (error) {
      console.error('[Analytics] Failed to initialize PostHog:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Track an event
   */
  track(eventName: string, properties?: Record<string, string | number | boolean | string[] | undefined>): void {
    // Skip if analytics is disabled
    if (!this.isInitialized || !this.client || !this.configManager.isAnalyticsEnabled()) {
      return;
    }

    try {
      // Add common properties
      const enhancedProperties = {
        ...properties,
        app_version: app.getVersion(),
        platform: os.platform(),
        electron_version: process.versions.electron,
      };

      // Remove undefined values
      const cleanedProperties = Object.fromEntries(
        Object.entries(enhancedProperties).filter(([_, v]) => v !== undefined)
      );

      this.client.capture({
        distinctId: this.distinctId,
        event: eventName,
        properties: cleanedProperties,
      });

      if (this.configManager.isVerbose()) {
        console.log(`[Analytics] Tracked event: ${eventName}`, cleanedProperties);
      }
    } catch (error) {
      console.error(`[Analytics] Failed to track event ${eventName}:`, error);
    }
  }

  /**
   * Track a minimal event even when analytics is disabled
   * Used for: app_opened when opted out, analytics_opted_out event
   */
  trackMinimalEvent(eventName: string, properties?: Record<string, string | number | boolean | string[] | undefined>): void {
    if (!this.minimalClient) {
      console.log('[Analytics] Minimal client not available, skipping minimal event');
      return;
    }

    try {
      // Only include very basic properties for privacy
      const minimalProperties = {
        ...properties,
        app_version: app.getVersion(),
        platform: os.platform(),
        analytics_enabled: this.configManager.isAnalyticsEnabled(),
      };

      // Remove undefined values
      const cleanedProperties = Object.fromEntries(
        Object.entries(minimalProperties).filter(([_, v]) => v !== undefined)
      );

      this.minimalClient.capture({
        distinctId: this.distinctId,
        event: eventName,
        properties: cleanedProperties,
      });

      console.log(`[Analytics] Tracked minimal event: ${eventName}`);
    } catch (error) {
      console.error(`[Analytics] Failed to track minimal event ${eventName}:`, error);
    }
  }

  /**
   * Identify the user (with anonymous ID)
   */
  identify(properties?: Record<string, string | number | boolean | undefined>): void {
    if (!this.isInitialized || !this.client || !this.configManager.isAnalyticsEnabled()) {
      return;
    }

    try {
      this.client.identify({
        distinctId: this.distinctId,
        properties: {
          ...properties,
          app_version: app.getVersion(),
          platform: os.platform(),
        },
      });
    } catch (error) {
      console.error('[Analytics] Failed to identify user:', error);
    }
  }

  /**
   * Flush any pending events
   */
  async flush(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.flush();
      console.log('[Analytics] Events flushed');
    } catch (error) {
      console.error('[Analytics] Failed to flush events:', error);
    }
  }

  /**
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    if (this.client) {
      shutdownPromises.push(
        this.client.shutdown().then(() => {
          console.log('[Analytics] PostHog client shut down');
        }).catch((error) => {
          console.error('[Analytics] Failed to shut down PostHog client:', error);
        })
      );
    }

    if (this.minimalClient) {
      shutdownPromises.push(
        this.minimalClient.shutdown().then(() => {
          console.log('[Analytics] Minimal PostHog client shut down');
        }).catch((error) => {
          console.error('[Analytics] Failed to shut down minimal PostHog client:', error);
        })
      );
    }

    await Promise.all(shutdownPromises);
  }

  /**
   * Helper to hash session IDs for privacy
   */
  hashSessionId(sessionId: string): string {
    return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 16);
  }

  /**
   * Categorize numeric values for privacy
   */
  categorizeNumber(value: number, thresholds: number[]): string {
    for (let i = 0; i < thresholds.length; i++) {
      if (value <= thresholds[i]) {
        return i === 0 ? `0-${thresholds[i]}` : `${thresholds[i - 1] + 1}-${thresholds[i]}`;
      }
    }
    return `${thresholds[thresholds.length - 1] + 1}+`;
  }

  /**
   * Categorize duration for privacy
   */
  categorizeDuration(seconds: number): string {
    if (seconds < 10) return '0-10s';
    if (seconds < 30) return '10-30s';
    if (seconds < 60) return '30-60s';
    if (seconds < 300) return '1-5m';
    if (seconds < 600) return '5-10m';
    if (seconds < 1800) return '10-30m';
    if (seconds < 3600) return '30-60m';
    return '60m+';
  }

  /**
   * Categorize prompt length for privacy
   */
  categorizePromptLength(length: number): string {
    if (length < 50) return 'short';
    if (length < 200) return 'medium';
    if (length < 500) return 'long';
    return 'very_long';
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.isInitialized && this.configManager.isAnalyticsEnabled();
  }
}

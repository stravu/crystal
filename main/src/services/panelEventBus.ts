import { PanelEvent, PanelEventType, PanelEventSubscription } from '../../../shared/types/panels';
import { EventEmitter } from 'events';

export class PanelEventBus extends EventEmitter {
  private subscriptions = new Map<string, PanelEventSubscription[]>();
  private eventHistory: PanelEvent[] = [];
  private readonly MAX_HISTORY_SIZE = 100;
  
  constructor() {
    super();
    this.setMaxListeners(100); // Allow many panels to subscribe
  }
  
  subscribe(subscription: PanelEventSubscription): () => void {
    const { panelId, eventTypes } = subscription;
    
    // Get existing subscriptions for this panel
    const panelSubs = this.subscriptions.get(panelId) || [];
    
    // Add new subscription
    panelSubs.push(subscription);
    this.subscriptions.set(panelId, panelSubs);
    
    // Set up event listeners for each event type
    eventTypes.forEach(eventType => {
      const listener = (event: PanelEvent) => {
        // Don't send events back to the source panel
        if (event.source.panelId !== panelId) {
          subscription.callback(event);
        }
      };
      
      this.on(eventType, listener);
    });
    
    // Return unsubscribe function
    return () => {
      this.unsubscribePanel(panelId);
    };
  }
  
  emit(eventType: string | symbol, event: PanelEvent): boolean {
    // Add to history
    this.eventHistory.push(event);
    
    // Trim history if needed
    if (this.eventHistory.length > this.MAX_HISTORY_SIZE) {
      this.eventHistory = this.eventHistory.slice(-this.MAX_HISTORY_SIZE);
    }
    
    // Emit the event
    return super.emit(eventType, event);
  }
  
  emitPanelEvent(event: PanelEvent): void {
    this.emit(event.type, event);
    
    // Also emit a generic 'panel:event' for logging/debugging
    this.emit('panel:event', event);
  }
  
  getRecentEvents(eventTypes?: PanelEventType[], limit = 10): PanelEvent[] {
    let events = [...this.eventHistory];
    
    // Filter by event types if specified
    if (eventTypes && eventTypes.length > 0) {
      events = events.filter(e => eventTypes.includes(e.type));
    }
    
    // Return most recent events up to limit
    return events.slice(-limit);
  }
  
  unsubscribePanel(panelId: string): void {
    const subs = this.subscriptions.get(panelId);
    
    if (subs) {
      // Remove all listeners for this panel
      subs.forEach(sub => {
        sub.eventTypes.forEach(eventType => {
          this.removeAllListeners(eventType);
        });
      });
      
      // Remove from subscriptions map
      this.subscriptions.delete(panelId);
      
      // Re-add listeners for remaining panels
      this.subscriptions.forEach((panelSubs, pid) => {
        if (pid !== panelId) {
          panelSubs.forEach(sub => {
            sub.eventTypes.forEach(eventType => {
              const listener = (event: PanelEvent) => {
                if (event.source.panelId !== pid) {
                  sub.callback(event);
                }
              };
              this.on(eventType, listener);
            });
          });
        }
      });
    }
  }
  
  clearHistory(): void {
    this.eventHistory = [];
  }
  
  getSubscribedPanels(eventType: PanelEventType): string[] {
    const panels: string[] = [];
    
    this.subscriptions.forEach((subs, panelId) => {
      if (subs.some(sub => sub.eventTypes.includes(eventType))) {
        panels.push(panelId);
      }
    });
    
    return panels;
  }
}

// Export singleton instance
export const panelEventBus = new PanelEventBus();
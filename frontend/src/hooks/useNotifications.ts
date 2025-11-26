import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { API } from '../utils/api';
import { AnalyticsService } from '../services/analyticsService';

// Extend window interface for webkit audio context compatibility
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

interface NotificationSettings {
  enabled: boolean;
  playSound: boolean;
  notifyOnStatusChange: boolean;
  notifyOnWaiting: boolean;
  notifyOnComplete: boolean;
}

export function useNotifications() {
  const sessions = useSessionStore((state) => state.sessions);
  const prevSessionsRef = useRef<typeof sessions>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    playSound: true,
    notifyOnStatusChange: true,
    notifyOnWaiting: true,
    notifyOnComplete: true,
  });
  const settingsLoaded = useRef(false);
  const initialLoadComplete = useRef(false);

  // Track shown notifications to prevent duplicate analytics tracking
  // Key format: `${sessionId}:${status}` for status notifications, or `${sessionId}:created` for new sessions
  // This ensures we only track each unique notification once, even if the component re-renders
  const trackedNotificationsRef = useRef<Set<string>>(new Set());

  const requestPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  };

  const playNotificationSound = () => {
    if (!settings.playSound) return;
    
    try {
      // Create a simple notification sound using Web Audio API
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('AudioContext not supported');
        return;
      }
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  };

  const showNotification = (title: string, body: string, icon?: string, triggerEvent?: string, trackingKey?: string) => {
    if (!settings.enabled) return;

    requestPermission().then((hasPermission) => {
      if (hasPermission) {
        new Notification(title, {
          body,
          icon: icon || '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'claude-code-commander',
          requireInteraction: false,
        });

        playNotificationSound();

        // Track notification shown analytics - only if this is a unique notification
        // trackingKey is used to deduplicate notifications (e.g., "sessionId:status")
        // If no trackingKey is provided, we track every notification (backwards compatibility)
        if (!trackingKey || !trackedNotificationsRef.current.has(trackingKey)) {
          // Mark this notification as tracked
          if (trackingKey) {
            trackedNotificationsRef.current.add(trackingKey);
          }

          const notificationType = title.includes('Error') || title.includes('error') ? 'error' :
                                   title.includes('Complete') || title.includes('complete') ? 'success' :
                                   title.includes('Required') || title.includes('waiting') ? 'info' : 'other';

          AnalyticsService.trackNotificationShown({
            notification_type: notificationType,
            trigger_event: triggerEvent || 'unknown',
          }).catch((error) => {
            console.error('[Notifications] Failed to track notification:', error);
          });
        }
      }
    });
  };

  const getStatusEmoji = (status: string): string => {
    switch (status) {
      case 'initializing': return '🔄';
      case 'running': return '🏃';
      case 'waiting': return '⏸️';
      case 'stopped': return '✅';
      case 'completed_unviewed': return '🔔';
      case 'error': return '❌';
      default: return '📝';
    }
  };

  const getStatusMessage = (status: string): string => {
    switch (status) {
      case 'initializing': return 'is starting up';
      case 'running': return 'is working';
      case 'waiting': return 'needs your input';
      case 'stopped': return 'has completed';
      case 'completed_unviewed': return 'has new activity';
      case 'error': return 'encountered an error';
      default: return 'status changed';
    }
  };

  useEffect(() => {
    const prevSessions = prevSessionsRef.current;
    
    // If this is the initial load (prevSessions is empty and we have sessions),
    // just update the ref without triggering notifications
    if (!initialLoadComplete.current && prevSessions.length === 0 && sessions.length > 0) {
      prevSessionsRef.current = sessions;
      initialLoadComplete.current = true;
      return;
    }
    
    // Only process notifications after the initial load is complete
    if (!initialLoadComplete.current) {
      return;
    }
    
    // Compare current sessions with previous sessions to detect changes
    sessions.forEach((currentSession) => {
      const prevSession = prevSessions.find(s => s.id === currentSession.id);
      
      if (!prevSession) {
        // New session created - use tracking key to prevent duplicate tracking
        if (settings.notifyOnStatusChange) {
          showNotification(
            `New Session Created ${getStatusEmoji('initializing')}`,
            `"${currentSession.name}" is starting up`,
            undefined,
            'session_created',
            `${currentSession.id}:created` // Tracking key ensures we only track this once
          );
        }
        return;
      }

      // Check for status changes
      if (prevSession.status !== currentSession.status) {
        const emoji = getStatusEmoji(currentSession.status);
        const message = getStatusMessage(currentSession.status);

        // Use tracking key format: `sessionId:status` to deduplicate per-status notifications
        // This ensures that if a session transitions from waiting->running->waiting,
        // we track both 'waiting' notifications, but if the component re-renders while
        // in 'waiting' state, we don't track it multiple times
        const trackingKey = `${currentSession.id}:${currentSession.status}`;

        // Notify based on specific status
        if (currentSession.status === 'waiting' && settings.notifyOnWaiting) {
          showNotification(
            `Input Required ${emoji}`,
            `"${currentSession.name}" is waiting for your response`,
            undefined,
            'status_waiting',
            trackingKey
          );
        } else if (currentSession.status === 'completed_unviewed' && settings.notifyOnComplete) {
          showNotification(
            `Session Complete ✅`,
            `"${currentSession.name}" has finished`,
            undefined,
            'status_completed',
            trackingKey
          );
        } else if (currentSession.status === 'error') {
          showNotification(
            `Session Error ${emoji}`,
            `"${currentSession.name}" encountered an error`,
            undefined,
            'status_error',
            trackingKey
          );
        } else if (settings.notifyOnStatusChange) {
          showNotification(
            `Status Update ${emoji}`,
            `"${currentSession.name}" ${message}`,
            undefined,
            `status_${currentSession.status}`,
            trackingKey
          );
        }
      }
    });

    // Update the ref for next comparison
    prevSessionsRef.current = sessions;
  }, [sessions, settings]);

  // Load settings on first mount
  useEffect(() => {
    if (!settingsLoaded.current) {
      settingsLoaded.current = true;
      
      API.config.get().then(response => {
        if (response.success && response.data?.notifications) {
          setSettings(response.data.notifications);
        }
      }).catch(error => {
        console.error('Failed to load notification settings:', error);
      });
      
      requestPermission();
    }
  }, []);

  return {
    settings,
    updateSettings: (newSettings: Partial<NotificationSettings>) => {
      setSettings(prev => ({ ...prev, ...newSettings }));
    },
    requestPermission,
    showNotification,
  };
}
import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { API } from '../utils/api';

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
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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

  const showNotification = (title: string, body: string, icon?: string) => {
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
    
    // Compare current sessions with previous sessions to detect changes
    sessions.forEach((currentSession) => {
      const prevSession = prevSessions.find(s => s.id === currentSession.id);
      
      if (!prevSession) {
        // New session created
        if (settings.notifyOnStatusChange) {
          showNotification(
            `New Session Created ${getStatusEmoji('initializing')}`,
            `"${currentSession.name}" is starting up`
          );
        }
        return;
      }

      // Check for status changes
      if (prevSession.status !== currentSession.status) {
        const emoji = getStatusEmoji(currentSession.status);
        const message = getStatusMessage(currentSession.status);
        
        // Notify based on specific status
        if (currentSession.status === 'waiting' && settings.notifyOnWaiting) {
          showNotification(
            `Input Required ${emoji}`,
            `"${currentSession.name}" is waiting for your response`
          );
        } else if (currentSession.status === 'completed_unviewed' && settings.notifyOnComplete) {
          showNotification(
            `Session Complete ✅`,
            `"${currentSession.name}" has finished`
          );
        } else if (currentSession.status === 'error') {
          showNotification(
            `Session Error ${emoji}`,
            `"${currentSession.name}" encountered an error`
          );
        } else if (settings.notifyOnStatusChange) {
          showNotification(
            `Status Update ${emoji}`,
            `"${currentSession.name}" ${message}`
          );
        }
      }
    });

    // Update the ref for next comparison
    prevSessionsRef.current = sessions;
  }, [sessions]);

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
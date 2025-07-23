import { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ToggleField } from './ui/Toggle';

interface NotificationSettings {
  enabled: boolean;
  playSound: boolean;
  notifyOnStatusChange: boolean;
  notifyOnWaiting: boolean;
  notifyOnComplete: boolean;
}

interface NotificationSettingsProps {
  settings: NotificationSettings;
  onUpdateSettings: (settings: Partial<NotificationSettings>) => void;
}

export function NotificationSettings({ settings, onUpdateSettings }: NotificationSettingsProps) {
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
  };

  const testNotification = () => {
    if (Notification.permission === 'granted') {
      new Notification('Crystal', {
        body: 'This is a test notification! 🎉',
        icon: '/favicon.ico',
      });
    } else {
      alert('Please enable notifications first');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-text-primary mb-4">Notification Settings</h3>
        
        {/* Permission Status */}
        <Card variant="bordered" className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-text-secondary">Browser Permissions</h4>
              <p className="text-sm text-text-tertiary">
                Status: {permissionStatus === 'granted' ? '✅ Enabled' : 
                        permissionStatus === 'denied' ? '❌ Denied' : '⚠️ Not requested'}
              </p>
            </div>
            {permissionStatus !== 'granted' && (
              <Button
                onClick={requestPermission}
                size="sm"
                variant="primary"
              >
                Enable Notifications
              </Button>
            )}
          </div>
          {permissionStatus === 'granted' && (
            <Button
              onClick={testNotification}
              size="sm"
              variant="secondary"
              className="mt-2 !bg-status-success hover:!bg-status-success-hover !text-white"
            >
              Test Notification
            </Button>
          )}
        </Card>

        {/* Settings */}
        <div className="space-y-4">
          <ToggleField
            label="Enable Notifications"
            description="Show browser notifications for session events"
            checked={settings.enabled}
            onChange={(checked) => onUpdateSettings({ enabled: checked })}
          />

          <ToggleField
            label="Play Sound"
            description="Play a sound when notifications appear"
            checked={settings.playSound}
            onChange={(checked) => onUpdateSettings({ playSound: checked })}
          />

          <ToggleField
            label="Status Changes"
            description="Notify when session status changes"
            checked={settings.notifyOnStatusChange}
            onChange={(checked) => onUpdateSettings({ notifyOnStatusChange: checked })}
          />

          <ToggleField
            label="Input Required"
            description="Notify when sessions are waiting for input"
            checked={settings.notifyOnWaiting}
            onChange={(checked) => onUpdateSettings({ notifyOnWaiting: checked })}
          />

          <ToggleField
            label="Session Complete"
            description="Notify when sessions finish successfully"
            checked={settings.notifyOnComplete}
            onChange={(checked) => onUpdateSettings({ notifyOnComplete: checked })}
          />
        </div>
      </div>
    </div>
  );
}
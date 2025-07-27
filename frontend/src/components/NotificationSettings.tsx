import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { ToggleField } from './ui/Toggle';
import { CollapsibleCard } from './ui/CollapsibleCard';
import { SettingsSection } from './ui/SettingsSection';
import { Bell, BellOff, Volume2, VolumeX, Zap, Shield } from 'lucide-react';

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

  const getPermissionIcon = () => {
    switch (permissionStatus) {
      case 'granted': return <Bell className="w-4 h-4 text-status-success" />;
      case 'denied': return <BellOff className="w-4 h-4 text-status-error" />;
      default: return <Shield className="w-4 h-4 text-status-warning" />;
    }
  };

  const getPermissionStatus = () => {
    switch (permissionStatus) {
      case 'granted': return { text: 'Enabled', color: 'text-status-success' };
      case 'denied': return { text: 'Denied', color: 'text-status-error' };
      default: return { text: 'Not requested', color: 'text-status-warning' };
    }
  };

  const status = getPermissionStatus();

  return (
    <div className="space-y-6">
      {/* Browser Permissions */}
      <CollapsibleCard
        title="Browser Permissions"
        subtitle="Allow Crystal to show desktop notifications"
        icon={getPermissionIcon()}
        defaultExpanded={true}
      >
        <SettingsSection
          title="Notification Access"
          description="Crystal needs browser permission to show notifications when your sessions update"
          icon={getPermissionIcon()}
        >
          <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg border border-border-secondary">
            <div className="flex items-center gap-3">
              {getPermissionIcon()}
              <div>
                <span className="text-sm font-medium text-text-primary">Permission Status</span>
                <p className={`text-sm ${status.color} font-medium`}>
                  {status.text}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {permissionStatus !== 'granted' && (
                <Button
                  onClick={requestPermission}
                  size="sm"
                  variant="primary"
                >
                  Enable Notifications
                </Button>
              )}
              {permissionStatus === 'granted' && (
                <Button
                  onClick={testNotification}
                  size="sm"
                  variant="secondary"
                >
                  Test Notification
                </Button>
              )}
            </div>
          </div>
          {permissionStatus === 'denied' && (
            <div className="mt-3 p-3 bg-status-error/10 border border-status-error/20 rounded-lg">
              <p className="text-xs text-status-error">
                Notifications are blocked. Please enable them in your browser settings and refresh Crystal.
              </p>
            </div>
          )}
        </SettingsSection>
      </CollapsibleCard>

      {/* Notification Preferences */}
      <CollapsibleCard
        title="Notification Preferences"
        subtitle="Customize when and how you receive notifications"
        icon={settings.enabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        defaultExpanded={true}
      >
        <SettingsSection
          title="Master Control"
          description="Turn all notifications on or off"
          icon={settings.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        >
          <ToggleField
            label="Enable Notifications"
            description="Show browser notifications for session events"
            checked={settings.enabled}
            onChange={(checked) => onUpdateSettings({ enabled: checked })}
          />
        </SettingsSection>

        <SettingsSection
          title="Sound & Audio"
          description="Control notification sounds"
          icon={settings.playSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        >
          <ToggleField
            label="Play notification sounds"
            description="Play a subtle sound when notifications appear"
            checked={settings.playSound}
            onChange={(checked) => onUpdateSettings({ playSound: checked })}
          />
        </SettingsSection>

        <SettingsSection
          title="Event Triggers"
          description="Choose which session events should trigger notifications"
          icon={<Zap className="w-4 h-4" />}
          spacing="sm"
        >
          <div className="space-y-3">
            <ToggleField
              label="Status changes"
              description="When sessions start, stop, or change state"
              checked={settings.notifyOnStatusChange}
              onChange={(checked) => onUpdateSettings({ notifyOnStatusChange: checked })}
            />

            <ToggleField
              label="Input required"
              description="When Claude is waiting for your response"
              checked={settings.notifyOnWaiting}
              onChange={(checked) => onUpdateSettings({ notifyOnWaiting: checked })}
            />

            <ToggleField
              label="Task completion"
              description="When sessions finish successfully"
              checked={settings.notifyOnComplete}
              onChange={(checked) => onUpdateSettings({ notifyOnComplete: checked })}
            />
          </div>
        </SettingsSection>
      </CollapsibleCard>
    </div>
  );
}
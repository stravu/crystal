import { useState, useEffect } from 'react';

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

  const handleToggle = (key: keyof NotificationSettings) => {
    onUpdateSettings({ [key]: !settings[key] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Settings</h3>
        
        {/* Permission Status */}
        <div className="mb-6 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-700">Browser Permissions</h4>
              <p className="text-sm text-gray-500">
                Status: {permissionStatus === 'granted' ? '✅ Enabled' : 
                        permissionStatus === 'denied' ? '❌ Denied' : '⚠️ Not requested'}
              </p>
            </div>
            {permissionStatus !== 'granted' && (
              <button
                onClick={requestPermission}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Enable Notifications
              </button>
            )}
          </div>
          {permissionStatus === 'granted' && (
            <button
              onClick={testNotification}
              className="mt-2 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Test Notification
            </button>
          )}
        </div>

        {/* Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Enable Notifications</label>
              <p className="text-sm text-gray-500">Show browser notifications for session events</p>
            </div>
            <button
              onClick={() => handleToggle('enabled')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Play Sound</label>
              <p className="text-sm text-gray-500">Play a sound when notifications appear</p>
            </div>
            <button
              onClick={() => handleToggle('playSound')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.playSound ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.playSound ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Status Changes</label>
              <p className="text-sm text-gray-500">Notify when session status changes</p>
            </div>
            <button
              onClick={() => handleToggle('notifyOnStatusChange')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.notifyOnStatusChange ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.notifyOnStatusChange ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Input Required</label>
              <p className="text-sm text-gray-500">Notify when sessions are waiting for input</p>
            </div>
            <button
              onClick={() => handleToggle('notifyOnWaiting')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.notifyOnWaiting ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.notifyOnWaiting ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-gray-700">Session Complete</label>
              <p className="text-sm text-gray-500">Notify when sessions finish successfully</p>
            </div>
            <button
              onClick={() => handleToggle('notifyOnComplete')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.notifyOnComplete ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.notifyOnComplete ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
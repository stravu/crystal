import { useState, useEffect } from 'react';
import { X, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  versionInfo?: {
    current: string;
    latest: string;
    hasUpdate: boolean;
    releaseUrl?: string;
    releaseNotes?: string;
  };
}

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export function UpdateDialog({ isOpen, onClose, versionInfo }: UpdateDialogProps) {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPackaged, setIsPackaged] = useState(false);

  useEffect(() => {
    // Check if app is packaged (auto-update only works in packaged apps)
    if (window.electronAPI?.isPackaged) {
      window.electronAPI.isPackaged().then((packaged) => {
        console.log('[UpdateDialog] App packaged state:', packaged);
        setIsPackaged(packaged);
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !window.electronAPI?.events) return;

    // Set up auto-updater event listeners
    const cleanupFns: Array<() => void> = [];

    cleanupFns.push(
      window.electronAPI.events.onUpdaterCheckingForUpdate(() => {
        setUpdateState('checking');
        setError(null);
      })
    );

    cleanupFns.push(
      window.electronAPI.events.onUpdaterUpdateAvailable((info) => {
        console.log('Update available:', info);
        setUpdateState('available');
      })
    );

    cleanupFns.push(
      window.electronAPI.events.onUpdaterUpdateNotAvailable((info) => {
        console.log('No update available:', info);
        setUpdateState('idle');
      })
    );

    cleanupFns.push(
      window.electronAPI.events.onUpdaterDownloadProgress((progress) => {
        setUpdateState('downloading');
        setDownloadProgress(progress);
      })
    );

    cleanupFns.push(
      window.electronAPI.events.onUpdaterUpdateDownloaded((info) => {
        console.log('Update downloaded:', info);
        setUpdateState('downloaded');
        setDownloadProgress(null);
      })
    );

    cleanupFns.push(
      window.electronAPI.events.onUpdaterError((err) => {
        console.error('Update error:', err);
        setUpdateState('error');
        setError(err.message || 'An unknown error occurred');
      })
    );

    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, [isOpen]);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.updater) {
      setError('Update functionality not available');
      return;
    }
    try {
      setError(null);
      await window.electronAPI.updater.checkAndDownload();
    } catch (err: any) {
      setError(err.message || 'Failed to check for updates');
      setUpdateState('error');
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.electronAPI?.updater) {
      setError('Update functionality not available');
      return;
    }
    try {
      setError(null);
      await window.electronAPI.updater.downloadUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to download update');
      setUpdateState('error');
    }
  };

  const handleInstallUpdate = async () => {
    if (!window.electronAPI?.updater) {
      setError('Update functionality not available');
      return;
    }
    try {
      await window.electronAPI.updater.installUpdate();
      // App will restart, so no need to handle response
    } catch (err: any) {
      setError(err.message || 'Failed to install update');
      setUpdateState('error');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Download className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-gray-100">Software Update</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            disabled={updateState === 'downloading'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {versionInfo && (
            <div className="mb-6">
              <div className="text-gray-300 mb-2">
                Current version: <span className="font-mono text-gray-100">{versionInfo.current}</span>
              </div>
              {versionInfo.hasUpdate && (
                <div className="text-gray-300">
                  Latest version: <span className="font-mono text-green-400">{versionInfo.latest}</span>
                </div>
              )}
            </div>
          )}

          {/* Update State UI */}
          <div className="space-y-4">
            {updateState === 'idle' && versionInfo?.hasUpdate && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-100 mb-2">Update Available</h3>
                <p className="text-gray-300 mb-4">
                  A new version of Crystal is available. 
                  {isPackaged ? ' Click below to download and install the update.' : ' Auto-update is only available in the packaged app.'}
                </p>
                
                {isPackaged ? (
                  <button
                    onClick={handleCheckForUpdates}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Download Update
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => versionInfo.releaseUrl && window.electronAPI.openExternal(versionInfo.releaseUrl)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      View Release
                    </button>
                  </div>
                )}
              </div>
            )}

            {updateState === 'checking' && (
              <div className="flex items-center gap-3 text-gray-300">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Checking for updates...</span>
              </div>
            )}

            {updateState === 'available' && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-100 mb-2">Ready to Download</h3>
                <p className="text-gray-300 mb-4">
                  The update is ready to download. This may take a few minutes depending on your connection.
                </p>
                <button
                  onClick={handleDownloadUpdate}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Start Download
                </button>
              </div>
            )}

            {updateState === 'downloading' && downloadProgress && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-gray-300">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Downloading update...</span>
                </div>
                
                <div className="bg-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
                    <span>{formatSpeed(downloadProgress.bytesPerSecond)}</span>
                  </div>
                  
                  <div className="w-full bg-gray-600 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress.percent}%` }}
                    />
                  </div>
                  
                  <div className="text-center text-sm text-gray-400">
                    {Math.round(downloadProgress.percent)}%
                  </div>
                </div>
              </div>
            )}

            {updateState === 'downloaded' && (
              <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-green-400 mb-2">Update Downloaded</h3>
                    <p className="text-gray-300 mb-4">
                      The update has been downloaded successfully. Crystal will restart to apply the update.
                    </p>
                    <button
                      onClick={handleInstallUpdate}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    >
                      Restart and Install
                    </button>
                  </div>
                </div>
              </div>
            )}

            {updateState === 'error' && error && (
              <div className="space-y-4">
                {/* Manual Download Box */}
                {versionInfo?.releaseUrl && (
                  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-blue-400 mb-1">Manual Update Available</h3>
                        <p className="text-sm text-gray-300">
                          Automatic update failed, but you can download the latest version manually.
                        </p>
                      </div>
                      <button
                        onClick={() => window.electronAPI.openExternal(versionInfo.releaseUrl!)}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download from GitHub
                      </button>
                    </div>
                  </div>
                )}

                {/* Error Details */}
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-red-400 mb-2">Update Error</h3>
                      <p className="text-gray-300 mb-2">{error}</p>
                      <div className="space-y-3">
                        <p className="text-sm text-gray-400">
                          To update manually:
                        </p>
                        <ol className="text-sm text-gray-300 list-decimal list-inside ml-2 space-y-2">
                          <li>Click "Download from GitHub" above</li>
                          <li>Download the .dmg file from the release page</li>
                          <li>Close Crystal</li>
                          <li>Open the downloaded .dmg file</li>
                          <li>Drag Crystal to your Applications folder</li>
                          <li>Launch the new version of Crystal</li>
                        </ol>
                        <p className="text-sm text-gray-400 mt-3">
                          Your settings and sessions will be preserved during the update.
                        </p>
                        {(error.includes('404') || error.includes('latest-mac.yml')) && (
                          <div className="mt-3 p-2 bg-gray-800 rounded text-xs text-gray-500">
                            <p className="font-semibold mb-1">Technical Details:</p>
                            <p>The release may be missing required update metadata files, or you may be testing with a development version.</p>
                          </div>
                        )}
                      </div>
                      {versionInfo?.releaseUrl && (
                        <button
                          onClick={() => window.electronAPI.openExternal(versionInfo.releaseUrl!)}
                          className="mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
                        >
                          View Release on GitHub
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!versionInfo?.hasUpdate && updateState === 'idle' && (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-300">You're running the latest version of Crystal!</p>
              </div>
            )}
          </div>

          {/* Release Notes */}
          {versionInfo?.releaseNotes && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-100 mb-3">Release Notes</h3>
              <div className="bg-gray-700 rounded-lg p-4 max-h-64 overflow-y-auto">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans">
                  {versionInfo.releaseNotes}
                </pre>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-700">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-400">
              {versionInfo?.releaseUrl && (
                <button
                  onClick={() => window.electronAPI.openExternal(versionInfo.releaseUrl!)}
                  className="hover:text-gray-200 underline transition-colors"
                >
                  View on GitHub
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              disabled={updateState === 'downloading'}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { X, ExternalLink, Download, Check, AlertCircle, Loader2 } from 'lucide-react';
import { UpdateDialog } from './UpdateDialog';

interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  workingDirectory?: string;
  buildDate?: string;
  gitCommit?: string;
}

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [isPackaged, setIsPackaged] = useState(true);

  useEffect(() => {
    if (isOpen) {
      // Get current version info immediately
      loadCurrentVersion();
      // Check if app is packaged
      window.electronAPI.isPackaged().then((packaged) => {
        setIsPackaged(packaged);
      });
    }
  }, [isOpen]);

  const loadCurrentVersion = async () => {
    try {
      const result = await window.electronAPI.getVersionInfo();
      if (result.success) {
        setVersionInfo({
          current: result.data.current,
          latest: result.data.current,
          hasUpdate: false,
          workingDirectory: result.data.workingDirectory,
          buildDate: result.data.buildDate,
          gitCommit: result.data.gitCommit
        });
      }
    } catch (error) {
      console.error('Failed to get version info:', error);
    }
  };

  const checkForUpdates = async () => {
    setIsChecking(true);
    setError(null);
    
    try {
      const result = await window.electronAPI.checkForUpdates();
      if (result.success) {
        setVersionInfo(result.data);
        // If update is available, automatically show the update dialog
        if (result.data.hasUpdate) {
          setShowUpdateDialog(true);
        }
      } else {
        setError(result.error || 'Failed to check for updates');
      }
    } catch (error) {
      setError('Failed to check for updates');
      console.error('Update check failed:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <img 
              src="/crystal-logo.svg" 
              alt="Crystal" 
              className="w-8 h-8"
              onError={(e) => {
                // Fallback if logo not found
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              About Crystal
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* App Info */}
          <div className="text-center space-y-2">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Crystal
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Multi-Session Claude Code Manager
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Created by{' '}
              <a 
                href="https://stravu.com/?utm_source=Crystal&utm_medium=OS&utm_campaign=Crystal&utm_id=1" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Stravu
              </a>
            </p>
          </div>

          {/* Version Info */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Current Version
              </span>
              <span className="text-sm text-gray-900 dark:text-white font-mono">
                {versionInfo?.current || 'Loading...'}
              </span>
            </div>

            {versionInfo?.workingDirectory && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Working Directory
                </span>
                <span className="text-sm text-gray-900 dark:text-white font-mono truncate max-w-[200px]" title={versionInfo.workingDirectory}>
                  {versionInfo.workingDirectory.split('/').pop() || versionInfo.workingDirectory}
                </span>
              </div>
            )}

            {versionInfo?.gitCommit && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Git Commit
                </span>
                <span className="text-sm text-gray-900 dark:text-white font-mono">
                  {versionInfo.gitCommit}
                </span>
              </div>
            )}

            {versionInfo?.buildDate && isPackaged && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Build Date
                </span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {formatDate(versionInfo.buildDate)}
                </span>
              </div>
            )}

            {versionInfo?.hasUpdate && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Update Available: v{versionInfo.latest}
                      </p>
                      {versionInfo.publishedAt && (
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Released {formatDate(versionInfo.publishedAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() => setShowUpdateDialog(true)}
                        className="inline-flex items-center justify-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Update</span>
                      </button>
                      {versionInfo.releaseUrl && (
                        <a
                          href={versionInfo.releaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center space-x-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <span>View Release Notes</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!versionInfo?.hasUpdate && versionInfo?.current && !isChecking && (
              <div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-400">
                <Check className="w-4 h-4" />
                <span>You're running the latest version</span>
              </div>
            )}

            {error && (
              <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Check for Updates Button */}
            <button
              onClick={checkForUpdates}
              disabled={isChecking}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isChecking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking for Updates...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Check for Updates</span>
                </>
              )}
            </button>
          </div>

          {/* Discord Community Button */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <a
              href="https://discord.gg/XrVa6q7DPY"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-lg transition-colors mb-4"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>Join our Discord Community</span>
            </a>
          </div>

          {/* Links */}
          <div className="space-y-2">
            <a
              href="https://github.com/stravu/crystal"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <span>View on GitHub</span>
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href="https://docs.anthropic.com/en/docs/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <span>Claude Code Documentation</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Disclaimer */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed">
              Crystal is an independent project created by Stravu. Claude™ is a trademark of Anthropic, PBC. 
              Crystal is not affiliated with, endorsed by, or sponsored by Anthropic.
            </p>
          </div>
        </div>
      </div>
      
      {/* Update Dialog */}
      {showUpdateDialog && versionInfo && (
        <UpdateDialog
          isOpen={showUpdateDialog}
          onClose={() => setShowUpdateDialog(false)}
          versionInfo={versionInfo}
        />
      )}
    </div>
  );
}
import { useEffect, useState } from 'react';
import { X, ExternalLink, Download, Check, AlertCircle, Loader2 } from 'lucide-react';

interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
}

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Get current version info immediately
      loadCurrentVersion();
    }
  }, [isOpen]);

  const loadCurrentVersion = async () => {
    try {
      const result = await window.electronAPI.getVersionInfo();
      if (result.success) {
        setVersionInfo({
          current: result.data.current,
          latest: result.data.current,
          hasUpdate: false
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
                href="https://stravu.com" 
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

            {versionInfo?.hasUpdate && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Download className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Update Available: v{versionInfo.latest}
                    </p>
                    {versionInfo.publishedAt && (
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Released {formatDate(versionInfo.publishedAt)}
                      </p>
                    )}
                    {versionInfo.releaseUrl && (
                      <a
                        href={versionInfo.releaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <span>View Release Notes</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
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

          {/* Links */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
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
    </div>
  );
}
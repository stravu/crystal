import { useEffect } from 'react';
import { X, ExternalLink, Download } from 'lucide-react';
import { NimbalystIcon } from './icons/NimbalystIcon';
import { AnalyticsService } from '../services/analyticsService';

interface NimbalystInstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NimbalystInstallDialog({ isOpen, onClose }: NimbalystInstallDialogProps) {
  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleDownload();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    // Track download button click
    await AnalyticsService.trackNimbalystDownloadClicked({});

    window.electronAPI.invoke('openExternal', 'https://nimbalyst.com/');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
        {/* Header with gradient background */}
        <div className="relative bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 p-6 pb-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-lg">
              <NimbalystIcon size={40} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-1">
                Nimbalyst
              </h3>
              <p className="text-blue-100 dark:text-blue-200 text-sm font-medium">
                Integrated Markdown Environment
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 mt-1">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex-1">
              <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                Installation Required
              </h4>
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                Nimbalyst is not installed on your system. To open worktrees in Nimbalyst, please download and install it first.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-lg p-4">
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
              <span className="font-semibold text-blue-700 dark:text-blue-400">Nimbalyst</span> is an integrated markdown environment for Claude Code from the team that brought you Crystal.
            </p>
          </div>
        </div>

        {/* Footer with actions */}
        <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-end space-x-3 border-t border-gray-200/50 dark:border-gray-700/50">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-all border border-gray-300 dark:border-gray-600 shadow-sm hover:shadow"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-[1.02]"
            autoFocus
          >
            Download Nimbalyst
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

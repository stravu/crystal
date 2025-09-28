import { Settings, X, Play, AlertCircle } from 'lucide-react';

interface RunScriptConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function RunScriptConfigDialog({
  isOpen,
  onClose,
  onOpenSettings
}: RunScriptConfigDialogProps) {
  if (!isOpen) return null;

  const handleOpenSettings = () => {
    onClose();
    if (onOpenSettings) {
      onOpenSettings();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <Play className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Configure Run Script
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="mb-6 space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-300">
                <p className="font-semibold mb-1">No run script configured</p>
                <p>A run script is required to test changes in your application.</p>
              </div>
            </div>
          </div>

          <div className="text-gray-700 dark:text-gray-300 space-y-3">
            <p>
              <strong>What is a run script?</strong><br />
              A run script contains the commands needed to start your application for testing changes made by Claude Code sessions.
            </p>
            
            <p>
              <strong>How to configure:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>Click the settings icon (⚙️) next to your project name in the sidebar (visible on hover)</li>
              <li>In the "Run Script" field, enter the command(s) to start your application</li>
              <li>Optionally add a "Build Script" that runs when creating new worktrees</li>
            </ol>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>💡 Recommendation:</strong> Include commands to kill any existing instances of your application to prevent port conflicts when switching between sessions.
              </p>
              <div className="mt-2 font-mono text-xs bg-white dark:bg-gray-900 p-2 rounded border border-blue-200 dark:border-blue-700">
                <div className="text-gray-600 dark:text-gray-400"># Example for a Node.js app on port 3000:</div>
                <div>pkill -f "node.*port=3000" || true</div>
                <div>npm run dev</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
          >
            Close
          </button>
          {onOpenSettings && (
            <button
              onClick={handleOpenSettings}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center space-x-2"
              autoFocus
            >
              <Settings className="w-4 h-4" />
              <span>Open Project Settings</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
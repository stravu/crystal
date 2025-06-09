import { AlertCircle, X } from 'lucide-react';

interface ErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  error: string;
  details?: string;
  command?: string;
}

export function ErrorDialog({ 
  isOpen, 
  onClose, 
  title = "Command Failed", 
  error, 
  details,
  command 
}: ErrorDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="space-y-4 overflow-y-auto">
          <div>
            <p className="text-gray-300">{error}</p>
          </div>
          
          {command && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-1">Command:</h4>
              <pre className="bg-gray-900 p-3 rounded text-sm text-gray-300 font-mono overflow-x-auto">
                {command}
              </pre>
            </div>
          )}
          
          {details && (
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-1">Error Details:</h4>
              <pre className="bg-gray-900 p-3 rounded text-sm text-red-400 font-mono overflow-x-auto whitespace-pre-wrap">
                {details}
              </pre>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
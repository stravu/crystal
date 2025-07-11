import React from 'react';
import { GitErrorDetails } from '../../types/session';
import { sanitizeGitOutput } from '../../utils/sanitizer';

interface GitErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  errorDetails: GitErrorDetails | null;
  formatGitOutput: (output: string) => string;
  getGitErrorTips: (errorDetails: GitErrorDetails) => string[];
  onAbortAndUseClaude: () => void;
}

export const GitErrorDialog: React.FC<GitErrorDialogProps> = ({
  isOpen,
  onClose,
  errorDetails,
  formatGitOutput,
  getGitErrorTips,
  onAbortAndUseClaude,
}) => {
  if (!isOpen || !errorDetails) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center space-x-3">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">{errorDetails.title}</h2>
          </div>
          <button onClick={onClose} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Error Message</h3>
              <div className="bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md p-3">
                <p className="text-red-600 dark:text-red-400 text-sm">{errorDetails.message}</p>
              </div>
            </div>

            <div className="border-2 border-red-300 dark:border-red-800 rounded-lg p-4 bg-red-100 dark:bg-red-900/20">
              <h3 className="text-base font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Git Output
              </h3>
              <div className="bg-gray-900 text-gray-100 rounded-md p-4 max-h-96 overflow-y-auto shadow-inner">
                <pre className="text-sm whitespace-pre-wrap font-mono">{sanitizeGitOutput(errorDetails.output || 'No output available')}</pre>
              </div>
            </div>

            {errorDetails.workingDirectory && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Working Directory</h3>
                <div className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-3">
                  <p className="text-gray-800 dark:text-gray-200 text-sm font-mono">{errorDetails.workingDirectory}</p>
                </div>
              </div>
            )}

            {errorDetails.projectPath && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Path</h3>
                <div className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-3">
                  <p className="text-gray-800 dark:text-gray-200 text-sm font-mono">{errorDetails.projectPath}</p>
                </div>
              </div>
            )}

            {(errorDetails.command || errorDetails.commands) && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {errorDetails.commands ? 'Git Commands Executed' : 'Git Command'}
                </h3>
                <div className="space-y-2">
                  {errorDetails.command && <div className="bg-gray-900 text-gray-100 rounded-md p-3 font-mono text-sm">{errorDetails.command}</div>}
                  {errorDetails.commands && errorDetails.commands.map((cmd, idx) => (
                    <div key={idx} className="bg-gray-900 text-gray-100 rounded-md p-3 font-mono text-sm">{cmd}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-800 rounded-md p-4">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">Troubleshooting Tips</h4>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    {getGitErrorTips(errorDetails).map((tip, idx) => <li key={idx}>{tip}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            {errorDetails.isRebaseConflict && (
              <button onClick={onAbortAndUseClaude} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>Use Claude Code to Resolve</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={() => navigator.clipboard.writeText(errorDetails.output || '')} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              <span>Copy Output</span>
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 
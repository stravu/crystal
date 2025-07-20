import { useState, useEffect } from 'react';
import { Settings } from './Settings';
import { DraggableProjectTreeView } from './DraggableProjectTreeView';
import { Info, Clock } from 'lucide-react';
import crystalLogo from '../assets/crystal-logo.svg';

interface SidebarProps {
  onHelpClick: () => void;
  onAboutClick: () => void;
  onPromptHistoryClick: () => void;
  width: number;
  onResize: (e: React.MouseEvent) => void;
}

export function Sidebar({ onHelpClick, onAboutClick, onPromptHistoryClick, width, onResize }: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showStatusGuide, setShowStatusGuide] = useState(false);
  const [version, setVersion] = useState<string>('');
  const [gitCommit, setGitCommit] = useState<string>('');

  useEffect(() => {
    // Fetch version info on component mount
    const fetchVersion = async () => {
      try {
        const result = await window.electronAPI.getVersionInfo();
        if (result.success && result.data) {
          if (result.data.current) {
            setVersion(result.data.current);
          }
          if (result.data.gitCommit) {
            setGitCommit(result.data.gitCommit);
          }
        }
      } catch (error) {
        console.error('Failed to fetch version:', error);
      }
    };
    
    fetchVersion();
  }, []);

  return (
    <>
      <div 
        data-testid="sidebar" 
        className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white h-full flex flex-col pt-4 relative flex-shrink-0 border-r border-gray-200 dark:border-gray-700"
        style={{ width: `${width}px` }}
      >
        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize group z-10"
          onMouseDown={onResize}
        >
          {/* Visual indicator */}
          <div className="absolute inset-0 bg-gray-300 dark:bg-gray-700 group-hover:bg-blue-500 transition-colors" />
          {/* Larger grab area */}
          <div className="absolute -left-2 -right-2 top-0 bottom-0" />
          {/* Drag indicator dots */}
          <div className="absolute top-1/2 -translate-y-1/2 right-0 transform translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex flex-col gap-1">
              <div className="w-1 h-1 bg-blue-400 rounded-full" />
              <div className="w-1 h-1 bg-blue-400 rounded-full" />
              <div className="w-1 h-1 bg-blue-400 rounded-full" />
            </div>
          </div>
        </div>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between overflow-hidden">
          <div className="flex items-center space-x-2 min-w-0">
            <img src={crystalLogo} alt="Crystal" className="h-6 w-6 flex-shrink-0" />
            <h1 className="text-xl font-bold truncate">Crystal</h1>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button
              onClick={onHelpClick}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Help"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              data-testid="settings-button"
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>


        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="px-4 py-2 text-sm uppercase flex items-center justify-between overflow-hidden">
            <span className="truncate text-gray-700 dark:text-gray-400">Projects & Sessions</span>
            <div className="flex items-center space-x-1">
              <button 
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                title="View Prompt History (Cmd/Ctrl + P)"
                onClick={onPromptHistoryClick}
              >
                <Clock className="w-4 h-4" />
              </button>
              <button 
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                title="View status legend"
                onClick={() => setShowStatusGuide(true)}
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>
          <DraggableProjectTreeView />
        </div>
        
        {/* Version display at bottom */}
        {version && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <div 
              className="text-xs text-gray-500 dark:text-gray-500 text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-400 transition-colors"
              onClick={onAboutClick}
              title="Click to view version details"
            >
              v{version}{gitCommit && ` • ${gitCommit}`}
            </div>
          </div>
        )}
    </div>

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      {/* Status Guide Modal */}
      {showStatusGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowStatusGuide(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Session Status Guide</h3>
              <button
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                onClick={() => setShowStatusGuide(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                <div>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">Initializing</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Setting up git worktree and environment</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                <div>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">Running</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Claude is actively processing your request</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse flex-shrink-0"></div>
                <div>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">Waiting</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Claude needs your input to continue</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-gray-400 rounded-full flex-shrink-0"></div>
                <div>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">Completed</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Task finished successfully</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse flex-shrink-0"></div>
                <div>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">New Activity</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Session has new unviewed results</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
                <div>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">Error</span>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Something went wrong with the session</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

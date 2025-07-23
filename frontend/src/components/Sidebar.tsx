import { useState, useEffect } from 'react';
import { Settings } from './Settings';
import { DraggableProjectTreeView } from './DraggableProjectTreeView';
import { Info, Clock, Check, Edit, FileText, CircleArrowUp, CircleArrowDown, AlertTriangle, HelpCircle, GitMerge, GitBranch } from 'lucide-react';
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
  const [worktreeName, setWorktreeName] = useState<string>('');

  useEffect(() => {
    // Fetch version info on component mount
    const fetchVersion = async () => {
      try {
        console.log('[Sidebar Debug] Fetching version info...');
        const result = await window.electronAPI.getVersionInfo();
        console.log('[Sidebar Debug] Version info result:', result);
        if (result.success && result.data) {
          console.log('[Sidebar Debug] Version data:', result.data);
          if (result.data.current) {
            setVersion(result.data.current);
            console.log('[Sidebar Debug] Set version:', result.data.current);
          }
          if (result.data.gitCommit) {
            setGitCommit(result.data.gitCommit);
            console.log('[Sidebar Debug] Set gitCommit:', result.data.gitCommit);
          }
          if (result.data.worktreeName) {
            setWorktreeName(result.data.worktreeName);
            console.log('[Sidebar Debug] Set worktreeName:', result.data.worktreeName);
          } else {
            console.log('[Sidebar Debug] No worktreeName in response');
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
              className="text-xs text-gray-500 dark:text-gray-500 text-center cursor-pointer hover:text-gray-700 dark:hover:text-gray-400 transition-colors truncate"
              onClick={onAboutClick}
              title="Click to view version details"
            >
              v{version}{worktreeName && ` • ${worktreeName}`}{gitCommit && ` • ${gitCommit}`}
            </div>
          </div>
        )}
    </div>

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      
      {/* Status Guide Modal */}
      {showStatusGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowStatusGuide(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Status Indicators Guide</h3>
              <button
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                onClick={() => setShowStatusGuide(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Project & Session Status */}
                <div className="space-y-6">
                  {/* Project Indicators */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Project Indicators</h4>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                      <div className="relative">
                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path d="M6 3v12M6 3a9 9 0 0 0 9 9m-9-9a9 9 0 0 1 9 9m0-9h12" />
                        </svg>
                        <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full"></div>
                      </div>
                      <div>
                        <span className="text-gray-700 dark:text-gray-200 font-medium">Git Project</span>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Project connected to a git repository</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Session Status Indicators */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Session Status</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-2 rounded">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                        <div>
                          <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">Initializing</span>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Setting up git worktree</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                        <div>
                          <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">Running</span>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Claude is actively processing</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded">
                        <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse flex-shrink-0"></div>
                        <div>
                          <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">Waiting</span>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Claude needs your input</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded">
                        <div className="w-3 h-3 bg-gray-400 rounded-full flex-shrink-0"></div>
                        <div>
                          <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">Completed</span>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Task finished successfully</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded">
                        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse flex-shrink-0"></div>
                        <div>
                          <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">New Activity</span>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Session has new unviewed results</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 p-2 rounded">
                        <div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div>
                        <div>
                          <span className="text-gray-700 dark:text-gray-200 font-medium text-sm">Error</span>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">Something went wrong</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Git Status Indicators */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Git Status Indicators</h4>
                  <p className="text-gray-600 dark:text-gray-400 text-xs mb-4">Click any indicator to view detailed changes in the View Diff tab</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-gray-300 dark:border-gray-600">
                        <Check className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Fully synced with main - safe to remove</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-gray-300 dark:border-gray-600">
                        <GitMerge className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">3</span>
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Ready to merge (commits ahead of main)</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-gray-300 dark:border-gray-600">
                        <Edit className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">2</span>
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Active changes (uncommitted files)</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600">
                        <CircleArrowUp className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">1</span>
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Ahead of main (commits to push)</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-600">
                        <FileText className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Untracked files present</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-gray-300 dark:border-gray-600">
                        <CircleArrowDown className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">2</span>
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Behind main (needs pull)</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-gray-300 dark:border-gray-600">
                        <GitBranch className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">2</span>
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Diverged from main</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-gray-300 dark:border-gray-600">
                        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Merge conflicts - resolve before continuing</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600">
                        <HelpCircle className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">Unknown status</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="font-medium text-blue-900 dark:text-blue-200 text-xs mb-2">Features</p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-blue-800 dark:text-blue-300">
                      <li>Numbers show commit count or file changes</li>
                      <li>Star (★) indicates counts above 9</li>
                      <li>Hover for detailed tooltips with stats</li>
                      <li>Real-time updates as you work</li>
                      <li>Multiple states can be shown together</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

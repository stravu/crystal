import { useState, useEffect } from 'react';
import { Settings } from './Settings';
import { DraggableProjectTreeView } from './DraggableProjectTreeView';
import { Info, Clock, Check, Edit, CircleArrowDown, AlertTriangle, GitMerge } from 'lucide-react';
import crystalLogo from '../assets/crystal-logo.svg';
import { IconButton } from './ui/Button';
import { Modal, ModalHeader, ModalBody } from './ui/Modal';

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
        className="bg-surface-primary text-text-primary h-full flex flex-col pt-4 relative flex-shrink-0 border-r border-border-primary"
        style={{ width: `${width}px` }}
      >
        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize group z-10"
          onMouseDown={onResize}
        >
          {/* Visual indicator */}
          <div className="absolute inset-0 bg-border-secondary group-hover:bg-interactive transition-colors" />
          {/* Larger grab area */}
          <div className="absolute -left-2 -right-2 top-0 bottom-0" />
          {/* Drag indicator dots */}
          <div className="absolute top-1/2 -translate-y-1/2 right-0 transform translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex flex-col gap-1">
              <div className="w-1 h-1 bg-interactive rounded-full" />
              <div className="w-1 h-1 bg-interactive rounded-full" />
              <div className="w-1 h-1 bg-interactive rounded-full" />
            </div>
          </div>
        </div>
        <div className="p-4 border-b border-border-primary flex items-center justify-between overflow-hidden">
          <div className="flex items-center space-x-2 min-w-0">
            <img src={crystalLogo} alt="Crystal" className="h-6 w-6 flex-shrink-0" />
            <h1 className="text-xl font-bold truncate">Crystal</h1>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <IconButton
              onClick={onHelpClick}
              aria-label="Help"
              size="md"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <IconButton
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Settings"
              data-testid="settings-button"
              size="md"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
          </div>
        </div>


        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="px-4 py-2 text-sm uppercase flex items-center justify-between overflow-hidden">
            <span className="truncate text-text-tertiary">Projects & Sessions</span>
            <div className="flex items-center space-x-1">
              <IconButton
                aria-label="View Prompt History (Cmd/Ctrl + P)"
                size="sm"
                onClick={onPromptHistoryClick}
                icon={<Clock className="w-4 h-4" />}
              />
              <IconButton
                aria-label="View status legend"
                size="sm"
                onClick={() => setShowStatusGuide(true)}
                icon={<Info className="w-4 h-4" />}
              />
            </div>
          </div>
          <DraggableProjectTreeView />
        </div>
        
        {/* Version display at bottom */}
        {version && (
          <div className="px-4 py-2 border-t border-border-primary">
            <div 
              className="text-xs text-text-tertiary text-center cursor-pointer hover:text-text-secondary transition-colors truncate"
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
      <Modal 
        isOpen={showStatusGuide} 
        onClose={() => setShowStatusGuide(false)}
        size="lg"
      >
        <ModalHeader>Status Indicators Guide</ModalHeader>
        <ModalBody>
            
            <div className="space-y-4">
              {/* Project Indicators */}
              <div className="pb-3 border-b border-border-primary">
                <h4 className="text-sm font-medium text-text-primary mb-2">Project Indicators</h4>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <svg className="w-4 h-4 text-interactive" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path d="M6 3v12M6 3a9 9 0 0 0 9 9m-9-9a9 9 0 0 1 9 9m0-9h12" />
                    </svg>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-status-success rounded-full"></div>
                  </div>
                  <div>
                    <span className="text-text-secondary font-medium">Git Project</span>
                    <p className="text-text-tertiary text-sm">Project connected to a git repository</p>
                  </div>
                </div>
              </div>
              
              {/* Session Status Indicators */}
              <div className="pb-3 border-b border-border-primary">
                <h4 className="text-sm font-medium text-text-primary mb-2">Session Status</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-status-success rounded-full animate-pulse flex-shrink-0"></div>
                    <div>
                      <span className="text-text-secondary font-medium">Initializing</span>
                      <p className="text-text-tertiary text-sm">Setting up git worktree and environment</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-status-success rounded-full animate-pulse flex-shrink-0"></div>
                    <div>
                      <span className="text-text-secondary font-medium">Running</span>
                      <p className="text-text-tertiary text-sm">Claude is actively processing your request</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-status-warning rounded-full animate-pulse flex-shrink-0"></div>
                    <div>
                      <span className="text-text-secondary font-medium">Waiting</span>
                      <p className="text-text-tertiary text-sm">Claude needs your input to continue</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-status-neutral rounded-full flex-shrink-0"></div>
                    <div>
                      <span className="text-text-secondary font-medium">Completed</span>
                      <p className="text-text-tertiary text-sm">Task finished successfully</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-status-info rounded-full animate-pulse flex-shrink-0"></div>
                    <div>
                      <span className="text-text-secondary font-medium">New Activity</span>
                      <p className="text-text-tertiary text-sm">Session has new unviewed results</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-status-error rounded-full flex-shrink-0"></div>
                    <div>
                      <span className="text-text-secondary font-medium">Error</span>
                      <p className="text-text-tertiary text-sm">Something went wrong with the session</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Git Status Indicators */}
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Git Status Indicators</h4>
                <p className="text-text-tertiary text-sm mb-3">Click any indicator to view detailed changes in the View Diff tab</p>
                
                {/* HIGH PRIORITY */}
                <div className="mb-3">
                  <p className="text-xs font-medium text-text-tertiary mb-2">HIGH PRIORITY</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-status-success/10 text-status-success border-border-primary">
                        <GitMerge className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">3</span>
                      </span>
                      <span className="text-xs text-text-secondary"><strong>Ready to Merge</strong> - Changes ready to merge cleanly</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-status-warning/10 text-status-warning border-border-primary">
                        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">2</span>
                      </span>
                      <span className="text-xs text-text-secondary"><strong>Conflict Risk</strong> - Behind main, potential conflicts</span>
                    </div>
                  </div>
                </div>
                
                {/* SPECIAL CASES */}
                <div className="mb-3">
                  <p className="text-xs font-medium text-text-tertiary mb-2">SPECIAL CASES</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-status-error/10 text-status-error border-border-primary">
                        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                      <span className="text-xs text-text-secondary"><strong>Conflicts</strong> - Active merge conflicts need resolution</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-status-info/10 text-status-info border-border-primary">
                        <Edit className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">2</span>
                      </span>
                      <span className="text-xs text-text-secondary"><strong>Uncommitted</strong> - Work in progress</span>
                    </div>
                  </div>
                </div>
                
                {/* LOW PRIORITY */}
                <div>
                  <p className="text-xs font-medium text-text-tertiary mb-2">LOW PRIORITY</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center gap-0.5 w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-bg-tertiary text-text-tertiary border-border-primary">
                        <CircleArrowDown className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="font-bold">2</span>
                      </span>
                      <span className="text-xs text-text-secondary"><strong>Behind Only</strong> - No unique changes</span>
                    </div>
                    
                    <div className="flex items-center gap-3 p-2 rounded">
                      <span className="inline-flex items-center justify-center w-[5.5ch] px-1.5 py-0.5 text-xs rounded-md border bg-bg-tertiary text-text-tertiary border-border-primary">
                        <Check className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                      <span className="text-xs text-text-secondary"><strong>Up to Date</strong> - Safe to remove</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-status-info/10 border border-status-info/20 rounded-lg">
                  <p className="font-medium text-status-info text-xs mb-2">Tips</p>
                  <ul className="list-disc list-inside space-y-1 text-xs text-text-secondary">
                    <li>Focus on <strong>High Priority</strong> branches first</li>
                    <li>Numbers show commit count or file changes</li>
                    <li>Star (★) indicates counts above 9</li>
                    <li>Gray indicators are low priority - often safe to remove</li>
                    <li>Click any indicator to view detailed diff</li>
                  </ul>
                </div>
              </div>
            </div>
        </ModalBody>
      </Modal>
    </>
  );
}

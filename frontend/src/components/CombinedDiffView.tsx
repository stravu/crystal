import React, { useState, useEffect, memo, useCallback, useRef, useMemo } from 'react';
import DiffViewer, { DiffViewerHandle } from './DiffViewer';
import ExecutionList from './ExecutionList';
import { CommitDialog } from './CommitDialog';
import { FileList } from './FileList';
import { API } from '../utils/api';
import type { CombinedDiffViewProps } from '../types/diff';
import type { ExecutionDiff, GitDiffResult } from '../types/diff';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';

const CombinedDiffView: React.FC<CombinedDiffViewProps> = memo(({ 
  sessionId, 
  selectedExecutions: initialSelected,
  isGitOperationRunning = false,
  isMainRepo = false,
  isVisible = true
}) => {
  const [executions, setExecutions] = useState<ExecutionDiff[]>([]);
  const [selectedExecutions, setSelectedExecutions] = useState<number[]>(initialSelected);
  const [lastSessionId, setLastSessionId] = useState<string>(sessionId);
  const [combinedDiff, setCombinedDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [mainBranch, setMainBranch] = useState<string>('main');
  const [lastVisibleState, setLastVisibleState] = useState<boolean>(isVisible);
  const [forceRefresh, setForceRefresh] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<string | undefined>();
  
  const diffViewerRef = useRef<DiffViewerHandle>(null);

  // Load git commands to get main branch
  useEffect(() => {
    const loadGitCommands = async () => {
      try {
        const response = await API.sessions.getGitCommands(sessionId);
        if (response.success && response.data) {
          setMainBranch(response.data.mainBranch || 'main');
        }
      } catch (err) {
        console.error('Failed to load git commands:', err);
      }
    };
    
    loadGitCommands();
  }, [sessionId]);

  // Reset selection when session changes
  useEffect(() => {
    if (sessionId !== lastSessionId) {
      setSelectedExecutions([]);
      setLastSessionId(sessionId);
      setModifiedFiles(new Set());
      setCombinedDiff(null);
      setExecutions([]);
      setSelectedFile(undefined);
    }
  }, [sessionId, lastSessionId]);

  // Detect when tab becomes visible and force refresh
  useEffect(() => {
    if (isVisible && !lastVisibleState) {
      // Tab just became visible - force refresh to get latest git state
      console.log('View Diff tab became visible, forcing refresh of git data...');
      setForceRefresh(prev => prev + 1); // Increment to trigger reload
      setCombinedDiff(null); // Clear diff data
      setSelectedExecutions([]); // Clear selection to force re-selection
    }
    setLastVisibleState(isVisible);
  }, [isVisible, lastVisibleState]);

  // Load executions for the session
  useEffect(() => {
    // Load executions when component mounts, sessionId changes, or becomes visible
    // This ensures we always have the latest git state when viewing the diff tab
    
    if (!isVisible) {
      // Don't load if not visible
      return;
    }
    
    // Add a small delay to debounce rapid updates
    const timeoutId = setTimeout(() => {
      const loadExecutions = async () => {
        try {
          setLoading(true);
          let response;
          
          if (isMainRepo) {
            // For main repo sessions, get the last 20 commits
            response = await API.sessions.getLastCommits(sessionId, 20);
          } else {
            // For regular sessions, get executions
            response = await API.sessions.getExecutions(sessionId);
          }
          
          if (!response.success) {
            throw new Error(response.error || 'Failed to load executions');
          }
          const data = response.data;
          setExecutions(data);
          
          // If no initial selection and session just changed, select all executions by default
          if (selectedExecutions.length === 0 && data.length > 0) {
            // Select all commits (excluding uncommitted changes if present)
            const allCommitIds = data
              .filter((exec: ExecutionDiff) => exec.id !== 0)
              .map((exec: ExecutionDiff) => exec.id);
            
            if (allCommitIds.length > 0) {
              // Select from first to last commit as a range
              setSelectedExecutions([allCommitIds[allCommitIds.length - 1], allCommitIds[0]]);
            } else {
              // If only uncommitted changes exist, select them
              setSelectedExecutions(data.map((exec: ExecutionDiff) => exec.id));
            }
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load executions');
        } finally {
          setLoading(false);
        }
      };

      loadExecutions();
    }, 100); // Reduced to 100ms for more responsive loading

    return () => clearTimeout(timeoutId);
  }, [sessionId, initialSelected, isMainRepo, isVisible, forceRefresh]); // Added isVisible and forceRefresh to dependencies

  // Load combined diff when selection changes
  useEffect(() => {
    // Only load if visible
    if (!isVisible) {
      return;
    }
    
    // Add debouncing to prevent rapid API calls
    const timeoutId = setTimeout(() => {
      const loadCombinedDiff = async () => {
        // For main repo sessions, we don't show diffs, just commit history
        if (isMainRepo) {
          setCombinedDiff(null);
          return;
        }
        
        if (selectedExecutions.length === 0) {
          setCombinedDiff(null);
          return;
        }

        try {
          setLoading(true);
          setError(null);
          
          console.log('CombinedDiffView loadCombinedDiff called:', {
            sessionId,
            selectedExecutions,
            executionsLength: executions.length,
            isMainRepo
          });
          
          let response;
          if (selectedExecutions.length === 1) {
            // For single commit selection
            if (selectedExecutions[0] === 0) {
              // Special case for uncommitted changes - pass as single element array
              console.log('Requesting uncommitted changes for session:', sessionId, 'with executionIds:', [0]);
              response = await API.sessions.getCombinedDiff(sessionId, [0]);
            } else {
              // For regular commits, pass it as a range with the same ID
              console.log('Requesting single commit:', selectedExecutions[0]);
              response = await API.sessions.getCombinedDiff(sessionId, [selectedExecutions[0], selectedExecutions[0]]);
            }
          } else if (selectedExecutions.length === executions.length) {
            // Get all diffs
            console.log('Getting all diffs');
            response = await API.sessions.getCombinedDiff(sessionId);
          } else {
            // Get selected diffs (range)
            console.log('Requesting range of diffs:', selectedExecutions);
            response = await API.sessions.getCombinedDiff(sessionId, selectedExecutions);
          }
          
          if (!response.success) {
            throw new Error(response.error || 'Failed to load combined diff');
          }
          
          const data = response.data;
          console.log('Received diff data:', {
            hasDiff: !!data?.diff,
            diffLength: data?.diff?.length,
            stats: data?.stats,
            isUncommitted: selectedExecutions.length === 1 && selectedExecutions[0] === 0
          });
          setCombinedDiff(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load combined diff');
          setCombinedDiff(null);
        } finally {
          setLoading(false);
        }
      };

      loadCombinedDiff();
    }, 100); // Reduced to 100ms for more responsive loading

    return () => clearTimeout(timeoutId);
  }, [selectedExecutions, sessionId, executions.length, isMainRepo, isVisible]);

  const handleSelectionChange = (newSelection: number[]) => {
    setSelectedExecutions(newSelection);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleManualRefresh = () => {
    console.log('Manual refresh triggered');
    setForceRefresh(prev => prev + 1);
    setCombinedDiff(null);
    setSelectedExecutions([]);
  };

  const handleFileSave = useCallback((filePath: string) => {
    setModifiedFiles(prev => {
      const newSet = new Set(prev);
      newSet.add(filePath);
      return newSet;
    });
    
    // Refresh executions list to show uncommitted changes
    const refreshExecutions = async () => {
      try {
        console.log('Refreshing executions after file save');
        const response = await API.sessions.getExecutions(sessionId);
        if (response.success) {
          setExecutions(response.data);
        }
      } catch (err) {
        console.error('Failed to refresh executions:', err);
      }
    };
    refreshExecutions();
    
    // Refresh only uncommitted changes when a file is saved
    if (selectedExecutions.includes(0)) {
      // Reload the uncommitted changes diff
      const loadUncommittedDiff = async () => {
        try {
          console.log('Refreshing uncommitted changes after file save');
          const response = await API.sessions.getCombinedDiff(sessionId, [0]);
          if (response.success) {
            setCombinedDiff(response.data);
          }
        } catch (err) {
          console.error('Failed to refresh uncommitted changes:', err);
        }
      };
      loadUncommittedDiff();
    }
  }, [sessionId, selectedExecutions]);

  const handleCommit = useCallback(async (message: string) => {
    console.log('Committing with message:', message);
    
    const result = await window.electronAPI.invoke('git:commit', {
      sessionId,
      message
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to commit changes');
    }
    
    // Clear modified files after successful commit
    setModifiedFiles(new Set());
    
    // Reload executions to reflect the new commit
    const response = await API.sessions.getExecutions(sessionId);
    if (response.success) {
      setExecutions(response.data);
    }
  }, [sessionId]);

  const handleRevert = useCallback(async (commitHash: string) => {
    if (!window.confirm(`Are you sure you want to revert commit ${commitHash.substring(0, 7)}? This will create a new commit that undoes the changes.`)) {
      return;
    }

    try {
      const result = await window.electronAPI.invoke('git:revert', {
        sessionId,
        commitHash
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to revert commit');
      }
      
      // Reload executions to reflect the new revert commit
      const response = await API.sessions.getExecutions(sessionId);
      if (response.success) {
        setExecutions(response.data);
        // Clear selection to show the new revert commit
        setSelectedExecutions([]);
      }
    } catch (err) {
      console.error('Error reverting commit:', err);
      alert(`Failed to revert commit: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [sessionId]);

  // Clear selected file when diff changes
  useEffect(() => {
    setSelectedFile(undefined);
  }, [combinedDiff]);

  // Parse files from the diff
  const filesFromDiff = useMemo(() => {
    if (!combinedDiff?.diff) return [];
    
    const files: Array<{
      path: string;
      type: 'added' | 'deleted' | 'modified' | 'renamed';
      additions: number;
      deletions: number;
      isBinary?: boolean;
    }> = [];
    
    const fileMatches = combinedDiff.diff.match(/diff --git[\s\S]*?(?=diff --git|$)/g);
    
    if (!fileMatches) return files;
    
    for (const fileContent of fileMatches) {
      const fileNameMatch = fileContent.match(/diff --git a\/(.*?) b\/(.*?)(?:\n|$)/);
      
      if (!fileNameMatch) continue;
      
      const oldFileName = fileNameMatch[1] || '';
      const newFileName = fileNameMatch[2] || '';
      
      const isBinary = fileContent.includes('Binary files') || fileContent.includes('GIT binary patch');
      
      let type: 'added' | 'deleted' | 'modified' | 'renamed' = 'modified';
      if (fileContent.includes('new file mode')) {
        type = 'added';
      } else if (fileContent.includes('deleted file mode')) {
        type = 'deleted';
      } else if (fileContent.includes('rename from') && fileContent.includes('rename to')) {
        type = 'renamed';
      }
      
      // Count additions and deletions
      const additions = (fileContent.match(/^\+[^+]/gm) || []).length;
      const deletions = (fileContent.match(/^-[^-]/gm) || []).length;
      
      files.push({
        path: newFileName || oldFileName,
        type,
        additions,
        deletions,
        isBinary
      });
    }
    
    return files;
  }, [combinedDiff]);

  const handleFileClick = useCallback((filePath: string, index: number) => {
    setSelectedFile(filePath);
    diffViewerRef.current?.scrollToFile(index);
  }, []);

  const handleFileDelete = useCallback(async (filePath: string) => {
    try {
      const result = await window.electronAPI.invoke('file:delete', {
        sessionId,
        filePath
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete file');
      }
      
      // Clear modified files if the deleted file was modified
      setModifiedFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
      
      // Reload executions to reflect the deletion
      const response = await API.sessions.getExecutions(sessionId);
      if (response.success) {
        setExecutions(response.data);
      }
      
      // Reload the diff to get the current state
      if (selectedExecutions.length > 0) {
        let diffResponse;
        if (selectedExecutions.length === 1 && selectedExecutions[0] === 0) {
          // Uncommitted changes
          diffResponse = await API.sessions.getCombinedDiff(sessionId, [0]);
        } else if (selectedExecutions.length === executions.length) {
          // All diffs
          diffResponse = await API.sessions.getCombinedDiff(sessionId);
        } else {
          // Selected range
          diffResponse = await API.sessions.getCombinedDiff(sessionId, selectedExecutions);
        }
        
        if (diffResponse.success) {
          setCombinedDiff(diffResponse.data);
        }
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      alert(`Failed to delete file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [sessionId, selectedExecutions, executions.length]);

  const handleRestore = useCallback(async () => {
    if (!window.confirm('Are you sure you want to restore all uncommitted changes? This will discard all your local modifications.')) {
      return;
    }

    try {
      const result = await window.electronAPI.invoke('git:restore', {
        sessionId
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to restore changes');
      }
      
      // Clear modified files after successful restore
      setModifiedFiles(new Set());
      
      // Reload executions and diff
      const response = await API.sessions.getExecutions(sessionId);
      if (response.success) {
        setExecutions(response.data);
      }
      
      // Reload the uncommitted changes diff if selected
      if (selectedExecutions.includes(0)) {
        const diffResponse = await API.sessions.getCombinedDiff(sessionId, [0]);
        if (diffResponse.success) {
          setCombinedDiff(diffResponse.data);
        }
      }
    } catch (err) {
      console.error('Error restoring changes:', err);
      alert(`Failed to restore changes: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [sessionId, selectedExecutions]);

  if (loading && executions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-text-secondary">Loading executions...</div>
      </div>
    );
  }

  if (error && executions.length === 0) {
    return (
      <div className="p-4 text-status-error bg-status-error/10 border border-status-error/30 rounded">
        <h3 className="font-medium mb-2">Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={`combined-diff-view flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-bg-primary' : 'h-full'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-primary bg-surface-secondary">
        <h2 className="text-xl font-semibold text-text-primary">File Changes</h2>
        <div className="flex items-center space-x-4">
          {isGitOperationRunning && (
            <div className="flex items-center space-x-2 text-sm text-interactive">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Git operation in progress...</span>
            </div>
          )}
          {combinedDiff && (
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-status-success">+{combinedDiff.stats.additions}</span>
              <span className="text-status-error">-{combinedDiff.stats.deletions}</span>
              <span className="text-text-tertiary">{combinedDiff.stats.filesChanged} {combinedDiff.stats.filesChanged === 1 ? 'file' : 'files'}</span>
            </div>
          )}
          <button
            onClick={handleManualRefresh}
            className="p-2 rounded hover:bg-surface-hover transition-colors"
            title="Refresh git data"
            disabled={loading}
          >
            <RefreshCw className={`w-5 h-5 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded hover:bg-surface-hover transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 text-text-secondary" />
            ) : (
              <Maximize2 className="w-5 h-5 text-text-secondary" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Commits selection sidebar */}
        {!isFullscreen && (
          <div className="w-1/3 border-r border-border-primary bg-surface-secondary overflow-hidden flex flex-col">
            {/* File list - show only when we have a diff */}
            {filesFromDiff.length > 0 && (
              <div className="h-1/3 border-b border-border-primary overflow-hidden">
                <FileList
                  files={filesFromDiff}
                  onFileClick={handleFileClick}
                  onFileDelete={handleFileDelete}
                  selectedFile={selectedFile}
                />
              </div>
            )}
            
            {/* Execution list */}
            <div className={filesFromDiff.length > 0 ? "flex-1 overflow-hidden" : "h-full"}>
              <ExecutionList
                sessionId={sessionId}
                executions={executions}
                selectedExecutions={selectedExecutions}
                onSelectionChange={handleSelectionChange}
                onCommit={() => setShowCommitDialog(true)}
                onRevert={handleRevert}
                onRestore={handleRestore}
              />
            </div>
          </div>
        )}

        {/* Diff preview */}
        <div className={`${isFullscreen ? 'w-full' : 'flex-1'} overflow-auto bg-bg-primary min-w-0 flex flex-col`}>
          {isGitOperationRunning ? (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <svg className="animate-spin h-12 w-12 text-interactive mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="text-text-secondary text-center">
                <p className="font-medium">Git operation in progress</p>
                <p className="text-sm text-text-tertiary mt-1">Please wait while the operation completes...</p>
              </div>
            </div>
          ) : loading && combinedDiff === null ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-text-secondary">Loading diff...</div>
            </div>
          ) : error ? (
            <div className="p-4 text-status-error bg-status-error/10 border border-status-error/30 rounded m-4">
              <h3 className="font-medium mb-2">Error loading diff</h3>
              <p>{error}</p>
            </div>
          ) : combinedDiff ? (
            <DiffViewer 
              ref={diffViewerRef}
              diff={combinedDiff.diff} 
              sessionId={sessionId} 
              className="h-full" 
              onFileSave={handleFileSave}
              isAllCommitsSelected={(() => {
                // Check if this is showing all commits
                const commits = executions.filter(e => e.id !== 0);
                if (commits.length === 0) return true; // No commits yet
                
                // If selectedExecutions is empty, it means "all"
                if (selectedExecutions.length === 0) return true;
                
                // If it's a range selection [start, end], check if it covers all commits
                if (selectedExecutions.length === 2) {
                  const [start, end] = selectedExecutions;
                  const minId = Math.min(start, end);
                  const maxId = Math.max(start, end);
                  const firstCommitId = commits[commits.length - 1].id;
                  const lastCommitId = commits[0].id;
                  return minId <= firstCommitId && maxId >= lastCommitId;
                }
                
                // Otherwise, check if all commits are individually selected
                return selectedExecutions.length === executions.length;
              })()}
              mainBranch={mainBranch}
            />
          ) : isMainRepo ? (
            <div className="flex items-center justify-center h-full text-text-secondary">
              <div className="text-center">
                <p className="mb-2">Showing last 20 commits from the main repository</p>
                <p className="text-sm">Select commits to view details</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-text-secondary">
              Select commits to view changes
            </div>
          )}
        </div>
      </div>
      
      {/* Commit Dialog */}
      <CommitDialog
        isOpen={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onCommit={handleCommit}
        fileCount={modifiedFiles.size}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent re-renders
  return (
    prevProps.sessionId === nextProps.sessionId &&
    prevProps.isGitOperationRunning === nextProps.isGitOperationRunning &&
    prevProps.isMainRepo === nextProps.isMainRepo &&
    prevProps.isVisible === nextProps.isVisible &&
    // Deep comparison of selectedExecutions array
    prevProps.selectedExecutions.length === nextProps.selectedExecutions.length &&
    prevProps.selectedExecutions.every((val, idx) => val === nextProps.selectedExecutions[idx])
  );
});

CombinedDiffView.displayName = 'CombinedDiffView';

export default CombinedDiffView;
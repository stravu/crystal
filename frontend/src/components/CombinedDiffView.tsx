import React, { useState, useEffect, memo, useCallback } from 'react';
import DiffViewer from './DiffViewer';
import ExecutionList from './ExecutionList';
import { CommitDialog } from './CommitDialog';
import { API } from '../utils/api';
import type { CombinedDiffViewProps } from '../types/diff';
import type { ExecutionDiff, GitDiffResult } from '../types/diff';
import { Maximize2, Minimize2 } from 'lucide-react';

const CombinedDiffView: React.FC<CombinedDiffViewProps> = memo(({ 
  sessionId, 
  selectedExecutions: initialSelected,
  isGitOperationRunning = false,
  isMainRepo = false
}) => {
  const [executions, setExecutions] = useState<ExecutionDiff[]>([]);
  const [selectedExecutions, setSelectedExecutions] = useState<number[]>(initialSelected);
  const [combinedDiff, setCombinedDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  // Load executions for the session
  useEffect(() => {
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
          
          // If no initial selection, select all executions by default
          if (initialSelected.length === 0 && data.length > 0) {
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
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [sessionId, initialSelected, isMainRepo]);

  // Load combined diff when selection changes
  useEffect(() => {
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
    }, 300); // 300ms debounce for diff loading

    return () => clearTimeout(timeoutId);
  }, [selectedExecutions, sessionId, executions.length, isMainRepo]);

  const handleSelectionChange = (newSelection: number[]) => {
    setSelectedExecutions(newSelection);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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

  if (loading && executions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600 dark:text-gray-400">Loading executions...</div>
      </div>
    );
  }

  if (error && executions.length === 0) {
    return (
      <div className="p-4 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
        <h3 className="font-medium mb-2">Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={`combined-diff-view flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900' : 'h-full'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">File Changes</h2>
        <div className="flex items-center space-x-4">
          {isGitOperationRunning && (
            <div className="flex items-center space-x-2 text-sm text-blue-600">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Git operation in progress...</span>
            </div>
          )}
          {combinedDiff && (
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-green-600">+{combinedDiff.stats.additions}</span>
              <span className="text-red-600">-{combinedDiff.stats.deletions}</span>
              <span className="text-gray-400">{combinedDiff.stats.filesChanged} {combinedDiff.stats.filesChanged === 1 ? 'file' : 'files'}</span>
            </div>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <Maximize2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Commits selection sidebar */}
        {!isFullscreen && (
          <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden flex flex-col">
            <ExecutionList
              sessionId={sessionId}
              executions={executions}
              selectedExecutions={selectedExecutions}
              onSelectionChange={handleSelectionChange}
              onCommit={() => setShowCommitDialog(true)}
              hasModifiedFiles={modifiedFiles.size > 0}
            />
          </div>
        )}

        {/* Diff preview */}
        <div className={`${isFullscreen ? 'w-full' : 'flex-1'} overflow-auto bg-white dark:bg-gray-900 min-w-0 flex flex-col`}>
          {isGitOperationRunning ? (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <svg className="animate-spin h-12 w-12 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="text-gray-600 dark:text-gray-400 text-center">
                <p className="font-medium">Git operation in progress</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please wait while the operation completes...</p>
              </div>
            </div>
          ) : loading && combinedDiff === null ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-gray-600 dark:text-gray-400">Loading diff...</div>
            </div>
          ) : error ? (
            <div className="p-4 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded m-4">
              <h3 className="font-medium mb-2">Error loading diff</h3>
              <p>{error}</p>
            </div>
          ) : combinedDiff ? (
            <DiffViewer 
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
            />
          ) : isMainRepo ? (
            <div className="flex items-center justify-center h-full text-gray-600 dark:text-gray-400">
              <div className="text-center">
                <p className="mb-2">Showing last 20 commits from the main repository</p>
                <p className="text-sm">Select commits to view details</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-600 dark:text-gray-400">
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
    // Deep comparison of selectedExecutions array
    prevProps.selectedExecutions.length === nextProps.selectedExecutions.length &&
    prevProps.selectedExecutions.every((val, idx) => val === nextProps.selectedExecutions[idx])
  );
});

CombinedDiffView.displayName = 'CombinedDiffView';

export default CombinedDiffView;
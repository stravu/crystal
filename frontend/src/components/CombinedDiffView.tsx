import React, { useState, useEffect } from 'react';
import DiffViewer from './DiffViewer';
import ExecutionList from './ExecutionList';
import { apiFetch } from '../utils/api';
import type { CombinedDiffViewProps } from '../types/diff';
import type { ExecutionDiff, GitDiffResult } from '../types/diff';
import { parseDiff } from 'react-diff-view';

const CombinedDiffView: React.FC<CombinedDiffViewProps> = ({ 
  sessionId, 
  selectedExecutions: initialSelected 
}) => {
  const [executions, setExecutions] = useState<ExecutionDiff[]>([]);
  const [selectedExecutions, setSelectedExecutions] = useState<number[]>(initialSelected);
  const [combinedDiff, setCombinedDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'files' | 'diff'>('list');

  // Load executions for the session
  useEffect(() => {
    const loadExecutions = async () => {
      try {
        setLoading(true);
        const response = await apiFetch(`/api/sessions/${sessionId}/executions`);
        if (!response.ok) {
          throw new Error('Failed to load executions');
        }
        const data = await response.json();
        setExecutions(data);
        
        // If no initial selection, select all executions
        if (initialSelected.length === 0) {
          setSelectedExecutions(data.map((exec: ExecutionDiff) => exec.id));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load executions');
      } finally {
        setLoading(false);
      }
    };

    loadExecutions();
  }, [sessionId, initialSelected]);

  // Load combined diff when selection changes
  useEffect(() => {
    const loadCombinedDiff = async () => {
      if (selectedExecutions.length === 0) {
        setCombinedDiff(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        let response;
        if (selectedExecutions.length === executions.length) {
          // Get all diffs
          response = await apiFetch(`/api/sessions/${sessionId}/combined-diff`);
        } else {
          // Get selected diffs
          response = await apiFetch(`/api/sessions/${sessionId}/combined-diff`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ executionIds: selectedExecutions }),
          });
        }
        
        if (!response.ok) {
          throw new Error('Failed to load combined diff');
        }
        
        const data = await response.json();
        setCombinedDiff(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load combined diff');
        setCombinedDiff(null);
      } finally {
        setLoading(false);
      }
    };

    loadCombinedDiff();
  }, [selectedExecutions, sessionId, executions.length]);

  const handleSelectionChange = (newSelection: number[]) => {
    setSelectedExecutions(newSelection);
  };


  if (loading && executions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading executions...</div>
      </div>
    );
  }

  if (error && executions.length === 0) {
    return (
      <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded">
        <h3 className="font-medium mb-2">Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="combined-diff-view h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <h2 className="text-xl font-semibold text-gray-900">File Changes</h2>
        <div className="flex items-center space-x-4">
          {combinedDiff && (
            <div className="flex items-center space-x-4 text-sm">
              <span className="text-green-600">+{combinedDiff.stats.additions}</span>
              <span className="text-red-600">-{combinedDiff.stats.deletions}</span>
              <span className="text-gray-600">{combinedDiff.stats.filesChanged} files</span>
            </div>
          )}
          <div className="flex border border-gray-300 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-sm transition-colors ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              Executions
            </button>
            <button
              onClick={() => setViewMode('files')}
              className={`px-3 py-1 text-sm transition-colors border-l border-gray-300 ${viewMode === 'files' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              Files
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`px-3 py-1 text-sm transition-colors border-l border-gray-300 ${viewMode === 'diff' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100'}`}
            >
              Full Diff
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {viewMode === 'list' ? (
          <>
            {/* Execution selection sidebar */}
            <div className="w-1/3 border-r border-gray-200 bg-white overflow-hidden flex flex-col">
              <ExecutionList
                sessionId={sessionId}
                executions={executions}
                selectedExecutions={selectedExecutions}
                onSelectionChange={handleSelectionChange}
              />
            </div>

            {/* Diff preview */}
            <div className="flex-1 overflow-auto bg-white min-w-0">
              {loading && combinedDiff === null ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-gray-500">Loading diff...</div>
                </div>
              ) : error ? (
                <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded m-4">
                  <h3 className="font-medium mb-2">Error loading diff</h3>
                  <p>{error}</p>
                </div>
              ) : combinedDiff ? (
                <div className="p-4">
                  <DiffViewer diff={combinedDiff.diff} />
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-500">
                  Select executions to view changes
                </div>
              )}
            </div>
          </>
        ) : viewMode === 'files' ? (
          /* Files list view */
          <div className="flex-1 overflow-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-gray-500">Loading files...</div>
              </div>
            ) : error ? (
              <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded m-4">
                <h3 className="font-medium mb-2">Error loading files</h3>
                <p>{error}</p>
              </div>
            ) : combinedDiff ? (
              <div className="p-4">
                {(() => {
                  try {
                    const files = parseDiff(combinedDiff.diff);
                    if (files.length === 0) {
                      return (
                        <div className="text-center text-gray-500 py-8">
                          No files changed
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold mb-4">
                          Changed Files ({files.length})
                        </h3>
                        {files.map((file, index) => (
                          <div 
                            key={`${file.oldPath}-${file.newPath}-${index}`} 
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="text-lg">
                                {file.type === 'delete' && <span className="text-red-600">🗑️</span>}
                                {file.type === 'add' && <span className="text-green-600">➕</span>}
                                {file.type === 'modify' && <span className="text-blue-600">📝</span>}
                                {file.type === 'rename' && <span className="text-purple-600">🔄</span>}
                              </div>
                              <div>
                                <div className="font-mono text-sm font-medium text-gray-900">
                                  {file.newPath || file.oldPath}
                                </div>
                                {file.type === 'rename' && file.oldPath !== file.newPath && (
                                  <div className="text-xs text-gray-500 font-mono">
                                    {file.oldPath} → {file.newPath}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-4 text-sm">
                              <span className="text-gray-600 capitalize">{file.type}</span>
                              <div className="flex items-center space-x-2">
                                {file.hunks && file.hunks.length > 0 && (
                                  <>
                                    <span className="text-green-600">
                                      +{file.hunks.reduce((acc, hunk) => acc + hunk.changes.filter(c => c.type === 'insert').length, 0)}
                                    </span>
                                    <span className="text-red-600">
                                      -{file.hunks.reduce((acc, hunk) => acc + hunk.changes.filter(c => c.type === 'delete').length, 0)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch (error) {
                    return (
                      <div className="p-4 text-red-500 bg-red-50 border border-red-200 rounded">
                        <h3 className="font-medium mb-2">Error parsing diff</h3>
                        <p>Unable to parse file changes</p>
                      </div>
                    );
                  }
                })()}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500">
                No changes to display
              </div>
            )}
          </div>
        ) : (
          /* Full diff view */
          <div className="flex-1 overflow-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-gray-500">Loading diff...</div>
              </div>
            ) : error ? (
              <div className="p-4 text-red-600 bg-red-50 border border-red-200 rounded m-4">
                <h3 className="font-medium mb-2">Error loading diff</h3>
                <p>{error}</p>
              </div>
            ) : combinedDiff ? (
              <div className="p-4">
                <DiffViewer diff={combinedDiff.diff} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500">
                No changes to display
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CombinedDiffView;
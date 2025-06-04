import React, { useState, useEffect } from 'react';
import DiffViewer from './DiffViewer';
import ExecutionList from './ExecutionList';
import type { CombinedDiffViewProps } from '../types/diff';
import type { ExecutionDiff, GitDiffResult } from '../types/diff';

const CombinedDiffView: React.FC<CombinedDiffViewProps> = ({ 
  sessionId, 
  selectedExecutions: initialSelected 
}) => {
  const [executions, setExecutions] = useState<ExecutionDiff[]>([]);
  const [selectedExecutions, setSelectedExecutions] = useState<number[]>(initialSelected);
  const [combinedDiff, setCombinedDiff] = useState<GitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'diff'>('list');

  // Load executions for the session
  useEffect(() => {
    const loadExecutions = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/sessions/${sessionId}/executions`);
        if (!response.ok) {
          throw new Error('Failed to load executions');
        }
        const data = await response.json();
        setExecutions(data);
        
        // If no initial selection, select all executions with changes
        if (initialSelected.length === 0) {
          const executionsWithChanges = data.filter((exec: ExecutionDiff) => exec.stats_files_changed > 0);
          setSelectedExecutions(executionsWithChanges.map((exec: ExecutionDiff) => exec.id));
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
          response = await fetch(`/api/sessions/${sessionId}/combined-diff`);
        } else {
          // Get selected diffs
          response = await fetch(`/api/sessions/${sessionId}/combined-diff`, {
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

  const toggleViewMode = () => {
    setViewMode(viewMode === 'list' ? 'diff' : 'list');
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
    <div className="combined-diff-view h-full flex flex-col">
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
          <button
            onClick={toggleViewMode}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
          >
            {viewMode === 'list' ? 'View Diff' : 'Select Executions'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'list' ? (
          <>
            {/* Execution selection sidebar */}
            <div className="w-1/3 border-r border-gray-200 bg-white overflow-hidden">
              <ExecutionList
                sessionId={sessionId}
                executions={executions}
                selectedExecutions={selectedExecutions}
                onSelectionChange={handleSelectionChange}
              />
            </div>

            {/* Diff preview */}
            <div className="flex-1 overflow-auto bg-white">
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
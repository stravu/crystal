import React, { useState, useEffect } from 'react';
import DiffViewer from './DiffViewer';
import ExecutionList from './ExecutionList';
import { API } from '../utils/api';
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

  // Load executions for the session
  useEffect(() => {
    const loadExecutions = async () => {
      try {
        setLoading(true);
        const response = await API.sessions.getExecutions(sessionId);
        if (!response.success) {
          throw new Error(response.error || 'Failed to load executions');
        }
        const data = response.data;
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
          response = await API.sessions.getCombinedDiff(sessionId);
        } else {
          // Get selected diffs
          response = await API.sessions.getCombinedDiff(sessionId, selectedExecutions);
        }
        
        if (!response.success) {
          throw new Error(response.error || 'Failed to load combined diff');
        }
        
        const data = response.data;
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
        {combinedDiff && (
          <div className="flex items-center space-x-4 text-sm">
            <span className="text-green-600">+{combinedDiff.stats.additions}</span>
            <span className="text-red-600">-{combinedDiff.stats.deletions}</span>
            <span className="text-gray-600">{combinedDiff.stats.filesChanged} {combinedDiff.stats.filesChanged === 1 ? 'file' : 'files'}</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Commits selection sidebar */}
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
              Select commits to view changes
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CombinedDiffView;
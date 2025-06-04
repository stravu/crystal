import React from 'react';
import type { ExecutionListProps } from '../types/diff';

const ExecutionList: React.FC<ExecutionListProps> = ({
  executions,
  selectedExecutions,
  onSelectionChange
}) => {
  const handleToggleExecution = (executionId: number) => {
    if (selectedExecutions.includes(executionId)) {
      onSelectionChange(selectedExecutions.filter(id => id !== executionId));
    } else {
      onSelectionChange([...selectedExecutions, executionId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedExecutions.length === executions.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(executions.map(exec => exec.id));
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatsDisplay = (exec: { stats_additions: number; stats_deletions: number; stats_files_changed: number }) => {
    const { stats_additions, stats_deletions, stats_files_changed } = exec;
    if (stats_files_changed === 0) {
      return <span className="text-gray-500 text-sm">No changes</span>;
    }
    
    return (
      <div className="text-sm space-x-3">
        <span className="text-green-600">+{stats_additions}</span>
        <span className="text-red-600">-{stats_deletions}</span>
        <span className="text-gray-600">{stats_files_changed} files</span>
      </div>
    );
  };

  if (executions.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-center">
        No executions found for this session
      </div>
    );
  }

  return (
    <div className="execution-list">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-medium text-gray-900">
          Prompt Executions ({executions.length})
        </h3>
        <button
          onClick={handleSelectAll}
          className="text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
        >
          {selectedExecutions.length === executions.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Execution list */}
      <div className="max-h-96 overflow-y-auto">
        {executions.map((execution) => {
          const isSelected = selectedExecutions.includes(execution.id);
          
          return (
            <div
              key={execution.id}
              className={`
                flex items-center p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors
                ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}
              `}
              onClick={() => handleToggleExecution(execution.id)}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggleExecution(execution.id)}
                className="mr-3 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-gray-900">
                    Execution #{execution.execution_sequence}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatTimestamp(execution.timestamp)}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    {getStatsDisplay(execution)}
                  </div>
                  
                  {execution.files_changed && execution.files_changed.length > 0 && (
                    <div className="text-xs text-gray-500 truncate max-w-xs">
                      Files: {execution.files_changed.slice(0, 3).join(', ')}
                      {execution.files_changed.length > 3 && ` +${execution.files_changed.length - 3} more`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection summary */}
      {selectedExecutions.length > 0 && (
        <div className="p-4 bg-blue-50 border-t border-blue-200">
          <div className="text-sm text-blue-800">
            {selectedExecutions.length} execution{selectedExecutions.length !== 1 ? 's' : ''} selected
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutionList;
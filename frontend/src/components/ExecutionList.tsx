import React, { useState, memo } from 'react';
import { GitCommit, RotateCcw, RefreshCw } from 'lucide-react';
import type { ExecutionListProps } from '../types/diff';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const ExecutionList: React.FC<ExecutionListProps> = memo(({
  executions,
  selectedExecutions,
  onSelectionChange,
  onCommit,
  onRevert,
  onRestore
}) => {
  const [rangeStart, setRangeStart] = useState<number | null>(null);

  const handleCommitClick = (executionId: number, event: React.MouseEvent) => {
    if (event.shiftKey && rangeStart !== null) {
      // Range selection with shift-click
      const start = Math.min(rangeStart, executionId);
      const end = Math.max(rangeStart, executionId);
      onSelectionChange([start, end]);
    } else {
      // Single selection
      setRangeStart(executionId);
      onSelectionChange([executionId]);
    }
  };

  const handleSelectAll = () => {
    if (executions.length > 0) {
      // Select from first to last commit (excluding uncommitted if present)
      const firstId = executions[executions.length - 1].id;
      const lastId = executions.find(e => e.id !== 0)?.id || firstId;
      onSelectionChange([firstId, lastId]);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const truncateMessage = (message: string, maxLength: number = 50) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  const getStatsDisplay = (exec: { stats_additions: number; stats_deletions: number; stats_files_changed: number }) => {
    const { stats_additions, stats_deletions, stats_files_changed } = exec;
    if (stats_files_changed === 0) {
      return <span className="text-text-tertiary text-sm">No changes</span>;
    }
    
    return (
      <div className="text-sm space-x-3">
        <span className="text-status-success">+{stats_additions}</span>
        <span className="text-status-error">-{stats_deletions}</span>
        <span className="text-text-tertiary">{stats_files_changed} {stats_files_changed === 1 ? 'file' : 'files'}</span>
      </div>
    );
  };

  const isInRange = (executionId: number): boolean => {
    if (selectedExecutions.length === 0) return false;
    if (selectedExecutions.length === 1) return selectedExecutions[0] === executionId;
    if (selectedExecutions.length === 2) {
      const [start, end] = selectedExecutions;
      return executionId >= Math.min(start, end) && executionId <= Math.max(start, end);
    }
    return false;
  };

  if (executions.length === 0) {
    return (
      <div className="p-4 text-text-tertiary text-center">
        No commits found for this session
      </div>
    );
  }

  return (
    <div className="execution-list h-full flex flex-col">
      {/* Header */}
      <Card variant="bordered" className="rounded-b-none border-b-0">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-text-primary">
            Commits ({executions.filter(e => e.id !== 0).length})
          </h3>
          <Button
            onClick={handleSelectAll}
            size="sm"
            variant="ghost"
          >
            Select All Commits
          </Button>
        </div>
      </Card>

      {/* Instructions */}
      <div className="px-4 py-2 bg-bg-secondary text-xs text-text-tertiary border-b border-border-secondary">
        Click to select a single commit, Shift+Click to select a range
      </div>

      {/* Execution list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {executions.map((execution) => {
          const isSelected = isInRange(execution.id);
          const isUncommitted = execution.id === 0;
          
          return (
            <div
              key={execution.id}
              className={`
                flex items-center p-4 border-b border-border-secondary cursor-pointer hover:bg-bg-hover transition-colors
                ${isSelected ? 'bg-bg-accent border-l-4 border-l-interactive' : ''}
                ${isUncommitted ? 'bg-status-warning/20' : ''}
              `}
              onClick={(e) => handleCommitClick(execution.id, e)}
            >
              <div className="mr-3 w-4 h-4 flex items-center justify-center">
                {isSelected && (
                  <div className="w-3 h-3 bg-interactive rounded-full" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-text-primary">
                      {isUncommitted ? (
                        <span className="text-status-warning">Uncommitted changes</span>
                      ) : (
                        <span>{truncateMessage(execution.commit_message || execution.prompt_text || `Commit ${execution.execution_sequence}`)}</span>
                      )}
                    </div>
                    {isUncommitted && (
                      <div className="flex items-center gap-2">
                        {onCommit && execution.stats_files_changed > 0 && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              onCommit();
                            }}
                            size="sm"
                            variant="primary"
                            className="!bg-status-success hover:!bg-status-success-hover !text-white text-xs"
                          >
                            <GitCommit className="w-3 h-3" />
                            Commit
                          </Button>
                        )}
                        {onRestore && execution.stats_files_changed > 0 && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestore();
                            }}
                            size="sm"
                            variant="secondary"
                            className="!bg-status-warning hover:!bg-status-warning-hover !text-white text-xs"
                            title="Restore all uncommitted changes to their last committed state"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Restore
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {formatTimestamp(execution.timestamp)}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    {getStatsDisplay(execution)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {execution.after_commit_hash && execution.after_commit_hash !== 'UNCOMMITTED' && (
                      <>
                        <div className="text-xs text-text-tertiary font-mono">
                          {execution.after_commit_hash.substring(0, 7)}
                        </div>
                        {onRevert && !isUncommitted && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRevert(execution.after_commit_hash!);
                            }}
                            size="sm"
                            variant="danger"
                            className="text-xs"
                            title="Revert this commit"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Revert
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selection summary */}
      {selectedExecutions.length > 0 && (
        <div className="p-4 bg-bg-accent border-t border-interactive">
          <div className="text-sm text-text-accent">
            {selectedExecutions.length === 1 ? (
              `1 commit selected`
            ) : selectedExecutions.length === 2 ? (
              `Range selected: ${Math.abs(selectedExecutions[1] - selectedExecutions[0]) + 1} commits`
            ) : (
              `${selectedExecutions.length} commits selected`
            )}
          </div>
        </div>
      )}
    </div>
  );
});

ExecutionList.displayName = 'ExecutionList';

export default ExecutionList;
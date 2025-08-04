import { useState, useEffect } from 'react';
import { GitCommit, ChevronDown, ChevronRight, FileText, Plus, Minus } from 'lucide-react';
import { API } from '../utils/api';
import { parseTimestamp, formatDistanceToNow } from '../utils/timestampUtils';
import { cn } from '../utils/cn';

interface ExecutionDiff {
  id: number;
  session_id: string;
  execution_sequence: number;
  after_commit_hash?: string;
  commit_message?: string;
  stats_additions: number;
  stats_deletions: number;
  stats_files_changed: number;
  timestamp: string;
}

interface CommitsPanelProps {
  sessionId: string;
}

export function CommitsPanel({ sessionId }: CommitsPanelProps) {
  const [commits, setCommits] = useState<ExecutionDiff[]>([]);
  const [expandedCommits, setExpandedCommits] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCommits();
  }, [sessionId]);

  const loadCommits = async () => {
    try {
      setLoading(true);
      const response = await API.sessions.getExecutions(sessionId);
      if (response.success && response.data) {
        // Show all execution diffs, including failed commits
        setCommits(response.data);
      }
    } catch (error) {
      console.error('Failed to load commits:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCommit = (commitId: number) => {
    setExpandedCommits(prev => {
      const next = new Set(prev);
      if (next.has(commitId)) {
        next.delete(commitId);
      } else {
        next.add(commitId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-sm text-text-tertiary">
        Loading commits...
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4 text-sm text-text-tertiary text-center">
        No commits yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {commits.map((commit) => {
        const isExpanded = expandedCommits.has(commit.id);
        const timeAgo = formatDistanceToNow(parseTimestamp(commit.timestamp));
        const isFailedCommit = !commit.after_commit_hash || commit.after_commit_hash === 'UNCOMMITTED';
        const hasChanges = commit.stats_files_changed > 0;
        
        // Skip executions with no changes and no commit
        if (!hasChanges && isFailedCommit) {
          return null;
        }
        
        return (
          <div
            key={commit.id}
            className="border-b border-border-primary last:border-b-0"
          >
            <button
              onClick={() => toggleCommit(commit.id)}
              className={cn(
                "w-full px-4 py-3 flex items-start gap-3 hover:bg-surface-hover transition-colors text-left",
                isExpanded && "bg-surface-secondary"
              )}
            >
              <div className="mt-0.5">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-text-tertiary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-text-tertiary" />
                )}
              </div>
              
              <GitCommit className={cn(
                "w-4 h-4 mt-0.5 flex-shrink-0",
                isFailedCommit ? "text-status-error" : "text-status-success"
              )} />
              
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">
                  {isFailedCommit ? (
                    <span className="text-status-error">Uncommitted changes</span>
                  ) : (
                    commit.commit_message || 'Autocommit'
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {commit.stats_files_changed}
                  </span>
                  <span className="flex items-center gap-1 text-status-success">
                    <Plus className="w-3 h-3" />
                    {commit.stats_additions}
                  </span>
                  <span className="flex items-center gap-1 text-status-error">
                    <Minus className="w-3 h-3" />
                    {commit.stats_deletions}
                  </span>
                  <span className="text-text-tertiary">•</span>
                  <span>{timeAgo} ago</span>
                </div>
              </div>
            </button>
            
            {isExpanded && (
              <div className="px-4 pl-14 pb-3 bg-surface-secondary">
                <div className="space-y-2 text-sm">
                  {isFailedCommit ? (
                    <div className="text-status-error text-sm">
                      <p className="font-medium">⚠️ Changes were not committed</p>
                      <p className="text-xs mt-1 text-text-secondary">
                        Check the Terminal tab for error details. You may need to commit manually.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-text-tertiary">Hash:</span>
                      <code className="font-mono text-xs text-text-primary">
                        {commit.after_commit_hash?.substring(0, 7)}
                      </code>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-text-tertiary">Execution:</span>
                    <span className="text-text-primary">#{commit.execution_sequence}</span>
                  </div>
                  <div className="flex items-center gap-4 text-text-secondary">
                    <span>{commit.stats_files_changed} file{commit.stats_files_changed !== 1 ? 's' : ''} changed</span>
                    <span className="text-status-success">
                      {commit.stats_additions} addition{commit.stats_additions !== 1 ? 's' : ''}
                    </span>
                    <span className="text-status-error">
                      {commit.stats_deletions} deletion{commit.stats_deletions !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
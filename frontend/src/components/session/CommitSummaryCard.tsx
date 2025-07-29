import React, { useState } from 'react';
import { GitCommit, FileText, Plus, Minus, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow, parseTimestamp } from '../../utils/timestampUtils';

interface CommitStats {
  additions: number;
  deletions: number;
  filesChanged: number;
}

interface CommitSummaryCardProps {
  hash: string;
  message: string;
  stats: CommitStats;
  timestamp: string;
  mode: 'hidden' | 'compact' | 'expanded';
  executionSequence: number;
}

export const CommitSummaryCard: React.FC<CommitSummaryCardProps> = ({
  hash,
  message,
  stats,
  timestamp,
  mode,
  executionSequence
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (mode === 'hidden') {
    return null;
  }

  const shortHash = hash.substring(0, 7);
  const timeAgo = formatDistanceToNow(parseTimestamp(timestamp));

  if (mode === 'compact') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 my-2 bg-surface-secondary border border-border-secondary rounded-lg text-sm">
        <GitCommit className="w-4 h-4 text-status-success flex-shrink-0" />
        <FileText className="w-3 h-3 text-text-tertiary flex-shrink-0" />
        <span className="text-text-secondary">{stats.filesChanged} files</span>
        <span className="text-status-success">+{stats.additions}</span>
        <span className="text-status-error">-{stats.deletions}</span>
        <span className="text-text-tertiary">•</span>
        <span className="text-text-primary truncate flex-1" title={message}>{message}</span>
        <span className="text-text-tertiary font-mono text-xs">{shortHash}</span>
      </div>
    );
  }

  // Expanded mode
  return (
    <div className="my-3 bg-surface-secondary border border-border-secondary rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-tertiary" />
          )}
        </div>
        
        <GitCommit className="w-4 h-4 text-status-success flex-shrink-0" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-primary font-medium truncate">{message}</span>
            <span className="text-text-tertiary font-mono text-xs">{shortHash}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-status-success">
              <Plus className="w-3 h-3" />
              {stats.additions}
            </span>
            <span className="flex items-center gap-1 text-status-error">
              <Minus className="w-3 h-3" />
              {stats.deletions}
            </span>
            <span className="text-text-tertiary">•</span>
            <span>{timeAgo} ago</span>
          </div>
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border-primary/50">
          <div className="pt-3 space-y-2">
            <div className="text-xs text-text-tertiary">
              Execution #{executionSequence} • Commit {hash}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-status-success">
                <Plus className="w-4 h-4" />
                <span>{stats.additions} addition{stats.additions !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-status-error">
                <Minus className="w-4 h-4" />
                <span>{stats.deletions} deletion{stats.deletions !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-text-secondary">
                <FileText className="w-4 h-4" />
                <span>{stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''} changed</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
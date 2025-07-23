import React from 'react';
import { GitBranch, AlertCircle, CheckCircle, Clock, ArrowRight, GitFork } from 'lucide-react';
import type { RemoteStatus, MainBranchStatus } from '../../types/projectDashboard';

interface MultiOriginStatusProps {
  mainBranch: string;
  mainBranchStatus?: MainBranchStatus;
  remotes?: RemoteStatus[];
  onReviewUpdates?: () => void;
}

export const MultiOriginStatus: React.FC<MultiOriginStatusProps> = ({
  mainBranch,
  mainBranchStatus,
  remotes = [],
  onReviewUpdates
}) => {
  // Handle progressive loading - mainBranchStatus might not be available yet
  if (!mainBranchStatus) {
    return null;
  }

  // Find upstream and origin remotes
  const upstream = remotes.find(r => r.isUpstream || r.name === 'upstream');
  const origin = remotes.find(r => !r.isUpstream && r.name === 'origin');
  const hasMultipleRemotes = remotes.length > 1;
  
  // Check if any updates are needed
  const upstreamNeedsUpdate = upstream && upstream.status !== 'up-to-date';
  const originNeedsUpdate = origin && origin.status !== 'up-to-date';
  const localNeedsUpdate = mainBranchStatus.status !== 'up-to-date';
  const hasUpdatesNeeded = upstreamNeedsUpdate || originNeedsUpdate || localNeedsUpdate;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up-to-date':
        return <CheckCircle className="w-4 h-4 text-status-success" />;
      case 'behind':
        return <AlertCircle className="w-4 h-4 text-status-warning" />;
      case 'ahead':
        return <Clock className="w-4 h-4 text-interactive" />;
      case 'diverged':
        return <AlertCircle className="w-4 h-4 text-status-error" />;
      default:
        return null;
    }
  };

  const getStatusText = (remote: RemoteStatus) => {
    switch (remote.status) {
      case 'up-to-date':
        return 'Up to date';
      case 'behind':
        return `${remote.behindCount} behind`;
      case 'ahead':
        return `${remote.aheadCount} ahead`;
      case 'diverged':
        return `${remote.aheadCount}↑ ${remote.behindCount}↓`;
      default:
        return 'Unknown';
    }
  };

  const getLocalStatusText = () => {
    const { status, aheadCount = 0, behindCount = 0 } = mainBranchStatus;
    switch (status) {
      case 'up-to-date':
        return 'Synced with origin';
      case 'behind':
        return `${behindCount} behind origin`;
      case 'ahead':
        return `${aheadCount} ahead of origin`;
      case 'diverged':
        return `${aheadCount}↑ ${behindCount}↓`;
      default:
        return 'Unknown status';
    }
  };

  if (!hasMultipleRemotes) {
    // Single remote view (original view)
    return (
      <div className="mb-6 p-4 bg-surface-secondary rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-text-tertiary" />
            <div>
              <h3 className="font-medium text-text-primary">
                Main Branch ({mainBranch})
              </h3>
              <p className="text-sm text-text-tertiary flex items-center gap-2 mt-1">
                {getStatusIcon(mainBranchStatus.status)}
                {getLocalStatusText()}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multi-remote cascade view
  return (
    <div className="mb-6 space-y-3">
      {/* Multi-Origin Status Flow */}
      <div className="bg-surface-primary border border-border-primary rounded-lg overflow-hidden">
        <div className="bg-surface-secondary px-4 py-2 border-b border-border-primary">
          <h3 className="text-sm font-medium text-text-secondary">Git Remote Status</h3>
        </div>
        
        <div className="p-4">
          <div className="flex items-center gap-3">
            
            {/* Upstream Status */}
            {upstream && (
              <>
                <div className="flex-1 bg-interactive/10 rounded-lg p-3 border border-interactive/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="w-4 h-4 text-interactive" />
                        <span className="text-sm font-semibold text-text-primary">
                          {upstream.name}/{upstream.branch}
                        </span>
                      </div>
                      <div className="text-xs text-text-tertiary">Source repository</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {upstream.status !== 'up-to-date' && (
                        <span className="text-xs font-medium text-interactive">
                          {getStatusText(upstream)}
                        </span>
                      )}
                      {getStatusIcon(upstream.status)}
                    </div>
                  </div>
                </div>
                
                <ArrowRight className="w-5 h-5 text-text-tertiary flex-shrink-0" />
              </>
            )}
          
            {/* Origin/Fork Status */}
            {origin && (
              <>
                <div className="flex-1 bg-interactive/10 rounded-lg p-3 border border-interactive/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="w-4 h-4 text-interactive" />
                        <span className="text-sm font-semibold text-text-primary">
                          {origin.name}/{origin.branch}
                        </span>
                        {origin.isFork && (
                          <span className="inline-flex items-center gap-1 text-xs bg-interactive/20 text-interactive px-1.5 py-0.5 rounded">
                            <GitFork className="w-3 h-3" />
                            <span>fork</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-tertiary">Your remote</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {origin.status !== 'up-to-date' && (
                        <span className="text-xs font-medium text-interactive">
                          {getStatusText(origin)}
                        </span>
                      )}
                      {getStatusIcon(origin.status)}
                    </div>
                  </div>
                </div>
                
                <ArrowRight className="w-5 h-5 text-text-tertiary flex-shrink-0" />
              </>
            )}
          
            {/* Local Main Status */}
            <div className="flex-1 bg-surface-secondary rounded-lg p-3 border border-border-primary">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="w-4 h-4 text-text-tertiary" />
                    <span className="text-sm font-semibold text-text-primary">
                      {mainBranch}
                    </span>
                    <span className="text-xs bg-surface-tertiary text-text-secondary px-1.5 py-0.5 rounded">
                      local
                    </span>
                  </div>
                  <div className="text-xs text-text-tertiary">Base for sessions</div>
                </div>
                <div className="flex items-center gap-2">
                  {mainBranchStatus.status !== 'up-to-date' && (
                    <span className="text-xs font-medium text-text-secondary">
                      {getLocalStatusText()}
                    </span>
                  )}
                  {getStatusIcon(mainBranchStatus.status)}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Action Bar - Shows when updates are needed */}
        {hasUpdatesNeeded && (
          <div className="bg-status-warning/10 border-t border-status-warning/30 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-status-warning" />
                <span className="text-sm font-medium text-status-warning">
                  Updates available in the cascade
                </span>
              </div>
              {onReviewUpdates && (
                <button 
                  onClick={onReviewUpdates}
                  className="text-sm bg-status-warning hover:bg-status-warning-hover text-white px-3 py-1.5 rounded font-medium transition-colors"
                >
                  Review Updates →
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Flow Legend */}
        <div className="bg-surface-secondary px-4 py-2 border-t border-border-primary">
          <div className="flex items-center gap-6 text-xs text-text-tertiary">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3 h-3 text-status-success" />
              <span>Synced</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3 h-3 text-status-warning" />
              <span>Behind</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-interactive" />
              <span>Ahead</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3 h-3 text-status-error" />
              <span>Diverged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
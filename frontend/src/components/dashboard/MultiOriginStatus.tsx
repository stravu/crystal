import React from 'react';
import { GitBranch, AlertCircle, CheckCircle, Clock, ArrowRight, GitFork } from 'lucide-react';
import type { RemoteStatus, MainBranchStatus } from '../../types/projectDashboard';

interface MultiOriginStatusProps {
  mainBranch: string;
  mainBranchStatus: MainBranchStatus;
  remotes?: RemoteStatus[];
  onReviewUpdates?: () => void;
}

export const MultiOriginStatus: React.FC<MultiOriginStatusProps> = ({
  mainBranch,
  mainBranchStatus,
  remotes = [],
  onReviewUpdates
}) => {
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
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'behind':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'ahead':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'diverged':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
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
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100">
                Main Branch ({mainBranch})
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2 mt-1">
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
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Git Remote Status</h3>
        </div>
        
        <div className="p-4">
          <div className="flex items-center gap-3">
            
            {/* Upstream Status */}
            {upstream && (
              <>
                <div className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {upstream.name}/{upstream.branch}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Source repository</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {upstream.status !== 'up-to-date' && (
                        <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                          {getStatusText(upstream)}
                        </span>
                      )}
                      {getStatusIcon(upstream.status)}
                    </div>
                  </div>
                </div>
                
                <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </>
            )}
          
            {/* Origin/Fork Status */}
            {origin && (
              <>
                <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {origin.name}/{origin.branch}
                        </span>
                        {origin.isFork && (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                            <GitFork className="w-3 h-3" />
                            <span>fork</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Your remote</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {origin.status !== 'up-to-date' && (
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                          {getStatusText(origin)}
                        </span>
                      )}
                      {getStatusIcon(origin.status)}
                    </div>
                  </div>
                </div>
                
                <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </>
            )}
          
            {/* Local Main Status */}
            <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {mainBranch}
                    </span>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">
                      local
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">Base for sessions</div>
                </div>
                <div className="flex items-center gap-2">
                  {mainBranchStatus.status !== 'up-to-date' && (
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
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
          <div className="bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Updates available in the cascade
                </span>
              </div>
              {onReviewUpdates && (
                <button 
                  onClick={onReviewUpdates}
                  className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded font-medium transition-colors"
                >
                  Review Updates →
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Flow Legend */}
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-6 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span>Synced</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3 h-3 text-yellow-500" />
              <span>Behind</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-blue-500" />
              <span>Ahead</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-3 h-3 text-red-500" />
              <span>Diverged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
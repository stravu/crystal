import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, GitBranch, AlertCircle, CheckCircle, GitPullRequest, Loader2, XCircle, Filter } from 'lucide-react';
import { API } from '../utils/api';
import type { ProjectDashboardData, SessionBranchInfo } from '../types/projectDashboard';
import { formatDistanceToNow } from '../utils/timestampUtils';
import { dashboardCache } from '../utils/dashboardCache';
import { debounce } from '../utils/debounce';
import { ProjectDashboardSkeleton } from './ProjectDashboardSkeleton';
import { useSessionStore } from '../stores/sessionStore';
import { useNavigationStore } from '../stores/navigationStore';
import { MultiOriginStatus } from './dashboard/MultiOriginStatus';
import { StatusSummaryCards } from './dashboard/StatusSummaryCards';

interface ProjectDashboardProps {
  projectId: number;
  projectName: string;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = React.memo(({ projectId, projectName }) => {
  const [dashboardData, setDashboardData] = useState<ProjectDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'stale' | 'changes' | 'pr'>('all');

  const fetchDashboardData = useCallback(async (useCache: boolean = true) => {
    // Check cache first if not forcing refresh
    if (useCache) {
      const cachedData = dashboardCache.get(projectId);
      if (cachedData) {
        setDashboardData(cachedData);
        setLastRefreshTime(new Date(Date.now() - 30000)); // Show it was from cache
        return;
      }
    }
    
    setIsLoading(!dashboardData); // Only show loading on initial load
    setIsRefreshing(!!dashboardData); // Show refreshing if we already have data
    setError(null);
    
    try {
      const response = await API.dashboard.getProjectStatus(projectId);
      
      if (response.success && response.data) {
        setDashboardData(response.data);
        setLastRefreshTime(new Date());
        // Cache the data
        dashboardCache.set(projectId, response.data);
      } else {
        setError(response.error || 'Failed to fetch project status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [projectId, dashboardData]);

  // Debounced refresh function
  const debouncedRefresh = useMemo(
    () => debounce(() => {
      dashboardCache.invalidate(projectId);
      fetchDashboardData(false);
    }, 500),
    [projectId, fetchDashboardData]
  );

  useEffect(() => {
    // Clear previous data when switching projects to show skeleton
    setDashboardData(null);
    setError(null);
    fetchDashboardData();
  }, [projectId]); // Only refetch when projectId changes

  // Memoize grouped sessions by base branch (for future use)
  // const groupedSessions = useMemo(() => {
  //   if (!dashboardData) return new Map();
  //   
  //   const groups = new Map<string, SessionBranchInfo[]>();
  //   dashboardData.sessionBranches.forEach(session => {
  //     const baseBranch = session.baseBranch || 'unknown';
  //     if (!groups.has(baseBranch)) {
  //       groups.set(baseBranch, []);
  //     }
  //     groups.get(baseBranch)!.push(session);
  //   });
  //   
  //   return groups;
  // }, [dashboardData?.sessionBranches]);

  const renderSessionRow = useCallback((session: SessionBranchInfo) => {
    const staleClass = session.isStale ? 'bg-yellow-50 dark:bg-yellow-900/20' : '';
    
    const handleSessionClick = () => {
      useSessionStore.getState().setActiveSession(session.sessionId);
      useNavigationStore.getState().navigateToSessions();
    };
    
    return (
      <tr key={session.sessionId} className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${staleClass} cursor-pointer`} onClick={handleSessionClick}>
        <td className="px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-medium text-gray-900 dark:text-gray-100">{session.sessionName}</div>
              <div className="text-gray-500 dark:text-gray-400 text-xs">{session.branchName}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
            {session.baseBranch}
          </code>
        </td>
        <td className="px-4 py-3 text-sm">
          {session.isStale ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="text-yellow-700 dark:text-yellow-400">
                Stale {session.staleSince && `since ${formatDistanceToNow(session.staleSince)}`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-green-700 dark:text-green-400">Current</span>
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          <div className="flex gap-3 text-xs">
            {session.commitsAhead > 0 && (
              <span className="text-blue-600 dark:text-blue-400">+{session.commitsAhead}</span>
            )}
            {session.commitsBehind > 0 && (
              <span className="text-orange-600 dark:text-orange-400">-{session.commitsBehind}</span>
            )}
            {session.commitsAhead === 0 && session.commitsBehind === 0 && (
              <span className="text-gray-400">—</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm">
          {session.hasUncommittedChanges && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-3 h-3" />
              <span className="text-xs">Uncommitted</span>
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-sm">
          {session.pullRequest ? (
            <a
              href={session.pullRequest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              <GitPullRequest className="w-4 h-4" />
              <span>#{session.pullRequest.number}</span>
              {session.pullRequest.state === 'open' && (
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
              )}
              {session.pullRequest.state === 'closed' && (
                <XCircle className="w-3 h-3 text-red-500" />
              )}
              {session.pullRequest.state === 'merged' && (
                <CheckCircle className="w-3 h-3 text-purple-500" />
              )}
            </a>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
      </tr>
    );
  }, []);

  // Filter sessions based on selected filter
  const filteredSessions = useMemo(() => {
    if (!dashboardData) return [];
    
    switch (filterType) {
      case 'stale':
        return dashboardData.sessionBranches.filter(s => s.isStale);
      case 'changes':
        return dashboardData.sessionBranches.filter(s => s.hasUncommittedChanges);
      case 'pr':
        return dashboardData.sessionBranches.filter(s => s.pullRequest);
      default:
        return dashboardData.sessionBranches;
    }
  }, [dashboardData, filterType]);

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Error loading dashboard</span>
        </div>
        <p className="mt-1 text-sm text-red-600 dark:text-red-300">{error}</p>
        <button
          onClick={() => fetchDashboardData(false)}
          className="mt-3 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (isLoading && !dashboardData) {
    return <ProjectDashboardSkeleton />;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Project Dashboard
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Git status for {dashboardData?.projectName || projectName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {lastRefreshTime && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Updated {formatDistanceToNow(lastRefreshTime)}
              </span>
            )}
            <button
              onClick={debouncedRefresh}
              disabled={isLoading || isRefreshing}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 
                       text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {(isLoading || isRefreshing) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
          </div>
        </div>
      </div>

      {dashboardData ? (
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          {/* Multi-Origin Status */}
          <MultiOriginStatus 
            mainBranch={dashboardData.mainBranch}
            mainBranchStatus={dashboardData.mainBranchStatus}
            remotes={dashboardData.remotes}
            onReviewUpdates={() => console.log('Review updates clicked')}
          />
          
          {/* Status Summary Cards */}
          <StatusSummaryCards sessions={dashboardData.sessionBranches} />

          {/* Session Branches Table */}
          {dashboardData.sessionBranches.length > 0 ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Session Branches ({filteredSessions.length} of {dashboardData.sessionBranches.length})
                </h3>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    <option value="all">All Sessions</option>
                    <option value="stale">Stale Only</option>
                    <option value="changes">With Changes</option>
                    <option value="pr">With PR</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Session
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Base Branch
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Commits
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Changes
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Pull Request
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredSessions.map(renderSessionRow)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p>No active session branches</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
});
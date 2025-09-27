import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Card } from './ui/Card';
import { Button } from './ui/Button';

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
  const [isProgressive] = useState(true); // Use progressive loading by default
  const pendingSessionUpdatesRef = useRef<Map<string, SessionBranchInfo>>(new Map());

  // Debounced function to apply pending session updates
  const applyPendingSessionUpdates = useMemo(
    () => debounce(() => {
      const updates = Array.from(pendingSessionUpdatesRef.current.values());
      if (updates.length === 0) return;

      setDashboardData(prevData => {
        if (!prevData) return null;
        
        const sessionMap = new Map(
          prevData.sessionBranches.map(s => [s.sessionId, s])
        );
        
        // Apply all pending updates
        updates.forEach(update => {
          sessionMap.set(update.sessionId, update);
        });
        
        // Clear pending updates
        pendingSessionUpdatesRef.current.clear();
        
        return {
          ...prevData,
          sessionBranches: Array.from(sessionMap.values())
        };
      });
    }, 100), // 100ms debounce for smooth updates
    []
  );

  const fetchDashboardData = useCallback(async (useCache: boolean = true, useProgressive: boolean = true) => {
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
      if (useProgressive && isProgressive) {
        // Use progressive loading
        const response = await API.dashboard.getProjectStatusProgressive(projectId);
        
        if (response.success && response.data) {
          setDashboardData(response.data);
          setLastRefreshTime(new Date());
          // Cache the data
          dashboardCache.set(projectId, response.data);
        } else {
          setError(response.error || 'Failed to fetch project status');
        }
      } else {
        // Use traditional loading
        const response = await API.dashboard.getProjectStatus(projectId);
        
        if (response.success && response.data) {
          setDashboardData(response.data);
          setLastRefreshTime(new Date());
          // Cache the data
          dashboardCache.set(projectId, response.data);
        } else {
          setError(response.error || 'Failed to fetch project status');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [projectId, dashboardData, isProgressive]);

  // Debounced refresh function
  const debouncedRefresh = useMemo(
    () => debounce(() => {
      dashboardCache.invalidate(projectId);
      fetchDashboardData(false, true);
    }, 500),
    [projectId, fetchDashboardData]
  );

  // Set up progressive loading event listeners
  useEffect(() => {
    if (!isProgressive) return;

    const cleanupFns: Array<() => void> = [];

    // Handle dashboard updates
    const unsubscribeUpdate = API.dashboard.onUpdate((event) => {
      if (event.projectId === projectId) {
        setDashboardData(prevData => {
          if (!prevData && event.data) {
            // Initial data
            return event.data as ProjectDashboardData;
          } else if (prevData && event.data && event.isPartial) {
            // Merge partial update
            return { ...prevData, ...event.data };
          } else if (event.data) {
            // Full update
            const data = event.data as ProjectDashboardData;
            if (data.projectId && data.projectName && data.sessionBranches) {
              dashboardCache.set(projectId, data);
            }
            return data;
          }
          return prevData;
        });
        
        if (!event.isPartial) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    });
    cleanupFns.push(unsubscribeUpdate);

    // Handle individual session updates with debouncing
    const unsubscribeSession = API.dashboard.onSessionUpdate((event) => {
      if (event.projectId === projectId && event.data && event.sessionId) {
        // Cast to SessionBranchInfo since we know this is the expected shape from dashboard updates
        const sessionData = event.data as SessionBranchInfo;
        // Add to pending updates
        pendingSessionUpdatesRef.current.set(event.sessionId, sessionData);
        // Trigger debounced update
        applyPendingSessionUpdates();
      }
    });
    cleanupFns.push(unsubscribeSession);

    return () => {
      cleanupFns.forEach(fn => fn());
      // Cancel any pending updates
      applyPendingSessionUpdates.cancel();
    };
  }, [projectId, isProgressive, applyPendingSessionUpdates]);

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
    const staleClass = session.isStale ? 'bg-status-warning/10' : '';
    
    const handleSessionClick = async () => {
      console.log('[ProjectDashboard] Session clicked:', session.sessionId, session.sessionName);
      try {
        await useSessionStore.getState().setActiveSession(session.sessionId);
        console.log('[ProjectDashboard] Session set, now navigating to sessions view');
        useNavigationStore.getState().navigateToSessions();
        console.log('[ProjectDashboard] Navigation completed');
      } catch (error) {
        console.error('[ProjectDashboard] Error in handleSessionClick:', error);
      }
    };
    
    return (
      <tr key={session.sessionId} className={`hover:bg-surface-hover ${staleClass} cursor-pointer`} onClick={handleSessionClick}>
        <td className="px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-text-tertiary" />
            <div>
              <div className="font-medium text-text-primary">{session.sessionName}</div>
              <div className="text-text-tertiary text-xs">{session.branchName}</div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary">
          <code className="text-xs bg-surface-secondary px-1 py-0.5 rounded">
            {session.baseBranch}
          </code>
        </td>
        <td className="px-4 py-3 text-sm">
          {session.isStale ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-status-warning" />
              <span className="text-status-warning">
                Stale {session.staleSince && `since ${formatDistanceToNow(session.staleSince)}`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-status-success" />
              <span className="text-status-success">Current</span>
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary">
          <div className="flex gap-3 text-xs">
            {session.commitsAhead > 0 && (
              <span className="text-interactive">+{session.commitsAhead}</span>
            )}
            {session.commitsBehind > 0 && (
              <span className="text-status-warning">-{session.commitsBehind}</span>
            )}
            {session.commitsAhead === 0 && session.commitsBehind === 0 && (
              <span className="text-text-tertiary">—</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm">
          {session.hasUncommittedChanges && (
            <span className="inline-flex items-center gap-1 text-status-warning">
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
              className="inline-flex items-center gap-1 text-interactive hover:text-interactive-hover"
              onClick={(e) => e.stopPropagation()}
            >
              <GitPullRequest className="w-4 h-4" />
              <span>#{session.pullRequest.number}</span>
              {session.pullRequest.state === 'open' && (
                <span className="inline-block w-2 h-2 bg-status-success rounded-full"></span>
              )}
              {session.pullRequest.state === 'closed' && (
                <XCircle className="w-3 h-3 text-status-error" />
              )}
              {session.pullRequest.state === 'merged' && (
                <CheckCircle className="w-3 h-3 text-interactive" />
              )}
            </a>
          ) : (
            <span className="text-text-tertiary">—</span>
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
      <div className="p-6 bg-status-error/10 rounded-lg">
        <div className="flex items-center gap-2 text-status-error">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Error loading dashboard</span>
        </div>
        <p className="mt-1 text-sm text-status-error/80">{error}</p>
        <button
          onClick={() => fetchDashboardData(false)}
          className="mt-3 px-3 py-1 text-sm bg-status-error text-white rounded hover:bg-status-error-hover"
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
    <Card className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border-primary">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Project Dashboard
            </h2>
            <p className="text-sm text-text-secondary">
              Git status for {dashboardData?.projectName || projectName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {lastRefreshTime && (
              <span className="text-xs text-text-tertiary">
                Updated {formatDistanceToNow(lastRefreshTime)}
              </span>
            )}
            <Button
              onClick={debouncedRefresh}
              disabled={isLoading || isRefreshing}
              variant="secondary"
              size="sm"
              icon={(isLoading || isRefreshing) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {dashboardData ? (
        <div className="p-6 flex-1 flex flex-col overflow-hidden">
          {/* Multi-Origin Status */}
          {dashboardData.mainBranchStatus && (
            <MultiOriginStatus 
              mainBranch={dashboardData.mainBranch}
              mainBranchStatus={dashboardData.mainBranchStatus}
              remotes={dashboardData.remotes}
              onReviewUpdates={() => console.log('Review updates clicked')}
            />
          )}
          
          {/* Status Summary Cards */}
          <StatusSummaryCards sessions={dashboardData.sessionBranches} />

          {/* Session Branches Table */}
          {dashboardData.sessionBranches.length > 0 ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-text-primary">
                  Session Branches ({filteredSessions.length} of {dashboardData.sessionBranches.length})
                </h3>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-text-tertiary" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                    className="text-sm border border-border-primary rounded px-2 py-1 bg-surface-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-interactive focus:border-interactive"
                  >
                    <option value="all">All Sessions</option>
                    <option value="stale">Stale Only</option>
                    <option value="changes">With Changes</option>
                    <option value="pr">With PR</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-auto border border-border-primary rounded-lg">
                <table className="min-w-full divide-y divide-border-primary">
                  <thead className="bg-surface-secondary">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                        Session
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                        Base Branch
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                        Commits
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                        Changes
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                        Pull Request
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-bg-primary divide-y divide-border-primary">
                    {filteredSessions.map(renderSessionRow)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-text-tertiary">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-text-tertiary/50" />
              <p>No active session branches</p>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
});
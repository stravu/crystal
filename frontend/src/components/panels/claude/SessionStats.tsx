import React, { useState, useEffect } from 'react';
import { API } from '../../../utils/api';
import { Activity, FileText, Clock, Zap, GitBranch, Hash, MessageSquare, Code, TrendingUp, Server, Wrench } from 'lucide-react';

interface SessionStatsProps {
  sessionId: string;
}

interface ToolUsageStats {
  name: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface SessionStatistics {
  session: {
    id: string;
    name: string;
    status: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    duration: number;
    worktreePath: string;
    branch?: string;
  };
  tokens: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
    messageCount: number;
  };
  files: {
    totalFilesChanged: number;
    totalLinesAdded: number;
    totalLinesDeleted: number;
    filesModified: string[];
    executionCount: number;
  };
  activity: {
    promptCount: number;
    messageCount: number;
    outputCounts: {
      json: number;
      stdout: number;
      stderr: number;
    };
    lastActivity: string;
  };
  toolUsage?: {
    tools: ToolUsageStats[];
    totalToolCalls: number;
  };
}

export const SessionStats: React.FC<SessionStatsProps> = ({ sessionId }) => {
  if (!sessionId) {
    throw new Error('SessionStats requires sessionId');
  }

  const [statistics, setStatistics] = useState<SessionStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        setLoading(true);
        const response = await API.sessions.getStatistics(sessionId);
        if (response.success && response.data) {
          setStatistics(response.data);
        } else {
          setError(response.error || 'Failed to load statistics');
        }
      } catch (err) {
        console.error('Failed to load session statistics:', err);
        setError('Failed to load session statistics');
      } finally {
        setLoading(false);
      }
    };

    loadStatistics();
    
    // Refresh every 30 seconds if session is active
    const interval = setInterval(() => {
      if (statistics?.session.status === 'running' || statistics?.session.status === 'waiting') {
        loadStatistics();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionId, statistics?.session.status]);

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const calculateCost = (tokens: SessionStatistics['tokens']): string => {
    // Rough estimate based on Claude pricing (as of knowledge cutoff)
    // Sonnet: $3 per million input tokens, $15 per million output tokens
    const inputCost = (tokens.totalInputTokens / 1000000) * 3;
    const outputCost = (tokens.totalOutputTokens / 1000000) * 15;
    const totalCost = inputCost + outputCost;
    
    if (totalCost < 0.01) {
      return '<$0.01';
    }
    return `$${totalCost.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-text-tertiary mb-2">Loading statistics...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-status-error mb-2">Failed to load statistics</div>
          <div className="text-sm text-text-quaternary">{error}</div>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  const { session, tokens, files, activity } = statistics;

  return (
    <div className="h-full overflow-y-auto bg-surface-primary p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-surface-secondary rounded-lg border border-border-primary p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">{session.name}</h2>
              <div className="flex items-center gap-4 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                  <Server className="w-4 h-4" />
                  {session.model}
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch className="w-4 h-4" />
                  {session.branch || 'main'}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  session.status === 'running' ? 'bg-status-success/10 text-status-success' :
                  session.status === 'waiting' ? 'bg-status-warning/10 text-status-warning' :
                  session.status === 'error' ? 'bg-status-error/10 text-status-error' :
                  'bg-surface-hover text-text-tertiary'
                }`}>
                  {session.status.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-text-primary">{formatDuration(session.duration)}</div>
              <div className="text-sm text-text-quaternary">Session Duration</div>
            </div>
          </div>
        </div>

        {/* Token Usage */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center justify-between mb-2">
              <Zap className="w-5 h-5 text-status-info" />
              <span className="text-xs text-text-quaternary">Input</span>
            </div>
            <div className="text-2xl font-bold text-text-primary mb-1">
              {formatNumber(tokens.totalInputTokens)}
            </div>
            <div className="text-xs text-text-tertiary">tokens</div>
          </div>

          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-status-success" />
              <span className="text-xs text-text-quaternary">Output</span>
            </div>
            <div className="text-2xl font-bold text-text-primary mb-1">
              {formatNumber(tokens.totalOutputTokens)}
            </div>
            <div className="text-xs text-text-tertiary">tokens</div>
          </div>

          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center justify-between mb-2">
              <Activity className="w-5 h-5 text-status-warning" />
              <span className="text-xs text-text-quaternary">Cache Hit</span>
            </div>
            <div className="text-2xl font-bold text-text-primary mb-1">
              {tokens.totalCacheReadTokens > 0 
                ? `${((tokens.totalCacheReadTokens / (tokens.totalInputTokens || 1)) * 100).toFixed(0)}%`
                : '0%'
              }
            </div>
            <div className="text-xs text-text-tertiary">
              {formatNumber(tokens.totalCacheReadTokens)} cached
            </div>
          </div>

          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center justify-between mb-2">
              <Hash className="w-5 h-5 text-accent-primary" />
              <span className="text-xs text-text-quaternary">Est. Cost</span>
            </div>
            <div className="text-2xl font-bold text-text-primary mb-1">
              {calculateCost(tokens)}
            </div>
            <div className="text-xs text-text-tertiary">USD</div>
          </div>
        </div>

        {/* Activity Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center gap-3 mb-3">
              <MessageSquare className="w-5 h-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">Conversation</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Prompts</span>
                <span className="text-sm font-medium text-text-primary">{activity.promptCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Messages</span>
                <span className="text-sm font-medium text-text-primary">{activity.messageCount}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">JSON Events</span>
                <span className="text-sm font-medium text-text-primary">{activity.outputCounts.json}</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center gap-3 mb-3">
              <FileText className="w-5 h-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">File Changes</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Files Modified</span>
                <span className="text-sm font-medium text-text-primary">{files.totalFilesChanged}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Lines Added</span>
                <span className="text-sm font-medium text-status-success">+{files.totalLinesAdded}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Lines Deleted</span>
                <span className="text-sm font-medium text-status-error">-{files.totalLinesDeleted}</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center gap-3 mb-3">
              <Code className="w-5 h-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">Performance</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Tokens/Prompt</span>
                <span className="text-sm font-medium text-text-primary">
                  {activity.promptCount > 0 
                    ? formatNumber(Math.round((tokens.totalInputTokens + tokens.totalOutputTokens) / activity.promptCount))
                    : '0'
                  }
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Lines/Hour</span>
                <span className="text-sm font-medium text-text-primary">
                  {session.duration > 3600000 
                    ? Math.round((files.totalLinesAdded + files.totalLinesDeleted) / (session.duration / 3600000))
                    : files.totalLinesAdded + files.totalLinesDeleted
                  }
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Executions</span>
                <span className="text-sm font-medium text-text-primary">{files.executionCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tool Usage Breakdown */}
        {statistics.toolUsage && statistics.toolUsage.totalToolCalls > 0 && (
          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center gap-3 mb-4">
              <Wrench className="w-5 h-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">Tool Usage</h3>
              <span className="text-xs text-text-quaternary">({statistics.toolUsage.totalToolCalls} total calls)</span>
            </div>
            
            {/* Tool usage table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border-primary">
                    <th className="pb-2 pr-4 text-text-secondary font-medium">Tool</th>
                    <th className="pb-2 px-2 text-text-secondary font-medium text-right">Uses</th>
                    <th className="pb-2 px-2 text-text-secondary font-medium text-right">Total Time</th>
                    <th className="pb-2 px-2 text-text-secondary font-medium text-right">Avg Time</th>
                    <th className="pb-2 pl-2 text-text-secondary font-medium text-right">% of Calls</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.toolUsage.tools.slice(0, 10).map((tool) => {
                    const percentage = ((tool.count / statistics.toolUsage!.totalToolCalls) * 100).toFixed(1);
                    return (
                      <tr key={tool.name} className="border-b border-border-primary/50 hover:bg-surface-hover transition-colors">
                        <td className="py-2 pr-4">
                          <span className="font-mono text-text-primary">{tool.name}</span>
                        </td>
                        <td className="py-2 px-2 text-right text-text-primary font-medium">
                          {tool.count}
                        </td>
                        <td className="py-2 px-2 text-right text-text-secondary">
                          {formatDuration(tool.totalDuration)}
                        </td>
                        <td className="py-2 px-2 text-right text-text-secondary">
                          {tool.avgDuration > 0 ? formatDuration(tool.avgDuration) : '-'}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-surface-primary rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-status-info rounded-full h-1.5 transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-text-tertiary text-xs w-10 text-right">{percentage}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              
              {statistics.toolUsage.tools.length > 10 && (
                <div className="mt-2 text-xs text-text-quaternary text-center">
                  And {statistics.toolUsage.tools.length - 10} more tools...
                </div>
              )}
            </div>

            {/* Tool usage summary */}
            <div className="mt-4 pt-4 border-t border-border-primary grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-text-quaternary">Most Used</span>
                <div className="text-text-primary font-medium">
                  {statistics.toolUsage.tools[0]?.name || 'N/A'} ({statistics.toolUsage.tools[0]?.count || 0}x)
                </div>
              </div>
              <div>
                <span className="text-text-quaternary">Total Time</span>
                <div className="text-text-primary font-medium">
                  {formatDuration(statistics.toolUsage.tools.reduce((sum, t) => sum + t.totalDuration, 0))}
                </div>
              </div>
              <div>
                <span className="text-text-quaternary">Unique Tools</span>
                <div className="text-text-primary font-medium">
                  {statistics.toolUsage.tools.length}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modified Files List */}
        {files.filesModified.length > 0 && (
          <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
            <div className="flex items-center gap-3 mb-3">
              <FileText className="w-5 h-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">Modified Files</h3>
              <span className="text-xs text-text-quaternary">({files.filesModified.length})</span>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <div className="space-y-1">
                {files.filesModified.map((file, index) => (
                  <div key={index} className="text-sm text-text-secondary font-mono hover:text-text-primary transition-colors">
                    {file}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-surface-secondary rounded-lg border border-border-primary p-4">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-5 h-5 text-text-tertiary" />
            <h3 className="text-sm font-semibold text-text-primary">Timeline</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Created</span>
              <span className="font-medium text-text-primary">
                {new Date(session.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Last Activity</span>
              <span className="font-medium text-text-primary">
                {new Date(activity.lastActivity).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
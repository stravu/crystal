import React, { useEffect, useState } from 'react';
import { Activity, Clock, Cpu, Database, GitBranch, Hash } from 'lucide-react';
import { DEFAULT_CODEX_MODEL, getCodexModelConfig } from '../../../../../shared/types/models';

interface CodexStatsViewProps {
  sessionId: string;
}

interface CodexStats {
  totalMessages: number;
  totalTokens: number;
  executionTime: number;
  toolCalls: number;
  model: string;
  sessionDuration: number;
}

export const CodexStatsView: React.FC<CodexStatsViewProps> = ({ sessionId }) => {
  const [stats, setStats] = useState<CodexStats>({
    totalMessages: 0,
    totalTokens: 0,
    executionTime: 0,
    toolCalls: 0,
    model: DEFAULT_CODEX_MODEL,
    sessionDuration: 0
  });

  useEffect(() => {
    // Load stats for this session
    loadStats();

    // Update stats periodically
    const interval = setInterval(loadStats, 5000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const loadStats = async () => {
    try {
      // TODO: Load actual stats from backend
      console.log('[CodexStatsView] Loading stats for session:', sessionId);
      
      // Mock stats for now
      setStats({
        totalMessages: Math.floor(Math.random() * 50),
        totalTokens: Math.floor(Math.random() * 10000),
        executionTime: Math.floor(Math.random() * 300),
        toolCalls: Math.floor(Math.random() * 20),
        model: DEFAULT_CODEX_MODEL,
        sessionDuration: Math.floor(Math.random() * 3600)
      });
    } catch (error) {
      console.error('[CodexStatsView] Failed to load stats:', error);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h3 className="text-lg font-medium text-text-primary mb-6">Codex Session Statistics</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Total Messages */}
          <div className="bg-surface-secondary rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Hash className="w-5 h-5 text-blue-400" />
              <span className="text-sm text-text-secondary">Total Messages</span>
            </div>
            <div className="text-2xl font-semibold text-text-primary">
              {stats.totalMessages}
            </div>
          </div>

          {/* Total Tokens */}
          <div className="bg-surface-secondary rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-5 h-5 text-green-400" />
              <span className="text-sm text-text-secondary">Total Tokens</span>
            </div>
            <div className="text-2xl font-semibold text-text-primary">
              {stats.totalTokens.toLocaleString()}
            </div>
          </div>

          {/* Execution Time */}
          <div className="bg-surface-secondary rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              <span className="text-sm text-text-secondary">Execution Time</span>
            </div>
            <div className="text-2xl font-semibold text-text-primary">
              {formatDuration(stats.executionTime)}
            </div>
          </div>

          {/* Tool Calls */}
          <div className="bg-surface-secondary rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-5 h-5 text-purple-400" />
              <span className="text-sm text-text-secondary">Tool Calls</span>
            </div>
            <div className="text-2xl font-semibold text-text-primary">
              {stats.toolCalls}
            </div>
          </div>

          {/* Model */}
          <div className="bg-surface-secondary rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Cpu className="w-5 h-5 text-orange-400" />
              <span className="text-sm text-text-secondary">Model</span>
            </div>
            <div className="text-2xl font-semibold text-text-primary">
              {getCodexModelConfig(stats.model)?.label || stats.model}
            </div>
          </div>

          {/* Session Duration */}
          <div className="bg-surface-secondary rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <GitBranch className="w-5 h-5 text-cyan-400" />
              <span className="text-sm text-text-secondary">Session Duration</span>
            </div>
            <div className="text-2xl font-semibold text-text-primary">
              {formatDuration(stats.sessionDuration)}
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 p-4 bg-surface-secondary rounded-lg">
          <h4 className="text-sm font-medium text-text-primary mb-3">Session Info</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Session ID:</span>
              <span className="text-text-primary font-mono">{sessionId.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Model Version:</span>
              <span className="text-text-primary">{getCodexModelConfig(stats.model)?.label || 'GPT-5'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Provider:</span>
              <span className="text-text-primary">OpenAI</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
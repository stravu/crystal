import React from 'react';
import type { SessionBranchInfo } from '../../types/projectDashboard';
import { Card } from '../ui/Card';

interface StatusSummaryCardsProps {
  sessions: SessionBranchInfo[];
}

export const StatusSummaryCards: React.FC<StatusSummaryCardsProps> = ({ sessions }) => {
  const upToDateCount = sessions.filter(s => !s.isStale).length;
  const staleCount = sessions.filter(s => s.isStale).length;
  const needsAttentionCount = sessions.filter(s => s.hasUncommittedChanges).length;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <Card className="p-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Up to date</span>
            <div className="w-2 h-2 bg-status-success rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {upToDateCount}
            <span className="text-sm font-normal text-text-tertiary">/{sessions.length}</span>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Stale</span>
            <div className="w-2 h-2 bg-status-warning rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {staleCount}
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Changes</span>
            <div className="w-2 h-2 bg-status-warning rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-text-primary">
            {needsAttentionCount}
          </div>
        </div>
      </Card>
    </div>
  );
};
import React from 'react';
import type { SessionBranchInfo } from '../../types/projectDashboard';

interface StatusSummaryCardsProps {
  sessions: SessionBranchInfo[];
}

export const StatusSummaryCards: React.FC<StatusSummaryCardsProps> = ({ sessions }) => {
  const upToDateCount = sessions.filter(s => !s.isStale).length;
  const staleCount = sessions.filter(s => s.isStale).length;
  const needsAttentionCount = sessions.filter(s => s.hasUncommittedChanges).length;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Up to date</span>
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {upToDateCount}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">/{sessions.length}</span>
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stale</span>
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {staleCount}
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Changes</span>
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {needsAttentionCount}
          </div>
        </div>
      </div>
    </div>
  );
};
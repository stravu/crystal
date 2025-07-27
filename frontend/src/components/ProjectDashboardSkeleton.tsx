import React from 'react';
import { Card } from './ui/Card';

export const ProjectDashboardSkeleton: React.FC = () => {
  return (
    <Card className="animate-pulse">
      {/* Header Skeleton */}
      <div className="px-6 py-4 border-b border-border-primary">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-48 bg-surface-tertiary rounded mb-2"></div>
            <div className="h-4 w-32 bg-surface-tertiary rounded"></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-4 w-24 bg-surface-tertiary rounded"></div>
            <div className="h-8 w-20 bg-surface-tertiary rounded"></div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Main Branch Status Skeleton */}
        <div className="mb-6 p-4 bg-surface-secondary rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-border-primary rounded"></div>
              <div>
                <div className="h-5 w-36 bg-surface-tertiary rounded mb-2"></div>
                <div className="h-4 w-48 bg-surface-tertiary rounded"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Table Header Skeleton */}
        <div className="mb-3">
          <div className="h-4 w-40 bg-surface-tertiary rounded"></div>
        </div>

        {/* Table Skeleton */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border-primary">
            <thead className="bg-surface-secondary">
              <tr>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <th key={i} className="px-4 py-3">
                    <div className="h-3 w-16 bg-border-primary rounded"></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-surface-primary divide-y divide-border-primary">
              {[1, 2, 3].map((row) => (
                <tr key={row}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-surface-tertiary rounded"></div>
                      <div>
                        <div className="h-4 w-32 bg-surface-tertiary rounded mb-1"></div>
                        <div className="h-3 w-24 bg-surface-tertiary rounded"></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 bg-surface-tertiary rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 bg-surface-tertiary rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-12 bg-surface-tertiary rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 bg-surface-tertiary rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 bg-surface-tertiary rounded"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
};
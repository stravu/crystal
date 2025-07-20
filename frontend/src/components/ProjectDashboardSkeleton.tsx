import React from 'react';

export const ProjectDashboardSkeleton: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-pulse">
      {/* Header Skeleton */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Main Branch Status Skeleton */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-gray-300 dark:bg-gray-600 rounded"></div>
              <div>
                <div className="h-5 w-36 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Table Header Skeleton */}
        <div className="mb-3">
          <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>

        {/* Table Skeleton */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <th key={i} className="px-4 py-3">
                    <div className="h-3 w-16 bg-gray-300 dark:bg-gray-600 rounded"></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {[1, 2, 3].map((row) => (
                <tr key={row}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div>
                        <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-1"></div>
                        <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
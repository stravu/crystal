import React from 'react';

interface ProjectDashboardProps {
  projectId: number;
  projectName: string;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({ projectId, projectName }) => {
  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">{projectName} Dashboard</h3>
      <p className="text-gray-600 dark:text-gray-400">
        Dashboard for project "{projectName}" (ID: {projectId}) is under development.
      </p>
    </div>
  );
};
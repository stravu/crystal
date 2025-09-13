import React from 'react';
import { ProjectDashboard } from '../ProjectDashboard';
import { useSession } from '../../contexts/SessionContext';

interface DashboardPanelProps {
  panelId: string;
  sessionId: string;
  isActive: boolean;
}

const DashboardPanel: React.FC<DashboardPanelProps> = () => {
  const sessionContext = useSession();
  
  // Get project info from session context
  const projectIdStr = sessionContext?.projectId;
  const projectName = sessionContext?.projectName || 'Project';

  if (!projectIdStr) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-gray-400">No project selected</div>
      </div>
    );
  }

  const projectId = parseInt(projectIdStr, 10);
  if (isNaN(projectId)) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-gray-400">Invalid project ID</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-900 overflow-auto">
      <ProjectDashboard 
        projectId={projectId} 
        projectName={projectName} 
      />
    </div>
  );
};

export default DashboardPanel;
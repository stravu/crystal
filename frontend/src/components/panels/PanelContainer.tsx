import React, { Suspense, lazy, useMemo } from 'react';
import { PanelContainerProps } from '../../types/panelComponents';
import { ErrorBoundary } from 'react-error-boundary';

// Lazy load panel components for better performance
const TerminalPanel = lazy(() => import('./TerminalPanel'));
const ClaudePanel = lazy(() => import('./claude/ClaudePanel'));
const DiffPanel = lazy(() => import('./diff/DiffPanel'));
const EditorPanel = lazy(() => import('./editor/EditorPanel'));
const LogsPanel = lazy(() => import('./logPanel/LogsPanel'));
const DashboardPanel = lazy(() => import('./DashboardPanel'));

const PanelErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({ 
  error, 
  resetErrorBoundary 
}) => (
  <div className="flex flex-col items-center justify-center h-full text-red-500 p-4">
    <p className="text-lg font-semibold mb-2">Panel Error</p>
    <p className="text-sm text-gray-400 mb-4">{error.message}</p>
    <button 
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
    >
      Retry
    </button>
  </div>
);

export const PanelContainer: React.FC<PanelContainerProps> = ({
  panel,
  isActive
}) => {
  console.log('[PanelContainer] Rendering panel:', panel.id, 'Type:', panel.type, 'Active:', isActive);
  
  // FIX: Use stable panel rendering without forcing remounts
  // Each panel type maintains its own state internally
  // The isActive prop controls whether it should render its content
  
  const panelComponent = useMemo(() => {
    console.log('[PanelContainer] Creating component for panel type:', panel.type);
    switch (panel.type) {
      case 'terminal':
        return <TerminalPanel panel={panel} isActive={isActive} />;
      case 'claude':
        return <ClaudePanel panel={panel} isActive={isActive} />;
      case 'diff':
        return <DiffPanel panel={panel} isActive={isActive} sessionId={panel.sessionId} />;
      case 'editor':
        return <EditorPanel panel={panel} isActive={isActive} />;
      case 'logs':
        return <LogsPanel panel={panel} isActive={isActive} />;
      case 'dashboard':
        return <DashboardPanel panelId={panel.id} sessionId={panel.sessionId} isActive={isActive} />;
      // Future panel types...
      default:
        return <div>Unknown panel type: {panel.type}</div>;
    }
  }, [panel.type, panel.id, isActive]); // Include stable deps only

  return (
    <ErrorBoundary
      FallbackComponent={PanelErrorFallback}
      resetKeys={[panel.id]} // Only reset when panel changes
    >
      <Suspense fallback={
        <div className="flex items-center justify-center h-full text-gray-500">
          Loading panel...
        </div>
      }>
        {panelComponent}
      </Suspense>
    </ErrorBoundary>
  );
};
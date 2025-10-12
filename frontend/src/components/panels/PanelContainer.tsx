import React, { Suspense, lazy, useMemo } from 'react';
import { PanelContainerProps } from '../../types/panelComponents';
import { ErrorBoundary } from 'react-error-boundary';
import { CliPanelFactory } from './cli/CliPanelFactory';
import { PanelLoadingFallback } from './PanelLoadingFallback';
import { renderLog } from '../../utils/console';

// Lazy load panel components for better performance
const TerminalPanel = lazy(() => import('./TerminalPanel'));
const DiffPanel = lazy(() => import('./diff/DiffPanel'));
const EditorPanel = lazy(() => import('./editor/EditorPanel'));
const LogsPanel = lazy(() => import('./logPanel/LogsPanel'));
const DashboardPanel = lazy(() => import('./DashboardPanel'));
const SetupTasksPanel = lazy(() => import('./SetupTasksPanel'));

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

export const PanelContainer: React.FC<PanelContainerProps> = React.memo(({
  panel,
  isActive,
  isMainRepo = false
}) => {
  renderLog('[PanelContainer] Rendering panel:', panel.id, 'Type:', panel.type, 'Active:', isActive);
  
  // FIX: Use stable panel rendering without forcing remounts
  // Each panel type maintains its own state internally
  // The isActive prop controls whether it should render its content
  
  const panelComponent = useMemo(() => {
    renderLog('[PanelContainer] Creating component for panel type:', panel.type);

    // CLI panel types (including Claude and Codex) use the CLI panel factory
    const cliPanelTypes = ['claude', 'codex', 'aider', 'continue', 'cursor', 'generic-cli'];
    if (cliPanelTypes.includes(panel.type)) {
      return <CliPanelFactory panel={panel} isActive={isActive} />;
    }

    // Non-CLI panel types use direct components
    switch (panel.type) {
      case 'terminal':
        return <TerminalPanel panel={panel} isActive={isActive} />;
      case 'diff':
        return <DiffPanel panel={panel} isActive={isActive} sessionId={panel.sessionId} isMainRepo={isMainRepo} />;
      case 'editor':
        return <EditorPanel panel={panel} isActive={isActive} />;
      case 'logs':
        return <LogsPanel panel={panel} isActive={isActive} />;
      case 'dashboard':
        return <DashboardPanel panelId={panel.id} sessionId={panel.sessionId} isActive={isActive} />;
      case 'setup-tasks':
        return <SetupTasksPanel panelId={panel.id} sessionId={panel.sessionId} isActive={isActive} />;
      default:
        return (
          <div className="h-full w-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <h3 className="text-lg font-medium text-text-primary mb-2">
                Unknown Panel Type
              </h3>
              <p className="text-sm text-text-secondary">
                Panel type "{panel.type}" is not recognized.
              </p>
              <p className="text-xs text-text-tertiary mt-2">
                Panel ID: {panel.id}
              </p>
            </div>
          </div>
        );
    }
  }, [panel, isActive, isMainRepo]); // Include panel to catch state changes

  return (
    <ErrorBoundary
      FallbackComponent={PanelErrorFallback}
      resetKeys={[panel.id]} // Only reset when panel changes
    >
      <Suspense fallback={
        <PanelLoadingFallback 
          panelType={panel.type}
          message={`Loading ${panel.type} panel...`}
        />
      }>
        {panelComponent}
      </Suspense>
    </ErrorBoundary>
  );
});

PanelContainer.displayName = 'PanelContainer';

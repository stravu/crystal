import { useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { useNotifications } from './hooks/useNotifications';
import { Sidebar } from './components/Sidebar';
import { SessionView } from './components/SessionView';
import { PromptHistory } from './components/PromptHistory';

type ViewMode = 'sessions' | 'prompts';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  useSocket();
  useNotifications();

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Draggable title bar area */}
      <div 
        className="fixed top-0 left-0 right-0 h-8 z-50" 
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <Sidebar viewMode={viewMode} onViewModeChange={setViewMode} />
      {viewMode === 'sessions' ? <SessionView /> : <PromptHistory />}
    </div>
  );
}

export default App;
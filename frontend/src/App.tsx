import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useNotifications } from './hooks/useNotifications';
import { Sidebar } from './components/Sidebar';
import { SessionView } from './components/SessionView';
import { PromptHistory } from './components/PromptHistory';
import Help from './components/Help';
import Welcome from './components/Welcome';
import { MainProcessLogger } from './components/MainProcessLogger';

type ViewMode = 'sessions' | 'prompts';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  
  useSocket();
  useNotifications();

  useEffect(() => {
    // Check if we should show welcome screen
    const hideWelcome = localStorage.getItem('crystal-hide-welcome');
    if (!hideWelcome) {
      setIsWelcomeOpen(true);
    }
  }, []);

  return (
    <div className="h-screen flex overflow-hidden">
      <MainProcessLogger />
      {/* Draggable title bar area */}
      <div 
        className="fixed top-0 left-0 right-0 h-8 z-50" 
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <Sidebar viewMode={viewMode} onViewModeChange={setViewMode} onHelpClick={() => setIsHelpOpen(true)} />
      {viewMode === 'sessions' ? <SessionView /> : <PromptHistory />}
      <Help isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <Welcome isOpen={isWelcomeOpen} onClose={() => setIsWelcomeOpen(false)} />
    </div>
  );
}

export default App;
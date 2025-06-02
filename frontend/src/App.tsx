import { useState } from 'react';
import { useSocket } from './hooks/useSocket';
import { Sidebar } from './components/Sidebar';
import { SessionView } from './components/SessionView';
import { PromptHistory } from './components/PromptHistory';

type ViewMode = 'sessions' | 'prompts';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  useSocket();

  return (
    <div className="h-screen flex">
      <Sidebar viewMode={viewMode} onViewModeChange={setViewMode} />
      {viewMode === 'sessions' ? <SessionView /> : <PromptHistory />}
    </div>
  );
}

export default App;
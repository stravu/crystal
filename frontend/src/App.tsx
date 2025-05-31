import { useSocket } from './hooks/useSocket';
import { Sidebar } from './components/Sidebar';
import { SessionView } from './components/SessionView';

function App() {
  useSocket();

  return (
    <div className="h-screen flex">
      <Sidebar />
      <SessionView />
    </div>
  );
}

export default App;
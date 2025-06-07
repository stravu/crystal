import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { SessionListItem } from './SessionListItem';
import { CreateSessionButton } from './CreateSessionButton';
import { Settings } from './Settings';
import ProjectSelector from './ProjectSelector';

type ViewMode = 'sessions' | 'prompts';

interface SidebarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function Sidebar({ viewMode, onViewModeChange }: SidebarProps) {
  const sessions = useSessionStore((state) => state.sessions);
  const isLoaded = useSessionStore((state) => state.isLoaded);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  return (
    <>
      <div className="w-64 bg-gray-800 text-white h-full flex flex-col">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h1 className="text-xl font-bold">Crystal</h1>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-gray-400 hover:text-white transition-colors"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        
        {/* Project Selector */}
        <div className="p-4 border-b border-gray-700">
          <ProjectSelector onProjectChange={() => {
            // Reload sessions when project changes
            window.location.reload();
          }} />
        </div>
        
        {/* Navigation Tabs */}
        <div className="border-b border-gray-700">
          <div className="flex">
            <button
              onClick={() => onViewModeChange('sessions')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                viewMode === 'sessions'
                  ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => onViewModeChange('prompts')}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                viewMode === 'prompts'
                  ? 'bg-gray-700 text-white border-b-2 border-blue-500'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
            >
              Prompts
            </button>
          </div>
        </div>
        
        {viewMode === 'sessions' && (
          <div className="p-4">
            <CreateSessionButton />
          </div>
        )}
      
      {viewMode === 'sessions' && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 py-2 text-sm text-gray-400 uppercase">Sessions</div>
          <div className="space-y-1 px-2 pb-2">
            {!isLoaded ? (
              <div className="px-2 py-4 text-gray-500 text-sm text-center">
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-2 py-4 text-gray-500 text-sm text-center">
                No sessions yet
              </div>
            ) : (
              sessions.map((session) => (
                <SessionListItem key={session.id} session={session} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
      
      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}
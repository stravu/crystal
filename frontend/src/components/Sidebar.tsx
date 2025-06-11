import { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { SessionListItem } from './SessionListItem';
import { CreateSessionButton } from './CreateSessionButton';
import { Settings } from './Settings';
import ProjectSelector from './ProjectSelector';
import crystalLogo from '../assets/crystal-logo.svg';

type ViewMode = 'sessions' | 'prompts';

interface SidebarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onHelpClick: () => void;
  onAboutClick: () => void;
}

export function Sidebar({ viewMode, onViewModeChange, onHelpClick, onAboutClick }: SidebarProps) {
  const sessions = useSessionStore((state) => state.sessions);
  const isLoaded = useSessionStore((state) => state.isLoaded);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <div data-testid="sidebar" className="w-64 bg-gray-800 text-white h-full flex flex-col pt-4">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img src={crystalLogo} alt="Crystal" className="h-6 w-6" />
            <h1 className="text-xl font-bold">Crystal</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onHelpClick}
              className="text-gray-400 hover:text-white transition-colors"
              title="Help"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={onAboutClick}
              className="text-gray-400 hover:text-white transition-colors"
              title="About Crystal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              data-testid="settings-button"
              className="text-gray-400 hover:text-white transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
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
          <div className="px-4 py-2 text-sm text-gray-400 uppercase flex items-center justify-between">
            <span>Sessions</span>
            <div className="group relative">
              <button 
                className="text-gray-500 hover:text-gray-300 transition-colors"
                title="Status legend"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {/* Status Legend Tooltip */}
              <div className="absolute left-full ml-2 -top-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                <div className="p-3">
                  <h4 className="text-sm font-semibold text-white mb-2">Session Status Legend</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-gray-300">Initializing - Setting up environment</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-gray-300">Running - Processing your request</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                      <span className="text-gray-300">Waiting - Needs your input</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                      <span className="text-gray-300">Completed - Task finished</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-gray-300">Error - Something went wrong</span>
                    </div>
                  </div>
                </div>
                {/* Arrow pointing left */}
                <div className="absolute top-4 -left-2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-gray-900"></div>
              </div>
            </div>
          </div>
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

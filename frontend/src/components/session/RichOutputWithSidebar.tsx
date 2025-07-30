import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, History, GitCommit } from 'lucide-react';
import { RichOutputView } from './RichOutputView';
import { PromptNavigation } from '../PromptNavigation';
import { CommitsPanel } from '../CommitsPanel';
import { cn } from '../../utils/cn';
import { RichOutputSettings } from './RichOutputView';

interface RichOutputWithSidebarProps {
  sessionId: string;
  sessionStatus?: string;
  model?: string;
  settings?: RichOutputSettings;
  onSettingsChange?: (settings: RichOutputSettings) => void;
  showSettings?: boolean;
  onSettingsClick?: () => void;
}

const SIDEBAR_COLLAPSED_KEY = 'crystal-rich-output-sidebar-collapsed';
const SIDEBAR_TAB_KEY = 'crystal-rich-output-sidebar-tab';

type SidebarTab = 'prompts' | 'commits';

export const RichOutputWithSidebar: React.FC<RichOutputWithSidebarProps> = ({
  sessionId,
  sessionStatus,
  settings,
}) => {
  // Load collapsed state from localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  });
  
  // Load active tab from localStorage
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => {
    const stored = localStorage.getItem(SIDEBAR_TAB_KEY);
    return (stored as SidebarTab) || 'prompts';
  });
  
  const richOutputRef = useRef<{ scrollToPrompt: (promptIndex: number) => void }>(null);

  // Save collapsed state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);
  
  // Save active tab to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(SIDEBAR_TAB_KEY, activeTab);
  }, [activeTab]);
  
  // Override the navigation handler to scroll within rich output
  const handleNavigateToPrompt = useCallback((marker: any) => {
    // Use the prompt index to scroll to the right message
    if (richOutputRef.current && marker) {
      const promptIndex = marker.id - 1; // Prompt IDs start at 1
      richOutputRef.current.scrollToPrompt(promptIndex);
    }
  }, []);

  return (
    <div className="flex h-full relative">
      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <RichOutputView
          ref={richOutputRef}
          sessionId={sessionId}
          sessionStatus={sessionStatus}
          settings={settings}
        />
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          'absolute top-4 z-10 bg-surface-secondary hover:bg-surface-hover',
          'border border-border-primary rounded-l-lg p-2',
          'transition-all duration-300 ease-in-out',
          'flex items-center gap-1 group',
          isCollapsed ? 'right-0 rounded-r-lg' : 'right-64 -mr-px'
        )}
        title={isCollapsed ? 'Show sidebar' : 'Hide sidebar'}
      >
        {isCollapsed ? (
          <>
            {activeTab === 'prompts' ? (
              <History className="w-4 h-4 text-text-secondary group-hover:text-text-primary" />
            ) : (
              <GitCommit className="w-4 h-4 text-text-secondary group-hover:text-text-primary" />
            )}
            <ChevronLeft className="w-4 h-4 text-text-secondary group-hover:text-text-primary" />
          </>
        ) : (
          <ChevronRight className="w-4 h-4 text-text-secondary group-hover:text-text-primary" />
        )}
      </button>

      {/* Collapsible Sidebar */}
      <div
        className={cn(
          'flex transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-0' : 'w-64'
        )}
      >
        {!isCollapsed && (
          <div className="w-64 h-full border-l border-border-primary flex flex-col">
            {/* Tab Header */}
            <div className="flex border-b border-border-primary">
              <button
                onClick={() => setActiveTab('prompts')}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  activeTab === 'prompts'
                    ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                )}
              >
                <History className="w-4 h-4" />
                <span>Prompts</span>
              </button>
              <button
                onClick={() => setActiveTab('commits')}
                className={cn(
                  'flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  activeTab === 'commits'
                    ? 'text-interactive border-b-2 border-interactive bg-interactive/5'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-hover'
                )}
              >
                <GitCommit className="w-4 h-4" />
                <span>Commits</span>
              </button>
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'prompts' ? (
                <PromptNavigation
                  sessionId={sessionId}
                  onNavigateToPrompt={handleNavigateToPrompt}
                />
              ) : (
                <CommitsPanel sessionId={sessionId} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
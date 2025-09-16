import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { RichOutputView } from '../ai/RichOutputView';
import { PromptNavigation } from './PromptNavigation';
import { cn } from '../../../utils/cn';
import { RichOutputSettings } from '../ai/AbstractAIPanel';
import { MessageTransformer } from '../ai/transformers/MessageTransformer';
import { ClaudeMessageTransformer } from '../ai/transformers/ClaudeMessageTransformer';

interface RichOutputWithSidebarProps {
  panelId?: string;
  sessionId?: string; // Support both for backward compatibility
  sessionStatus?: string;
  model?: string;
  settings?: RichOutputSettings;
  onSettingsChange?: (settings: RichOutputSettings) => void;
  showSettings?: boolean;
  onSettingsClick?: () => void;
  transformer?: MessageTransformer;
}

export const RichOutputWithSidebar: React.FC<RichOutputWithSidebarProps> = ({
  panelId,
  sessionId,
  sessionStatus,
  settings,
  transformer,
}) => {
  // Use panelId if available, otherwise fall back to sessionId for backward compatibility
  const id = panelId || sessionId;
  if (!id) {
    throw new Error('RichOutputWithSidebar requires either panelId or sessionId');
  }
  
  // Create panel-specific localStorage keys
  const sidebarCollapsedKey = `crystal-sidebar-collapsed-${id}`;
  
  // Load collapsed state from localStorage (keyed by panel ID)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(sidebarCollapsedKey);
    return stored === 'true';
  });
  
  const richOutputRef = useRef<{ scrollToPrompt: (promptIndex: number) => void }>(null);

  // Save collapsed state to localStorage when it changes (keyed by panel ID)
  useEffect(() => {
    localStorage.setItem(sidebarCollapsedKey, String(isCollapsed));
  }, [isCollapsed, sidebarCollapsedKey]);
  
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
          panelId={id}
          sessionStatus={sessionStatus}
          settings={settings}
          messageTransformer={transformer || new ClaudeMessageTransformer()}
          outputEventName="session-output-available"
          getOutputsHandler="panels:getJsonMessages"
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
        title={isCollapsed ? 'Show prompt history' : 'Hide prompt history'}
      >
        {isCollapsed ? (
          <>
            <History className="w-4 h-4 text-text-secondary group-hover:text-text-primary" />
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
          <PromptNavigation
            panelId={id}
            onNavigateToPrompt={handleNavigateToPrompt}
          />
        )}
      </div>
    </div>
  );
};
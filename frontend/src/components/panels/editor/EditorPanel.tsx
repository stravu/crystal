import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileEditor } from './FileEditor';
import { EditorPanelState, ToolPanel } from '../../../../../shared/types/panels';
import { panelApi } from '../../../services/panelApi';
import { debounce } from '../../../utils/debounce';

interface EditorPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({ 
  panel, 
  isActive 
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  
  const editorState = panel.state?.customState as EditorPanelState;
  
  // Mark panel as viewed when it becomes active
  useEffect(() => {
    if (isActive && !panel.state?.hasBeenViewed) {
      panelApi.updatePanel(panel.id, {
        state: {
          ...panel.state,
          hasBeenViewed: true
        }
      });
    }
  }, [isActive, panel.id, panel.state]);
  
  // Initialize the editor panel
  useEffect(() => {
    if (isActive && !isInitialized) {
      setIsInitialized(true);
      // If there's a file path in state, it will be loaded by FileEditor
    }
  }, [isActive, isInitialized]);
  
  // Use ref to store the debounced function so it doesn't get recreated
  const debouncedUpdateRef = useRef<any>(null);
  
  // Initialize debounced function only once
  useEffect(() => {
    debouncedUpdateRef.current = debounce((panelId: string, newState: Partial<EditorPanelState>) => {
      // Get the latest panel state from the store when actually saving
      const currentPanel = panel; // This might be stale, but we use panelId
      panelApi.updatePanel(panelId, {
        state: {
          isActive: currentPanel.state?.isActive || false,
          isPinned: currentPanel.state?.isPinned,
          hasBeenViewed: currentPanel.state?.hasBeenViewed,
          customState: newState // Just save the new state directly
        }
      }).catch(err => {
        console.error('Failed to update editor panel state:', err);
      });
    }, 500);
    
    // Cleanup on unmount
    return () => {
      if (debouncedUpdateRef.current?.cancel) {
        debouncedUpdateRef.current.cancel();
      }
    };
  }, []); // Empty deps - only create once
  
  // Save state changes to the panel
  const handleStateChange = useCallback((newState: Partial<EditorPanelState>) => {
    // Merge with existing state
    const mergedState = {
      ...editorState,
      ...newState
    };
    
    // Call debounced update
    if (debouncedUpdateRef.current) {
      debouncedUpdateRef.current(panel.id, mergedState);
    }
  }, [panel.id, editorState]);
  
  // Update panel title when file changes
  const handleFileChange = useCallback((filePath: string | undefined, isDirty: boolean) => {
    if (filePath) {
      const filename = filePath.split('/').pop() || 'Editor';
      const title = isDirty ? `${filename} *` : filename;
      panelApi.updatePanel(panel.id, { title });
      
      // Also update state
      handleStateChange({ filePath, isDirty });
    }
  }, [panel.id, handleStateChange]);
  
  // Only render when active (for memory efficiency)
  if (!isActive) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        <div className="text-center">
          <div className="text-sm">Editor panel not active</div>
          <div className="text-xs mt-1 text-text-tertiary">Click to activate</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-full w-full">
      <FileEditor 
        sessionId={panel.sessionId}
        initialFilePath={editorState?.filePath}
        initialState={editorState}
        onFileChange={handleFileChange}
        onStateChange={handleStateChange}
      />
    </div>
  );
};

export default EditorPanel;
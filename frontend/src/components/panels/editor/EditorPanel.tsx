import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileEditor } from './FileEditor';
import { EditorPanelState, ToolPanel } from '../../../../../shared/types/panels';
import { panelApi } from '../../../services/panelApi';
import { debounce, type DebouncedFunction } from '../../../utils/debounce';

interface EditorPanelProps {
  panel: ToolPanel;
  isActive: boolean;
}

export const EditorPanel: React.FC<EditorPanelProps> = ({ 
  panel, 
  isActive 
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Extract editor state each render to ensure we get updates
  const editorState = React.useMemo(() => 
    panel.state?.customState as EditorPanelState,
    [panel.state?.customState]
  );
  
  console.log('[EditorPanel] Rendering with state:', {
    panelId: panel.id,
    isActive,
    editorState,
    panelState: panel.state
  });
  
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
  const debouncedUpdateRef = useRef<DebouncedFunction<(panelId: string, newState: Partial<EditorPanelState>) => void> | null>(null);
  
  // Initialize debounced function immediately to prevent warning
  if (!debouncedUpdateRef.current) {
    debouncedUpdateRef.current = debounce((panelId: string, newState: Partial<EditorPanelState>) => {
      console.log('[EditorPanel] Saving state to database:', {
        panelId,
        newState
      });
      
      // Get the latest panel state from the store when actually saving
      const currentPanel = panel; // This might be stale, but we use panelId
      const stateToSave = {
        isActive: currentPanel.state?.isActive || false,
        isPinned: currentPanel.state?.isPinned,
        hasBeenViewed: currentPanel.state?.hasBeenViewed,
        customState: newState // Just save the new state directly
      };
      
      console.log('[EditorPanel] Full state being saved:', stateToSave);
      
      panelApi.updatePanel(panelId, {
        state: stateToSave
      }).then(() => {
        console.log('[EditorPanel] State saved successfully');
      }).catch(err => {
        console.error('[EditorPanel] Failed to update editor panel state:', err);
      });
    }, 500);
  }
  
  // Cleanup effect for debounced function - flush pending saves on unmount
  useEffect(() => {
    return () => {
      if (debouncedUpdateRef.current?.flush) {
        debouncedUpdateRef.current.flush(); // Save any pending changes before unmount
      }
    };
  }, []); // Empty deps - only create once
  
  // Also flush pending saves when switching sessions
  useEffect(() => {
    const handleSessionSwitch = () => {
      if (debouncedUpdateRef.current?.flush) {
        debouncedUpdateRef.current.flush(); // Save before switching sessions
      }
    };
    
    window.addEventListener('session-switched', handleSessionSwitch);
    return () => {
      window.removeEventListener('session-switched', handleSessionSwitch);
    };
  }, []); // Empty deps - only create once
  
  // Save state changes to the panel
  const handleStateChange = useCallback((newState: Partial<EditorPanelState>) => {
    console.log('[EditorPanel] handleStateChange called with:', newState);
    
    // Get the current state directly from panel prop to avoid stale closure
    const currentState = panel.state?.customState as EditorPanelState;
    
    // Merge with existing state
    const mergedState = {
      ...currentState,
      ...newState
    };
    
    console.log('[EditorPanel] Merged state:', mergedState);
    
    // Call debounced update
    if (debouncedUpdateRef.current) {
      console.log('[EditorPanel] Calling debounced update');
      debouncedUpdateRef.current(panel.id, mergedState);
    } else {
      console.error('[EditorPanel] No debounced update function!');
    }
  }, [panel.id, panel.state?.customState]);
  
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
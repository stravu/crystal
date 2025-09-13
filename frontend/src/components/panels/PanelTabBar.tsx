import React, { useCallback, memo, useState, useRef, useEffect } from 'react';
import { Plus, X, Terminal, ChevronDown, MessageSquare, GitBranch, FileText, FileCode, MoreVertical } from 'lucide-react';
import { cn } from '../../utils/cn';
import { PanelTabBarProps } from '../../types/panelComponents';
import { ToolPanel, ToolPanelType, PANEL_CAPABILITIES } from '../../../../shared/types/panels';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import { useSession } from '../../contexts/SessionContext';

export const PanelTabBar: React.FC<PanelTabBarProps> = memo(({
  panels,
  activePanel,
  onPanelSelect,
  onPanelClose,
  onPanelCreate
}) => {
  const sessionContext = useSession();
  const { gitBranchActions, isMerging } = sessionContext || {};
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Memoize event handlers to prevent unnecessary re-renders
  const handlePanelClick = useCallback((panel: ToolPanel) => {
    onPanelSelect(panel);
  }, [onPanelSelect]);

  const handlePanelClose = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
    
    // Prevent closing logs panel while it's running
    if (panel.type === 'logs') {
      const logsState = panel.state?.customState as any;
      if (logsState?.isRunning) {
        alert('Cannot close logs panel while process is running. Please stop the process first.');
        return;
      }
    }
    
    onPanelClose(panel);
  }, [onPanelClose]);
  
  const handleAddPanel = useCallback((type: ToolPanelType) => {
    onPanelCreate(type);
    setShowDropdown(false);
  }, [onPanelCreate]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);
  
  // Get available panel types (excluding permanent panels, logs, and enforcing singleton)
  const availablePanelTypes = (Object.keys(PANEL_CAPABILITIES) as ToolPanelType[])
    .filter(type => {
      // Exclude permanent panels
      if (PANEL_CAPABILITIES[type].permanent) return false;
      
      // Exclude logs panel - it's only created automatically when running scripts
      if (type === 'logs') return false;
      
      // Enforce singleton panels
      if (PANEL_CAPABILITIES[type].singleton) {
        // Check if a panel of this type already exists
        return !panels.some(p => p.type === type);
      }
      
      return true;
    });
  
  const getPanelIcon = (type: ToolPanelType) => {
    switch (type) {
      case 'terminal':
        return <Terminal className="w-4 h-4" />;
      case 'claude':
        return <MessageSquare className="w-4 h-4" />;
      case 'diff':
        return <GitBranch className="w-4 h-4" />;
      case 'editor':
        return <FileText className="w-4 h-4" />;
      case 'logs':
        return <FileCode className="w-4 h-4" />;
      // Add more icons as panel types are added
      default:
        return null;
    }
  };

  return (
    <div className="panel-tab-bar flex items-center bg-gray-800 border-b border-gray-700 h-8">
      {/* Render panel tabs */}
      {panels.map((panel) => {
        const isPermanent = panel.metadata?.permanent === true;
        
        return (
          <div
            key={panel.id}
            className={cn(
              "flex items-center px-3 py-1 cursor-pointer hover:bg-gray-700 border-r border-gray-700",
              activePanel?.id === panel.id && "bg-gray-700"
            )}
            onClick={() => handlePanelClick(panel)}
            title={isPermanent ? "This panel cannot be closed" : undefined}
          >
            {getPanelIcon(panel.type)}
            <span className="ml-2 text-sm">{panel.title}</span>
            {!isPermanent && (
              <button
                className="ml-2 p-0.5 hover:bg-gray-600 rounded"
                onClick={(e) => handlePanelClose(e, panel)}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
      
      {/* Add Panel dropdown button */}
      <div className="relative" ref={dropdownRef}>
        <button
          className="flex items-center px-3 py-1 hover:bg-gray-700 text-sm"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Tool
          <ChevronDown className="w-3 h-3 ml-1" />
        </button>
        
        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg z-10">
            {availablePanelTypes.map((type) => (
              <button
                key={type}
                className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-700 text-left"
                onClick={() => handleAddPanel(type)}
              >
                {getPanelIcon(type)}
                <span className="ml-2 capitalize">{type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Branch Actions button - moved from ViewTabs */}
      {gitBranchActions && gitBranchActions.length > 0 && (
        <div className="ml-auto flex items-center gap-2 pr-2">
          <Dropdown
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2 px-3 py-1 h-7"
                disabled={isMerging}
              >
                <GitBranch className="w-4 h-4" />
                <span className="text-sm">Git Branch Actions</span>
                <MoreVertical className="w-3 h-3" />
              </Button>
            }
            items={gitBranchActions}
            position="bottom-right"
          />
        </div>
      )}
    </div>
  );
});

PanelTabBar.displayName = 'PanelTabBar';
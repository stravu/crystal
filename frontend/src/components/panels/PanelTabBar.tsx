import React, { useCallback, memo, useState, useRef, useEffect } from 'react';
import { Plus, X, Terminal, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { PanelTabBarProps } from '../../types/panelComponents';
import { ToolPanel, ToolPanelType, PANEL_CAPABILITIES } from '../../../../shared/types/panels';

export const PanelTabBar: React.FC<PanelTabBarProps> = memo(({
  panels,
  activePanel,
  onPanelSelect,
  onPanelClose,
  onPanelCreate
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Memoize event handlers to prevent unnecessary re-renders
  const handlePanelClick = useCallback((panel: ToolPanel) => {
    onPanelSelect(panel);
  }, [onPanelSelect]);

  const handlePanelClose = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
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
  
  // Get available panel types
  const availablePanelTypes = Object.keys(PANEL_CAPABILITIES) as ToolPanelType[];
  
  const getPanelIcon = (type: ToolPanelType) => {
    switch (type) {
      case 'terminal':
        return <Terminal className="w-4 h-4" />;
      // Add more icons as panel types are added
      default:
        return null;
    }
  };

  return (
    <div className="panel-tab-bar flex items-center bg-gray-800 border-b border-gray-700 h-8">
      {/* Render panel tabs */}
      {panels.map((panel) => (
        <div
          key={panel.id}
          className={cn(
            "flex items-center px-3 py-1 cursor-pointer hover:bg-gray-700 border-r border-gray-700",
            activePanel?.id === panel.id && "bg-gray-700"
          )}
          onClick={() => handlePanelClick(panel)}
        >
          {getPanelIcon(panel.type)}
          <span className="ml-2 text-sm">{panel.title}</span>
          <button
            className="ml-2 p-0.5 hover:bg-gray-600 rounded"
            onClick={(e) => handlePanelClose(e, panel)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      
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
    </div>
  );
});

PanelTabBar.displayName = 'PanelTabBar';
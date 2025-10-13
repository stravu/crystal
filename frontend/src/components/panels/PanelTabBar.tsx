import React, { useCallback, memo, useState, useRef, useEffect } from 'react';
import { Plus, X, Terminal, ChevronDown, MessageSquare, GitBranch, FileText, FileCode, MoreVertical, BarChart3, Code2, Edit2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { PanelTabBarProps } from '../../types/panelComponents';
import { ToolPanel, ToolPanelType, PANEL_CAPABILITIES, LogsPanelState } from '../../../../shared/types/panels';
import { Button } from '../ui/Button';
import { Dropdown } from '../ui/Dropdown';
import { useSession } from '../../contexts/SessionContext';

export const PanelTabBar: React.FC<PanelTabBarProps> = memo(({
  panels,
  activePanel,
  onPanelSelect,
  onPanelClose,
  onPanelCreate,
  context = 'worktree'  // Default to worktree for backward compatibility
}) => {
  const sessionContext = useSession();
  const { gitBranchActions, isMerging } = sessionContext || {};
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  
  // Memoize event handlers to prevent unnecessary re-renders
  const handlePanelClick = useCallback((panel: ToolPanel) => {
    onPanelSelect(panel);
  }, [onPanelSelect]);

  const handlePanelClose = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
    
    // Prevent closing logs panel while it's running
    if (panel.type === 'logs') {
      const logsState = panel.state?.customState as LogsPanelState;
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
  
  const handleStartRename = useCallback((e: React.MouseEvent, panel: ToolPanel) => {
    e.stopPropagation();
    if (panel.type === 'diff') {
      return;
    }
    setEditingPanelId(panel.id);
    setEditingTitle(panel.title);
  }, []);
  
  const handleRenameSubmit = useCallback(async () => {
    if (editingPanelId && editingTitle.trim()) {
      try {
        // Update the panel title via IPC
        await window.electron?.invoke('panels:update', editingPanelId, {
          title: editingTitle.trim()
        });
        
        // Update the local panel in the store
        const panel = panels.find(p => p.id === editingPanelId);
        if (panel) {
          panel.title = editingTitle.trim();
        }
      } catch (error) {
        console.error('Failed to rename panel:', error);
      }
    }
    setEditingPanelId(null);
    setEditingTitle('');
  }, [editingPanelId, editingTitle, panels]);
  
  const handleRenameCancel = useCallback(() => {
    setEditingPanelId(null);
    setEditingTitle('');
  }, []);
  
  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  }, [handleRenameSubmit, handleRenameCancel]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && event.target && event.target instanceof Node && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);
  
  // Focus input when editing starts
  useEffect(() => {
    if (editingPanelId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPanelId]);
  
  // Get available panel types (excluding permanent panels, logs, and enforcing singleton)
  const availablePanelTypes = (Object.keys(PANEL_CAPABILITIES) as ToolPanelType[])
    .filter(type => {
      const capabilities = PANEL_CAPABILITIES[type];
      
      // Filter based on context
      if (context === 'project' && !capabilities.canAppearInProjects) return false;
      if (context === 'worktree' && !capabilities.canAppearInWorktrees) return false;
      
      // Exclude permanent panels
      if (capabilities.permanent) return false;
      
      // Exclude logs panel - it's only created automatically when running scripts
      if (type === 'logs') return false;
      
      // Enforce singleton panels
      if (capabilities.singleton) {
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
      case 'codex':
        return <Code2 className="w-4 h-4" />;
      case 'diff':
        return <GitBranch className="w-4 h-4" />;
      case 'editor':
        return <FileText className="w-4 h-4" />;
      case 'logs':
        return <FileCode className="w-4 h-4" />;
      case 'dashboard':
        return <BarChart3 className="w-4 h-4" />;
      // Add more icons as panel types are added
      default:
        return null;
    }
  };

  return (
    <div className="panel-tab-bar bg-surface-secondary border-b border-border-primary dark:border-border-hover">
      {/* Flex container that wraps when needed */}
      <div
        className="flex flex-wrap items-center min-h-[2rem] px-2 gap-x-1"
        role="tablist"
        aria-label="Panel Tabs"
      >
        {/* Render panel tabs */}
        {panels.map((panel) => {
          const isPermanent = panel.metadata?.permanent === true;
          const isEditing = editingPanelId === panel.id;
          const isDiffPanel = panel.type === 'diff';
          const displayTitle = isDiffPanel ? 'Diff' : panel.title;
          
          return (
            <div
              key={panel.id}
              className={cn(
                "group relative inline-flex items-center h-8 px-3 text-sm whitespace-nowrap cursor-pointer select-none",
                "rounded-t-md border border-border-primary dark:border-border-hover border-b-0 -mb-px",
                activePanel?.id === panel.id
                  ? "bg-surface-primary text-text-primary shadow-tactile"
                  : "bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              )}
              onClick={() => !isEditing && handlePanelClick(panel)}
              title={isPermanent ? "This panel cannot be closed" : undefined}
              role="tab"
              aria-selected={activePanel?.id === panel.id}
              tabIndex={activePanel?.id === panel.id ? 0 : -1}
              onKeyDown={(e) => {
                if (isEditing) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePanelClick(panel);
                }
              }}
            >
              {getPanelIcon(panel.type)}
              
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={handleRenameSubmit}
                  className="ml-2 px-1 text-sm bg-bg-primary border border-border-primary dark:border-border-hover rounded outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus text-text-primary"
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: `${Math.max(50, editingTitle.length * 8)}px` }}
                />
              ) : (
                <>
                  <span className="ml-2 text-sm">{displayTitle}</span>
                  {!isPermanent && !isDiffPanel && (
                    <button
                      className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity transition-colors text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-subtle"
                      onClick={(e) => handleStartRename(e, panel)}
                      title="Rename panel"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
              
              {!isPermanent && !isEditing && (
                <button
                  className="ml-1 p-0.5 rounded transition-colors text-text-muted hover:bg-surface-hover hover:text-status-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-subtle"
                  onClick={(e) => handlePanelClose(e, panel)}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        
        {/* Add Panel dropdown button */}
        <div className="relative h-8 flex items-center ml-1" ref={dropdownRef}>
          <button
            className="inline-flex items-center h-8 px-3 text-sm rounded-t-md border border-border-primary dark:border-border-hover border-b-0 -mb-px bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-subtle"
            onClick={() => setShowDropdown(!showDropdown)}
            aria-haspopup="menu"
            aria-expanded={showDropdown}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Tool
            <ChevronDown className="w-3 h-3 ml-1" />
          </button>
          
          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-surface-primary border border-border-primary dark:border-border-hover rounded shadow-dropdown z-10 animate-dropdown-enter">
              {availablePanelTypes.map((type) => (
                <button
                  key={type}
                  className="flex items-center w-full px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary text-left"
                  onClick={() => handleAddPanel(type)}
                >
                  {getPanelIcon(type)}
                  <span className="ml-2 capitalize">{type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Branch Actions button - moved from ViewTabs - only in worktree context */}
        {context === 'worktree' && gitBranchActions && gitBranchActions.length > 0 && (
          <div className="ml-auto flex items-center gap-2 pr-2 h-8">
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
    </div>
  );
});

PanelTabBar.displayName = 'PanelTabBar';

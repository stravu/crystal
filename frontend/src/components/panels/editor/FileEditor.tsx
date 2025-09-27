import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import Editor from '@monaco-editor/react';
import type * as monaco from 'monaco-editor';
import { ChevronRight, ChevronDown, File, Folder, RefreshCw, Plus, Trash2, FolderPlus, Search, X, Eye, Code } from 'lucide-react';
import { MonacoErrorBoundary } from '../../MonacoErrorBoundary';
import { useTheme } from '../../../contexts/ThemeContext';
import { debounce } from '../../../utils/debounce';
import { MarkdownPreview } from '../../MarkdownPreview';
import { useResizablePanel } from '../../../hooks/useResizablePanel';
import { EditorPanelState } from '../../../../../shared/types/panels';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
}

interface FileTreeNodeProps {
  file: FileItem;
  level: number;
  onFileClick: (file: FileItem) => void;
  onRefresh: (path: string) => void;
  onDelete: (file: FileItem) => void;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  searchQuery?: string;
}

function FileTreeNode({ file, level, onFileClick, onRefresh, onDelete, selectedPath, expandedDirs, onToggleDir, searchQuery }: FileTreeNodeProps) {
  const isExpanded = expandedDirs.has(file.path);
  const isSelected = selectedPath === file.path;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (file.isDirectory) {
      onToggleDir(file.path);
    } else {
      onFileClick(file);
    }
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRefresh(file.path);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(file);
  };

  // Highlight matching text
  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    
    // Escape special regex characters
    const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));
    return (
      <>
        {parts.map((part, index) => 
          part.toLowerCase() === searchQuery.toLowerCase() ? (
            <span key={index} className="bg-status-warning text-text-primary">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div
        className={`flex items-center px-2 py-1 hover:bg-surface-hover cursor-pointer group ${
          isSelected ? 'bg-interactive' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={(e) => e.preventDefault()}
      >
        {file.isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 mr-1 text-text-tertiary" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-1 text-text-tertiary" />
            )}
            <Folder className="w-4 h-4 mr-2 text-interactive" />
          </>
        ) : (
          <>
            <div className="w-4 h-4 mr-1" />
            <File className="w-4 h-4 mr-2 text-text-tertiary" />
          </>
        )}
        <span className="flex-1 text-sm truncate text-text-primary">{highlightText(file.name)}</span>
        {file.isDirectory && (
          <button
            onClick={handleRefresh}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-hover rounded text-text-tertiary hover:text-text-primary"
            title="Refresh folder"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-surface-hover rounded ml-1"
          title={`Delete ${file.isDirectory ? 'folder' : 'file'}`}
        >
          <Trash2 className="w-3 h-3 text-status-error" />
        </button>
      </div>
    </div>
  );
}

interface FileTreeProps {
  sessionId: string;
  onFileSelect: (file: FileItem | null) => void;
  selectedPath: string | null;
  initialExpandedDirs?: string[];
  initialSearchQuery?: string;
  initialShowSearch?: boolean;
  onTreeStateChange?: (state: { expandedDirs: string[]; searchQuery: string; showSearch: boolean }) => void;
}

function FileTree({ 
  sessionId, 
  onFileSelect, 
  selectedPath,
  initialExpandedDirs,
  initialSearchQuery,
  initialShowSearch,
  onTreeStateChange 
}: FileTreeProps) {
  const [files, setFiles] = useState<Map<string, FileItem[]>>(new Map());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(initialExpandedDirs || [''])
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [showSearch, setShowSearch] = useState(initialShowSearch || false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showNewItemDialog, setShowNewItemDialog] = useState<'file' | 'folder' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const pendingToggleRef = useRef<string | null>(null);

  const loadFiles = useCallback(async (path: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.invoke('file:list', {
        sessionId,
        path
      });
      
      if (result.success) {
        setFiles(prev => new Map(prev).set(path, result.files));
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadFiles('');
  }, [loadFiles]);

  const toggleDir = useCallback((path: string) => {
    // Prevent double-toggles from React StrictMode
    if (pendingToggleRef.current === path) {
      console.log('Ignoring duplicate toggle for:', path);
      return;
    }
    
    pendingToggleRef.current = path;
    
    // Use flushSync to ensure state updates are applied immediately
    flushSync(() => {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
          console.log('Collapsed:', path);
        } else {
          next.add(path);
          console.log('Expanded:', path);
          // Load files immediately if needed
          if (!files.has(path)) {
            loadFiles(path);
          }
        }
        return next;
      });
    });
    
    // Clear the pending toggle after a short delay
    setTimeout(() => {
      if (pendingToggleRef.current === path) {
        pendingToggleRef.current = null;
      }
    }, 50);
  }, [files, loadFiles]);

  const handleDelete = useCallback(async (file: FileItem) => {
    const confirmMessage = file.isDirectory 
      ? `Are you sure you want to delete the folder "${file.name}" and all its contents?`
      : `Are you sure you want to delete the file "${file.name}"?`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const result = await window.electronAPI.invoke('file:delete', {
        sessionId,
        filePath: file.path
      });
      
      if (result.success) {
        // Refresh the parent directory
        const parentPath = file.path.split('/').slice(0, -1).join('/') || '';
        loadFiles(parentPath);
        
        // If the deleted file was selected, clear the selection
        if (selectedPath === file.path) {
          onFileSelect(null);
        }
      } else {
        setError(`Failed to delete ${file.isDirectory ? 'folder' : 'file'}: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to delete:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    }
  }, [sessionId, loadFiles, selectedPath, onFileSelect]);

  const handleNewFile = useCallback(() => {
    setShowNewItemDialog('file');
    setNewItemName('');
  }, []);

  const handleNewFolder = useCallback(() => {
    setShowNewItemDialog('folder');
    setNewItemName('');
  }, []);

  const handleCreateNewItem = useCallback(async () => {
    if (!newItemName.trim()) return;

    try {
      const isFolder = showNewItemDialog === 'folder';
      const filePath = isFolder ? `${newItemName}/.gitkeep` : newItemName;
      
      const result = await window.electronAPI.invoke('file:write', {
        sessionId,
        filePath,
        content: ''
      });

      if (result.success) {
        loadFiles('');
        setShowNewItemDialog(null);
        setNewItemName('');
      } else {
        setError(`Failed to create ${isFolder ? 'folder' : 'file'}: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to create item:', err);
      setError(err instanceof Error ? err.message : 'Failed to create item');
    }
  }, [sessionId, loadFiles, newItemName, showNewItemDialog]);

  // Focus input when dialog is shown
  useEffect(() => {
    if (showNewItemDialog && newItemInputRef.current) {
      newItemInputRef.current.focus();
    }
  }, [showNewItemDialog]);

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Filter function for search
  const matchesSearch = useCallback((file: FileItem): boolean => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return file.name.toLowerCase().includes(query) || file.path.toLowerCase().includes(query);
  }, [searchQuery]);

  // Check if any child matches search
  const hasMatchingChild = useCallback((dirPath: string): boolean => {
    const queue = [dirPath];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      if (visited.has(currentPath)) continue;
      visited.add(currentPath);
      
      const items = files.get(currentPath) || [];
      for (const item of items) {
        if (matchesSearch(item)) return true;
        if (item.isDirectory) {
          queue.push(item.path);
        }
      }
    }
    return false;
  }, [files, matchesSearch]);

  const renderTree = (path: string, level: number = 0): React.ReactNode => {
    const items = files.get(path) || [];
    
    return items
      .filter(file => {
        if (!searchQuery) return true;
        // Show file if it matches or if it's a directory with matching children
        return matchesSearch(file) || (file.isDirectory && hasMatchingChild(file.path));
      })
      .map(file => (
        <React.Fragment key={file.path}>
          <FileTreeNode
            file={file}
            level={level}
            onFileClick={onFileSelect}
            onRefresh={loadFiles}
            onDelete={handleDelete}
            selectedPath={selectedPath}
            expandedDirs={expandedDirs}
            onToggleDir={toggleDir}
            searchQuery={searchQuery}
          />
          {file.isDirectory && expandedDirs.has(file.path) && (
            <div onClick={(e) => e.stopPropagation()} style={{ minHeight: '1px' }}>
              {renderTree(file.path, level + 1)}
            </div>
          )}
        </React.Fragment>
      ));
  };

  // Auto-expand directories when searching
  useEffect(() => {
    if (searchQuery) {
      // Expand all directories to show search results
      const allDirs = new Set<string>(['']);
      files.forEach((items, dirPath) => {
        allDirs.add(dirPath);
        items.forEach(item => {
          if (item.isDirectory) {
            allDirs.add(item.path);
          }
        });
      });
      setExpandedDirs(allDirs);
    }
    // Note: We don't collapse when search is cleared to preserve user's expanded state
  }, [searchQuery, files]);

  // Focus search input when shown
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Notify parent about tree state changes
  // Use a ref to track if this is the initial mount to avoid calling on first render
  const isInitialMount = useRef(true);
  
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      console.log('[FileTree] Skipping initial mount state update');
      return; // Skip the first render
    }
    
    console.log('[FileTree] State changed:', {
      expandedDirs: Array.from(expandedDirs),
      searchQuery,
      showSearch
    });
    
    if (onTreeStateChange) {
      console.log('[FileTree] Calling onTreeStateChange');
      onTreeStateChange({
        expandedDirs: Array.from(expandedDirs),
        searchQuery,
        showSearch
      });
    } else {
      console.log('[FileTree] No onTreeStateChange callback');
    }
  }, [expandedDirs, searchQuery, showSearch]); // Remove onTreeStateChange from deps to avoid loops
  
  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle search with Cmd/Ctrl+F
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(!showSearch);
      }
      
      // ESC key handling
      if (e.key === 'Escape') {
        // Close new item dialog if open
        if (showNewItemDialog) {
          setShowNewItemDialog(null);
          setNewItemName('');
        }
        // Clear search if active
        else if (searchQuery) {
          setSearchQuery('');
          if (searchInputRef.current) {
            searchInputRef.current.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, searchQuery, showNewItemDialog]);

  if (loading && files.size === 0) {
    return <div className="p-4 text-text-secondary">Loading files...</div>;
  }

  if (error) {
    return <div className="p-4 text-status-error">Error: {error}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-2 border-b border-border-primary">
        <span className="text-sm font-medium text-text-primary">Files</span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1 rounded text-text-tertiary hover:text-text-primary ${showSearch ? 'bg-surface-tertiary' : 'hover:bg-surface-hover'}`}
            title="Search files (Cmd/Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewFile}
            className="p-1 hover:bg-surface-hover rounded text-text-tertiary hover:text-text-primary"
            title="New file"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewFolder}
            className="p-1 hover:bg-surface-hover rounded text-text-tertiary hover:text-text-primary"
            title="New folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
          <button
            onClick={() => loadFiles('')}
            className="p-1 hover:bg-surface-hover rounded text-text-tertiary hover:text-text-primary"
            title="Refresh all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
      {showSearch && (
        <div className="p-2 border-b border-border-primary">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-8 pr-8 py-1 bg-surface-primary border border-border-primary rounded text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-interactive focus:ring-1 focus:ring-interactive"
            />
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 p-0.5 hover:bg-surface-hover rounded"
              >
                <X className="w-3 h-3 text-text-tertiary" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-1 text-xs text-text-tertiary">
              Press ESC to clear • Cmd/Ctrl+F to toggle search
            </div>
          )}
        </div>
      )}
      {showNewItemDialog && (
        <div className="p-2 border-b border-border-primary bg-surface-secondary">
          <form onSubmit={(e) => { e.preventDefault(); handleCreateNewItem(); }}>
            <div className="flex items-center gap-2">
              <input
                ref={newItemInputRef}
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={`Enter ${showNewItemDialog} name...`}
                className="flex-1 px-2 py-1 bg-surface-primary border border-border-primary rounded text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-interactive focus:ring-1 focus:ring-interactive"
              />
              <button
                type="submit"
                disabled={!newItemName.trim()}
                className="px-3 py-1 bg-interactive hover:bg-interactive-hover disabled:bg-surface-tertiary disabled:text-text-tertiary text-white rounded text-sm transition-colors"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => { setShowNewItemDialog(null); setNewItemName(''); }}
                className="px-3 py-1 bg-surface-tertiary hover:bg-surface-hover text-text-secondary rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {error && (
        <div className="px-3 py-2 bg-status-error/20 text-status-error text-sm border-b border-status-error/30">
          {error}
        </div>
      )}
      <div className="flex-1 overflow-auto" onClick={(e) => e.stopPropagation()}>
        {renderTree('')}
      </div>
    </div>
  );
}

interface FileEditorProps {
  sessionId: string;
  initialFilePath?: string;
  initialState?: EditorPanelState;
  onFileChange?: (filePath: string | undefined, isDirty: boolean) => void;
  onStateChange?: (state: Partial<EditorPanelState>) => void;
}

export function FileEditor({ 
  sessionId, 
  initialFilePath,
  initialState,
  onFileChange,
  onStateChange 
}: FileEditorProps) {
  console.log('[FileEditor] Mounting with:', {
    sessionId,
    initialFilePath,
    initialState,
    hasOnStateChange: !!onStateChange
  });
  
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);

  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const hasUnsavedChanges = fileContent !== originalContent;
  
  // Wrap onResize callback to avoid recreating
  const handleTreeResize = useCallback((width: number) => {
    console.log('[FileEditor] Tree resized to:', width);
    if (onStateChange) {
      onStateChange({ fileTreeWidth: width });
    }
  }, [onStateChange]);
  
  // Add resizable hook for file tree column
  const { width: fileTreeWidth, startResize } = useResizablePanel({
    defaultWidth: initialState?.fileTreeWidth || 256,  // Use saved width or default
    minWidth: 200,
    maxWidth: 400,
    storageKey: 'crystal-file-tree-width',
    onResize: handleTreeResize
  });
  
  // Check if this is a markdown file
  const isMarkdownFile = useMemo(() => {
    if (!selectedFile) return false;
    const ext = selectedFile.path.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'markdown';
  }, [selectedFile]);

  const loadFile = useCallback(async (file: FileItem | null) => {
    if (!file || file.isDirectory) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.invoke('file:read', {
        sessionId,
        filePath: file.path
      });
      
      if (result.success) {
        setFileContent(result.content);
        setOriginalContent(result.content);
        setSelectedFile(file);
        setViewMode('edit'); // Reset to edit mode when opening a new file
        
        // Notify parent about file change
        if (onFileChange) {
          onFileChange(file.path, false);
        }
        
        // After loading new file, we need to restore its position
        // This happens in handleEditorMount when editor re-renders
        // But we also need to tell parent the file path changed
        if (onStateChange) {
          onStateChange({ 
            filePath: file.path,
            isDirty: false 
          });
        }
        
        // If we have saved position for this file, restore it
        // The actual restoration happens in handleEditorMount
        // but we need to trigger a re-render with the right state
        if (editorRef.current && initialState?.filePath === file.path) {
          const monacoEditor = editorRef.current;
          
          // Restore cursor position
          if (initialState.cursorPosition && monacoEditor.setPosition) {
            const { line, column } = initialState.cursorPosition;
            setTimeout(() => {
              monacoEditor.setPosition({
                lineNumber: line,
                column: column
              });
              monacoEditor.revealPositionInCenter({
                lineNumber: line,
                column: column
              });
            }, 50);
          }
          
          // Restore scroll position
          if (initialState.scrollPosition !== undefined && monacoEditor.setScrollTop) {
            const scrollPos = initialState.scrollPosition;
            setTimeout(() => {
              monacoEditor.setScrollTop(scrollPos);
            }, 100);
          }
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  }, [sessionId, onFileChange, onStateChange, initialState]);


  const handleEditorMount = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: typeof monaco) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    
    // Now we have properly typed Monaco editor
    const monacoEditor = editor;
    
    // Track cursor position changes with debouncing
    const saveCursorPosition = debounce((position: { lineNumber: number; column: number }) => {
      if (onStateChange) {
        onStateChange({
          cursorPosition: {
            line: position.lineNumber,
            column: position.column
          }
        });
      }
    }, 500); // Debounce cursor position saves
    
    // Track scroll position changes with debouncing
    const saveScrollPosition = debounce((scrollTop: number) => {
      if (onStateChange) {
        onStateChange({
          scrollPosition: scrollTop
        });
      }
    }, 500); // Debounce scroll position saves
    
    // Listen for cursor position changes
    monacoEditor.onDidChangeCursorPosition?.((e: monaco.editor.ICursorPositionChangedEvent) => {
      saveCursorPosition(e.position);
    });
    
    // Listen for scroll position changes
    monacoEditor.onDidScrollChange?.((e: { scrollTop?: number; scrollLeft?: number }) => {
      if (e.scrollTop !== undefined) {
        saveScrollPosition(e.scrollTop);
      }
    });
    
    // Restore cursor and scroll position if available
    if (initialState?.cursorPosition && monacoEditor.setPosition) {
      const { line, column } = initialState.cursorPosition;
      setTimeout(() => {
        monacoEditor.setPosition({
          lineNumber: line,
          column: column
        });
        monacoEditor.revealPositionInCenter({
          lineNumber: line,
          column: column
        });
      }, 50); // Small delay to ensure editor is ready
    }
    
    if (initialState?.scrollPosition !== undefined && monacoEditor.setScrollTop) {
      // Delay to ensure editor is fully rendered and content is loaded
      const scrollPos = initialState.scrollPosition;
      setTimeout(() => {
        monacoEditor.setScrollTop(scrollPos);
      }, 100);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    setFileContent(value || '');
    
    // Notify parent about dirty state
    if (onFileChange && selectedFile) {
      const isDirty = (value || '') !== originalContent;
      onFileChange(selectedFile.path, isDirty);
    }
  };

  // Auto-save functionality
  const autoSave = useCallback(
    debounce(async () => {
      if (!selectedFile || selectedFile.isDirectory || fileContent === originalContent) return;
      
      try {
        const result = await window.electronAPI.invoke('file:write', {
          sessionId,
          filePath: selectedFile.path,
          content: fileContent
        });
        
        if (result.success) {
          setOriginalContent(fileContent);
          
          // Notify parent that file is saved
          if (onFileChange && selectedFile) {
            onFileChange(selectedFile.path, false);
          }
          
          // Emit file saved event
          if (onStateChange) {
            onStateChange({ 
              filePath: selectedFile.path, 
              isDirty: false 
            });
          }
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to auto-save file');
      }
    }, 1000), // Auto-save after 1 second of inactivity
    [sessionId, selectedFile, fileContent, originalContent, onFileChange, onStateChange]
  );

  // Trigger auto-save when content changes
  useEffect(() => {
    if (fileContent !== originalContent && selectedFile && !selectedFile.isDirectory) {
      autoSave();
    }
  }, [fileContent, originalContent, selectedFile, autoSave]);
  
  // Load initial file if provided
  useEffect(() => {
    if (initialFilePath && !selectedFile) {
      const file: FileItem = {
        name: initialFilePath.split('/').pop() || '',
        path: initialFilePath,
        isDirectory: false
      };
      loadFile(file);
    }
  }, [initialFilePath, selectedFile, loadFile]);

  // Memoize the tree state change handler to prevent infinite loops
  const handleTreeStateChange = useCallback((treeState: { expandedDirs: string[]; searchQuery: string; showSearch: boolean }) => {
    console.log('[FileEditor] handleTreeStateChange called with:', treeState);
    if (onStateChange) {
      console.log('[FileEditor] Calling onStateChange');
      onStateChange({
        expandedDirs: treeState.expandedDirs,
        searchQuery: treeState.searchQuery,
        showSearch: treeState.showSearch
      });
    } else {
      console.log('[FileEditor] No onStateChange callback');
    }
  }, [onStateChange]);
  
  // Cleanup effect for Monaco editor models
  useEffect(() => {
    return () => {
      // Cleanup Monaco editor models when component unmounts or file changes
      try {
        if (editorRef.current && typeof editorRef.current === 'object' && editorRef.current !== null && 'getModel' in editorRef.current) {
          const editor = editorRef.current as { getModel: () => unknown, dispose?: () => void };
          const model = editor.getModel();
          if (model && typeof model === 'object' && model !== null && 'dispose' in model) {
            const typedModel = model as { dispose: () => void };
            console.log('[FileEditor] Disposing Monaco model');
            typedModel.dispose();
          }
        }
      } catch (error) {
        console.warn('[FileEditor] Error during Monaco cleanup:', error);
      }
    };
  }, [selectedFile?.path]); // Run cleanup when file changes

  return (
    <div className="h-full flex">
      <div 
        className="bg-surface-secondary border-r border-border-primary relative flex-shrink-0"
        style={{ width: `${fileTreeWidth}px` }}
      >
        <FileTree
          sessionId={sessionId}
          onFileSelect={loadFile}
          selectedPath={selectedFile?.path || null}
          initialExpandedDirs={initialState?.expandedDirs}
          initialSearchQuery={initialState?.searchQuery}
          initialShowSearch={initialState?.showSearch}
          onTreeStateChange={handleTreeStateChange}
        />
        
        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize group z-10"
          onMouseDown={startResize}
        >
          {/* Visual indicator */}
          <div className="absolute inset-0 bg-border-primary group-hover:bg-interactive transition-colors" />
          {/* Larger grab area */}
          <div className="absolute -left-2 -right-2 top-0 bottom-0" />
          {/* Drag indicator dots */}
          <div className="absolute top-1/2 -translate-y-1/2 right-0 transform translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex flex-col gap-1">
              <div className="w-1 h-1 bg-interactive rounded-full" />
              <div className="w-1 h-1 bg-interactive rounded-full" />
              <div className="w-1 h-1 bg-interactive rounded-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border-primary">
              <div className="flex items-center gap-2">
                <File className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm text-text-primary">
                  {selectedFile.path}
                  {hasUnsavedChanges && <span className="text-status-warning ml-2">●</span>}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* Preview Toggle for Markdown Files */}
                {isMarkdownFile && (
                  <div className="flex items-center rounded-lg border border-border-primary bg-surface-tertiary">
                    <button
                      onClick={() => setViewMode('edit')}
                      className={`px-2 py-1 text-xs font-medium rounded-l-lg transition-colors flex items-center gap-1 ${
                        viewMode === 'edit'
                          ? 'bg-interactive text-white'
                          : 'text-text-secondary hover:bg-surface-hover'
                      }`}
                      title="Edit mode"
                    >
                      <Code className="w-3 h-3" />
                      Edit
                    </button>
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`px-2 py-1 text-xs font-medium rounded-r-lg transition-colors flex items-center gap-1 ${
                        viewMode === 'preview'
                          ? 'bg-interactive text-white'
                          : 'text-text-secondary hover:bg-surface-hover'
                      }`}
                      title="Preview mode"
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  {hasUnsavedChanges ? (
                    <>
                      <div className="w-2 h-2 bg-status-warning rounded-full animate-pulse" />
                      <span className="text-status-warning">Auto-saving...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-status-success rounded-full" />
                      <span className="text-status-success">All changes saved</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {error && (
              <div className="px-4 py-2 bg-status-error/20 text-status-error text-sm">
                Error: {error}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              {viewMode === 'preview' && isMarkdownFile ? (
                <div className="h-full overflow-auto bg-bg-primary">
                  <MarkdownPreview
                    content={fileContent}
                    className="min-h-full"
                    id={`file-editor-preview-${sessionId}-${selectedFile.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
                  />
                </div>
              ) : (
                <MonacoErrorBoundary>
                  <Editor
                    theme={isDarkMode ? 'vs-dark' : 'light'}
                    value={fileContent}
                    onChange={handleEditorChange}
                    onMount={handleEditorMount}
                    options={{
                      minimap: { enabled: true },
                      fontSize: 14,
                      wordWrap: 'on',
                      automaticLayout: true,
                      scrollBeyondLastLine: false,
                    }}
                    language={getLanguageFromPath(selectedFile.path)}
                  />
                </MonacoErrorBoundary>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-secondary">
            {loading ? 'Loading...' : 'Select a file to edit'}
          </div>
        )}
      </div>
    </div>
  );
}

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    java: 'java',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ps1: 'powershell',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
  };
  
  return languageMap[ext || ''] || 'plaintext';
}
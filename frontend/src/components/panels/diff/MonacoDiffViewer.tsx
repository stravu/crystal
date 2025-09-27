import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { DiffEditor, type DiffEditorProps, type MonacoDiffEditor } from '@monaco-editor/react';
import { AlertCircle, FileText, Check, Loader2, Eye, Code } from 'lucide-react';
import type { FileDiff } from '../../../types/diff';
import { debounce, type DebouncedFunction } from '../../../utils/debounce';
import { MonacoErrorBoundary } from '../../MonacoErrorBoundary';
import { MarkdownPreview } from '../../MarkdownPreview';
import type * as monaco from 'monaco-editor';

interface IDisposable {
  dispose(): void;
}

interface MonacoDiffViewerProps {
  file: FileDiff;
  sessionId: string;
  isDarkMode: boolean;
  viewType: 'split' | 'inline';
  onSave?: () => void;
  isReadOnly?: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'pending';

export const MonacoDiffViewer: React.FC<MonacoDiffViewerProps> = ({
  file,
  sessionId,
  isDarkMode,
  viewType,
  onSave,
  isReadOnly = false
}) => {
  const editorRef = useRef<MonacoDiffEditor | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentContent, setCurrentContent] = useState<string>(file.newValue || '');
  const savedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProgrammaticUpdateRef = useRef<boolean>(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [canMountEditor, setCanMountEditor] = useState(false);
  const [isFullContentLoaded, setIsFullContentLoaded] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number>(400); // Default height
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedSaveRef = useRef<DebouncedFunction<(content: string) => Promise<void>> | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'preview' | 'split'>('diff');
  const [previewHeight, setPreviewHeight] = useState<number>(600); // Default preview height
  const previewRef = useRef<HTMLDivElement>(null);
  
  // Check if this is a markdown file
  const isMarkdownFile = useMemo(() => {
    const ext = file.path.split('.').pop()?.toLowerCase();
    return ext === 'md' || ext === 'markdown';
  }, [file.path]);

  // Debug logging
  console.log('MonacoDiffViewer - isDarkMode:', isDarkMode);
  console.log('MonacoDiffViewer - theme:', isDarkMode ? 'vs-dark' : 'vs');

  // Delay mounting editor to ensure stability
  useEffect(() => {
    // Reset states when important props change
    setCanMountEditor(false);
    setIsEditorReady(false);
    
    const timer = setTimeout(() => {
      setCanMountEditor(true);
    }, 100);
    
    return () => {
      clearTimeout(timer);
      // Don't reset canMountEditor on cleanup to avoid race conditions
    };
  }, [file.path]); // Removed isReadOnly - we'll handle it dynamically

  // Track when full content is loaded
  useEffect(() => {
    // Check if we have full content by looking for the originalDiffNewValue marker
    const hasFullContent = 'originalDiffNewValue' in file && file.originalDiffNewValue !== undefined && file.newValue !== file.originalDiffNewValue;
    setIsFullContentLoaded(hasFullContent);
    console.log('Full content loaded status:', hasFullContent, 'for file:', file.path);
  }, [file]);

  // Get file extension for language detection
  const getLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'swift': 'swift',
      'kt': 'kotlin',
      'r': 'r',
      'sql': 'sql',
      'sh': 'shell',
      'bash': 'shell',
      'zsh': 'shell',
      'ps1': 'powershell',
      'yaml': 'yaml',
      'yml': 'yaml',
      'json': 'json',
      'xml': 'xml',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'md': 'markdown',
      'markdown': 'markdown',
      'dockerfile': 'dockerfile',
      'makefile': 'makefile',
      'toml': 'toml',
      'ini': 'ini',
      'conf': 'ini',
      'env': 'ini',
    };
    return languageMap[ext || ''] || 'plaintext';
  };

  const performSave = useCallback(async (content: string) => {
    console.log('Saving file:', { file, sessionId, path: file.path, isFullContentLoaded });

    if (!file.path) {
      setSaveError('File path is missing');
      setSaveStatus('error');
      console.error('File path is undefined:', file);
      return;
    }

    // If we expect full content but don't have it yet, prevent save
    if (!isReadOnly && 'originalDiffNewValue' in file && !isFullContentLoaded) {
      setSaveError('Cannot save: Waiting for full file content to load. Please try again.');
      setSaveStatus('error');
      console.error('Prevented saving before full content is loaded');
      return;
    }

    // Safety check: if we have originalDiffNewValue, it means we tried to load full content
    // but might have failed. Check if the content we're about to save looks like just a diff hunk
    if ('originalDiffNewValue' in file && file.originalDiffNewValue !== undefined) {
      // If newValue is different from originalDiffNewValue, we successfully loaded full content
      const hasFullContent = file.newValue !== file.originalDiffNewValue;
      
      if (!hasFullContent) {
        // We're still using the diff hunk content, not the full file
        // This is dangerous - we should not save partial content
        setSaveError('Cannot save: Only partial file content is loaded. Please refresh the diff view.');
        setSaveStatus('error');
        console.error('Prevented saving partial content. Current content matches original diff hunk, not full file.');
        return;
      }
    }

    // Additional safety check: Look for diff markers that indicate partial content
    const diffMarkers = ['@@', '+++', '---', 'diff --git'];
    const contentLines = content.split('\n');
    const firstFewLines = contentLines.slice(0, 5).join('\n');
    
    // Check if content looks like a diff rather than actual file content
    if (diffMarkers.some(marker => firstFewLines.includes(marker))) {
      setSaveError('Cannot save: Content appears to be a diff, not the full file. Please refresh the diff view.');
      setSaveStatus('error');
      console.error('Prevented saving diff content as file content. Content starts with:', firstFewLines);
      return;
    }

    // Additional check: If file is supposed to be non-empty but content is suspiciously short
    if (file.type === 'modified' && content.length < 50 && file.oldValue && file.oldValue.length > content.length * 2) {
      setSaveError('Cannot save: Content appears incomplete. Please refresh the diff view.');
      setSaveStatus('error');
      console.error('Prevented saving potentially incomplete content. New length:', content.length, 'Old length:', file.oldValue?.length);
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);

    // Final safety check: ensure we're saving to the correct file
    const currentFilePath = file.path;
    
    try {
      console.log('Invoking file:write with:', {
        sessionId,
        filePath: currentFilePath,
        contentLength: content.length,
        contentPreview: content.substring(0, 100)
      });
      
      const result = await window.electronAPI.invoke('file:write', {
        sessionId,
        filePath: currentFilePath,
        content
      });

      if (result.success) {
        setSaveStatus('saved');
        // Update the file's newValue to match saved content
        file.newValue = content;
        onSave?.();
        
        // Clear the saved status after 2 seconds
        if (savedTimeoutRef.current) {
          clearTimeout(savedTimeoutRef.current);
        }
        savedTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      } else {
        setSaveError(result.error || 'Failed to save file');
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Error saving file:', error);
      setSaveError('Failed to save file');
      setSaveStatus('error');
    }
  }, [sessionId, file, onSave, isReadOnly, isFullContentLoaded]);

  // Create debounced save function
  const debouncedSave = useMemo(
    () => debounce(performSave, 1000),
    [performSave]
  );
  
  // Store debouncedSave in ref for cleanup
  useEffect(() => {
    debouncedSaveRef.current = debouncedSave;
  }, [debouncedSave]);

  // Calculate height based on content
  const calculateEditorHeight = useCallback(() => {
    if (!editorRef.current) return;
    
    try {
      const originalEditor = editorRef.current.getOriginalEditor();
      const modifiedEditor = editorRef.current.getModifiedEditor();
      
      const originalModel = originalEditor.getModel();
      const modifiedModel = modifiedEditor.getModel();
      
      const lineHeight = 19; // Default line height for Monaco editor
      const originalLines = originalModel ? originalModel.getLineCount() : 0;
      const modifiedLines = modifiedModel ? modifiedModel.getLineCount() : 0;
      
      // Use the maximum line count between original and modified
      const maxLines = Math.max(originalLines, modifiedLines);
      
      // Calculate height with padding for diff headers and UI elements
      // Line height + padding for headers (approx 3 lines worth)
      const calculatedHeight = Math.max(400, (maxLines * lineHeight) + (lineHeight * 3));
      
      setEditorHeight(calculatedHeight);
    } catch (error) {
      // Error calculating editor height - debug logging removed
    }
  }, []);

  const handleBeforeMount = useCallback((_monaco: typeof monaco) => {
    // Temporarily commented out to test built-in themes
    // // Define custom themes before the editor mounts
    // monaco.editor.defineTheme('crystal-dark', {
    //   base: 'vs-dark',
    //   inherit: true,
    //   rules: [],
    //   colors: {
    //     'editor.background': '#111827',
    //     'editor.foreground': '#f3f4f6',
    //     'editorWidget.background': '#111827',
    //     'editorWidget.foreground': '#f3f4f6',
    //     'diffEditor.insertedTextBackground': '#10b98120',
    //     'diffEditor.removedTextBackground': '#ef444420',
    //     'diffEditor.insertedLineBackground': '#10b98115',
    //     'diffEditor.removedLineBackground': '#ef444415',
    //   }
    // });
    
    // monaco.editor.defineTheme('crystal-light', {
    //   base: 'vs',
    //   inherit: true,
    //   rules: [],
    //   colors: {
    //     'editor.background': '#ffffff',
    //     'editor.foreground': '#1e2026',
    //     'editorWidget.background': '#ffffff',
    //     'editorWidget.foreground': '#1e2026',
    //     'diffEditor.insertedTextBackground': '#16a34a15',
    //     'diffEditor.removedTextBackground': '#dc262615',
    //     'diffEditor.insertedLineBackground': '#16a34a10',
    //     'diffEditor.removedLineBackground': '#dc262610',
    //   }
    // });
  }, []);

  const handleEditorDidMount: DiffEditorProps['onMount'] = useCallback((editor: MonacoDiffEditor, monacoInstance: typeof monaco) => {
    try {
      editorRef.current = editor;
      
      // Get the modified editor (right side)
      const modifiedEditor = editor.getModifiedEditor();
      
      // Store disposables for cleanup
      const disposables: IDisposable[] = [];
      
      // Mark editor as ready
      setIsEditorReady(true);
      
      // Calculate initial height
      setTimeout(() => {
        calculateEditorHeight();
      }, 100);
    
    // Track changes and auto-save (only if not read-only)
    if (!isReadOnly) {
      const changeDisposable = modifiedEditor.onDidChangeModelContent(() => {
        // Check if editor and model still exist
        if (!editorRef.current || !modifiedEditor.getModel()) {
          return;
        }
        
        try {
          const newContent = modifiedEditor.getValue();
          setCurrentContent(newContent);
          
          // Recalculate height when content changes
          setTimeout(() => {
            calculateEditorHeight();
          }, 50);
          
          // Skip auto-save if this is a programmatic update (e.g., switching commits)
          if (isProgrammaticUpdateRef.current) {
            return;
          }
          
          // Show pending status immediately
          if (newContent !== file.newValue) {
            setSaveStatus('pending');
            setSaveError(null);
            // Only trigger auto-save if we have full content loaded (or if it's not expected)
            if (isFullContentLoaded || !('originalDiffNewValue' in file)) {
              // Trigger debounced save
              debouncedSave(newContent);
            } else {
              console.log('Auto-save skipped: waiting for full content to load');
            }
          }
        } catch (error) {
          console.debug('Error in content change handler:', error);
        }
      });
      disposables.push(changeDisposable);

      // Add save keyboard shortcut for immediate save
      const commandDisposable = modifiedEditor.addCommand(
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS,
        () => {
          // Check if editor and model still exist
          if (!editorRef.current || !modifiedEditor.getModel()) {
            return;
          }
          
          try {
            const content = modifiedEditor.getValue();
            // Cancel any pending debounced save
            debouncedSave.cancel?.();
            performSave(content);
          } catch (error) {
            console.debug('Error in save command:', error);
          }
        }
      );
      if (commandDisposable) {
        disposables.push({ dispose: () => commandDisposable });
      }
    }
    
    // Store disposables for cleanup
    (editor as MonacoDiffEditor & { __disposables?: IDisposable[] }).__disposables = disposables;
    } catch (error) {
      console.error('Error mounting Monaco editor:', error);
      setIsEditorReady(false);
      // Try to recover by remounting
      setTimeout(() => {
        setCanMountEditor(false);
        setTimeout(() => setCanMountEditor(true), 100);
      }, 100);
    }
  }, [isReadOnly, debouncedSave, performSave, file.newValue, isFullContentLoaded, calculateEditorHeight, isDarkMode]);

  // Refresh content when file changes
  useEffect(() => {
    // Set flag to prevent auto-save during programmatic update
    isProgrammaticUpdateRef.current = true;
    
    setCurrentContent(file.newValue || '');
    setSaveStatus('idle');
    setSaveError(null);
    
    // Update the editor content if it exists, is ready, and hasn't been disposed
    if (editorRef.current && isEditorReady) {
      try {
        const modifiedEditor = editorRef.current.getModifiedEditor();
        if (modifiedEditor && modifiedEditor.getModel()) {
          const currentValue = modifiedEditor.getValue();
          
          // Only update if content is different
          if (currentValue !== (file.newValue || '')) {
            modifiedEditor.setValue(file.newValue || '');
          }
        }
      } catch (error) {
        // Editor might have been disposed, ignore the error
        console.debug('Editor update skipped, might be disposed:', error);
      }
    }
    
    // Reset flag after a small delay to ensure the change event has fired
    const timeoutId = setTimeout(() => {
      isProgrammaticUpdateRef.current = false;
      // Recalculate height after content update
      calculateEditorHeight();
    }, 100);
    
    // Cleanup timeout on effect cleanup
    return () => clearTimeout(timeoutId);
  }, [file.path, file.newValue, isEditorReady, calculateEditorHeight]);

  // Handle readOnly prop changes dynamically
  useEffect(() => {
    if (editorRef.current && isEditorReady) {
      try {
        const modifiedEditor = editorRef.current.getModifiedEditor();
        if (modifiedEditor) {
          modifiedEditor.updateOptions({ readOnly: isReadOnly });
        }
      } catch (error) {
        console.debug('Error updating editor readOnly option:', error);
      }
    }
  }, [isReadOnly, isEditorReady]);

  // Update theme when isDarkMode changes
  // useEffect(() => {
  //   if (editorRef.current && isEditorReady) {
  //     // The monaco instance from @monaco-editor/react is available via the loader
  //     import('monaco-editor').then((monacoModule) => {
  //       monacoModule.editor.setTheme(isDarkMode ? 'crystal-dark' : 'crystal-light');
  //     });
  //   }
  // }, [isDarkMode, isEditorReady]);

  // Calculate preview height when content or view mode changes
  useEffect(() => {
    if (!isMarkdownFile || viewMode === 'diff') return;

    const calculatePreviewHeight = () => {
      if (previewRef.current) {
        // Get the actual height of the preview content
        const contentHeight = previewRef.current.scrollHeight;
        // Add some padding
        const calculatedHeight = Math.max(600, contentHeight + 50);
        setPreviewHeight(calculatedHeight);
      }
    };

    // Calculate height after a delay to ensure content is rendered
    const timer = setTimeout(calculatePreviewHeight, 300);

    // Also recalculate when window resizes
    const handleResize = debounce(calculatePreviewHeight, 250);
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [currentContent, viewMode, isMarkdownFile]);

  // Also flush pending saves when switching sessions
  useEffect(() => {
    const handleSessionSwitch = () => {
      if (debouncedSaveRef.current?.flush) {
        debouncedSaveRef.current.flush(); // Save before switching sessions
      }
    };
    
    window.addEventListener('session-switched', handleSessionSwitch);
    return () => {
      window.removeEventListener('session-switched', handleSessionSwitch);
    };
  }, []); // Empty deps - only create once
  
  // Cleanup on unmount or when key props change
  useEffect(() => {
    return () => {
      // Flush any pending saves before unmount
      debouncedSaveRef.current?.flush();
      
      // Clear timeout
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
      
      // Dispose of the editor to prevent memory leaks and errors
      if (editorRef.current) {
        try {
          // Dispose event handlers first
          const editor = editorRef.current as MonacoDiffEditor & { __disposables?: IDisposable[] };
          if (editor.__disposables) {
            editor.__disposables.forEach((d: IDisposable) => {
              try {
                d.dispose();
              } catch (error) {
                console.debug('Error disposing event handler:', error);
              }
            });
            editor.__disposables = [];
          }
          
          // Get both editors to ensure proper cleanup
          const originalEditor = editorRef.current.getOriginalEditor();
          const modifiedEditor = editorRef.current.getModifiedEditor();
          
          // Clear models before disposing to prevent the TextModel disposal error
          if (originalEditor && originalEditor.getModel()) {
            originalEditor.setModel(null);
          }
          if (modifiedEditor && modifiedEditor.getModel()) {
            modifiedEditor.setModel(null);
          }
          
          // Then dispose of the diff editor
          editorRef.current.dispose();
          editorRef.current = null;
        } catch (error) {
          console.debug('Error during Monaco editor cleanup:', error);
        }
      }
    };
  }, [file.path]); // Only cleanup when file path changes

  const options = {
    readOnly: isReadOnly,
    renderSideBySide: viewType === 'split',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineNumbers: 'on' as const,
    renderWhitespace: 'selection' as const,
    automaticLayout: true,
    scrollbar: {
      vertical: 'hidden' as const,
      horizontal: 'hidden' as const,
      handleMouseWheel: false,
      alwaysConsumeMouseWheel: false,
    },
  };

  const getSaveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving':
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'saved':
        return <Check className="w-3 h-3" />;
      case 'error':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getSaveStatusText = () => {
    switch (saveStatus) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return 'Saved';
      case 'error':
        return saveError || 'Error';
      case 'pending':
        return 'Auto-save pending...';
      default:
        return '';
    }
  };

  const getSaveStatusColor = () => {
    switch (saveStatus) {
      case 'saving':
      case 'pending':
        return 'text-status-warning';
      case 'saved':
        return 'text-status-success';
      case 'error':
        return 'text-status-error';
      default:
        return 'text-text-tertiary';
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-b border-border-primary">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-text-tertiary" />
          <span className="text-sm font-medium text-text-primary">
            {file.path}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Preview Toggle for Markdown Files */}
          {isMarkdownFile && (
            <div className="flex items-center rounded-lg border border-border-primary bg-surface-primary">
              <button
                onClick={() => setViewMode('diff')}
                className={`px-2 py-1 text-xs font-medium rounded-l-lg transition-colors flex items-center gap-1 ${
                  viewMode === 'diff'
                    ? 'bg-interactive text-white'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
                title="Show diff view"
              >
                <Code className="w-3 h-3" />
                Diff
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-2 py-1 text-xs font-medium transition-colors flex items-center gap-1 ${
                  viewMode === 'split'
                    ? 'bg-interactive text-white'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
                title="Show split view"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Split
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-2 py-1 text-xs font-medium rounded-r-lg transition-colors flex items-center gap-1 ${
                  viewMode === 'preview'
                    ? 'bg-interactive text-white'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
                title="Show markdown preview"
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
            </div>
          )}
          
          {/* Save Status or Read-only indicator */}
          {isReadOnly ? (
            <div className="flex items-center gap-1 text-xs text-text-tertiary">
              <AlertCircle className="w-3 h-3" />
              <span>Read-only (select all commits to edit)</span>
            </div>
          ) : saveStatus !== 'idle' && (
            <div className={`flex items-center gap-1 text-xs ${getSaveStatusColor()}`}>
              {getSaveStatusIcon()}
              <span>{getSaveStatusText()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Editor or Preview */}
      {viewMode === 'preview' && isMarkdownFile ? (
        <div ref={previewRef} className="relative overflow-auto" style={{ height: `${previewHeight}px` }}>
          <MarkdownPreview
            content={currentContent}
            className="h-full"
            id={`diff-preview-${sessionId}-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
          />
        </div>
      ) : viewMode === 'split' && isMarkdownFile ? (
        <div className="flex" style={{ height: `${Math.max(editorHeight, previewHeight)}px` }}>
          {/* Diff Editor */}
          <div className="w-1/2 border-r border-border-primary" ref={containerRef} style={{ overflow: 'hidden' }}>
            {(!isEditorReady || !canMountEditor) && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-primary z-10">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Loading editor...</span>
                </div>
              </div>
            )}
            {file.path && canMountEditor && (
              <MonacoErrorBoundary onReset={() => setIsEditorReady(false)}>
                <DiffEditor
                  height={editorHeight}
                  language={getLanguage(file.path)}
                  original={file.oldValue || ''}
                  modified={currentContent}
                  theme={isDarkMode ? 'vs-dark' : 'vs'}
                  options={options}
                  onMount={handleEditorDidMount}
                />
              </MonacoErrorBoundary>
            )}
          </div>
          {/* Preview */}
          <div ref={previewRef} className="w-1/2 overflow-auto">
            <MarkdownPreview
              content={currentContent}
              className="h-full"
              id={`diff-split-preview-${sessionId}-${file.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
            />
          </div>
        </div>
      ) : (
        <div className="relative" ref={containerRef} style={{ height: `${editorHeight}px`, overflow: 'hidden' }}>
          {(!isEditorReady || !canMountEditor) && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-primary z-10">
              <div className="flex items-center gap-2 text-text-secondary">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading editor...</span>
              </div>
            </div>
          )}
          {file.path && canMountEditor && (
            <MonacoErrorBoundary onReset={() => setIsEditorReady(false)}>
              <DiffEditor
                height={editorHeight}
                language={getLanguage(file.path)}
                original={file.oldValue || ''}
                modified={currentContent}
                theme={isDarkMode ? 'vs-dark' : 'vs'}
                options={options}
                beforeMount={handleBeforeMount}
                onMount={handleEditorDidMount}
              />
            </MonacoErrorBoundary>
          )}
        </div>
      )}
    </div>
  );
};
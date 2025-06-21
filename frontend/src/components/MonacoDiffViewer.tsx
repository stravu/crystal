import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { DiffEditor, type DiffEditorProps, type MonacoDiffEditor } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { AlertCircle, FileText, Check, Loader2 } from 'lucide-react';
import type { FileDiff } from '../types/diff';
import { debounce } from '../utils/debounce';

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
    console.log('Saving file:', { file, sessionId, path: file.path });

    if (!file.path) {
      setSaveError('File path is missing');
      setSaveStatus('error');
      console.error('File path is undefined:', file);
      return;
    }

    setSaveStatus('saving');
    setSaveError(null);

    try {
      const result = await window.electronAPI.invoke('file:write', {
        sessionId,
        filePath: file.path,
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
  }, [sessionId, file, onSave]);

  // Create debounced save function
  const debouncedSave = useMemo(
    () => debounce(performSave, 1000),
    [performSave]
  );

  const handleEditorDidMount: DiffEditorProps['onMount'] = useCallback((editor: MonacoDiffEditor) => {
    editorRef.current = editor;
    
    // Get the modified editor (right side)
    const modifiedEditor = editor.getModifiedEditor();
    
    // Track changes and auto-save (only if not read-only)
    if (!isReadOnly) {
      modifiedEditor.onDidChangeModelContent(() => {
        const newContent = modifiedEditor.getValue();
        setCurrentContent(newContent);
        
        // Skip auto-save if this is a programmatic update (e.g., from switching commits)
        if (isProgrammaticUpdateRef.current) {
          console.log('Skipping auto-save: programmatic update detected');
          return;
        }
        
        // Show pending status immediately
        if (newContent !== file.newValue) {
          setSaveStatus('pending');
          setSaveError(null);
          // Trigger debounced save
          debouncedSave(newContent);
        }
      });

      // Add save keyboard shortcut for immediate save
      modifiedEditor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          const content = modifiedEditor.getValue();
          // Cancel any pending debounced save
          debouncedSave.cancel?.();
          performSave(content);
        }
      );
    }
  }, [isReadOnly, debouncedSave, performSave, file.newValue]);

  // Refresh content when file changes
  useEffect(() => {
    // Set flag to prevent auto-save during programmatic update
    isProgrammaticUpdateRef.current = true;
    
    setCurrentContent(file.newValue || '');
    setSaveStatus('idle');
    setSaveError(null);
    
    // Update the editor content if it exists
    if (editorRef.current) {
      const modifiedEditor = editorRef.current.getModifiedEditor();
      const currentValue = modifiedEditor.getValue();
      
      // Only update if content is different
      if (currentValue !== (file.newValue || '')) {
        modifiedEditor.setValue(file.newValue || '');
      }
    }
    
    // Reset flag after a small delay to ensure the change event has fired
    setTimeout(() => {
      isProgrammaticUpdateRef.current = false;
    }, 100);
  }, [file.path, file.newValue]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  const options: monaco.editor.IStandaloneDiffEditorConstructionOptions = {
    readOnly: isReadOnly,
    renderSideBySide: viewType === 'split',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    automaticLayout: true,
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      useShadows: false,
      verticalScrollbarSize: 10,
      horizontalScrollbarSize: 10,
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
        return 'text-yellow-600 dark:text-yellow-400';
      case 'saved':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {file.path}
          </span>
        </div>
        
        {/* Save Status or Read-only indicator */}
        {isReadOnly ? (
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
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

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <DiffEditor
          height="100%"
          language={getLanguage(file.path)}
          original={file.oldValue || ''}
          modified={currentContent}
          theme={isDarkMode ? 'vs-dark' : 'vs'}
          options={options}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
};
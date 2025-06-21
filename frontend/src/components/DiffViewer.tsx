import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { MonacoDiffViewer } from './MonacoDiffViewer';
import { FileText, ChevronRight, ChevronDown } from 'lucide-react';
import type { DiffViewerProps } from '../types/diff';
import type { FileDiff } from '../types/diff';

// Parse unified diff format to extract individual file diffs
const parseUnifiedDiff = (diff: string): FileDiff[] => {
  const files: FileDiff[] = [];
  
  if (!diff || diff.trim().length === 0) {
    console.log('parseUnifiedDiff: Empty diff input');
    return files;
  }
  
  console.log('parseUnifiedDiff: Parsing diff of length:', diff.length);
  
  const fileMatches = diff.match(/diff --git[\s\S]*?(?=diff --git|$)/g);
  
  if (!fileMatches) {
    console.warn('parseUnifiedDiff: No file matches found in diff');
    return files;
  }
  
  console.log('parseUnifiedDiff: Found', fileMatches.length, 'file(s) in diff');
  
  for (const fileContent of fileMatches) {
    // Try multiple patterns to extract file names
    let fileNameMatch = fileContent.match(/diff --git a\/(.*?) b\/(.*?)(?:\n|$)/);
    
    // If the first pattern fails, try without the newline
    if (!fileNameMatch) {
      fileNameMatch = fileContent.match(/diff --git a\/(.*?) b\/(.*)/);
    }
    
    if (!fileNameMatch) {
      console.warn('Could not parse file names from diff:', fileContent.substring(0, 100));
      continue;
    }
    
    const oldFileName = fileNameMatch[1] || '';
    const newFileName = fileNameMatch[2] || '';
    
    const isBinary = fileContent.includes('Binary files') || fileContent.includes('GIT binary patch');
    
    let type: 'added' | 'deleted' | 'modified' | 'renamed' = 'modified';
    if (fileContent.includes('new file mode')) {
      type = 'added';
    } else if (fileContent.includes('deleted file mode')) {
      type = 'deleted';
    } else if (fileContent.includes('rename from') && fileContent.includes('rename to')) {
      type = 'renamed';
    }
    
    if (isBinary) {
      files.push({
        path: newFileName || '',
        oldPath: oldFileName || '',
        oldValue: '',
        newValue: '',
        type,
        isBinary: true,
        additions: 0,
        deletions: 0,
      });
      continue;
    }
    
    const lines = fileContent.split('\n');
    const diffStartIndex = lines.findIndex(line => line.startsWith('@@'));
    
    if (diffStartIndex === -1) {
      files.push({
        path: newFileName || '',
        oldPath: oldFileName || '',
        oldValue: '',
        newValue: '',
        type,
        isBinary: false,
        additions: 0,
        deletions: 0,
      });
      continue;
    }
    
    const oldLines: string[] = [];
    const newLines: string[] = [];
    let additions = 0;
    let deletions = 0;
    
    for (let i = diffStartIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('@@')) {
        continue;
      } else if (line.startsWith('-')) {
        oldLines.push(line.substring(1));
        deletions++;
      } else if (line.startsWith('+')) {
        newLines.push(line.substring(1));
        additions++;
      } else if (line.startsWith(' ')) {
        oldLines.push(line.substring(1));
        newLines.push(line.substring(1));
      } else if (line.startsWith('\\')) {
        continue;
      } else if (line === '') {
        oldLines.push('');
        newLines.push('');
      }
    }
    
    const fileDiff: FileDiff = {
      path: newFileName || '',
      oldPath: oldFileName || '',
      oldValue: type === 'added' ? '' : oldLines.join('\n'),
      newValue: type === 'deleted' ? '' : newLines.join('\n'),
      type,
      isBinary: false,
      additions,
      deletions,
    };
    
    if (!fileDiff.path) {
      console.error('parseUnifiedDiff: File path is empty for diff:', fileContent.substring(0, 100));
    }
    
    files.push(fileDiff);
  }
  
  console.log('parseUnifiedDiff: Parsed', files.length, 'files');
  return files;
};

const DiffViewer: React.FC<DiffViewerProps> = memo(({ diff, sessionId, className = '', onFileSave, isAllCommitsSelected = true }) => {
  const [viewType, setViewType] = useState<'split' | 'inline'>('split');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    const savedViewType = localStorage.getItem('diffViewType');
    if (savedViewType === 'split' || savedViewType === 'inline') {
      setViewType(savedViewType);
    }
  }, []);

  const handleViewTypeChange = (type: 'split' | 'inline') => {
    setViewType(type);
    localStorage.setItem('diffViewType', type);
  };

  const files = useMemo(() => {
    try {
      return parseUnifiedDiff(diff || '');
    } catch (error) {
      console.error('Error parsing diff:', error);
      return [];
    }
  }, [diff]);

  useEffect(() => {
    if (files.length > 0 && files.length <= 3) {
      setExpandedFiles(new Set(files.map((f, i) => `${f.path}-${i}`)));
    }
  }, [files]);

  const toggleFile = (fileKey: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileKey)) {
        newSet.delete(fileKey);
      } else {
        newSet.add(fileKey);
      }
      return newSet;
    });
  };

  const handleFileSave = useCallback((filePath: string) => {
    if (onFileSave) {
      onFileSave(filePath);
    }
  }, [onFileSave]);

  if (!diff || diff.trim() === '' || files.length === 0) {
    return (
      <div className={`p-4 text-gray-500 dark:text-gray-400 text-center ${className}`}>
        No changes to display
      </div>
    );
  }

  const isDarkMode = document.documentElement.classList.contains('dark');

  return (
    <div className={`diff-viewer ${className}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-2 flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {files.length} {files.length === 1 ? 'file' : 'files'} changed
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Split/Unified Toggle */}
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
              <button
                onClick={() => handleViewTypeChange('inline')}
                className={`px-3 py-1 text-sm font-medium rounded-l-lg transition-colors ${
                  viewType === 'inline'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                Unified
              </button>
              <button
                onClick={() => handleViewTypeChange('split')}
                className={`px-3 py-1 text-sm font-medium rounded-r-lg transition-colors ${
                  viewType === 'split'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                Split
              </button>
            </div>
          </div>
        </div>
        
        {/* File List */}
        <div className="flex-1 overflow-auto">
          {files.map((file, index) => {
            // Skip files with invalid paths
            if (!file.path) {
              console.error('File with undefined path found:', file);
              return null;
            }
            
            const fileKey = `${file.path}-${index}`;
            const isExpanded = expandedFiles.has(fileKey);
            const isModified = false; // Modification tracking moved to parent component
            
            if (file.isBinary || (!file.oldValue && !file.newValue && file.type !== 'added' && file.type !== 'deleted')) {
              return (
                <div key={fileKey} className="border-b border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {file.path}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {file.isBinary ? 'Binary file' : file.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <div key={fileKey} className="border-b border-gray-200 dark:border-gray-700">
                {/* File header */}
                <div 
                  className="px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  onClick={() => toggleFile(fileKey)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <FileText className="w-4 h-4" />
                      {file.path}
                      {isModified && (
                        <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded">Modified</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      {file.additions > 0 && <span className="text-green-600">+{file.additions}</span>}
                      {file.deletions > 0 && <span className="text-red-600">-{file.deletions}</span>}
                    </span>
                  </div>
                </div>

                {/* Diff content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700" style={{ height: '600px' }}>
                    <MonacoDiffViewer
                      file={file}
                      sessionId={sessionId || ''}
                      isDarkMode={isDarkMode}
                      viewType={viewType}
                      onSave={() => handleFileSave(file.path)}
                      isReadOnly={!isAllCommitsSelected}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
});

DiffViewer.displayName = 'DiffViewer';

export default DiffViewer;
import { useState, useEffect, useMemo, memo, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { MonacoDiffViewer } from './MonacoDiffViewer';
import { FileText, ChevronRight, ChevronDown } from 'lucide-react';
import type { DiffViewerProps } from '../types/diff';
import type { FileDiff } from '../types/diff';
import { useTheme } from '../contexts/ThemeContext';

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

export interface DiffViewerHandle {
  scrollToFile: (index: number) => void;
}

const DiffViewer = memo(forwardRef<DiffViewerHandle, DiffViewerProps>(({ diff, sessionId, className = '', onFileSave, isAllCommitsSelected = true, mainBranch = 'main' }, ref) => {
  const { theme } = useTheme();
  const [viewType, setViewType] = useState<'split' | 'inline'>('split');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [filesWithFullContent, setFilesWithFullContent] = useState<FileDiff[]>([]);
  const [loadingFullContent, setLoadingFullContent] = useState(false);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Load full file contents when in edit mode
  useEffect(() => {
    const loadFullFileContents = async () => {
      if (!isAllCommitsSelected || !sessionId || files.length === 0) {
        setFilesWithFullContent(files);
        return;
      }

      setLoadingFullContent(true);
      setLoadErrors({}); // Clear previous errors
      console.log('Loading full file contents for editing...');

      try {
        const errors: Record<string, string> = {};
        const updatedFiles = await Promise.all(
          files.map(async (file) => {
            // Skip binary files, deleted files, or files that already seem to have full content
            if (file.isBinary || file.type === 'deleted' || !file.path) {
              return file;
            }

            try {
              // Load the full current file content
              const result = await window.electronAPI.invoke('file:read', {
                sessionId,
                filePath: file.path
              });

              if (result.success && result.content !== undefined) {
                console.log(`Loaded full content for ${file.path}: ${result.content.length} characters`);
                
                // For added files, oldValue should remain empty
                if (file.type === 'added') {
                  return {
                    ...file,
                    newValue: result.content,
                    originalDiffNewValue: file.newValue
                  };
                }
                
                // For modified files, get the file content at the base revision for comparison
                // When all commits are selected, compare against the main branch
                // Otherwise, compare against HEAD
                const baseRevision = isAllCommitsSelected ? mainBranch : 'HEAD';
                
                try {
                  const headResult = await window.electronAPI.invoke('file:readAtRevision', {
                    sessionId,
                    filePath: file.path,
                    revision: baseRevision
                  });
                  
                  if (headResult.success && headResult.content !== undefined) {
                    console.log(`Loaded ${baseRevision} content for ${file.path}: ${headResult.content.length} characters`);
                    return {
                      ...file,
                      oldValue: headResult.content,  // File content at base revision
                      newValue: result.content,       // Current working directory content
                      originalDiffNewValue: file.newValue,
                      originalDiffOldValue: file.oldValue
                    };
                  } else {
                    // File might not exist in the base revision (e.g., new file)
                    console.warn(`Failed to load ${baseRevision} content for ${file.path}, file may not exist in ${baseRevision}`);
                    return {
                      ...file,
                      oldValue: '',  // File doesn't exist in base revision
                      newValue: result.content,       // Current working directory content
                      originalDiffNewValue: file.newValue,
                      originalDiffOldValue: file.oldValue
                    };
                  }
                } catch (headError) {
                  console.error(`Error loading ${baseRevision} content for ${file.path}:`, headError);
                  // File likely doesn't exist in base revision
                  return {
                    ...file,
                    oldValue: '',  // File doesn't exist in base revision
                    newValue: result.content,       // Current working directory content
                    originalDiffNewValue: file.newValue,
                    originalDiffOldValue: file.oldValue
                  };
                }
              } else {
                console.warn(`Failed to load full content for ${file.path}:`, result.error);
                // Check if file was deleted (ENOENT error)
                if (result.error && result.error.includes('ENOENT')) {
                  // File was deleted, mark it as deleted type
                  return {
                    ...file,
                    type: 'deleted' as const,
                    oldValue: file.oldValue || '',
                    newValue: ''
                  };
                }
                errors[file.path] = result.error || 'Failed to load file content';
                return file;
              }
            } catch (error) {
              console.error(`Error loading file ${file.path}:`, error);
              errors[file.path] = error instanceof Error ? error.message : 'Failed to load file content';
              return file;
            }
          })
        );

        setFilesWithFullContent(updatedFiles);
        setLoadErrors(errors);
      } catch (error) {
        console.error('Error loading full file contents:', error);
        setFilesWithFullContent(files);
      } finally {
        setLoadingFullContent(false);
      }
    };

    loadFullFileContents();
  }, [files, isAllCommitsSelected, sessionId, mainBranch]);

  useEffect(() => {
    // Expand all files by default
    if (files.length > 0) {
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

  // Expose scroll function to parent
  useImperativeHandle(ref, () => ({
    scrollToFile: (index: number) => {
      const fileElement = document.getElementById(`file-${index}`);
      if (fileElement && scrollContainerRef.current) {
        // First expand the file if it's collapsed
        const fileKey = `${files[index]?.path}-${index}`;
        if (fileKey && !expandedFiles.has(fileKey)) {
          setExpandedFiles(prev => new Set([...prev, fileKey]));
        }
        
        // Then scroll to it with a small delay to allow expansion animation
        setTimeout(() => {
          fileElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 3);
      }
    }
  }), [files, expandedFiles]);

  if (!diff || diff.trim() === '' || files.length === 0) {
    return (
      <div className={`p-4 text-text-secondary text-center ${className}`}>
        No changes to display
      </div>
    );
  }

  const isDarkMode = theme === 'dark';
  
  // Show loading state while fetching full content
  if (loadingFullContent && isAllCommitsSelected) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-text-secondary">Loading file contents for editing...</div>
      </div>
    );
  }

  // Use files with full content when available
  const filesToRender = filesWithFullContent.length > 0 ? filesWithFullContent : files;

  return (
    <div className={`diff-viewer ${className}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-2 flex-shrink-0 bg-surface-secondary border-b border-border-primary">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-text-secondary">
              {filesToRender.length} {filesToRender.length === 1 ? 'file' : 'files'} changed
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Split/Unified Toggle */}
            <div className="inline-flex rounded-lg border border-border-primary bg-surface-primary">
              <button
                onClick={() => handleViewTypeChange('inline')}
                className={`px-3 py-1 text-sm font-medium rounded-l-lg transition-colors ${
                  viewType === 'inline'
                    ? 'bg-interactive text-white'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
              >
                Unified
              </button>
              <button
                onClick={() => handleViewTypeChange('split')}
                className={`px-3 py-1 text-sm font-medium rounded-r-lg transition-colors ${
                  viewType === 'split'
                    ? 'bg-interactive text-white'
                    : 'text-text-secondary hover:bg-surface-hover'
                }`}
              >
                Split
              </button>
            </div>
          </div>
        </div>
        
        {/* File List */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto">
          {filesToRender.map((file, index) => {
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
                <div key={fileKey} className="border-b border-border-primary">
                  <div className="px-4 py-3 bg-surface-secondary">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text-primary flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        {file.path}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {file.isBinary ? 'Binary file' : file.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            
            return (
              <div 
                key={fileKey} 
                id={`file-${index}`}
                data-file-path={file.path}
                className="border-b border-border-primary"
              >
                {/* File header */}
                <div 
                  className="px-4 py-3 bg-surface-secondary hover:bg-surface-hover cursor-pointer transition-colors"
                  onClick={() => toggleFile(fileKey)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <FileText className="w-4 h-4" />
                      {file.path}
                      {isModified && (
                        <span className="text-xs bg-status-warning text-white px-2 py-0.5 rounded">Modified</span>
                      )}
                      {file.type === 'deleted' && (
                        <span className="text-xs bg-status-error text-white px-2 py-0.5 rounded">Deleted</span>
                      )}
                    </span>
                    <span className="text-xs text-text-tertiary flex items-center gap-2">
                      {file.additions > 0 && <span className="text-status-success">+{file.additions}</span>}
                      {file.deletions > 0 && <span className="text-status-error">-{file.deletions}</span>}
                    </span>
                  </div>
                </div>

                {/* Diff content */}
                {isExpanded && (
                  <div className="border-t border-border-primary">
                    {file.type === 'deleted' ? (
                      <div className="p-4 bg-surface-secondary text-text-secondary">
                        <p className="text-sm">This file has been deleted from the filesystem.</p>
                      </div>
                    ) : (
                      <>
                        {loadErrors[file.path] && isAllCommitsSelected ? (
                          <div className="p-4 bg-status-error/10 border-b border-status-error/30">
                            <div className="flex items-center gap-2 text-status-error">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">Failed to load full file content</span>
                            </div>
                            <p className="mt-1 text-sm text-status-error/80">
                              {loadErrors[file.path]}
                            </p>
                            <p className="mt-2 text-sm text-status-error/80">
                              ⚠️ Auto-save is disabled for this file to prevent data loss. Only the diff is shown below.
                            </p>
                          </div>
                        ) : null}
                        <MonacoDiffViewer
                          key={`${file.path}-${index}`}
                          file={file}
                          sessionId={sessionId || ''}
                          isDarkMode={isDarkMode}
                          viewType={viewType}
                          onSave={() => handleFileSave(file.path)}
                          isReadOnly={!isAllCommitsSelected || !!loadErrors[file.path]}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}));

DiffViewer.displayName = 'DiffViewer';

export default DiffViewer;
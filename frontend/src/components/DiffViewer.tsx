import React, { useState, useEffect } from 'react';
import { parseDiff, Diff, Hunk } from 'react-diff-view';
import type { DiffViewerProps } from '../types/diff';

const DiffViewer: React.FC<DiffViewerProps> = ({ diff, className = '' }) => {
  const [viewType, setViewType] = useState<'unified' | 'split'>('unified');
  
  // Load saved preference from localStorage
  useEffect(() => {
    const savedViewType = localStorage.getItem('diffViewType');
    if (savedViewType === 'split' || savedViewType === 'unified') {
      setViewType(savedViewType);
    }
  }, []);
  
  // Save preference when it changes
  const handleViewTypeChange = (type: 'unified' | 'split') => {
    setViewType(type);
    localStorage.setItem('diffViewType', type);
  };
  if (!diff || diff.trim() === '') {
    return (
      <div className={`p-4 text-gray-500 text-center ${className}`}>
        No changes to display
      </div>
    );
  }

  try {
    // Parse the git diff
    const files = parseDiff(diff);

    if (files.length === 0) {
      return (
        <div className={`p-4 text-gray-500 text-center ${className}`}>
          No changes to display
        </div>
      );
    }

    return (
      <div className={`diff-viewer ${className}`}>
        {/* View toggle */}
        <div className="flex justify-end mb-4">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white">
            <button
              onClick={() => handleViewTypeChange('unified')}
              className={`px-3 py-1 text-sm font-medium rounded-l-lg transition-colors ${
                viewType === 'unified'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Unified
            </button>
            <button
              onClick={() => handleViewTypeChange('split')}
              className={`px-3 py-1 text-sm font-medium rounded-r-lg transition-colors ${
                viewType === 'split'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Side-by-side
            </button>
          </div>
        </div>
        
        {files.map((file, index) => (
          <div key={`${file.oldPath}-${file.newPath}-${index}`} className="mb-6">
            {/* File header */}
            <div className="bg-gray-100 border border-gray-300 rounded-t-lg px-4 py-2 font-mono text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">
                  {file.type === 'delete' && (
                    <span className="text-red-600 mr-2">−</span>
                  )}
                  {file.type === 'add' && (
                    <span className="text-green-600 mr-2">+</span>
                  )}
                  {file.type === 'modify' && (
                    <span className="text-blue-600 mr-2">~</span>
                  )}
                  {file.newPath || file.oldPath}
                </span>
                <span className="text-xs text-gray-500">
                  {file.type === 'delete' && 'deleted'}
                  {file.type === 'add' && 'added'}
                  {file.type === 'modify' && 'modified'}
                  {file.type === 'rename' && 'renamed'}
                </span>
              </div>
              {file.type === 'rename' && file.oldPath !== file.newPath && (
                <div className="text-xs text-gray-600 mt-1">
                  {file.oldPath} → {file.newPath}
                </div>
              )}
            </div>

            {/* Diff content */}
            <div className="border border-t-0 border-gray-300 rounded-b-lg overflow-x-hidden">
              <Diff 
                viewType={viewType} 
                diffType={file.type} 
                hunks={file.hunks}
                className="diff-content"
              >
                {(hunks) =>
                  hunks.map((hunk) => (
                    <Hunk 
                      key={hunk.content} 
                      hunk={hunk}
                    />
                  ))
                }
              </Diff>
            </div>
          </div>
        ))}

        <style dangerouslySetInnerHTML={{__html: `
          .diff-viewer .diff-content {
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
          }

          .diff-viewer .diff-line {
            padding: 2px 8px;
            white-space: pre-wrap;
            word-break: break-all;
            border: none;
          }

          .diff-viewer .diff-line-normal {
            background-color: white;
            color: #333;
          }

          .diff-viewer .diff-line-insert {
            background-color: #e6ffed;
            color: #22863a;
          }

          .diff-viewer .diff-line-delete {
            background-color: #ffeef0;
            color: #cb2431;
          }

          .diff-viewer .diff-line-number {
            padding: 2px 8px;
            color: #586069;
            background-color: #f6f8fa;
            border-right: 1px solid #e1e4e8;
            text-align: right;
            min-width: 40px;
            user-select: none;
          }

          .diff-viewer .diff-gutter {
            width: 80px;
            background-color: #f6f8fa;
          }

          .diff-viewer .diff-gutter-insert {
            background-color: #cdffd8;
          }

          .diff-viewer .diff-gutter-delete {
            background-color: #ffdce0;
          }
          
          /* Split view styles */
          .diff-viewer .diff-split-table {
            width: 100%;
            table-layout: auto;
            min-width: 800px;
          }
          
          .diff-viewer .diff-split-cell {
            width: 50%;
            vertical-align: top;
            min-width: 400px;
          }
          
          .diff-viewer .diff-split-gutter {
            width: 40px;
          }
          
          .diff-viewer .diff-code-cell {
            overflow-x: visible;
            word-break: break-all;
          }
          
          .diff-viewer .diff-line-content {
            white-space: pre-wrap;
            word-break: break-all;
          }

          .diff-viewer .hunk-header {
            background-color: #f1f8ff;
            color: #586069;
            padding: 4px 8px;
            border-top: 1px solid #e1e4e8;
            border-bottom: 1px solid #e1e4e8;
            font-weight: 600;
          }

          .diff-viewer .diff-omit {
            background-color: #f6f8fa;
            color: #586069;
            text-align: center;
            padding: 8px;
            border-top: 1px solid #e1e4e8;
            border-bottom: 1px solid #e1e4e8;
          }
        `}} />
      </div>
    );
  } catch (error) {
    console.error('Error parsing diff:', error);
    return (
      <div className={`p-4 text-red-500 bg-red-50 border border-red-200 rounded ${className}`}>
        <h3 className="font-medium mb-2">Error parsing diff</h3>
        <pre className="text-sm font-mono bg-white p-2 rounded border">
          {diff}
        </pre>
      </div>
    );
  }
};

export default DiffViewer;
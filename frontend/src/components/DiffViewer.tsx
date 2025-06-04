import React from 'react';
import { parseDiff, Diff, Hunk } from 'react-diff-view';
import type { DiffViewerProps } from '../types/diff';

const DiffViewer: React.FC<DiffViewerProps> = ({ diff, className = '' }) => {
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
            <div className="border border-t-0 border-gray-300 rounded-b-lg overflow-hidden">
              <Diff 
                viewType="unified" 
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
            white-space: pre;
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
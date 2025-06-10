import React, { useState, useEffect } from 'react';
import { Check, X, Shield, AlertTriangle, Code, Edit } from 'lucide-react';

interface PermissionRequest {
  id: string;
  sessionId: string;
  toolName: string;
  input: any;
  timestamp: number;
}

interface PermissionDialogProps {
  request: PermissionRequest | null;
  onRespond: (requestId: string, behavior: 'allow' | 'deny', updatedInput?: any, message?: string) => void;
  session?: { name: string };
}

export const PermissionDialog: React.FC<PermissionDialogProps> = ({ request, onRespond, session }) => {
  const [editMode, setEditMode] = useState(false);
  const [editedInput, setEditedInput] = useState('');

  useEffect(() => {
    if (request) {
      setEditedInput(JSON.stringify(request.input, null, 2));
      setEditMode(false);
    }
  }, [request]);

  if (!request) return null;

  const handleAllow = () => {
    let updatedInput = request.input;
    if (editMode) {
      try {
        updatedInput = JSON.parse(editedInput);
      } catch (error) {
        // If JSON parse fails, keep original input
        console.error('Invalid JSON in edited input:', error);
      }
    }
    onRespond(request.id, 'allow', updatedInput);
  };

  const handleDeny = () => {
    onRespond(request.id, 'deny', undefined, 'Permission denied by user');
  };

  const formatToolName = (toolName: string) => {
    // Remove mcp prefix if present
    if (toolName.startsWith('mcp__')) {
      return toolName.substring(5).replace(/__/g, ' → ');
    }
    return toolName;
  };

  const getToolDescription = (toolName: string) => {
    const descriptions: Record<string, string> = {
      'Bash': 'Execute shell commands',
      'Write': 'Write files to disk',
      'Edit': 'Modify existing files',
      'MultiEdit': 'Make multiple edits to a file',
      'Delete': 'Delete files or directories',
      'Move': 'Move or rename files',
      'Read': 'Read file contents',
      'Grep': 'Search file contents',
      'WebFetch': 'Fetch content from the web',
      'WebSearch': 'Search the web',
    };
    
    for (const [key, desc] of Object.entries(descriptions)) {
      if (toolName.includes(key)) {
        return desc;
      }
    }
    return 'Perform an action';
  };

  const isHighRisk = (toolName: string) => {
    const highRiskTools = ['Bash', 'Delete', 'Write', 'Edit', 'MultiEdit'];
    return highRiskTools.some(tool => toolName.includes(tool));
  };

  const renderInputPreview = () => {
    const { input, toolName } = request;
    
    if (toolName.includes('Bash')) {
      return (
        <div className="bg-gray-900 p-3 rounded font-mono text-sm">
          <div className="text-gray-400 text-xs mb-1">Command:</div>
          <div className="text-white">{input.command || 'No command specified'}</div>
          {input.description && (
            <>
              <div className="text-gray-400 text-xs mt-2 mb-1">Description:</div>
              <div className="text-gray-300">{input.description}</div>
            </>
          )}
        </div>
      );
    }
    
    if (toolName.includes('Write') || toolName.includes('Edit')) {
      return (
        <div className="bg-gray-900 p-3 rounded font-mono text-sm">
          <div className="text-gray-400 text-xs mb-1">File Path:</div>
          <div className="text-white">{input.file_path || input.path || 'No path specified'}</div>
          {input.content && (
            <>
              <div className="text-gray-400 text-xs mt-2 mb-1">Content Preview:</div>
              <div className="text-gray-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {input.content.length > 500 ? input.content.substring(0, 500) + '...' : input.content}
              </div>
            </>
          )}
        </div>
      );
    }
    
    // Default JSON view
    return (
      <div className="bg-gray-900 p-3 rounded font-mono text-sm">
        <pre className="text-white overflow-x-auto">{JSON.stringify(input, null, 2)}</pre>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Shield className={`w-6 h-6 ${isHighRisk(request.toolName) ? 'text-red-400' : 'text-yellow-400'}`} />
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">Permission Required</h2>
              <p className="text-sm text-gray-400 mt-1">
                Claude wants to {getToolDescription(request.toolName)} in session: {session?.name || request.sessionId}
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Code className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-300">Tool</h3>
              {isHighRisk(request.toolName) && (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">High Risk</span>
              )}
            </div>
            <p className="text-white font-mono">{formatToolName(request.toolName)}</p>
          </div>
          
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-300">Input Parameters</h3>
              <button
                onClick={() => setEditMode(!editMode)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <Edit className="w-3 h-3" />
                {editMode ? 'Preview' : 'Edit'}
              </button>
            </div>
            
            {editMode ? (
              <textarea
                value={editedInput}
                onChange={(e) => setEditedInput(e.target.value)}
                className="w-full h-48 bg-gray-900 text-white p-3 rounded font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                spellCheck={false}
              />
            ) : (
              renderInputPreview()
            )}
          </div>
          
          {isHighRisk(request.toolName) && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">High Risk Action</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                This action could modify your system or files. Review carefully before approving.
              </p>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleDeny}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Deny
          </button>
          <button
            onClick={handleAllow}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Allow
          </button>
        </div>
      </div>
    </div>
  );
};
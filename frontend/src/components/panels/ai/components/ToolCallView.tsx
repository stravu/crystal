import React from 'react';
import { Wrench, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolCall } from '../transformers/MessageTransformer';

interface ToolCallViewProps {
  tool: ToolCall;
  depth?: number;
  isExpanded: boolean;
  collapseTools: boolean;
  onToggleExpand: (toolId: string) => void;
}

export const ToolCallView: React.FC<ToolCallViewProps> = ({ 
  tool, 
  depth = 0, 
  isExpanded,
  collapseTools,
  onToggleExpand 
}) => {
  const isTaskAgent = tool.isSubAgent && tool.name === 'Task';
  const hasChildTools = tool.childToolCalls && tool.childToolCalls.length > 0;
  
  // Different styling for Task sub-agents
  const bgColor = isTaskAgent 
    ? 'bg-interactive/10' 
    : depth > 0 
      ? 'bg-surface-tertiary/30' 
      : 'bg-surface-tertiary/50';
  
  const borderColor = isTaskAgent
    ? 'border-interactive/30'
    : 'border-border-primary/50';
  
  return (
    <div className={`rounded-md ${bgColor} overflow-hidden border ${borderColor} ${depth > 0 ? 'ml-4' : ''}`}>
      <button
        onClick={() => onToggleExpand(tool.id)}
        className="w-full px-3 py-2 bg-surface-tertiary/30 flex items-center gap-2 hover:bg-surface-tertiary/50 transition-colors text-left"
      >
        {isTaskAgent ? (
          <svg className="w-3.5 h-3.5 text-interactive flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ) : (
          <Wrench className="w-3.5 h-3.5 text-interactive-on-dark flex-shrink-0" />
        )}
        <span className="font-mono text-xs text-text-primary flex-1">
          {isTaskAgent ? 'Sub-Agent' : tool.name}
          {isTaskAgent && tool.subAgentType && (
            <span className="ml-2 text-interactive font-semibold">
              [{tool.subAgentType}]
            </span>
          )}
        </span>
        {tool.status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-status-success flex-shrink-0" />}
        {tool.status === 'error' && <XCircle className="w-3.5 h-3.5 text-status-error flex-shrink-0" />}
        {tool.status === 'pending' && <Clock className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0 animate-pulse" />}
        {(collapseTools || hasChildTools) && (
          isExpanded ? <ChevronDown className="w-3 h-3 text-text-tertiary" /> : <ChevronRight className="w-3 h-3 text-text-tertiary" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-3 py-2 text-xs">
          {/* Tool Parameters */}
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div className="mb-2">
              <div className="text-text-tertiary mb-1">Parameters:</div>
              {formatToolInput(tool.name, tool.input)}
            </div>
          )}
          
          {/* Child tool calls for Task agents */}
          {hasChildTools && (
            <div className="mt-2">
              <div className="text-text-secondary text-xs font-semibold mb-2 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Sub-agent Actions:
              </div>
              <div className="space-y-2">
                {tool.childToolCalls!.map((childTool, idx) => (
                  <ToolCallView
                    key={`${tool.id}-child-${idx}`}
                    tool={childTool}
                    depth={depth + 1}
                    isExpanded={isExpanded}
                    collapseTools={collapseTools}
                    onToggleExpand={onToggleExpand}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Tool Result */}
          {tool.result && (
            <div className="mt-2">
              <div className="text-text-tertiary mb-1">
                {tool.result.isError ? 'Error:' : 'Result:'}
              </div>
              <div className={`${tool.result.isError ? 'text-status-error' : 'text-text-primary'}`}>
                {formatToolResult(tool.name, tool.result.content)}
              </div>
            </div>
          )}
          
          {/* Pending state */}
          {tool.status === 'pending' && !hasChildTools && (
            <div className="text-text-tertiary italic">Waiting for result...</div>
          )}
        </div>
      )}
    </div>
  );
};

// Format tool input for display
const formatToolInput = (toolName: string, input: any): React.ReactNode => {
  switch (toolName) {
    case 'Read':
      return (
        <div className="font-mono text-xs space-y-0.5">
          {input.file_path && (
            <div className="flex items-center gap-1">
              <span className="text-text-tertiary">File:</span>
              <span className="text-interactive-on-dark truncate">{input.file_path}</span>
            </div>
          )}
          {input.offset && <div className="text-text-tertiary">Lines: {input.offset}-{input.offset + (input.limit || 2000)}</div>}
        </div>
      );
    
    case 'Edit':
    case 'MultiEdit':
      return (
        <div className="font-mono text-sm space-y-1">
          {input.file_path && <div>File: <span className="text-interactive-on-dark">{input.file_path}</span></div>}
          {toolName === 'MultiEdit' && input.edits && (
            <div>{input.edits.length} changes</div>
          )}
        </div>
      );
    
    case 'Write':
      return (
        <div className="font-mono text-sm space-y-1">
          {input.file_path && <div>File: <span className="text-interactive-on-dark">{input.file_path}</span></div>}
          {input.content && (
            <div>{input.content.split('\n').length} lines</div>
          )}
        </div>
      );
    
    case 'Bash':
      return (
        <div className="font-mono text-sm bg-bg-tertiary px-2 py-1 rounded">
          <span className="text-status-success">$</span> {input.command}
        </div>
      );
    
    case 'Grep':
      return (
        <div className="font-mono text-sm space-y-1">
          <div>Pattern: <span className="text-status-warning">"{input.pattern}"</span></div>
          {input.path && <div>Path: {input.path}</div>}
          {input.glob && <div>Files: {input.glob}</div>}
        </div>
      );
    
    case 'Task':
      return (
        <div className="text-sm space-y-1.5">
          {input.description && (
            <div className="flex items-start gap-2">
              <span className="text-text-tertiary">Task:</span>
              <span className="text-interactive font-medium">{input.description}</span>
            </div>
          )}
          {input.subagent_type && (
            <div className="flex items-start gap-2">
              <span className="text-text-tertiary">Agent Type:</span>
              <span className="text-status-warning font-mono text-xs">{input.subagent_type}</span>
            </div>
          )}
          {input.prompt && (
            <details className="mt-1">
              <summary className="cursor-pointer text-text-secondary hover:text-text-primary text-xs">
                View Prompt
              </summary>
              <div className="mt-1 p-2 bg-surface-secondary rounded text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                {input.prompt}
              </div>
            </details>
          )}
        </div>
      );
    
    case 'TodoWrite':
      return (
        <div className="text-sm space-y-1">
          {input.todos && input.todos.map((todo: any, idx: number) => {
            const icon = todo.status === 'completed' ? '✓' : 
                        todo.status === 'in_progress' ? '→' : '○';
            const color = todo.status === 'completed' ? 'text-status-success' : 
                         todo.status === 'in_progress' ? 'text-status-warning' : 'text-text-tertiary';
            return (
              <div key={idx} className={`${color} truncate`}>
                {icon} {todo.content}
              </div>
            );
          })}
        </div>
      );
    
    default:
      // Compact display for unknown tools
      return (
        <pre className="text-xs overflow-x-auto max-h-20">
          {JSON.stringify(input, null, 2)}
        </pre>
      );
  }
};

// Format tool result for display
const formatToolResult = (toolName: string, result: string): React.ReactNode => {
  if (!result) {
    return <div className="text-sm text-text-tertiary italic">No result</div>;
  }
  
  try {
    // Check if result is JSON
    const parsed = JSON.parse(result);
    
    // Handle Task tool results (array with text objects)
    if (toolName === 'Task' && Array.isArray(parsed)) {
      // Extract text content from Task results
      const textContent = parsed
        .filter(item => item.type === 'text' && item.text)
        .map(item => item.text)
        .join('\n\n');
      
      if (textContent) {
        return (
          <div className="text-sm text-text-primary whitespace-pre-wrap max-h-64 overflow-y-auto">
            {textContent}
          </div>
        );
      }
    }
    
    // Handle image reads
    if (Array.isArray(parsed) && parsed[0]?.type === 'image') {
      return (
        <div className="text-sm text-text-secondary italic">
          [Image displayed to assistant]
        </div>
      );
    }
    
    // For other JSON results, pretty print compactly
    return (
      <pre className="text-xs overflow-x-auto max-h-32">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    // Not JSON, display as text
    if (result.length > 300) {
      return (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
            {result.substring(0, 100)}... (click to expand)
          </summary>
          <pre className="mt-2 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{result}</pre>
        </details>
      );
    }
    
    return <pre className="text-sm whitespace-pre-wrap">{result}</pre>;
  }
};
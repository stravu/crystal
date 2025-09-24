import React from 'react';
import { Wrench, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolCall } from '../transformers/MessageTransformer';
import { MarkdownPreview } from '../../../MarkdownPreview';

interface ToolCallViewProps {
  tool: ToolCall;
  depth?: number;
  isExpanded: boolean;
  collapseTools: boolean;
  onToggleExpand: (toolId: string) => void;
  expandedTools?: Set<string>;  // Add this to track expanded state for child tools
}

// Get a compact summary for the tool call
const getCompactToolSummary = (tool: ToolCall): string => {
  const input = tool.input;
  if (!input) return '';
  
  switch (tool.name) {
    case 'Read':
      if (input.file_path) {
        const filename = input.file_path.split('/').pop() || input.file_path;
        const lines = input.offset ? ` (lines ${input.offset}-${input.offset + (input.limit || 2000)})` : '';
        return filename + lines;
      }
      return '';
    
    case 'Edit':
    case 'MultiEdit':
      if (input.file_path) {
        const filename = input.file_path.split('/').pop() || input.file_path;
        const editsInfo = tool.name === 'MultiEdit' && input.edits ? ` (${input.edits.length} changes)` : '';
        return filename + editsInfo;
      }
      return '';
    
    case 'Write':
      if (input.file_path) {
        const filename = input.file_path.split('/').pop() || input.file_path;
        const lines = input.content ? ` (${input.content.split('\n').length} lines)` : '';
        return filename + lines;
      }
      return '';
    
    case 'Bash':
      if (input.command) {
        // Truncate long commands
        const cmd = input.command.length > 50 ? input.command.substring(0, 50) + '...' : input.command;
        return cmd;
      }
      return '';
    
    case 'Grep':
      if (input.pattern) {
        const pattern = input.pattern.length > 20 ? input.pattern.substring(0, 20) + '...' : input.pattern;
        const location = input.path ? ` in ${input.path.split('/').pop() || input.path}` : '';
        return `"${pattern}"${location}`;
      }
      return '';
    
    case 'Glob':
      if (input.pattern) {
        const location = input.path ? ` in ${input.path.split('/').pop() || input.path}` : '';
        return `${input.pattern}${location}`;
      }
      return '';
    
    case 'Task':
      if (input.description) {
        return input.description.length > 40 ? input.description.substring(0, 40) + '...' : input.description;
      }
      return input.subagent_type || '';
    
    case 'TodoWrite':
      if (input.todos && Array.isArray(input.todos)) {
        const total = input.todos.length;
        const completed = input.todos.filter((t: any) => t.status === 'completed').length;
        return `${completed}/${total} tasks`;
      }
      return '';
    
    case 'WebFetch':
      if (input.url) {
        try {
          const url = new URL(input.url);
          return url.hostname;
        } catch {
          return input.url.substring(0, 30) + '...';
        }
      }
      return '';
    
    case 'WebSearch':
      if (input.query) {
        return input.query.length > 30 ? input.query.substring(0, 30) + '...' : input.query;
      }
      return '';
    
    case 'LS':
      if (input.path) {
        return input.path.split('/').pop() || input.path;
      }
      return '';
    
    case 'NotebookEdit':
      if (input.notebook_path) {
        const filename = input.notebook_path.split('/').pop() || input.notebook_path;
        const mode = input.edit_mode || 'replace';
        return `${filename} (${mode})`;
      }
      return '';
    
    case 'BashOutput':
      if (input.bash_id) {
        return `shell: ${input.bash_id.substring(0, 8)}...`;
      }
      return '';
    
    case 'KillBash':
      if (input.shell_id) {
        return `kill shell: ${input.shell_id.substring(0, 8)}...`;
      }
      return '';
    
    case 'ExitPlanMode':
      return 'exit planning mode';
    
    case 'TodoRead':
      return 'read task list';
    
    default:
      // For unknown tools, try to show something meaningful
      if (input.file_path) {
        return input.file_path.split('/').pop() || input.file_path;
      }
      if (input.path) {
        return input.path.split('/').pop() || input.path;
      }
      if (input.command) {
        return input.command.substring(0, 30) + '...';
      }
      if (input.name) {
        return input.name;
      }
      return '';
  }
};

export const ToolCallView: React.FC<ToolCallViewProps> = ({ 
  tool, 
  depth = 0, 
  isExpanded,
  collapseTools,
  onToggleExpand,
  expandedTools 
}) => {
  const isTaskAgent = tool.isSubAgent && tool.name === 'Task';
  const hasChildTools = tool.childToolCalls && tool.childToolCalls.length > 0;
  
  // Sub-agents (Task tools) should always be expanded by default
  const effectiveIsExpanded = isTaskAgent ? (expandedTools ? expandedTools.has(tool.id) : true) : isExpanded;
  
  // Get compact summary for the tool
  const compactSummary = getCompactToolSummary(tool);
  
  // Lighter, more subtle styling
  const bgColor = isTaskAgent 
    ? 'bg-interactive/5' 
    : depth > 0 
      ? 'bg-surface-tertiary/10' 
      : 'bg-surface-tertiary/15';
  
  const borderColor = isTaskAgent
    ? 'border-interactive/20'
    : 'border-border-primary/20';
  
  return (
    <div className={`rounded-md ${bgColor} overflow-hidden border ${borderColor} ${depth > 0 ? 'ml-4' : ''}`}>
      <button
        onClick={() => onToggleExpand(tool.id)}
        className="w-full px-2 py-1 flex items-center gap-2 hover:bg-surface-tertiary/20 transition-colors text-left"
      >
        {/* Always show chevron for expandable tools */}
        {effectiveIsExpanded ? <ChevronDown className="w-3 h-3 text-text-tertiary flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-text-tertiary flex-shrink-0" />}
        
        {/* Tool icon */}
        {isTaskAgent ? (
          <svg className="w-3 h-3 text-interactive flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        ) : (
          <Wrench className="w-3 h-3 text-interactive-on-dark flex-shrink-0" />
        )}
        
        {/* Compact display: tool name + summary */}
        <span className="font-mono text-xs text-text-primary flex-1 truncate">
          <span className="font-semibold">{isTaskAgent ? 'Agent' : tool.name}</span>
          {isTaskAgent && tool.subAgentType && (
            <span className="ml-1 text-interactive">
              [{tool.subAgentType}]
            </span>
          )}
          {compactSummary && <span className="ml-2 text-text-secondary">{compactSummary}</span>}
        </span>
        
        {/* Status icon */}
        {tool.status === 'success' && <CheckCircle className="w-3 h-3 text-status-success flex-shrink-0" />}
        {tool.status === 'error' && <XCircle className="w-3 h-3 text-status-error flex-shrink-0" />}
        {tool.status === 'pending' && <Clock className="w-3 h-3 text-text-tertiary flex-shrink-0 animate-pulse" />}
      </button>
      
      {effectiveIsExpanded && (
        <div className="px-2 py-1.5 text-xs border-t border-border-primary/15">
          {/* Tool Parameters - more compact display */}
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div className="mb-1.5">
              <div className="text-text-tertiary text-[10px] uppercase tracking-wider mb-0.5">Parameters</div>
              {formatToolInput(tool.name, tool.input)}
            </div>
          )}
          
          {/* Child tool calls for Task agents */}
          {hasChildTools && (
            <div className="mt-1.5">
              <div className="text-text-secondary text-[10px] uppercase tracking-wider mb-1">
                Sub-agent Actions ({tool.childToolCalls!.length})
              </div>
              <div className="space-y-1">
                {tool.childToolCalls!.map((childTool, idx) => (
                  <ToolCallView
                    key={`${tool.id}-child-${idx}`}
                    tool={childTool}
                    depth={depth + 1}
                    isExpanded={expandedTools ? expandedTools.has(childTool.id) : false}
                    collapseTools={collapseTools}
                    onToggleExpand={onToggleExpand}
                    expandedTools={expandedTools}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Tool Result - render in markdown */}
          {tool.result && (
            <div className="mt-1.5">
              <div className="text-text-tertiary text-[10px] uppercase tracking-wider mb-0.5">
                {tool.result.isError ? 'Error' : 'Result'}
              </div>
              <div className={`${tool.result.isError ? 'text-status-error' : 'text-text-primary'} text-[11px]`}>
                {formatToolResultMarkdown(tool.name, tool.result.content, tool.result.isError || false)}
              </div>
            </div>
          )}
          
          {/* Pending state */}
          {tool.status === 'pending' && !hasChildTools && (
            <div className="text-text-tertiary italic text-[11px]">Waiting for result...</div>
          )}
        </div>
      )}
    </div>
  );
};

// Format tool input for display - compact version
const formatToolInput = (toolName: string, input: any): React.ReactNode => {
  switch (toolName) {
    case 'Read':
      return (
        <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
          {input.file_path && (
            <div className="truncate">
              <span className="text-text-tertiary">file:</span> {input.file_path}
            </div>
          )}
          {input.offset && <div>lines: {input.offset}-{input.offset + (input.limit || 2000)}</div>}
        </div>
      );
    
    case 'Edit':
    case 'MultiEdit':
      return (
        <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
          {input.file_path && <div className="truncate"><span className="text-text-tertiary">file:</span> {input.file_path}</div>}
          {toolName === 'MultiEdit' && input.edits && (
            <div>{input.edits.length} edits</div>
          )}
        </div>
      );
    
    case 'Write':
      return (
        <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
          {input.file_path && <div className="truncate"><span className="text-text-tertiary">file:</span> {input.file_path}</div>}
          {input.content && (
            <div>{input.content.split('\n').length} lines</div>
          )}
        </div>
      );
    
    case 'Bash':
      return (
        <div className="font-mono text-[11px] bg-bg-tertiary/50 px-1.5 py-0.5 rounded">
          <span className="text-status-success">$</span> {input.command}
        </div>
      );
    
    case 'Grep':
      return (
        <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
          <div><span className="text-text-tertiary">pattern:</span> <span className="text-status-warning">"{input.pattern}"</span></div>
          {input.path && <div className="truncate"><span className="text-text-tertiary">path:</span> {input.path}</div>}
          {input.glob && <div><span className="text-text-tertiary">files:</span> {input.glob}</div>}
        </div>
      );
    
    case 'Task':
      return (
        <div className="text-[11px] space-y-1">
          {input.description && (
            <div className="text-interactive">{input.description}</div>
          )}
          {input.subagent_type && (
            <div className="text-status-warning font-mono">agent: {input.subagent_type}</div>
          )}
          {input.prompt && (
            <details>
              <summary className="cursor-pointer text-text-tertiary hover:text-text-secondary text-[10px]">
                view prompt
              </summary>
              <div className="mt-0.5 p-1 bg-surface-secondary/50 rounded text-[10px] whitespace-pre-wrap max-h-24 overflow-y-auto">
                {input.prompt}
              </div>
            </details>
          )}
        </div>
      );
    
    case 'TodoWrite':
      return (
        <div className="text-[11px] space-y-0.5">
          {input.todos && Array.isArray(input.todos) && input.todos.map((todo: any, idx: number) => {
            const icon = todo.status === 'completed' ? '✓' : 
                        todo.status === 'in_progress' ? '→' : '○';
            const color = todo.status === 'completed' ? 'text-status-success' : 
                         todo.status === 'in_progress' ? 'text-status-warning' : 'text-text-tertiary';
            return (
              <div key={idx} className={`${color}`}>
                {icon} {todo.content}
              </div>
            );
          })}
        </div>
      );
    
    default:
      // Compact display for unknown tools
      return (
        <pre className="text-[10px] overflow-x-auto max-h-16 text-text-secondary">
          {JSON.stringify(input, null, 2)}
        </pre>
      );
  }
};

// Format tool result in markdown - replaces the old formatToolResult
const formatToolResultMarkdown = (toolName: string, result: string, isError: boolean): React.ReactNode => {
  if (!result) {
    return <div className="text-[10px] text-text-tertiary italic">No result</div>;
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
        // Render task results as markdown
        return (
          <div className="rich-output-markdown tool-result-markdown">
            <MarkdownPreview content={textContent} />
          </div>
        );
      }
    }
    
    // Handle image reads
    if (Array.isArray(parsed) && parsed[0]?.type === 'image') {
      return (
        <div className="text-[11px] text-text-secondary italic">
          [Image displayed]
        </div>
      );
    }
    
    // For other JSON results, pretty-print them in a code block
    return (
      <details className="text-[10px]">
        <summary className="cursor-pointer text-text-tertiary hover:text-text-secondary">
          View JSON result
        </summary>
        <pre className="mt-0.5 overflow-x-auto max-h-24 bg-surface-tertiary/30 p-2 rounded">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      </details>
    );
  } catch {
    // Not JSON - render as markdown for text content
    
    // For error messages, show them prominently
    if (isError) {
      return (
        <div className="text-status-error bg-status-error/10 p-2 rounded border border-status-error/30">
          <MarkdownPreview content={result} />
        </div>
      );
    }
    
    // For short results, render inline markdown
    if (result.length < 200) {
      return (
        <div className="rich-output-markdown tool-result-markdown">
          <MarkdownPreview content={result} />
        </div>
      );
    }
    
    // For longer results, make them expandable but still render as markdown
    return (
      <details className="text-[11px]">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary mb-1">
          View full result ({result.split('\n').length} lines)
        </summary>
        <div className="rich-output-markdown tool-result-markdown mt-1 max-h-48 overflow-y-auto">
          <MarkdownPreview content={result} />
        </div>
      </details>
    );
  }
};


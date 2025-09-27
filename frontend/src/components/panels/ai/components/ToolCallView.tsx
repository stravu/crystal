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

// Type guards for tool input types
interface ReadToolInput extends Record<string, unknown> {
  file_path: string;
  offset?: number;
  limit?: number;
}

interface EditToolInput extends Record<string, unknown> {
  file_path: string;
  old_string?: string;
  new_string?: string;
}

interface MultiEditToolInput extends Record<string, unknown> {
  file_path: string;
  edits: Array<{ old_string: string; new_string: string }>;
}

interface WriteToolInput extends Record<string, unknown> {
  file_path: string;
  content: string;
}

interface BashToolInput extends Record<string, unknown> {
  command: string;
}

interface GrepToolInput extends Record<string, unknown> {
  pattern: string;
  path?: string;
  glob?: string;
}

interface GlobToolInput extends Record<string, unknown> {
  pattern: string;
  path?: string;
}

interface WebFetchToolInput extends Record<string, unknown> {
  url: string;
  prompt: string;
}

// Type guards
const isReadInput = (input: Record<string, unknown>): input is ReadToolInput => {
  return typeof input.file_path === 'string';
};

const isEditInput = (input: Record<string, unknown>): input is EditToolInput => {
  return typeof input.file_path === 'string';
};

const isMultiEditInput = (input: Record<string, unknown>): input is MultiEditToolInput => {
  return typeof input.file_path === 'string' && Array.isArray(input.edits);
};

const isWriteInput = (input: Record<string, unknown>): input is WriteToolInput => {
  return typeof input.file_path === 'string' && typeof input.content === 'string';
};

const isBashInput = (input: Record<string, unknown>): input is BashToolInput => {
  return typeof input.command === 'string';
};

const isGrepInput = (input: Record<string, unknown>): input is GrepToolInput => {
  return typeof input.pattern === 'string';
};

const isGlobInput = (input: Record<string, unknown>): input is GlobToolInput => {
  return typeof input.pattern === 'string';
};

const isWebFetchInput = (input: Record<string, unknown>): input is WebFetchToolInput => {
  return typeof input.url === 'string' && typeof input.prompt === 'string';
};

interface TaskToolInput extends Record<string, unknown> {
  description?: string;
  subagent_type?: string;
  prompt?: string;
}

interface TodoWriteToolInput extends Record<string, unknown> {
  todos: Array<{ status: string; content: string }>;
}

interface WebSearchToolInput extends Record<string, unknown> {
  query: string;
}

const isTaskInput = (input: Record<string, unknown>): input is TaskToolInput => {
  return typeof input.description === 'string' || typeof input.subagent_type === 'string';
};

const isTodoWriteInput = (input: Record<string, unknown>): input is TodoWriteToolInput => {
  return Array.isArray(input.todos);
};

const isWebSearchInput = (input: Record<string, unknown>): input is WebSearchToolInput => {
  return typeof input.query === 'string';
};

interface LSToolInput extends Record<string, unknown> {
  path: string;
}

interface NotebookEditToolInput extends Record<string, unknown> {
  notebook_path: string;
  edit_mode?: string;
}

interface BashOutputToolInput extends Record<string, unknown> {
  bash_id: string;
}

interface KillBashToolInput extends Record<string, unknown> {
  shell_id: string;
}

const isLSInput = (input: Record<string, unknown>): input is LSToolInput => {
  return typeof input.path === 'string';
};

const isNotebookEditInput = (input: Record<string, unknown>): input is NotebookEditToolInput => {
  return typeof input.notebook_path === 'string';
};

const isBashOutputInput = (input: Record<string, unknown>): input is BashOutputToolInput => {
  return typeof input.bash_id === 'string';
};

const isKillBashInput = (input: Record<string, unknown>): input is KillBashToolInput => {
  return typeof input.shell_id === 'string';
};

// Get a compact summary for the tool call
const getCompactToolSummary = (tool: ToolCall): string => {
  const input = tool.input;
  if (!input) return '';
  
  switch (tool.name) {
    case 'Read':
      if (isReadInput(input)) {
        const filename = input.file_path.split('/').pop() || input.file_path;
        const lines = input.offset ? ` (lines ${input.offset}-${input.offset + (input.limit || 2000)})` : '';
        return filename + lines;
      }
      return '';
    
    case 'Edit':
      if (isEditInput(input)) {
        const filename = input.file_path.split('/').pop() || input.file_path;
        return filename;
      }
      return '';
      
    case 'MultiEdit':
      if (isMultiEditInput(input)) {
        const filename = input.file_path.split('/').pop() || input.file_path;
        const editsInfo = ` (${input.edits.length} changes)`;
        return filename + editsInfo;
      }
      return '';
    
    case 'Write':
      if (isWriteInput(input)) {
        const filename = input.file_path.split('/').pop() || input.file_path;
        const lines = ` (${input.content.split('\n').length} lines)`;
        return filename + lines;
      }
      return '';
    
    case 'Bash':
      if (isBashInput(input)) {
        // Truncate long commands
        const cmd = input.command.length > 50 ? input.command.substring(0, 50) + '...' : input.command;
        return cmd;
      }
      return '';
    
    case 'Grep':
      if (isGrepInput(input)) {
        const pattern = input.pattern.length > 20 ? input.pattern.substring(0, 20) + '...' : input.pattern;
        const location = input.path ? ` in ${input.path.split('/').pop() || input.path}` : '';
        return `"${pattern}"${location}`;
      }
      return '';
    
    case 'Glob':
      if (isGlobInput(input)) {
        const location = input.path ? ` in ${input.path.split('/').pop() || input.path}` : '';
        return `${input.pattern}${location}`;
      }
      return '';
    
    case 'Task':
      if (isTaskInput(input)) {
        if (input.description) {
          return input.description.length > 40 ? input.description.substring(0, 40) + '...' : input.description;
        }
        return input.subagent_type || '';
      }
      return '';
    
    case 'TodoWrite':
      if (isTodoWriteInput(input)) {
        const total = input.todos.length;
        const completed = input.todos.filter(t => t.status === 'completed').length;
        return `${completed}/${total} tasks`;
      }
      return '';
    
    case 'WebFetch':
      if (isWebFetchInput(input)) {
        try {
          const url = new URL(input.url);
          return url.hostname;
        } catch {
          return input.url.substring(0, 30) + '...';
        }
      }
      return '';
    
    case 'WebSearch':
      if (isWebSearchInput(input)) {
        return input.query.length > 30 ? input.query.substring(0, 30) + '...' : input.query;
      }
      return '';
    
    case 'LS':
      if (isLSInput(input)) {
        return input.path.split('/').pop() || input.path;
      }
      return '';
    
    case 'NotebookEdit':
      if (isNotebookEditInput(input)) {
        const filename = input.notebook_path.split('/').pop() || input.notebook_path;
        const mode = input.edit_mode || 'replace';
        return `${filename} (${mode})`;
      }
      return '';
    
    case 'BashOutput':
      if (isBashOutputInput(input)) {
        return `shell: ${input.bash_id.substring(0, 8)}...`;
      }
      return '';
    
    case 'KillBash':
      if (isKillBashInput(input)) {
        return `kill shell: ${input.shell_id.substring(0, 8)}...`;
      }
      return '';
    
    case 'ExitPlanMode':
      return 'exit planning mode';
    
    case 'TodoRead':
      return 'read task list';
    
    default:
      // For unknown tools, try to show something meaningful using type checks
      if (typeof input.file_path === 'string') {
        return input.file_path.split('/').pop() || input.file_path;
      }
      if (typeof input.path === 'string') {
        return input.path.split('/').pop() || input.path;
      }
      if (typeof input.command === 'string') {
        return input.command.substring(0, 30) + '...';
      }
      if (typeof input.name === 'string') {
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
const formatToolInput = (toolName: string, input: Record<string, unknown>): React.ReactNode => {
  switch (toolName) {
    case 'Read':
      if (isReadInput(input)) {
        return (
          <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
            <div className="truncate">
              <span className="text-text-tertiary">file:</span> {input.file_path}
            </div>
            {input.offset && <div>lines: {input.offset}-{input.offset + (input.limit || 2000)}</div>}
          </div>
        );
      }
      break;
    
    case 'Edit':
      if (isEditInput(input)) {
        return (
          <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
            <div className="truncate"><span className="text-text-tertiary">file:</span> {input.file_path}</div>
          </div>
        );
      }
      break;

    case 'MultiEdit':
      if (isMultiEditInput(input)) {
        return (
          <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
            <div className="truncate"><span className="text-text-tertiary">file:</span> {input.file_path}</div>
            <div>{input.edits.length} change{input.edits.length !== 1 ? 's' : ''}</div>
          </div>
        );
      }
      break;
    
    case 'Write':
      if (isWriteInput(input)) {
        return (
          <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
            <div className="truncate"><span className="text-text-tertiary">file:</span> {input.file_path}</div>
            <div>{input.content.split('\n').length} lines</div>
          </div>
        );
      }
      break;
    
    case 'Bash':
      if (isBashInput(input)) {
        return (
          <div className="font-mono text-[11px] bg-bg-tertiary/50 px-1.5 py-0.5 rounded">
            <span className="text-status-success">$</span> {input.command}
          </div>
        );
      }
      break;
    
    case 'Grep':
      if (isGrepInput(input)) {
        return (
          <div className="font-mono text-[11px] space-y-0.5 text-text-secondary">
            <div><span className="text-text-tertiary">pattern:</span> <span className="text-status-warning">"{input.pattern}"</span></div>
            {input.path && <div className="truncate"><span className="text-text-tertiary">path:</span> {input.path}</div>}
            {input.glob && <div><span className="text-text-tertiary">files:</span> {input.glob}</div>}
          </div>
        );
      }
      break;
    
    case 'Task':
      if (isTaskInput(input)) {
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
      }
      break;
    
    case 'TodoWrite':
      if (isTodoWriteInput(input)) {
        return (
          <div className="text-[11px] space-y-0.5">
            {input.todos.map((todo: { status: string; content: string }, idx: number) => {
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
      }
      break;
    
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


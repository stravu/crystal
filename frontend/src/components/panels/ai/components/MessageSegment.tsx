import React from 'react';
import { MarkdownPreview } from '../../../MarkdownPreview';
import { ToolCallView } from './ToolCallView';
import { MessageSegment as MessageSegmentType } from '../transformers/MessageTransformer';

interface MessageSegmentProps {
  segment: MessageSegmentType;
  messageId: string;  // Used for unique keys
  index: number;  // Used for unique keys
  isUser: boolean;
  isCollapsed?: boolean;
  expandedTools: Set<string>;
  collapseTools: boolean;
  showToolCalls: boolean;
  showThinking: boolean;
  onToggleToolExpand: (toolId: string) => void;
}

export const MessageSegment: React.FC<MessageSegmentProps> = ({
  segment,
  messageId: _messageId,  // Prefix with _ to indicate intentionally unused
  index: _index,  // Prefix with _ to indicate intentionally unused
  isUser,
  isCollapsed = false,
  expandedTools,
  collapseTools,
  showToolCalls,
  showThinking,
  onToggleToolExpand
}) => {
  // State for diff expansion - declared at top level
  const [isDiffExpanded, setDiffExpanded] = React.useState(false);
  
  switch (segment.type) {
    case 'text':
      if (!segment.content.trim()) return null;
      
      return (
        <div className={`${isCollapsed ? 'max-h-20 overflow-hidden relative' : ''}`}>
          {isUser ? (
            <div className="text-text-primary whitespace-pre-wrap font-medium">{segment.content}</div>
          ) : (
            <div className="rich-output-markdown">
              <MarkdownPreview content={segment.content} />
            </div>
          )}
          {isCollapsed && (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-surface-secondary to-transparent pointer-events-none" />
          )}
        </div>
      );
    
    case 'thinking':
      if (!showThinking || !segment.content.trim()) return null;
      
      return (
        <div className="relative">
          <div className="absolute -left-7 top-0 w-1 h-full bg-interactive/20 rounded-full" />
          <div className="pl-4 pr-2 py-2">
            <div className="text-sm thinking-content italic text-text-secondary">
              <MarkdownPreview content={segment.content} />
            </div>
          </div>
        </div>
      );
    
    case 'tool_call':
      if (!showToolCalls) return null;
      
      return (
        <ToolCallView
          tool={segment.tool}
          isExpanded={collapseTools ? expandedTools.has(segment.tool.id) : true}
          collapseTools={collapseTools}
          onToggleExpand={onToggleToolExpand}
          expandedTools={expandedTools}
        />
      );
    
    case 'tool_result':
      if (!showToolCalls) return null;
      
      return (
        <div className="px-4 py-2 bg-surface-hover/30">
          <div className="text-xs text-text-secondary mb-1">Tool Result</div>
          <pre className="text-xs text-text-tertiary font-mono overflow-x-auto max-h-32 overflow-y-auto">
            {typeof segment.result.content === 'string' 
              ? segment.result.content 
              : JSON.stringify(segment.result.content, null, 2)}
          </pre>
        </div>
      );
    
    case 'system_info':
      // System info segments are handled differently by parent component
      return null;
    
    case 'error':
      if (!segment.error) return null;
      
      return (
        <div className="my-2 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
          <div className="text-red-400 font-semibold text-sm mb-2">
            {segment.error.message || 'Error'}
          </div>
          {segment.error.details && (
            <div className="text-red-300 text-sm whitespace-pre-wrap font-mono">
              {segment.error.details}
            </div>
          )}
        </div>
      );
    
    case 'diff': {
      if (!segment.diff || !segment.diff.trim()) return null;
      
      // For diffs, show them in a collapsible code block
      const lines = segment.diff.split('\n');
      const fileCount = (segment.diff.match(/^diff --git/gm) || []).length;
      const addedLines = (segment.diff.match(/^\+[^+]/gm) || []).length;
      const removedLines = (segment.diff.match(/^-[^-]/gm) || []).length;
      
      return (
        <div className="my-2">
          <button
            onClick={() => setDiffExpanded(!isDiffExpanded)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-surface-secondary hover:bg-surface-hover rounded transition-colors w-full text-left"
          >
            <span className="text-text-tertiary">
              {isDiffExpanded ? '▼' : '▶'}
            </span>
            <span className="text-text-secondary font-medium">
              Diff: {fileCount} file{fileCount !== 1 ? 's' : ''} changed
            </span>
            <span className="text-green-500">+{addedLines}</span>
            <span className="text-red-500">-{removedLines}</span>
          </button>
          
          {isDiffExpanded && (
            <div className="mt-2 bg-black/20 rounded-lg p-3 overflow-hidden">
              <pre className="text-xs font-mono overflow-x-auto">
                {lines.map((line, i) => {
                  let className = 'text-text-tertiary';
                  if (line.startsWith('+++') || line.startsWith('---')) {
                    className = 'text-text-secondary font-semibold';
                  } else if (line.startsWith('@@')) {
                    className = 'text-blue-400';
                  } else if (line.startsWith('+') && !line.startsWith('+++')) {
                    className = 'text-green-400 bg-green-900/20';
                  } else if (line.startsWith('-') && !line.startsWith('---')) {
                    className = 'text-red-400 bg-red-900/20';
                  } else if (line.startsWith('diff --git')) {
                    className = 'text-purple-400 font-semibold mt-2';
                  }
                  
                  return (
                    <div key={i} className={className}>
                      {line || '\u00A0'}
                    </div>
                  );
                })}
              </pre>
            </div>
          )}
        </div>
      );
    }
    
    default:
      return null;
  }
};
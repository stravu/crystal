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
          isExpanded={!collapseTools || expandedTools.has(segment.tool.id)}
          collapseTools={collapseTools}
          onToggleExpand={onToggleToolExpand}
        />
      );
    
    case 'system_info':
      // System info segments are handled differently by parent component
      return null;
    
    default:
      return null;
  }
};
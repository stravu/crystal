import React from 'react';
import { MessageSegment as MessageSegmentType } from '../transformers/MessageTransformer';
import { ToolCallView } from './ToolCallView';

interface ToolCallGroupProps {
  tools: MessageSegmentType[];  // These are tool_call segments
  expandedTools: Set<string>;
  collapseTools: boolean;
  onToggleToolExpand: (toolId: string) => void;
}

export const ToolCallGroup: React.FC<ToolCallGroupProps> = ({
  tools,
  expandedTools,
  collapseTools,
  onToggleToolExpand
}) => {
  // Filter to only tool_call segments and extract the tools
  const toolCalls = tools
    .filter(seg => seg.type === 'tool_call')
    .map(seg => seg.type === 'tool_call' ? seg.tool : null)
    .filter(tool => tool !== null);

  // If there's only one tool, render it directly
  if (toolCalls.length === 1) {
    const tool = toolCalls[0];
    return (
      <ToolCallView
        tool={tool}
        isExpanded={collapseTools ? expandedTools.has(tool.id) : true}
        collapseTools={collapseTools}
        onToggleExpand={onToggleToolExpand}
        expandedTools={expandedTools}
      />
    );
  }

  // For multiple tools, render them in a grouped container
  return (
    <div className="rounded-lg bg-surface-tertiary/20 border border-border-primary/30 overflow-hidden">
      <div className="px-2 py-1.5 bg-surface-tertiary/30 border-b border-border-primary/20">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium">
            Tool Sequence ({toolCalls.length} tools)
          </span>
          <div className="flex items-center gap-1 ml-auto">
            {/* Status summary */}
            {toolCalls.filter(t => t.status === 'success').length > 0 && (
              <span className="text-[10px] text-status-success">
                {toolCalls.filter(t => t.status === 'success').length} ✓
              </span>
            )}
            {toolCalls.filter(t => t.status === 'error').length > 0 && (
              <span className="text-[10px] text-status-error">
                {toolCalls.filter(t => t.status === 'error').length} ✗
              </span>
            )}
            {toolCalls.filter(t => t.status === 'pending').length > 0 && (
              <span className="text-[10px] text-text-tertiary">
                {toolCalls.filter(t => t.status === 'pending').length} ⏳
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="divide-y divide-border-primary/20">
        {toolCalls.map((tool, idx) => (
          <div key={`tool-${tool.id}-${idx}`} className="first:border-t-0">
            <ToolCallView
              tool={tool}
              isExpanded={collapseTools ? expandedTools.has(tool.id) : true}
              collapseTools={collapseTools}
              onToggleExpand={onToggleToolExpand}
              expandedTools={expandedTools}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
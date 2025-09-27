# Compact Tool Display Test

## Summary of Changes

The tool display in Crystal has been made significantly more compact for both Claude Code and Codex sessions:

### 1. **Collapsed by Default** 🆕
- **All tools are now collapsed by default**, showing only the single-line summary
- Click on any tool to expand and see full details
- Tools remember their expanded/collapsed state within the session

### 2. **Compact One-Line Display** (Collapsed State)
- Tool calls display in a single compact line with:
  - Chevron icon (▶ collapsed, ▼ expanded) - always visible for all tools
  - Tool icon (wrench for tools, clipboard for sub-agents)
  - Tool name in bold
  - Brief summary of key parameters (file name, command, pattern, etc.)
  - Status icon (checkmark ✓, error ✗, or pending ⏰)

### 3. **Smart Parameter Summaries**
Each tool type shows relevant info inline:
- **Read**: filename + line range
- **Edit/MultiEdit**: filename + number of changes
- **Write**: filename + line count
- **Bash**: command (truncated to 50 chars)
- **Grep**: pattern + location
- **TodoWrite**: task counts by status (e.g., "2 ✓, 1 →, 3 ○")
- **Task**: description or sub-agent type
- **WebFetch**: hostname
- **WebSearch**: query (truncated)

### 4. **Compact Expanded View**
When expanded, tools show:
- Smaller padding (px-2 py-1.5 instead of px-3 py-2)
- Smaller font sizes (text-[11px] for content, text-[10px] for labels)
- Uppercase labels with tracking for better readability at small sizes
- Collapsible details for long content
- Smart truncation with "view more" options

### 5. **Intelligent Result Display**
Tool results are shown more compactly:
- Short results (< 100 chars) shown inline
- Long results collapsed with preview
- Error results highlighted in red with expandable details
- File counts shown as summaries (e.g., "Found 15 files")
- JSON results show first 50 chars with expand option

### 6. **Visual Improvements**
- Reduced vertical spacing between tools
- Thinner borders and more subtle backgrounds
- Smaller icons (3x3 instead of 3.5x3.5)
- More efficient use of horizontal space with truncation

## Testing

To test these changes in your existing Crystal app:

1. Create or open a Claude Code or Codex session
2. Run some commands that trigger various tools:
   - File operations (Read, Edit, Write)
   - Search operations (Grep, Glob)
   - System commands (Bash)
   - Task management (TodoWrite, Task)

3. Observe that:
   - **Tools are collapsed by default** - only single lines visible
   - Clicking any tool expands it to show full details
   - Expanded tools can be collapsed again by clicking
   - Long outputs are intelligently truncated with "view more" options
   - The overall vertical space usage is significantly reduced (2-3x more tools visible)

## Benefits

- **More tools visible**: Can see 2-3x more tool calls on screen at once
- **Faster scanning**: One-line summaries make it easy to understand what happened
- **Less scrolling**: Compact display reduces need to scroll through long sessions
- **On-demand details**: Full information still available when needed via expansion
- **Better for complex sessions**: Especially helpful when using Task agents with many sub-tools

## Code Changes

Modified files:
- `frontend/src/components/panels/ai/components/ToolCallView.tsx`
  - Added `getCompactToolSummary()` function for intelligent parameter summarization
  - Reduced padding and font sizes throughout (text-[11px] for content, text-[10px] for labels)
  - Always show chevron icon for expand/collapse functionality
  - Enhanced result display with smart truncation and pattern recognition
  
- `frontend/src/components/panels/ai/components/MessageSegment.tsx`
  - Changed tool expansion logic to respect collapsed state properly
  - Tools are now collapsed when `collapseTools` setting is enabled
  
- `frontend/src/components/panels/ai/RichOutputView.tsx`
  - Changed default `collapseTools` setting to `true` (tools collapsed by default)
# Grouped Tool Display Implementation

## Summary
Consecutive tool-only messages are now automatically grouped into a single container box at the rendering level for cleaner visualization in both Claude Code and Codex sessions. **The underlying message storage remains unchanged** - grouping happens purely during display.

## Key Changes

### 1. **Rendering-Level Tool Grouping**
- Groups consecutive messages that contain ONLY tool calls (no text or other content)
- Grouping happens at render time in `renderedMessages` useMemo hook
- Original message structure in database/state remains unchanged
- Single tool messages render as before
- Mixed messages (tool + text) render normally

### 2. **ToolCallGroup Component** (`frontend/src/components/panels/ai/components/ToolCallGroup.tsx`)
- New component that renders multiple tools in a grouped container
- Shows header with tool count and status summary
- Each tool within the group is still individually expandable/collapsible

### 3. **Visual Design**
- **Group Header**: Shows "Tool Sequence (N tools)" with status summary
  - Success count: `3 ✓` 
  - Error count: `1 ✗`
  - Pending count: `2 ⏳`
- **Container**: Light background with border to visually group tools
- **Dividers**: Subtle lines between individual tools within the group
- **Collapsed by default**: All tools start collapsed as single lines

### 4. **Updated Files**
- `frontend/src/components/panels/ai/RichOutputView.tsx`
  - Completely rewritten `renderedMessages` computation to group consecutive tool-only messages
  - Grouping logic checks if messages contain ONLY tool_call segments
  - Renders grouped tools inline without using ToolCallGroup component
  
- `frontend/src/components/panels/ai/components/ToolCallGroup.tsx`
  - New component for grouped tool rendering
  
- `frontend/src/components/panels/ai/components/ToolCallView.tsx`
  - Enhanced with compact display and better summaries
  
- `frontend/src/components/panels/ai/components/MessageSegment.tsx`
  - Updated to properly handle collapsed state

## Benefits

1. **Cleaner Visual Hierarchy**
   - Related tools are visually grouped
   - Reduces visual clutter when many tools are used
   - Makes it easier to understand tool sequences

2. **Space Efficiency**
   - Single header for multiple tools
   - Shared container reduces redundant borders/spacing
   - Combined with collapsed-by-default, shows even more on screen

3. **Better Context**
   - Shows at a glance how many tools were executed together
   - Status summary provides quick overview of success/failure
   - Maintains individual tool expandability for details

## Example Display

### Before (Individual Tools):
```
▶ 🔧 Read file.txt ✓
▶ 🔧 Grep "pattern" in src ✓
▶ 🔧 Edit main.ts ✓
▶ 🔧 Bash npm test ✓
```

### After (Grouped Tools):
```
┌─ Tool Sequence (4 tools)  4 ✓ ─┐
│ ▶ 🔧 Read file.txt ✓           │
│ ▶ 🔧 Grep "pattern" in src ✓   │
│ ▶ 🔧 Edit main.ts ✓            │
│ ▶ 🔧 Bash npm test ✓           │
└─────────────────────────────────┘
```

## Behavior

- **Consecutive Detection**: Only groups tools that appear one after another with no text/thinking between
- **Individual Expansion**: Each tool can still be clicked to expand/collapse independently
- **Smart Defaults**: Tools are collapsed by default for maximum efficiency
- **Status Tracking**: Group header shows aggregate status for quick scanning

## Testing

To see the grouped tool display:
1. Open a Claude Code or Codex session
2. Run multiple commands in sequence (the AI often does this automatically)
3. Observe that consecutive tools appear in a single grouped container
4. Click individual tools to expand and see their details
5. Note the status summary in the group header

This implementation significantly improves the readability of sessions with many tool calls, especially when using Task agents that may execute dozens of tools in sequence.
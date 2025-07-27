# Terminal Formatter Redesign Proposal

## Current Problems

1. **Hardcoded ANSI colors** in formatters with no theme awareness
2. **Poor readability** in light mode (white text on light background)
3. **No design system integration** - colors are disconnected from our tokens
4. **Server-side formatting** can't access frontend theme state

## Current Color Usage

### formatters.ts
- Timestamps: `\x1b[36m` (cyan)
- User messages: `\x1b[32m` (green) header, `\x1b[37m` (white) content
- Assistant messages: `\x1b[35m` (magenta) header, `\x1b[37m` (white) content
- System messages: Various colors
- Metadata: `\x1b[90m` (bright black/gray)

## Proposed Solutions

### Option 1: Theme-Aware ANSI Codes (Recommended)

Instead of hardcoded colors, use semantic ANSI mappings that work in both themes:

```typescript
// Define semantic color mappings
const COLORS = {
  timestamp: '\x1b[90m',      // gray (readable in both themes)
  userHeader: '\x1b[92m',     // bright green
  userContent: '\x1b[0m',     // default terminal color
  assistantHeader: '\x1b[94m', // bright blue (instead of magenta)
  assistantContent: '\x1b[0m', // default terminal color
  systemInfo: '\x1b[90m',     // gray
  error: '\x1b[91m',          // bright red
  success: '\x1b[92m',        // bright green
  warning: '\x1b[93m',        // bright yellow
};
```

Benefits:
- Works immediately without major refactoring
- Uses terminal's default colors which adapt to theme
- Better contrast in both themes

### Option 2: Client-Side Formatting

Move formatting to the frontend where we have theme access:
1. Send raw JSON to frontend
2. Format with theme-appropriate colors client-side
3. Write formatted text to terminal

Benefits:
- Full theme awareness
- Can use CSS variables directly
- Complete design system integration

Drawbacks:
- Major refactoring required
- Performance considerations

### Option 3: Hybrid Approach

1. Use semantic ANSI codes that work well in both themes (Option 1)
2. Add theme hint to messages from backend
3. Post-process on frontend if needed

## Immediate Fix

For now, let's implement Option 1 with these changes:
1. Replace white (`\x1b[37m`) with default color (`\x1b[0m`)
2. Change assistant magenta to bright blue
3. Use bright variants for better contrast

This will make the terminal readable in both themes while we plan a proper redesign.
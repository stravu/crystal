# Diff Viewer CSS Troubleshooting

⚠️ **IMPORTANT**: The diff viewer (react-diff-viewer-continued) has specific CSS requirements that can be tricky to debug.

## Common Issue: No Scrollbars on Diff Viewer

If the diff viewer content is cut off and scrollbars don't appear:

1. **DO NOT add complex CSS overrides** - This often makes the problem worse
2. **Check parent containers for `overflow-hidden`** - This is usually the root cause
3. **Use simple `overflow: 'auto'`** on the immediate diff container
4. **Remove any forced widths or min-widths** unless absolutely necessary

## The Solution That Works

```tsx
// In DiffViewer.tsx - Keep it simple!
<div className="border border-t-0 border-gray-600 rounded-b-lg" style={{ overflow: 'auto', maxHeight: '600px' }}>
  <ReactDiffViewer
    oldValue={file.oldValue || ''}
    newValue={file.newValue || ''}
    splitView={viewType === 'split'}
    useDarkTheme={isDarkMode}
    styles={currentStyles}
    // Don't add complex style overrides here
  />
</div>
```

## What NOT to Do

- Don't add multiple wrapper divs with conflicting overflow settings
- Don't use CSS-in-JS to override react-diff-viewer's internal styles
- Don't add global CSS selectors targeting generated class names
- Don't use JavaScript hacks to force reflows

## Root Cause

The issue is typically caused by parent containers having `overflow-hidden` which prevents child scrollbars from appearing. Check these files:

- `SessionView.tsx` - Look for `overflow-hidden` classes
- `CombinedDiffView.tsx` - Check both the main container and flex containers
- `App.tsx` - Sometimes the issue starts at the app root level

The react-diff-viewer-continued library uses emotion/styled-components internally, which makes CSS overrides unreliable. The best approach is to ensure proper overflow handling in parent containers and keep the diff viewer wrapper simple.

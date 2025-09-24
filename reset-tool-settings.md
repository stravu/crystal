# Reset Tool Display Settings

If your tools are still showing expanded after this update, you may need to clear the cached settings in localStorage.

## How to Reset Settings

### Option 1: Through Crystal's Developer Tools
1. Open Crystal
2. Press `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux) to open Developer Tools
3. Go to the **Console** tab
4. Paste and run this command:
```javascript
// Clear all rich output settings to use new defaults
localStorage.removeItem('richOutputSettings');
localStorage.removeItem('claudeRichOutputSettings');
localStorage.removeItem('codexRichOutputSettings');
console.log('Tool display settings reset! Refresh the app to see changes.');
```
5. Refresh Crystal (`Cmd+R` or `Ctrl+R`)

### Option 2: Through the Settings Panel
1. Open a Claude or Codex session
2. Click the Settings icon (⚙️) in the top bar
3. Toggle "Collapse tools" to ON (if it's not already)
4. This will save the new preference

## What Changed?

- **Before**: Tools were expanded by default, showing all parameters and results
- **After**: Tools are collapsed to single lines, click to expand

## Expected Behavior

After resetting:
- All tool calls show as **single compact lines**
- Each line shows: `▶ [Tool Icon] ToolName parameter summary ✓`
- Click any tool to expand and see full details
- Click again to collapse back to single line
- Your expand/collapse choices are remembered during the session

## Benefits

- See **2-3x more tools** on screen at once
- Faster scanning of what the AI did
- Less scrolling needed
- Details still available on demand
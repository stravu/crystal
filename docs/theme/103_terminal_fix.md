# Terminal Theme Fix - Integration with Design System

## Issues Found

1. **ANSI Escape Codes Visible**: The terminal is showing raw escape codes like `[7;28;47 PM]` instead of processing them
2. **Poor Contrast**: Terminal colors don't match the Crystal design system
3. **Background Issues**: Pure black background in dark mode doesn't match the app

## Solution Applied

### 1. Updated Terminal Colors in Design System

Added proper terminal color tokens that integrate with our design system:

**Dark Theme**:
- Background: `var(--gray-900)` (matches app background)
- Foreground: `var(--gray-100)` (good contrast)
- Cursor: `var(--blue-400)` (accent color)

**Light Theme**:
- Background: `var(--gray-50)` (subtle background)
- Foreground: `var(--gray-900)` (dark text)
- Cursor: `var(--blue-600)` (accent color)

### 2. Terminal Configuration

Updated XTerm.js configuration:
- Added proper font settings
- Removed problematic renderer type
- Added CSS for better terminal integration

### 3. Dynamic Theme Loading

Terminal themes now load from CSS variables, ensuring they always match the current theme.

## Testing

1. Switch to Settings and toggle between light/dark mode
2. Check that terminal text is readable in both themes
3. Verify ANSI colors work properly (red errors, green success, etc.)
4. Ensure terminal background matches the app design

## Note

If ANSI escape codes are still visible, it might be an issue with how the Claude output is being processed. The terminal configuration is now correct for displaying properly formatted terminal output.
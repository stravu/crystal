# Command Bar Focus State Fix

## Problem Identified
The command input bar was losing its visual hierarchy and styling when users interacted with dropdowns (model selector, commit mode toggle) within the same toolbar. This caused the command bar to appear "flattened" or "inactive" during dropdown interactions.

## Root Cause Analysis

### 1. Focus Management Issue
- When dropdowns were clicked, the textarea lost focus (`onBlur` triggered)
- This removed the `isFocused` state and associated `command-bar-focus` styling
- The command bar appeared visually inactive even though the user was still interacting with the toolbar

### 2. Styling Dependency
The command bar styling was solely dependent on `isFocused`:
```tsx
${isFocused ? 'command-bar-focus' : ''}
```

### 3. Focus Event Behavior
- Clicking dropdown triggers caused the textarea to blur
- No mechanism to detect continued toolbar interaction
- Focus state was binary (on/off) rather than contextual

## Solution Implemented

### 1. Enhanced Focus State Management
Added `isToolbarActive` state to track toolbar-level interaction:

```tsx
const [isFocused, setIsFocused] = useState(false);        // Input field focus
const [isToolbarActive, setIsToolbarActive] = useState(false); // Toolbar-level focus
```

### 2. Intelligent Focus/Blur Handling
Updated handlers to consider toolbar context:

```tsx
const handleBlur = useCallback((e: React.FocusEvent) => {
  const toolbar = e.currentTarget.closest('[data-toolbar-container]');
  const relatedTarget = e.relatedTarget;
  
  // Only remove focus if we're actually leaving the toolbar area
  if (!toolbar || !relatedTarget || !toolbar.contains(relatedTarget as Node)) {
    setIsFocused(false);
    setIsToolbarActive(false);
    onBlur?.();
  } else {
    // Keep toolbar active if staying within toolbar
    setIsFocused(false);
    setIsToolbarActive(true);
  }
}, [onBlur]);
```

### 3. Toolbar-Level Focus Capture
Added focus management at the container level:

```tsx
<div 
  data-toolbar-container
  onFocusCapture={(e) => {
    setIsToolbarActive(true);
  }}
  onBlurCapture={(e) => {
    setTimeout(() => {
      const activeElement = document.activeElement;
      const toolbar = e.currentTarget;
      
      if (!activeElement || !toolbar.contains(activeElement)) {
        setIsToolbarActive(false);
      }
    }, 0);
  }}
>
```

### 4. Combined Styling Logic
Updated command bar styling to maintain hierarchy during toolbar interaction:

```tsx
${(isFocused || isToolbarActive) ? 'command-bar-focus' : ''}
```

### 5. Improved Dropdown Accessibility
Made dropdown triggers focusable for keyboard navigation:

```tsx
<div 
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }}
>
```

### 6. Z-Index Management
Added proper layering to prevent visual conflicts:

```tsx
className="relative z-10"  // Command bar
// Dropdowns use z-dropdown (9999) which is higher
```

## Technical Benefits

1. **Visual Consistency**: Command bar maintains elevation during all toolbar interactions
2. **Better UX**: No jarring visual state changes when using dropdowns
3. **Accessibility**: Proper focus management for keyboard navigation
4. **Performance**: Minimal overhead with efficient event handling
5. **Maintainability**: Clear separation between input focus and toolbar interaction

## User Experience Improvements

- ✅ Command bar maintains visual hierarchy during dropdown interactions
- ✅ Smooth transitions without visual "flickering"
- ✅ Consistent focus ring and shadow styling
- ✅ Professional feel that matches the design system quality
- ✅ Keyboard accessibility for all toolbar elements

## Testing Considerations

When testing this fix:
1. Click model selector dropdown - command bar should remain elevated
2. Click commit mode toggle - command bar should maintain styling
3. Use keyboard navigation - focus states should be clear
4. Click outside toolbar - command bar should properly lose focus
5. Rapid clicking between elements - no visual glitches

This solution ensures the command bar always maintains its professional appearance and visual affordance, even during complex user interactions within the toolbar area.
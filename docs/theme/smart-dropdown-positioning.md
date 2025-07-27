# Smart Dropdown Positioning

## Overview
Implemented intelligent viewport-aware positioning for dropdown components to prevent them from appearing off-screen or in awkward positions.

## Problem Solved
Previously, dropdowns used fixed positioning (e.g., `top-right`) which could cause them to:
- Extend beyond the viewport boundaries
- Appear partially cut off
- Have misaligned arrows
- Provide poor user experience on smaller screens

## Solution: Auto-Positioning

### New Position Option: `auto`
Added `auto` as a positioning option that intelligently calculates the best position based on available viewport space.

```typescript
position?: 'auto' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
```

### Smart Positioning Logic

1. **Viewport Detection**: Calculates available space in all directions
2. **Preferred Positioning**: 
   - **Vertical**: Prefers bottom if sufficient space, otherwise flips to top
   - **Horizontal**: Prefers right if sufficient space, otherwise flips to left
3. **Fallback Logic**: Even with explicit positioning, will flip if content would go off-screen

### Implementation Details

```typescript
// Calculate available space
const spaceBelow = viewport.height - triggerRect.bottom - 8; // 8px margin
const spaceAbove = triggerRect.top - 8;
const spaceRight = viewport.width - triggerRect.left - 8;
const spaceLeft = triggerRect.right - 8;

// Determine best position
const preferBottom = spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove;
const preferRight = spaceRight >= estimatedWidth || spaceRight >= spaceLeft;
```

### Dynamic Arrow Positioning
Arrows now correctly align based on the actual dropdown position:

```typescript
{/* Arrow positioned based on actual position */}
{actualPosition.includes('top') && (
  <div className={cn(
    "absolute -bottom-1 w-2 h-2 bg-surface-primary border-r border-b border-border-subtle transform rotate-45",
    actualPosition.includes('right') ? 'right-4' : 'left-4'  // Dynamic positioning
  )}></div>
)}
```

## Usage

### Default Behavior (Recommended)
```tsx
<Dropdown
  trigger={<Pill>Options</Pill>}
  items={items}
  position="auto" // Smart positioning (now default)
/>
```

### Legacy Explicit Positioning (with smart fallback)
```tsx
<Dropdown
  trigger={<Pill>Options</Pill>}
  items={items}
  position="top-right" // Will flip if off-screen
/>
```

## Benefits

1. **Better UX**: Dropdowns always appear fully visible
2. **Responsive**: Works well on all screen sizes
3. **Automatic**: No manual positioning calculations needed
4. **Backward Compatible**: Existing explicit positions still work with smart fallbacks
5. **Proper Anchoring**: Arrows always point to the correct trigger location

## Components Updated

- ✅ **CommitModeToggle**: Now uses `position="auto"`
- ✅ **Model Selector**: Now uses `position="auto"`
- ✅ **Generic Dropdown**: Enhanced with smart positioning logic

## Technical Implementation

- **Real-time Calculations**: Position calculated when dropdown opens
- **Viewport Awareness**: Uses `getBoundingClientRect()` and `window` dimensions
- **Performance Optimized**: Calculations done only when needed
- **Size Estimation**: Uses reasonable estimates for dropdown dimensions before content renders

This ensures dropdowns provide a polished, professional experience that adapts intelligently to any screen size or position within the interface.
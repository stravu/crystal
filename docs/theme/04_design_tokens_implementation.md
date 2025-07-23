# 04. Design Tokens Implementation

**Date:** 2025-07-21  
**Status:** In Progress  
**Scope:** Creating CSS variables and design token system

## Overview

This document outlines the implementation of a design token system for Crystal using CSS variables. This will provide the foundation for consistent theming and future customization.

## Design Token Structure

### Color Tokens

```css
:root {
  /* Primitive Colors - Tailwind References */
  --gray-50: rgb(249 250 251);
  --gray-100: rgb(243 244 246);
  --gray-200: rgb(229 231 235);
  --gray-300: rgb(209 213 219);
  --gray-400: rgb(156 163 175);
  --gray-500: rgb(107 114 128);
  --gray-600: rgb(75 85 99);
  --gray-700: rgb(55 65 81);
  --gray-800: rgb(31 41 55);
  --gray-900: rgb(17 24 39);
  
  --blue-400: rgb(96 165 250);
  --blue-500: rgb(59 130 246);
  --blue-600: rgb(37 99 235);
  --blue-700: rgb(29 78 216);
  
  --green-500: rgb(34 197 94);
  --amber-500: rgb(245 158 11);
  --red-500: rgb(239 68 68);
  --red-600: rgb(220 38 38);
}

/* Dark Theme (Current Default) */
:root {
  /* Semantic Tokens - Backgrounds */
  --color-bg-primary: var(--gray-900);
  --color-bg-secondary: var(--gray-800);
  --color-bg-tertiary: var(--gray-700);
  --color-bg-hover: var(--gray-700);
  --color-bg-active: var(--gray-600);
  
  /* Semantic Tokens - Text */
  --color-text-primary: rgb(255 255 255);
  --color-text-secondary: var(--gray-100);
  --color-text-tertiary: var(--gray-300);
  --color-text-muted: var(--gray-400);
  --color-text-disabled: var(--gray-500);
  
  /* Semantic Tokens - Borders */
  --color-border-primary: var(--gray-700);
  --color-border-secondary: var(--gray-600);
  --color-border-hover: var(--gray-500);
  
  /* Semantic Tokens - Interactive */
  --color-interactive-primary: var(--blue-600);
  --color-interactive-hover: var(--blue-700);
  --color-interactive-active: var(--blue-500);
  --color-focus-ring: var(--blue-500);
  
  /* Semantic Tokens - Status */
  --color-status-success: var(--green-500);
  --color-status-warning: var(--amber-500);
  --color-status-error: var(--red-500);
  --color-status-info: var(--blue-500);
  --color-status-neutral: var(--gray-400);
  
  /* Component-Specific Tokens */
  --color-button-primary-bg: var(--color-interactive-primary);
  --color-button-primary-hover: var(--color-interactive-hover);
  --color-button-primary-text: rgb(255 255 255);
  
  --color-card-bg: var(--color-bg-secondary);
  --color-card-border: var(--color-border-primary);
  
  --color-input-bg: var(--color-bg-primary);
  --color-input-border: var(--color-border-primary);
  --color-input-focus: var(--color-focus-ring);
}
```

### Spacing Tokens

```css
:root {
  /* Spacing Scale */
  --space-0: 0;
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */
  
  /* Component Spacing */
  --button-padding-x: var(--space-4);
  --button-padding-y: var(--space-2);
  --card-padding: var(--space-4);
  --input-padding-x: var(--space-3);
  --input-padding-y: var(--space-2);
}
```

### Typography Tokens

```css
:root {
  /* Font Sizes */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  
  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  /* Line Heights */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
}
```

### Other Design Tokens

```css
:root {
  /* Border Radius */
  --radius-none: 0;
  --radius-sm: 0.125rem;
  --radius-default: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-default: 0 1px 3px 0 rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  
  /* Transitions */
  --transition-fast: 150ms;
  --transition-default: 200ms;
  --transition-slow: 300ms;
  
  /* Z-Index Scale */
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-modal: 30;
  --z-popover: 40;
  --z-tooltip: 50;
}
```

## Implementation Files

### 1. Create tokens.css

```css
/* frontend/src/styles/tokens.css */
@import './tokens/colors.css';
@import './tokens/spacing.css';
@import './tokens/typography.css';
@import './tokens/effects.css';
```

### 2. Update Tailwind Config

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Map to CSS variables
        'bg-primary': 'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        'bg-tertiary': 'var(--color-bg-tertiary)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'border-primary': 'var(--color-border-primary)',
        'interactive': 'var(--color-interactive-primary)',
        'status-success': 'var(--color-status-success)',
        'status-error': 'var(--color-status-error)',
        // ... etc
      },
      spacing: {
        'button-x': 'var(--button-padding-x)',
        'button-y': 'var(--button-padding-y)',
        // ... etc
      },
      borderRadius: {
        'button': 'var(--radius-md)',
        'card': 'var(--radius-lg)',
        'input': 'var(--radius-md)',
      },
    },
  },
}
```

### 3. Import in Main CSS

```css
/* frontend/src/index.css */
@import './styles/tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Migration Strategy

### Phase 1: Setup (Today)
1. ✅ Create token files structure
2. ✅ Define color tokens
3. ✅ Update Tailwind config
4. ✅ Test token usage

### Phase 2: Component Migration (This Week)
1. Update Button implementations
2. Update Card backgrounds
3. Update form elements
4. Update status indicators

### Phase 3: Cleanup (Next Week)
1. Remove hardcoded colors
2. Standardize spacing
3. Document token usage
4. Create token reference

## Usage Examples

### Before (Hardcoded)
```tsx
<button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md">
  Click me
</button>
```

### After (With Tokens)
```tsx
<button className="px-button-x py-button-y bg-interactive hover:bg-interactive-hover text-white rounded-button">
  Click me
</button>
```

### With Component
```tsx
<Button variant="primary">Click me</Button>
```

## Benefits

1. **Consistency**: Single source of truth for design decisions
2. **Maintainability**: Change once, update everywhere
3. **Flexibility**: Easy to create new themes
4. **Performance**: CSS variables are native and fast
5. **Developer Experience**: Semantic naming improves code clarity

## Testing Plan

1. Create test page with all token values displayed
2. Verify token inheritance works correctly
3. Test with browser dev tools token changes
4. Ensure no visual regressions
5. Check performance impact (minimal expected)

## Future Enhancements

1. **Theme Switching**: Re-enable light/dark mode toggle
2. **Custom Themes**: User-defined color schemes
3. **Contrast Modes**: High contrast accessibility option
4. **Brand Theming**: Easy brand color updates
5. **Component Themes**: Per-component token overrides

## Next Steps

1. Implement token files
2. Update Tailwind configuration
3. Create first component using tokens
4. Document token usage guidelines
5. Begin progressive migration
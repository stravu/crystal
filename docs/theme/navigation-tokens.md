# Navigation Surface Design Tokens

## Token Definitions

### 1. Surface Tokens

```css
/* Dark Theme */
:root {
  /* Navigation Surface - Distinct from main content */
  --color-surface-navigation: var(--gray-850);        /* Slightly darker than surface-primary */
  --color-surface-navigation-hover: var(--gray-750);  /* Subtle hover state */
  --color-surface-navigation-active: var(--gray-700); /* Pressed/active state */
  
  /* Navigation Item States */
  --color-surface-navigation-selected: var(--interactive/20);     /* Selected item background */
  --color-surface-navigation-selected-hover: var(--interactive/25); /* Selected + hover */
  
  /* Navigation Borders & Dividers */
  --color-border-navigation: var(--gray-700);         /* Main navigation border */
  --color-divider-navigation: var(--gray-750);        /* Section dividers */
  --color-divider-navigation-subtle: var(--gray-800); /* Subtle dividers between items */
}

/* Light Theme */
:root.light {
  /* Navigation Surface - Warm tinted for light mode */
  --color-surface-navigation: var(--warm-gray-50);    /* Slightly warmer than bg-primary */
  --color-surface-navigation-hover: var(--lilac-50);  /* Lilac tint on hover */
  --color-surface-navigation-active: var(--lilac-100); /* Deeper lilac when pressed */
  
  /* Navigation Item States */
  --color-surface-navigation-selected: var(--lilac-100);       /* Selected with brand color */
  --color-surface-navigation-selected-hover: var(--lilac-200); /* Selected + hover */
  
  /* Navigation Borders & Dividers */
  --color-border-navigation: var(--lilac-100);        /* Soft lilac border */
  --color-divider-navigation: var(--warm-gray-200);   /* Section dividers */
  --color-divider-navigation-subtle: var(--warm-gray-100); /* Subtle dividers */
}
```

### 2. Text Tokens for Navigation

```css
/* Dark Theme */
:root {
  /* Navigation Text Hierarchy */
  --color-text-navigation-primary: var(--gray-100);    /* Main navigation labels */
  --color-text-navigation-secondary: var(--gray-400);  /* Sublabels, counts */
  --color-text-navigation-muted: var(--gray-500);      /* Disabled items */
  --color-text-navigation-selected: var(--gray-50);    /* Selected item text */
  --color-text-navigation-hover: var(--gray-50);       /* Hover state text */
  
  /* Navigation Headers */
  --color-text-navigation-section: var(--gray-500);    /* Section headers */
  --color-text-navigation-brand: var(--gray-300);      /* Brand/logo text */
}

/* Light Theme */
:root.light {
  /* Navigation Text Hierarchy */
  --color-text-navigation-primary: var(--gray-700);    /* Main navigation labels */
  --color-text-navigation-secondary: var(--gray-500);  /* Sublabels, counts */
  --color-text-navigation-muted: var(--gray-400);      /* Disabled items */
  --color-text-navigation-selected: var(--lilac-700);  /* Selected with brand color */
  --color-text-navigation-hover: var(--gray-900);       /* Darker on hover */
  
  /* Navigation Headers */
  --color-text-navigation-section: var(--gray-500);    /* Section headers */
  --color-text-navigation-brand: var(--lilac-600);     /* Brand identity */
}
```

### 3. Interactive States

```css
/* Both Themes */
:root, :root.light {
  /* Focus States for Accessibility */
  --color-focus-navigation: var(--color-focus-ring);
  --color-focus-navigation-offset: 2px;
  
  /* Selection Ring */
  --color-ring-navigation-selected: var(--color-interactive);
  --color-ring-navigation-opacity: 0.3;
  
  /* Drag & Drop States */
  --color-surface-navigation-drag: var(--color-interactive/10);
  --color-border-navigation-drop: var(--color-interactive);
}
```

### 4. Tailwind/CSS Classes

```css
/* Utility Classes */
.bg-surface-navigation { background-color: var(--color-surface-navigation); }
.hover\:bg-surface-navigation-hover:hover { background-color: var(--color-surface-navigation-hover); }
.bg-surface-navigation-selected { background-color: var(--color-surface-navigation-selected); }

.text-navigation-primary { color: var(--color-text-navigation-primary); }
.text-navigation-secondary { color: var(--color-text-navigation-secondary); }
.text-navigation-selected { color: var(--color-text-navigation-selected); }

.border-navigation { border-color: var(--color-border-navigation); }
.divide-navigation > * + * { border-color: var(--color-divider-navigation); }
```

## Recommended Usage

### Sidebar Container
```tsx
<div className="bg-surface-navigation border-r border-navigation">
  {/* Sidebar content */}
</div>
```

### Navigation Items
```tsx
// Default state
<button className="text-navigation-primary hover:bg-surface-navigation-hover hover:text-navigation-hover">
  Project Name
</button>

// Selected state
<button className="bg-surface-navigation-selected text-navigation-selected ring-1 ring-ring-navigation-selected/30">
  Active Session
</button>

// With secondary text
<div className="hover:bg-surface-navigation-hover">
  <span className="text-navigation-primary">Session Name</span>
  <span className="text-navigation-secondary text-sm">2 files changed</span>
</div>
```

### Section Headers
```tsx
<h3 className="text-navigation-section text-xs font-medium uppercase tracking-wider px-3 py-2">
  Projects
</h3>
```

### Dividers
```tsx
// Section divider
<div className="border-t border-divider-navigation my-2" />

// Subtle item divider
<div className="divide-y divide-navigation-subtle">
  {items.map(item => ...)}
</div>
```

### Nested Navigation
```tsx
// Folder with children
<div className="ml-4 border-l border-divider-navigation-subtle pl-2">
  {children}
</div>
```

## Visual Hierarchy Principles

1. **Surface Hierarchy**:
   - Navigation surface is darker/warmer than main content (creates visual separation)
   - Less prominent than modals/dialogs (which use primary surfaces)
   - More prominent than disabled states

2. **Text Contrast**:
   - Primary text has sufficient contrast for readability
   - Selected text stands out without being jarring
   - Secondary text provides hierarchy without distraction

3. **Interactive Feedback**:
   - Hover states are subtle (5-10% lightness change)
   - Selected states use brand color with low opacity
   - Focus rings meet accessibility standards

4. **Semantic Meaning**:
   - `navigation` tokens are specifically for persistent nav areas
   - Different from `surface` tokens (for content areas)
   - Different from `bg` tokens (for page backgrounds)

## Implementation Example

```tsx
// Update Sidebar.tsx
<div className="bg-surface-navigation text-navigation-primary h-full flex flex-col pt-4 relative flex-shrink-0 border-r border-navigation">
  {/* Logo area */}
  <div className="px-4 pb-4 border-b border-divider-navigation">
    <h1 className="text-navigation-brand font-semibold">Crystal</h1>
  </div>
  
  {/* Navigation sections */}
  <div className="flex-1 overflow-y-auto divide-y divide-divider-navigation">
    {/* Projects section */}
    <div className="py-2">
      <h3 className="text-navigation-section text-xs font-medium uppercase tracking-wider px-3 py-2">
        Projects
      </h3>
      {/* Project items */}
    </div>
  </div>
</div>

// Update SessionListItem.tsx
<div className={cn(
  'w-full text-left rounded-md flex items-center space-x-2 transition-all group',
  isActive 
    ? 'bg-surface-navigation-selected text-navigation-selected shadow-sm ring-1 ring-ring-navigation-selected/30' 
    : 'hover:bg-surface-navigation-hover text-navigation-secondary hover:text-navigation-hover'
)}>
  {/* Item content */}
</div>
```

## Migration Path

1. Add token definitions to `/frontend/src/styles/tokens/colors.css`
2. Create Tailwind utilities in `tailwind.config.js`
3. Update Sidebar.tsx to use `bg-surface-navigation`
4. Update navigation items to use new hover/selected tokens
5. Replace hardcoded divider colors with semantic tokens
6. Test in both light and dark themes
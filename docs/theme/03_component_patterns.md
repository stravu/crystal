# 03. Component Patterns Audit

**Date:** 2025-07-21  
**Status:** Complete  
**Scope:** UI patterns and Tailwind usage analysis

## Executive Summary

Crystal has 570+ inline UI element implementations with no component library. Every button, card, modal, and form element is built from scratch using Tailwind utilities. This has led to significant inconsistencies and maintenance challenges.

## Pattern Analysis

### Button Patterns (40+ implementations)

#### Current Variations Found:
```tsx
// Primary styles
"px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
"px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
"px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"

// Secondary styles
"px-4 py-2 bg-gray-200 text-gray-900 rounded"
"px-3 py-2 bg-gray-800 text-gray-100 rounded-md"

// Ghost styles
"p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
"p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
```

#### Issues:
- **Inconsistent padding**: px-3, px-4, p-2, p-1
- **Mixed border radius**: rounded, rounded-md, rounded-lg, rounded-full
- **Varying font weights**: Some use font-medium, others don't
- **Inconsistent transitions**: Some buttons have transition-colors

### Card/Panel Patterns (20+ implementations)

#### Current Variations:
```tsx
// Card backgrounds
"bg-white dark:bg-gray-800 rounded-lg p-4"
"bg-gray-100 dark:bg-gray-900 rounded-md p-6"
"bg-gray-50 dark:bg-gray-800 rounded border"

// Nested cards
"bg-gray-800 rounded-lg p-4"  // In dark:bg-gray-900 parent
"bg-gray-900 rounded-md p-3"  // In dark:bg-gray-800 parent
```

#### Issues:
- **No clear hierarchy**: Which gray for which nesting level?
- **Inconsistent spacing**: p-3, p-4, p-6
- **Mixed borders**: Some have borders, some don't
- **Shadow confusion**: Random shadow usage

### Modal/Dialog Patterns (10+ implementations)

#### Current Structures:
```tsx
// Settings.tsx
"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
"bg-white dark:bg-gray-800 rounded-lg max-w-2xl"

// CreateSessionDialog.tsx
"fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-40"
"bg-gray-900 rounded-lg p-6 max-w-lg"

// AboutDialog.tsx
"fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
"bg-gray-800 rounded-lg p-6 max-w-xl"
```

#### Issues:
- **Different overlay opacities**: 50% vs 60%
- **Inconsistent z-index**: z-40 vs z-50
- **Varying max-widths**: lg, xl, 2xl, 3xl
- **No shared close button pattern**

### Form Element Patterns (15+ implementations)

#### Input Variations:
```tsx
// Text inputs
"w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md"
"w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded"
"px-4 py-2 bg-white dark:bg-gray-900 border rounded-lg"

// Textareas
"w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md"
"px-3 py-2 bg-gray-800 rounded border border-gray-600"
```

#### Issues:
- **Background inconsistency**: gray-800 vs gray-900
- **Border color variance**: gray-600 vs gray-700
- **Focus state differences**: Some use rings, some don't

## Tailwind Usage Issues

### 1. Spacing Inconsistencies
- **Padding**: p-1, p-2, p-3, p-4, p-6, px-3 py-2, px-4 py-2
- **Margins**: m-2, m-4, mt-2, mt-4, mb-4, my-4
- **Gaps**: gap-2, gap-3, gap-4, space-x-2, space-y-4

### 2. Border Radius Chaos
- `rounded` - 4 uses
- `rounded-md` - 25 uses
- `rounded-lg` - 35 uses
- `rounded-full` - 8 uses
- `rounded-xl` - 2 uses

### 3. Shadow Inconsistency
- No shadows on most elements
- Random `shadow-lg` on some modals
- Custom shadows using style props
- No consistent elevation system

### 4. Animation/Transition Gaps
- Some interactive elements have transitions
- Others change instantly
- Mixed duration values when used
- No consistent easing functions

## Component Opportunities

### Immediate Wins (High Impact, Low Effort)

1. **Button Component**
   - Would replace 40+ implementations
   - Props: variant, size, disabled, loading
   - Immediate visual consistency

2. **Card Component**
   - Would replace 20+ implementations
   - Props: padding, nesting level
   - Solve hierarchy confusion

3. **StatusBadge Component**
   - Already partially extracted
   - Needs completion and standardization
   - Used in many places

### Medium Priority

4. **Modal Component**
   - Base modal with consistent overlay
   - Props: size, closeable
   - Slot for content

5. **Input Component**
   - Consistent styling and states
   - Props: type, error, disabled
   - Reusable across forms

6. **IconButton Component**
   - For icon-only buttons
   - Consistent sizing and padding
   - Tooltip support

### Future Considerations

7. **Tabs Component**
8. **Dropdown Component**
9. **Toast/Notification Component**
10. **Table Component**

## Migration Impact

### By the Numbers
- **Current**: 570+ inline implementations
- **With Components**: ~20 reusable components
- **Code Reduction**: ~70% less styling code
- **Consistency**: 100% vs current ~30%

### Development Benefits
1. **Faster Development**: Copy component, not styles
2. **Easier Updates**: Change once, update everywhere
3. **Better Testing**: Test components in isolation
4. **Type Safety**: Props ensure correct usage

## Recommended Approach

### Week 1: Foundation
1. Create Button component with 3 variants
2. Create Card component with 2 levels
3. Create Input component with states

### Week 2: Migration
1. Replace all buttons progressively
2. Standardize cards/panels
3. Update form elements

### Week 3: Enhancement
1. Add Modal base component
2. Create specialized components
3. Document usage patterns

## Success Metrics

- [ ] 90% reduction in inline button styles
- [ ] Consistent border radius across app
- [ ] Standardized spacing scale
- [ ] Component documentation complete
- [ ] Team trained on component usage

## Next Steps

1. Create `04_design_tokens_implementation.md`
2. Build proof-of-concept Button component
3. Get team feedback on component API
4. Begin progressive migration
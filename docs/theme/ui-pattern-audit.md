# Crystal UI Pattern Audit

## Overview
This audit analyzes the Crystal codebase for UI patterns and Tailwind CSS usage inconsistencies across 49 React components in the frontend directory.

## 1. Button Patterns

### Common Button Styles Found

#### Primary Buttons
- **Blue Primary**: `bg-blue-600 hover:bg-blue-700 text-white`
  - Used in: CreateSessionButton, various dialogs
  - Example: "New Session" button

#### Secondary/Ghost Buttons
- **Gray Secondary**: `bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`
  - Used in: Settings, ProjectSettings
  - Example: "Browse" buttons

#### Icon Buttons
- **Icon Only**: `text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300`
  - Used in: Close buttons in dialogs
  - Example: X close buttons

#### Danger Buttons
- **Red Danger**: `bg-red-600 hover:bg-red-700 text-white`
  - Used in: Delete confirmations
  
#### Success Buttons
- **Green Success**: `bg-green-600 hover:bg-green-700 text-white`
  - Used in: GitErrorDialog

### Inconsistencies
1. **Border Radius**: Mix of `rounded-md`, `rounded-lg`, `rounded-full`
2. **Padding**: Varies between `px-4 py-2`, `px-3 py-1.5`, `px-3 py-2`
3. **Font Weight**: Some use `font-medium`, others `font-semibold`, many none
4. **Transition**: Some buttons have `transition-colors`, others don't
5. **Focus States**: Inconsistent focus rings

## 2. Card/Panel Patterns

### Common Card Styles

#### Standard Card
```css
bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700
```
- Used in: Settings, ProjectSettings, dialogs

#### Nested/Secondary Card
```css
bg-gray-100 dark:bg-gray-900 rounded-md border border-gray-300 dark:border-gray-700
```
- Used in: Form sections, code blocks

### Inconsistencies
1. **Border Radius**: Mix of `rounded-lg`, `rounded-md`, `rounded`
2. **Shadow**: Some cards have shadows, others don't
3. **Padding**: Varies from `p-4` to `p-6`

## 3. Modal/Dialog Patterns

### Standard Dialog Structure
```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
    {/* Header */}
    {/* Content */}
    {/* Footer */}
  </div>
</div>
```

### Inconsistencies
1. **Max Width**: Varies between `max-w-lg`, `max-w-xl`, `max-w-2xl`, `max-w-3xl`
2. **Overlay Opacity**: Some use `bg-opacity-50`, others `bg-opacity-60`
3. **Z-index**: Mostly `z-50` but some variations

## 4. Form Element Patterns

### Input Fields
```css
w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500
```

### Textareas
Similar to inputs but with `resize-none` or custom resize behavior

### Checkboxes
```css
rounded border-gray-300 text-blue-600 focus:ring-blue-500
```

### Inconsistencies
1. **Background**: Some use `dark:bg-gray-900`, others `dark:bg-gray-800`
2. **Focus States**: Mix of `focus:border-blue-500` and `focus:ring-2`

## 5. Layout Patterns

### Common Layouts
- **Flex Column**: `flex flex-col`
- **Grid**: Limited grid usage, mostly flex
- **Spacing**: `space-y-4`, `space-x-2` commonly used

### Inconsistencies
1. **Gap vs Space**: Mix of `gap-` utilities and `space-` utilities
2. **Container Width**: Inconsistent max-width constraints

## 6. Spacing Patterns

### Common Spacing
- **Padding**: `p-4`, `p-6`, `px-4 py-2`, `px-3 py-2`
- **Margin**: `mb-4`, `mt-2`, `my-4`
- **Gap**: `gap-2`, `gap-4`, `space-x-2`, `space-y-4`

### Inconsistencies
1. No consistent spacing scale
2. Mix of padding values for similar components

## 7. Border Radius Values

### Found Values
- `rounded` (0.25rem)
- `rounded-md` (0.375rem)
- `rounded-lg` (0.5rem)
- `rounded-full` (9999px)

### Usage
- Buttons: Mix of all values
- Cards: Mostly `rounded-lg`
- Inputs: Mostly `rounded-md`

## 8. Shadow Patterns

### Common Shadows
- Cards: Often no shadow, sometimes `shadow-lg`
- Dropdowns: `shadow-lg`
- Modals: No shadow (uses overlay)

### Inconsistencies
1. Inconsistent shadow usage on similar components
2. No standardized elevation system

## 9. Animation/Transition Patterns

### Common Transitions
- `transition-colors` - For hover states
- `transition-all` - For general transitions
- `transition-transform` - For transforms
- `duration-200` - Common duration

### Animations
- Limited custom animations
- Status indicators use custom pulse animations

## Recommendations

### 1. Create Reusable Button Component
```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  size: 'sm' | 'md' | 'lg';
  // ... other props
}
```

### 2. Standardize Card Component
```tsx
interface CardProps {
  variant: 'default' | 'nested';
  padding: 'sm' | 'md' | 'lg';
  // ... other props
}
```

### 3. Create Modal Component
```tsx
interface ModalProps {
  size: 'sm' | 'md' | 'lg' | 'xl';
  // ... other props
}
```

### 4. Design System Constants
```tsx
const spacing = {
  xs: '0.5rem',  // 8px
  sm: '1rem',    // 16px
  md: '1.5rem',  // 24px
  lg: '2rem',    // 32px
  xl: '3rem',    // 48px
};

const borderRadius = {
  sm: '0.25rem',   // rounded
  md: '0.375rem',  // rounded-md
  lg: '0.5rem',    // rounded-lg
  full: '9999px',  // rounded-full
};
```

### 5. Standardize Dark Mode Patterns
- Background: `bg-white dark:bg-gray-800` (primary)
- Nested: `bg-gray-100 dark:bg-gray-900`
- Borders: `border-gray-200 dark:border-gray-700`
- Text: `text-gray-900 dark:text-gray-100`

### 6. Focus State Standardization
- Use consistent focus rings: `focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`

### 7. Transition Standardization
- Default: `transition-colors duration-200`
- Complex: `transition-all duration-200`

## Components Needing Most Attention

1. **Button implementations** - 40+ different button styles found
2. **Dialog/Modal components** - Each has unique implementation
3. **Form inputs** - Inconsistent styling and focus states
4. **Card/Panel components** - Mix of border radius and padding

## Quick Wins

1. Create a `Button` component to replace all button implementations
2. Create a `Card` component for consistent containers
3. Create a `Dialog` component for modals
4. Standardize spacing scale across all components
5. Create form component library (Input, Textarea, Select, Checkbox)
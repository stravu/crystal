# Detailed UI Inconsistencies in Crystal

## Button Inconsistencies

### 1. Primary Action Buttons

**CreateSessionButton.tsx**
```tsx
className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
```

**Settings.tsx - Save Button**
```tsx
className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
```

**GitErrorDialog.tsx**
```tsx
className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center space-x-2"
```

**Issues:**
- Inconsistent use of `font-medium`
- Inconsistent use of `transition-colors`
- Different padding values

### 2. Tab Buttons

**Settings.tsx**
```tsx
className={`px-4 py-2 text-sm font-medium ${
  activeTab === 'general'
    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
}`}
```

**SessionView (ViewTabs)**
```tsx
className={`px-3 py-1.5 text-sm font-medium rounded-t-lg ${
  activeView === 'output'
    ? 'bg-gray-800 text-white'
    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
}`}
```

**Issues:**
- Different padding values (`px-4 py-2` vs `px-3 py-1.5`)
- Different active state styling approach

### 3. Icon Buttons

**Various Close Buttons**
```tsx
// Settings.tsx
className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300"

// GitErrorDialog.tsx
className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"

// ProjectSettings.tsx
className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
```

**Issues:**
- Inconsistent hover colors (`dark:hover:text-gray-300` vs `dark:hover:text-gray-200`)
- Inconsistent use of `transition-colors`

## Dialog/Modal Inconsistencies

### 1. Overlay Styles

**Settings.tsx**
```tsx
className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
```

**CreateSessionDialog.tsx**
```tsx
className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
```

**PermissionDialog.tsx**
```tsx
className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
```

**Issues:**
- Different opacity values (`bg-opacity-50` vs `bg-opacity-60`)

### 2. Dialog Container Styles

**Settings.tsx**
```tsx
className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700"
```

**ProjectSettings.tsx**
```tsx
className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700"
```

**CreateSessionDialog.tsx**
```tsx
className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
```

**Issues:**
- Inconsistent max-width values
- Some have `shadow-xl`, others have borders
- Order of classes varies

## Form Input Inconsistencies

### 1. Text Input Styles

**Settings.tsx**
```tsx
className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500"
```

**ProjectSettings.tsx**
```tsx
className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:border-blue-500"
```

**CreateSessionDialog.tsx**
```tsx
className="flex-1 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md"
```

**Issues:**
- Inconsistent inclusion of text color classes
- Inconsistent focus states

### 2. Textarea Styles

**SessionInput.tsx**
```tsx
className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-200 focus:outline-none focus:border-blue-500 resize-none"
```

**CreateSessionDialog.tsx**
```tsx
className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200"
```

**Issues:**
- Different background colors
- Inconsistent resize behavior

## Card/Panel Inconsistencies

### 1. Main Content Cards

**ProjectDashboard.tsx - Error State**
```tsx
className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg"
```

**StatusSummaryCards.tsx**
```tsx
className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
```

**Session Cards**
```tsx
className="bg-gray-100 dark:bg-gray-900 rounded-md p-4"
```

**Issues:**
- Different border radius (`rounded-lg` vs `rounded-md`)
- Inconsistent shadow usage
- Different padding values

## Spacing Inconsistencies

### 1. Button Groups

**GitErrorDialog.tsx**
```tsx
<div className="flex justify-end space-x-2">
```

**Settings.tsx**
```tsx
<div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
```

**Issues:**
- Mix of `space-x-2` and `gap-3` for similar layouts
- Inconsistent spacing values

### 2. Form Field Spacing

**Settings.tsx**
```tsx
<div className="space-y-4">
```

**ProjectSettings.tsx**
```tsx
<div className="space-y-6">
```

**Issues:**
- Different vertical spacing for form sections

## Color Inconsistencies

### 1. Success States

```tsx
// Different shades of green
"text-green-500"
"text-green-600 dark:text-green-400"
"text-green-700 dark:text-green-400"
"bg-green-600 hover:bg-green-700"
"bg-green-50 dark:bg-green-900/20"
```

### 2. Error States

```tsx
// Different shades of red
"text-red-500"
"text-red-600 dark:text-red-400"
"text-red-700 dark:text-red-400"
"bg-red-100 dark:bg-red-900/20"
"bg-red-50 dark:bg-red-900/20"
```

## Animation/Transition Inconsistencies

### 1. Hover Transitions

```tsx
// Some buttons
"transition-colors"

// Others
"transition-all"

// Many have none
```

### 2. Duration Values

```tsx
"duration-200"
"duration-300"
// Many unspecified
```

## Recommendations for Standardization

### 1. Create a Theme Configuration

```tsx
const theme = {
  colors: {
    primary: {
      DEFAULT: 'blue-600',
      hover: 'blue-700',
      text: 'blue-600 dark:blue-400'
    },
    success: {
      DEFAULT: 'green-600',
      hover: 'green-700',
      text: 'green-600 dark:green-400'
    },
    danger: {
      DEFAULT: 'red-600',
      hover: 'red-700',
      text: 'red-600 dark:red-400'
    }
  },
  spacing: {
    button: 'px-4 py-2',
    buttonSm: 'px-3 py-1.5',
    input: 'px-3 py-2',
    card: 'p-6',
    cardSm: 'p-4'
  },
  borderRadius: {
    button: 'rounded-md',
    card: 'rounded-lg',
    input: 'rounded-md'
  }
};
```

### 2. Component Classes

```tsx
// Standardized button classes
const buttonClasses = {
  base: 'font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2',
  primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
  secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
  danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500'
};

// Standardized input classes
const inputClasses = 'w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

// Standardized card classes
const cardClasses = {
  base: 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700',
  nested: 'bg-gray-100 dark:bg-gray-900 rounded-md border border-gray-300 dark:border-gray-700'
};
```

### 3. Priority Components to Refactor

1. **Button** - Used in 40+ places with inconsistent styles
2. **Card** - Used in 20+ places with varying styles
3. **Modal** - 10+ implementations with different structures
4. **FormInput** - 15+ places with similar but inconsistent styles
5. **FormTextarea** - 5+ places needing standardization
# Select Component

## Overview
Created a custom Select component using Radix UI's Select primitive with Crystal's design tokens for consistent styling.

## Component Structure
- **SelectTrigger**: The clickable element that shows the current value
- **SelectContent**: The dropdown container with options
- **SelectItem**: Individual selectable options
- **SelectGroup**: Groups of related options
- **SelectLabel**: Labels for option groups
- **SelectSeparator**: Visual separator between groups

## Design Token Usage
- `--color-bg-primary`: Trigger background
- `--color-border-subtle`: Default border
- `--color-border-interactive-subtle`: Hover border  
- `--color-surface-primary`: Dropdown background
- `--color-surface-secondary`: Item hover background
- `--color-focus-ring-subtle`: Focus ring color
- `--color-interactive`: Selected item checkmark
- `--shadow-lg`: Dropdown elevation

## Features
- Full keyboard navigation support
- Accessible with ARIA attributes
- Smooth animations on open/close
- Support for grouped options
- Custom content in options (icons, status indicators)
- Disabled state support
- Focus management

## Usage Example
```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select an option" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

## Integration with Forms
The Select component works seamlessly with form libraries and can be controlled or uncontrolled. It provides proper value management and change events for form integration.
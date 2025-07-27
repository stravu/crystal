# Proposed Component Library for Crystal

## Overview

This document outlines a proposed component library to standardize UI patterns across the Crystal application. The library would replace the 570+ instances of inline Tailwind classes with consistent, reusable components.

## Core Design Principles

1. **Consistency**: All components follow the same patterns
2. **Dark Mode First**: Built with dark mode as the primary theme
3. **Accessibility**: WCAG 2.1 AA compliant
4. **Performance**: Minimal runtime overhead
5. **Developer Experience**: Easy to use and extend

## Component Structure

### 1. Button Component

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  fullWidth?: boolean;
}

// Usage examples:
<Button variant="primary" size="md">Create Session</Button>
<Button variant="danger" size="sm" icon={<Trash2 />}>Delete</Button>
<Button variant="ghost" icon={<X />} iconPosition="right">Close</Button>
```

### 2. Card Component

```tsx
interface CardProps {
  variant?: 'default' | 'nested' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

// Usage examples:
<Card variant="default" padding="md">
  <CardHeader>
    <CardTitle>Project Settings</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Form content */}
  </CardContent>
</Card>
```

### 3. Modal/Dialog Component

```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  title?: string;
  showCloseButton?: boolean;
  overlayClosable?: boolean;
  children: React.ReactNode;
}

// Usage example:
<Modal isOpen={isOpen} onClose={handleClose} size="lg" title="Create New Session">
  <ModalBody>
    {/* Modal content */}
  </ModalBody>
  <ModalFooter>
    <Button variant="secondary" onClick={handleClose}>Cancel</Button>
    <Button variant="primary" onClick={handleSubmit}>Create</Button>
  </ModalFooter>
</Modal>
```

### 4. Form Components

```tsx
// Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
}

// Textarea Component
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  autoResize?: boolean;
}

// Select Component
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
}

// Checkbox Component
interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

// Usage examples:
<Input
  label="Project Name"
  placeholder="My Awesome Project"
  error={errors.name}
  hint="Choose a descriptive name"
/>

<Textarea
  label="System Prompt"
  autoResize
  hint="Additional instructions for Claude"
/>

<Select
  label="Model"
  options={[
    { value: 'claude-3-opus', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' }
  ]}
/>

<Checkbox
  label="Enable verbose logging"
  hint="Shows detailed logs for debugging"
/>
```

### 5. Layout Components

```tsx
// Stack Component (vertical spacing)
interface StackProps {
  spacing?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

// Inline Component (horizontal spacing)
interface InlineProps {
  spacing?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: 'start' | 'center' | 'end' | 'between' | 'around';
  children: React.ReactNode;
}

// Grid Component
interface GridProps {
  cols?: 1 | 2 | 3 | 4 | 6 | 12;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}
```

### 6. Typography Components

```tsx
interface HeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
  className?: string;
}

interface TextProps {
  variant?: 'body' | 'small' | 'caption' | 'code';
  color?: 'default' | 'muted' | 'success' | 'error' | 'warning';
  children: React.ReactNode;
}

// Usage:
<Heading level={2}>Project Settings</Heading>
<Text variant="small" color="muted">Last updated 5 minutes ago</Text>
```

### 7. Status/Feedback Components

```tsx
// Badge Component
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
}

// Alert Component
interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
}

// Spinner Component
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'white';
}

// Progress Component
interface ProgressProps {
  value: number;
  max?: number;
  variant?: 'primary' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
}
```

### 8. Navigation Components

```tsx
// Tabs Component
interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}

interface TabProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

// Usage:
<Tabs value={activeTab} onChange={setActiveTab}>
  <Tab value="general" label="General" />
  <Tab value="notifications" label="Notifications" icon={<Bell />} />
  <Tab value="advanced" label="Advanced" />
</Tabs>
```

## Theme System

### Color Palette

```tsx
const colors = {
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  blue: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  // ... other colors
};
```

### Spacing Scale

```tsx
const spacing = {
  xs: '0.5rem',   // 8px
  sm: '1rem',     // 16px
  md: '1.5rem',   // 24px
  lg: '2rem',     // 32px
  xl: '3rem',     // 48px
  '2xl': '4rem', // 64px
};
```

### Typography Scale

```tsx
const typography = {
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};
```

## Implementation Plan

### Phase 1: Core Components (Week 1)
1. Button
2. Card
3. Modal
4. Input, Textarea, Select, Checkbox

### Phase 2: Layout & Typography (Week 2)
1. Stack, Inline, Grid
2. Heading, Text
3. Container, Divider

### Phase 3: Feedback & Navigation (Week 3)
1. Badge, Alert, Spinner, Progress
2. Tabs, Breadcrumb
3. Tooltip, Popover

### Phase 4: Migration (Week 4-6)
1. Replace existing implementations
2. Update documentation
3. Add Storybook for component documentation

## Benefits

1. **Consistency**: 570+ inline styles reduced to ~20 components
2. **Maintainability**: Changes in one place affect all instances
3. **Performance**: Smaller bundle size with shared classes
4. **Developer Experience**: Faster development with pre-built components
5. **Design System**: Foundation for future design improvements

## Example Migration

### Before:
```tsx
<button
  onClick={handleClick}
  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
>
  Create Session
</button>
```

### After:
```tsx
<Button onClick={handleClick} variant="primary">
  Create Session
</Button>
```

This standardization would significantly improve code quality, reduce bugs, and make the application easier to maintain and extend.
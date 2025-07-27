# Switch Component OFF State Improvements

## Changes Made to Improve Visual Affordance

### 1. **Track Background & Border (OFF State)**
```css
/* Previous: No visible background or border */
/* Updated: */
data-[state=unchecked]:bg-surface-interactive        /* gray-800 background */
data-[state=unchecked]:border                        /* visible border */
data-[state=unchecked]:border-border-interactive-subtle  /* gray-700 border */
```

### 2. **Hover States**
```css
/* OFF state hover */
data-[state=unchecked]:hover:bg-surface-interactive-hover  /* gray-700 on hover */
data-[state=unchecked]:hover:border-border-interactive     /* gray-600 border on hover */

/* ON state hover */
data-[state=checked]:hover:bg-interactive-hover           /* blue-700 on hover */
```

### 3. **Depth & Shadow**
```css
/* Track */
shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]  /* Subtle inset shadow for depth */

/* Thumb */
shadow-md                                   /* Default shadow on thumb */
group-hover:shadow-lg                      /* Elevated shadow on hover */
```

### 4. **Thumb Improvements**
```css
/* OFF state thumb */
data-[state=unchecked]:bg-white
data-[state=unchecked]:border              /* Added border for definition */
data-[state=unchecked]:border-gray-200     /* Light border color */

/* ON state thumb */
data-[state=checked]:bg-white
data-[state=checked]:shadow-lg             /* Stronger shadow when ON */
```

### 5. **Label & Icon States**
```css
/* Label text */
props.checked ? 'text-text-primary' : 'text-text-muted'  /* Muted when OFF */
hover:text-text-secondary                                 /* Hover feedback */

/* Icon color */
props.checked ? 'text-interactive-on-dark' : 'text-text-muted'  /* Muted icon when OFF */
```

## Visual Improvements Summary

1. **OFF State Now Has Structure**: The gray-800 background with gray-700 border makes the switch clearly visible and interactive
2. **Better Hover Feedback**: Both track and thumb respond to hover with color and shadow changes
3. **Clear State Differentiation**: OFF uses neutral grays, ON uses interactive blue
4. **Improved Contrast**: The white thumb now has proper contrast against both OFF and ON backgrounds
5. **Consistent Affordance**: The switch now looks clickable in both states

## Design Token Usage

- `--color-surface-interactive` (gray-800): OFF state background
- `--color-surface-interactive-hover` (gray-700): OFF state hover
- `--color-border-interactive-subtle` (gray-700): OFF state border
- `--color-border-interactive` (gray-600): OFF state hover border
- `--color-interactive` (blue-600): ON state background
- `--color-interactive-hover` (blue-700): ON state hover
- `--color-text-muted` (gray-400): OFF state text/icon color
- `--color-text-primary`: ON state text color
- `--color-interactive-on-dark` (blue-500): ON state icon color
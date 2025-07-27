# Context-Aware Text Tokens

## Overview
Added context-aware text tokens that automatically provide the correct text color based on the background color they're placed on. This ensures proper contrast and readability across all UI surfaces.

## Token List

### Dark Mode (Default)
- `--color-text-on-primary`: White text on dark backgrounds
- `--color-text-on-secondary`: Light gray text on secondary backgrounds  
- `--color-text-on-tertiary`: Lighter gray text on tertiary backgrounds
- `--color-text-on-surface`: Light text on surface backgrounds
- `--color-text-on-interactive`: White text on interactive (blue) backgrounds
- `--color-text-on-status-success`: White text on success (green) backgrounds
- `--color-text-on-status-warning`: Black text on warning (amber) backgrounds
- `--color-text-on-status-error`: White text on error (red) backgrounds
- `--color-text-on-status-info`: White text on info (blue) backgrounds
- `--color-text-on-navigation`: Light text on navigation backgrounds

### Light Mode
- `--color-text-on-primary`: Dark gray text on light backgrounds
- `--color-text-on-secondary`: Darker gray text on secondary backgrounds
- `--color-text-on-tertiary`: Medium gray text on tertiary backgrounds
- `--color-text-on-surface`: Dark text on surface backgrounds
- `--color-text-on-interactive`: White text on interactive (lilac) backgrounds
- `--color-text-on-status-success`: White text on success backgrounds
- `--color-text-on-status-warning`: White text on warning backgrounds
- `--color-text-on-status-error`: White text on error backgrounds
- `--color-text-on-status-info`: White text on info backgrounds
- `--color-text-on-navigation`: Dark text on light navigation

## Usage

### Tailwind Classes
```html
<!-- Text on primary background -->
<div class="bg-bg-primary text-on-primary">
  This text will automatically be white in dark mode, dark in light mode
</div>

<!-- Text on interactive background -->
<button class="bg-interactive text-on-interactive">
  Always white text on blue/lilac background
</button>

<!-- Text on status backgrounds -->
<div class="bg-status-success text-on-status-success">Success message</div>
<div class="bg-status-warning text-on-status-warning">Warning message</div>
<div class="bg-status-error text-on-status-error">Error message</div>
```

### Direct CSS Usage
```css
.my-component {
  background: var(--color-bg-primary);
  color: var(--color-text-on-primary);
}
```

## Benefits
1. **Automatic Contrast**: No need to manually pick text colors for different backgrounds
2. **Theme Consistency**: Text colors automatically adjust between light and dark modes
3. **Accessibility**: Ensures proper contrast ratios are maintained
4. **Developer Experience**: Reduces decision fatigue when choosing text colors

## Migration Guide
When updating existing components:
1. Identify the background color being used
2. Replace hardcoded text colors with the appropriate `text-on-*` class
3. Test in both light and dark modes to ensure proper contrast
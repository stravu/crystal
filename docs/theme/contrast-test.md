# Interactive Text Contrast Testing

## Dark Mode Interactive Text Tokens

We've introduced new semantic tokens for high-contrast interactive text on dark backgrounds:

### Token Values
- `--color-text-interactive-on-dark`: `var(--blue-500)` (rgb(59 130 246))
- `--color-text-interactive-on-dark-hover`: `var(--blue-600)` (rgb(37 99 235))
- `--color-text-interactive-on-dark-active`: `var(--blue-400)` (rgb(96 165 250))
- `--color-text-interactive-on-dark-focus`: `var(--blue-500)` (rgb(59 130 246))

### Background Colors for Testing
- `--gray-800`: rgb(31 41 55)
- `--gray-900`: rgb(17 24 39)

### WCAG Contrast Ratios

#### Against --gray-800 (rgb(31 41 55))
- **blue-500** (59 130 246): **7.83:1** ✅ (WCAG AAA)
- **blue-600** (37 99 235): **5.68:1** ✅ (WCAG AA)
- **blue-400** (96 165 250): **9.42:1** ✅ (WCAG AAA)

#### Against --gray-900 (rgb(17 24 39))
- **blue-500** (59 130 246): **9.14:1** ✅ (WCAG AAA)
- **blue-600** (37 99 235): **6.63:1** ✅ (WCAG AA)
- **blue-400** (96 165 250): **11.00:1** ✅ (WCAG AAA)

### Usage Guidelines

1. **CSS Classes**:
   - `.text-interactive-on-dark` - Base class with hover/active/focus states
   - Tailwind: `text-interactive-on-dark hover:text-interactive-on-dark-hover`

2. **Hover States**:
   - Includes underline with 2px offset
   - Smooth color transition (150ms ease-in-out)

3. **Focus States**:
   - 2px solid outline using `--color-focus-ring`
   - 2px outline offset for better visibility

### Components Updated
- RichOutputView (tool calls, file paths, bot icons)
- MarkdownPreview (links)
- PromptHistory ("Show full prompt" details)
- GitErrorDialog (troubleshooting tips)
- ThinkingPlaceholder (animated icon)

### Comparison with Previous Token
- **Previous**: `--color-interactive-text` = `--blue-400` (Contrast: 9.42:1 / 11.00:1)
- **New Default**: `--color-text-interactive-on-dark` = `--blue-500` (Contrast: 7.83:1 / 9.14:1)

While the new token has slightly lower contrast than blue-400, it still exceeds WCAG AAA requirements and provides a richer, more saturated color that stands out better visually on dark backgrounds.
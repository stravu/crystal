# Extended Thinking Toggle - Dark Mode UX Case Study

## Current Implementation Analysis

The "Extended Thinking" control currently uses a `TogglePill` component with:
- Pill-shaped button with rounded corners
- Checkbox-like circular indicator (filled when on, empty when off)
- Text label "Extended Thinking"
- CPU icon inside the indicator when checked
- Blue focus ring on all focus (not just keyboard)
- Scale transform on hover/active

### Current Dark Mode Issues

1. **Poor Idle State Affordance**
   - When unchecked: `bg-surface-tertiary` (gray-700) with `text-text-secondary` 
   - Looks like static text, not an interactive control
   - No visual cue that it's clickable

2. **Weak Hover State**
   - Only changes to `bg-surface-hover` (also gray-700)
   - Scale transform helps but is subtle
   - No cursor change indicated in code

3. **Focus Ring Always Visible**
   - Uses `:focus` instead of `:focus-visible`
   - Shows ring on mouse clicks (annoying)
   - Ring offset creates visual jump

4. **Inconsistent Active State**
   - When checked, uses `bg-interactive/10` (blue with 10% opacity)
   - Very subtle difference from unchecked state
   - Border only appears when active AND not default variant

## 1. Component Pattern Assessment

### Is a Pill Toggle the Right Pattern?

**Pros of Pill Toggle:**
- Compact and space-efficient
- Fits well with other pills in the toolbar
- Familiar pattern from mobile UIs
- Good for binary on/off states

**Cons of Current Implementation:**
- Doesn't clearly communicate toggle state
- Checkbox indicator is too small (3.5 rem = 14px)
- Looks too similar to non-interactive pills

### Alternative Patterns Considered

1. **Switch/Toggle Component** ✅ (Recommended)
   - Clear on/off state with position
   - Better accessibility (ARIA switch role)
   - Industry standard for binary settings
   - Can include icons/labels

2. **Segmented Control**
   - Good for 2-3 mutually exclusive options
   - Takes more space
   - Overkill for binary state

3. **Checkbox**
   - Clear but feels too form-like
   - Doesn't match the toolbar aesthetic

4. **Icon Button with State**
   - Could work but less discoverable
   - Harder to show state clearly

## 2. Refined Pill Toggle Design (If Keeping Pills)

If we keep the pill pattern, here's how to improve it:

### Visual States

```css
/* Idle (Off) State */
.toggle-pill {
  background: var(--color-surface-interactive); /* New token: gray-800 with hint of blue */
  color: var(--color-text-interactive-muted);   /* New token: gray-400 */
  border: 1px solid var(--color-border-interactive-subtle); /* New token: gray-700 */
  cursor: pointer;
}

/* Hover (Off) State */
.toggle-pill:hover {
  background: var(--color-surface-interactive-hover); /* New token: gray-700 */
  color: var(--color-text-interactive);
  border-color: var(--color-border-interactive);
  transform: translateY(-1px); /* Subtle lift */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* Active (On) State */
.toggle-pill[data-state="on"] {
  background: var(--color-interactive-surface); /* New token: blue-600/20 */
  color: var(--color-interactive-on-dark);
  border-color: var(--color-interactive-border); /* New token: blue-500/50 */
}

/* Hover (On) State */
.toggle-pill[data-state="on"]:hover {
  background: var(--color-interactive-surface-hover); /* New token: blue-600/30 */
  border-color: var(--color-interactive-border-hover); /* New token: blue-500/70 */
}

/* Focus State - Keyboard Only */
.toggle-pill:focus-visible {
  outline: 2px solid var(--color-focus-ring-subtle); /* New token: blue-400/50 */
  outline-offset: 2px;
}

/* Pressed State */
.toggle-pill:active {
  transform: scale(0.98);
  transition: transform 50ms ease-out;
}
```

### Improved Indicator Design

```css
/* Larger, clearer indicator */
.toggle-indicator {
  width: 1rem;  /* 16px instead of 14px */
  height: 1rem;
  border-radius: 0.25rem; /* Rounded square instead of circle */
  background: var(--color-surface-secondary);
  border: 2px solid var(--color-border-secondary);
  transition: all 200ms ease-out;
}

/* On state - filled with check icon */
.toggle-pill[data-state="on"] .toggle-indicator {
  background: var(--color-interactive);
  border-color: var(--color-interactive);
}

/* Icon inside indicator */
.toggle-indicator svg {
  width: 0.75rem;
  height: 0.75rem;
  color: white;
  opacity: 0;
  transform: scale(0.5);
  transition: all 200ms ease-out;
}

.toggle-pill[data-state="on"] .toggle-indicator svg {
  opacity: 1;
  transform: scale(1);
}
```

## 3. Recommended Switch Component Design

A better approach would be a proper switch component:

### Switch Component Structure

```tsx
<Switch
  id="extended-thinking"
  checked={ultrathink}
  onCheckedChange={setUltrathink}
  size="sm"
  className="ml-2"
>
  <Cpu className="w-3 h-3" />
  <span>Extended Thinking</span>
</Switch>
```

### Switch Visual Design

```css
/* Switch Track */
.switch-track {
  width: 2.25rem; /* 36px */
  height: 1.25rem; /* 20px */
  background: var(--color-surface-interactive);
  border: 1px solid var(--color-border-interactive-subtle);
  border-radius: 9999px;
  position: relative;
  cursor: pointer;
  transition: all 200ms ease-out;
}

/* Switch Thumb */
.switch-thumb {
  width: 1rem; /* 16px */
  height: 1rem;
  background: var(--color-surface-primary);
  border-radius: 9999px;
  position: absolute;
  top: 1px;
  left: 1px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: all 200ms ease-out;
}

/* On State */
.switch[data-state="on"] .switch-track {
  background: var(--color-interactive);
  border-color: var(--color-interactive-dark);
}

.switch[data-state="on"] .switch-thumb {
  transform: translateX(1rem);
  background: white;
}

/* Hover States */
.switch:hover .switch-track {
  background: var(--color-surface-interactive-hover);
  border-color: var(--color-border-interactive);
}

.switch[data-state="on"]:hover .switch-track {
  background: var(--color-interactive-hover);
}

/* Focus State */
.switch:focus-visible .switch-track {
  outline: 2px solid var(--color-focus-ring-subtle);
  outline-offset: 2px;
}

/* Label */
.switch-label {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  transition: color 150ms ease-out;
}

.switch[data-state="on"] .switch-label {
  color: var(--color-text-primary);
}
```

## 4. New Semantic Tokens Needed

### For Improved Pill Toggle:
```css
/* Interactive surface tokens */
--color-surface-interactive: var(--gray-800); /* Slightly different from surface-primary */
--color-surface-interactive-hover: var(--gray-700);
--color-interactive-surface: rgba(var(--color-interactive-rgb), 0.2);
--color-interactive-surface-hover: rgba(var(--color-interactive-rgb), 0.3);

/* Interactive border tokens */
--color-border-interactive-subtle: var(--gray-700);
--color-border-interactive: var(--gray-600);
--color-interactive-border: rgba(var(--color-interactive-rgb), 0.5);
--color-interactive-border-hover: rgba(var(--color-interactive-rgb), 0.7);

/* Interactive text tokens */
--color-text-interactive-muted: var(--gray-400);

/* Focus ring variations */
--color-focus-ring-subtle: rgba(var(--color-interactive-rgb), 0.5);
```

### For Switch Component:
```css
/* Switch-specific tokens */
--color-switch-track-off: var(--gray-750);
--color-switch-track-on: var(--blue-600);
--color-switch-thumb: var(--gray-100);
--color-switch-thumb-on: white;
--color-interactive-dark: var(--blue-700); /* Darker shade for borders */
```

## 5. Accessibility Improvements

### For Pill Toggle:
- Use `role="switch"` and `aria-checked`
- Add `aria-label` for screen readers
- Implement `:focus-visible` instead of `:focus`
- Ensure 3:1 contrast ratio for borders

### For Switch:
- Native switch semantics
- Keyboard support (Space/Enter)
- Clear visual focus indicator
- Associated label for larger click target

## 6. Implementation Recommendations

### Short Term (Keep Pills):
1. Add new surface and border tokens for better idle state
2. Implement `:focus-visible` for keyboard-only focus
3. Increase indicator size to 16px
4. Add subtle elevation on hover
5. Improve color contrast between states

### Long Term (Switch to Switch):
1. Create a proper Switch component
2. Use for all binary toggles (Extended Thinking, Auto-commit, etc.)
3. Keep pills for actions and filters only
4. Establish clear pattern guidelines

## Conclusion

While the pill toggle can be improved, a dedicated Switch component would provide:
- Better affordance and discoverability
- Clearer state communication
- Industry-standard interaction patterns
- Better accessibility

The Extended Thinking feature is important enough to warrant a more prominent, clear control that users immediately recognize as toggleable.
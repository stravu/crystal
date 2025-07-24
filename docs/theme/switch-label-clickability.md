# Switch Label Clickability - UX Best Practice

## The Issue
The switch label had a hover effect (`cursor-pointer`, color change) suggesting it was clickable, but clicking it didn't toggle the switch. This created a confusing user experience.

## The Solution
Properly associate the label with the switch control using `htmlFor` and `id` attributes. This is standard HTML/accessibility practice.

### Implementation
```tsx
// Generate unique ID if none provided
const switchId = id || useId();

// Label with htmlFor pointing to switch ID
<label htmlFor={switchId} className="cursor-pointer ...">
  {icon}
  {label}
</label>

// Switch with matching ID
<SwitchPrimitive.Root id={switchId} ...>
```

## Why This Matters

### 1. **Accessibility**
- Screen readers properly associate the label with the control
- Keyboard navigation works correctly
- Meets WCAG guidelines for form controls

### 2. **Larger Click Target**
- Users can click anywhere on the label text or icon
- Especially helpful on mobile devices
- Reduces precision required for interaction

### 3. **Expected Behavior**
- Standard pattern across web and native apps
- Users expect labels to be clickable
- Hover effects should match functionality

## Visual Feedback
The label provides visual feedback through:
- `cursor-pointer` - Shows it's clickable
- Hover color change - Confirms interactivity
- Smooth transitions - Professional feel

## Best Practices
1. **Always associate labels with form controls**
2. **Ensure visual affordances match functionality**
3. **Test clickability of all interactive elements**
4. **Provide consistent hover/active states**

This small fix significantly improves the user experience by making the control behave as users expect.
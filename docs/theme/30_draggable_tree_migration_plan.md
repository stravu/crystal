# DraggableProjectTreeView Migration Plan

## Executive Summary

The DraggableProjectTreeView is Crystal's most complex UI component at **1,944 lines of code**. This document outlines a comprehensive migration strategy to transform it into a maintainable, design-token-based component while preserving all functionality and improving code organization.

## Component Analysis

### Current State
- **Lines of Code**: 1,944 (largest component in codebase)
- **Hardcoded Colors Found**: 77+ instances
- **Key Features**: 
  - Drag & drop for projects, sessions, and folders
  - Tree lines and visual hierarchy
  - Context menus and inline editing
  - Archived project management
  - Complex state management (8 different state variables)

### Complexity Breakdown
1. **Drag & Drop System** (~400 lines)
   - Project reordering
   - Session folder management
   - Visual feedback during drag operations

2. **Tree Rendering** (~600 lines)
   - Nested folder structures
   - Connecting lines between nodes
   - Expansion/collapse states

3. **Context Menus & Editing** (~300 lines)
   - Right-click operations
   - Inline folder renaming
   - Creation dialogs

4. **State Management** (~200 lines)
   - Multiple expansion states
   - Drag state tracking
   - UI persistence

5. **Event Handlers** (~400 lines)
   - IPC event listeners
   - Drag event handling
   - User interaction callbacks

## Migration Strategy

### Phase 1: Analysis & Preparation (Current)
- [x] Identify all hardcoded color patterns
- [x] Document component structure
- [x] Create migration plan
- [ ] Create backup of current functionality

### Phase 2: Color Token Migration
**Target**: Replace all hardcoded colors with design tokens

#### 2A: Tree Structure Colors
```tsx
// Current problematic patterns:
text-gray-600 dark:text-gray-400  → text-text-tertiary
text-blue-600 dark:text-blue-400  → text-interactive
bg-gray-100 dark:bg-gray-700      → bg-surface-hover
hover:bg-gray-200 dark:hover:bg-gray-600 → hover:bg-surface-hover
```

#### 2B: Interactive States
```tsx
// Drag feedback colors
bg-blue-500   → bg-interactive
text-red-600  → text-status-error
bg-red-100    → bg-status-error/10
```

#### 2C: Tree Lines & Visual Hierarchy
```tsx
// Connection line colors
border-gray-300 dark:border-gray-600 → border-border-secondary
bg-gray-50 dark:bg-gray-800/50      → bg-surface-secondary/50
```

### Phase 3: Code Organization (After Color Migration)
**Target**: Break down monolithic component into manageable pieces

#### 3A: Extract Drag & Drop Logic
```tsx
// New hook: useDragAndDrop.ts
export function useDragAndDrop(projects, onMove) {
  // Drag state and handlers
}
```

#### 3B: Extract Tree Rendering
```tsx
// New component: TreeNode.tsx
export function TreeNode({ node, level, onExpand, isDragging }) {
  // Individual node rendering
}
```

#### 3C: Extract Context Menu Logic
```tsx
// New component: TreeContextMenu.tsx
export function TreeContextMenu({ position, items, onAction }) {
  // Context menu handling
}
```

### Phase 4: Performance Optimization
**Target**: Improve rendering performance and reduce bundle size

#### 4A: Memoization Strategy
- Memo-ize TreeNode components
- Optimize re-render triggers
- Cache expanded state calculations

#### 4B: Event Handler Optimization
- Debounce drag operations
- Optimize IPC event listeners
- Reduce state update frequency

## Risk Assessment

### High Risk Areas
1. **Drag & Drop Functionality**
   - Risk: Breaking existing drag behavior
   - Mitigation: Extensive testing of all drag scenarios

2. **Tree Line Rendering**
   - Risk: Visual regression in connection lines
   - Mitigation: Pixel-perfect comparison testing

3. **State Persistence**
   - Risk: Lost expansion states
   - Mitigation: Backup/restore expanded state during migration

### Medium Risk Areas
1. **Context Menu Positioning**
   - Risk: Menu positioning issues
   - Mitigation: Cross-browser testing

2. **Performance Regressions**
   - Risk: Slower rendering with large trees
   - Mitigation: Performance benchmarking

### Low Risk Areas
1. **Color Consistency**
   - Risk: Minor visual differences
   - Mitigation: Design review process

## Implementation Approach

### Incremental Migration Strategy
Rather than a big-bang approach, we'll migrate in stages:

1. **Colors First**: Preserve exact functionality while updating colors
2. **Test Extensively**: Verify all interactions work correctly
3. **Refactor Structure**: Break into smaller components (if desired)
4. **Optimize Performance**: Final polish and optimization

### Quality Gates
Each phase must pass before proceeding:

✅ **Gate 1: Color Migration**
- All hardcoded colors replaced
- No visual regressions
- All drag interactions work
- Context menus function properly

⏳ **Gate 2: Code Organization**
- Component split into logical pieces
- No functionality loss
- Performance maintained or improved

⏳ **Gate 3: Final Polish**
- Code review complete
- Documentation updated
- Performance optimized

## Success Metrics

### Functional Requirements (Must Have)
- ✅ All existing drag & drop operations work
- ✅ Tree expansion/collapse preserved
- ✅ Context menus function correctly
- ✅ Inline editing works
- ✅ Project creation/deletion works
- ✅ Session management preserved
- ✅ Archived project handling works

### Non-Functional Requirements (Should Have)
- 🎯 **Code Reduction**: Target 25-30% reduction (1,944 → ~1,400 lines)
- 🎯 **Maintainability**: Extract 3-4 reusable components
- 🎯 **Performance**: No degradation in render times
- 🎯 **Design Consistency**: 100% design token usage

### Quality Requirements (Nice to Have)
- 🎨 **Visual Polish**: Enhanced tree line aesthetics
- ⚡ **Performance**: Faster rendering for large trees
- 🧪 **Testability**: Better component testability
- 📚 **Documentation**: Comprehensive component docs

## Next Steps

1. **Start Phase 2A**: Begin systematic color token replacement
2. **Create Test Plan**: Document all interaction scenarios for validation
3. **Progress Tracking**: Regular milestone documentation
4. **Stakeholder Communication**: Keep team informed of progress

This migration represents the final and most challenging piece of Crystal's design system transformation. Success here will complete a comprehensive, maintainable, and scalable design foundation for the entire application.
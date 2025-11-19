# Feature Usage Tracking Integration Guide

This document provides guidance on integrating the remaining feature usage tracking events into Crystal's frontend.

## Overview

The following feature usage events have been fully implemented:
- ✅ `run_script_executed` - Tracked in backend (logsManager)
- ✅ `notification_shown` - Tracked in frontend (useNotifications hook)

The following events require frontend integration:
- ⏳ `keyboard_shortcut_used` - Integration points documented below
- ⏳ `drag_drop_used` - Integration points documented below

## Keyboard Shortcut Tracking

### Event Properties
```typescript
{
  shortcut_key: string;  // e.g., "Cmd+Enter", "Ctrl+K", "Escape"
  action: string;        // e.g., "submit_input", "focus_search", "close_dialog"
}
```

### Integration Points

#### 1. AI Input Panels (Cmd/Ctrl+Enter)
**File**: `/frontend/src/hooks/useAIInputPanel.ts` (line ~311)

**Current Code**:
```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleSubmit();
  }
};
```

**Add Tracking**:
```typescript
import { AnalyticsService } from '../services/analyticsService';

const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    handleSubmit();

    // Track keyboard shortcut usage
    AnalyticsService.trackKeyboardShortcut({
      shortcut_key: `${e.metaKey ? 'Cmd' : 'Ctrl'}+Enter`,
      action: 'submit_ai_input',
    }).catch(console.error);
  }
};
```

#### 2. Session Input (Cmd/Ctrl+Enter)
**File**: `/frontend/src/components/session/SessionInput.tsx` (line ~50-60)

**Similar pattern** - Add tracking when Cmd/Ctrl+Enter is pressed to submit session input.

#### 3. File Editor Shortcuts
**File**: `/frontend/src/components/panels/editor/FileEditor.tsx`

**Keyboard shortcuts to track**:
- Save file: `Cmd/Ctrl+S`
- Close editor: `Escape`
- Any other Monaco editor keyboard shortcuts

**Add event listener**:
```typescript
// In useEffect or Monaco configuration
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
  handleSave();
  AnalyticsService.trackKeyboardShortcut({
    shortcut_key: 'Cmd+S',
    action: 'save_file',
  }).catch(console.error);
});
```

#### 4. Dialog Shortcuts (Escape to close)
**Files to check**:
- `/frontend/src/components/CreateSessionDialog.tsx`
- `/frontend/src/components/CommitDialog.tsx`
- `/frontend/src/components/ConfirmDialog.tsx`
- `/frontend/src/components/Help.tsx`

**Pattern**:
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    handleClose();
    AnalyticsService.trackKeyboardShortcut({
      shortcut_key: 'Escape',
      action: 'close_dialog',
    }).catch(console.error);
  }
};
```

#### 5. Search/Navigation Shortcuts
**File**: `/frontend/src/components/DraggableProjectTreeView.tsx`

If implementing keyboard shortcuts for search or navigation (e.g., `/` to focus search, arrow keys for navigation), track them here.

### Analytics Service Method to Add

**File**: `/frontend/src/services/analyticsService.ts`

```typescript
export interface KeyboardShortcutProperties {
  shortcut_key: string;
  action: string;
}

// In UIEventName type
export type UIEventName =
  | 'view_switched'
  | 'help_dialog_opened'
  | 'settings_opened'
  | 'settings_saved'
  | 'sidebar_toggled'
  | 'search_used'
  | 'notification_shown'
  | 'keyboard_shortcut_used';  // Add this

// Add method to class
static async trackKeyboardShortcut(properties: KeyboardShortcutProperties): Promise<void> {
  if (!this.isEnabled()) return;

  try {
    await window.electronAPI.analytics.trackUIEvent({
      event: 'keyboard_shortcut_used',
      properties,
    });
  } catch (error) {
    console.error('[Analytics] Failed to track keyboard_shortcut_used:', error);
  }
}
```

### Backend IPC Handler Update

**File**: `/main/src/ipc/analytics.ts`

```typescript
interface KeyboardShortcutUsedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  shortcut_key: string;
  action: string;
}

type AnalyticsEventData =
  | { event: 'view_switched'; properties: ViewSwitchedEvent }
  | { event: 'help_dialog_opened'; properties: HelpDialogOpenedEvent }
  | { event: 'settings_opened'; properties: SettingsOpenedEvent }
  | { event: 'settings_saved'; properties: SettingsSavedEvent }
  | { event: 'sidebar_toggled'; properties: SidebarToggledEvent }
  | { event: 'search_used'; properties: SearchUsedEvent }
  | { event: 'notification_shown'; properties: NotificationShownEvent }
  | { event: 'keyboard_shortcut_used'; properties: KeyboardShortcutUsedEvent };
```

---

## Drag and Drop Tracking

### Event Properties
```typescript
{
  item_type: string;    // "session" | "folder" | "project"
  target_type: string;  // "session" | "folder" | "project" | "root"
}
```

### Integration Point

**File**: `/frontend/src/components/DraggableProjectTreeView.tsx`

This component already has comprehensive drag-and-drop functionality. The drag state is managed in the `dragState` state variable.

#### Key Handlers to Instrument

**1. handleDrop handler** (line ~800-1000)

This is the main drop handler where drag-and-drop actions are completed. Add tracking here.

**Current pattern**:
```typescript
const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();

  // ... existing drop logic ...

  if (dragState.type && dragState.overType) {
    // Handle different drop scenarios
    // ... move session, move folder, etc. ...
  }

  // Reset drag state
  setDragState({ ... });
};
```

**Add Tracking**:
```typescript
import { AnalyticsService } from '../services/analyticsService';

const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();

  const sourceType = dragState.type;
  const targetType = dragState.overType;

  // ... existing drop logic ...

  if (sourceType && targetType) {
    // Track successful drag and drop
    AnalyticsService.trackDragDrop({
      item_type: sourceType,
      target_type: targetType,
    }).catch(console.error);
  }

  // Reset drag state
  setDragState({ ... });
};
```

**2. Track only successful drops**

Make sure to only track when the drop is successful and changes are saved to the database. Place the tracking call after successful API calls:

```typescript
// After successful session move
await API.sessions.update(dragState.sessionId, { folder_id: targetFolderId });

// Track the drag-drop action
AnalyticsService.trackDragDrop({
  item_type: 'session',
  target_type: targetType || 'root',
}).catch(console.error);
```

### Analytics Service Method to Add

**File**: `/frontend/src/services/analyticsService.ts`

```typescript
export interface DragDropUsedProperties {
  item_type: string;
  target_type: string;
}

// In UIEventName type
export type UIEventName =
  | 'view_switched'
  | 'help_dialog_opened'
  | 'settings_opened'
  | 'settings_saved'
  | 'sidebar_toggled'
  | 'search_used'
  | 'notification_shown'
  | 'keyboard_shortcut_used'
  | 'drag_drop_used';  // Add this

// Add method to class
static async trackDragDrop(properties: DragDropUsedProperties): Promise<void> {
  if (!this.isEnabled()) return;

  try {
    await window.electronAPI.analytics.trackUIEvent({
      event: 'drag_drop_used',
      properties,
    });
  } catch (error) {
    console.error('[Analytics] Failed to track drag_drop_used:', error);
  }
}
```

### Backend IPC Handler Update

**File**: `/main/src/ipc/analytics.ts`

```typescript
interface DragDropUsedEvent extends Record<string, string | number | boolean | string[] | undefined> {
  item_type: string;
  target_type: string;
}

type AnalyticsEventData =
  | { event: 'view_switched'; properties: ViewSwitchedEvent }
  | { event: 'help_dialog_opened'; properties: HelpDialogOpenedEvent }
  | { event: 'settings_opened'; properties: SettingsOpenedEvent }
  | { event: 'settings_saved'; properties: SettingsSavedEvent }
  | { event: 'sidebar_toggled'; properties: SidebarToggledEvent }
  | { event: 'search_used'; properties: SearchUsedEvent }
  | { event: 'notification_shown'; properties: NotificationShownEvent }
  | { event: 'keyboard_shortcut_used'; properties: KeyboardShortcutUsedEvent }
  | { event: 'drag_drop_used'; properties: DragDropUsedEvent };
```

---

## Testing

After implementing the above tracking:

1. **Enable analytics** in Crystal settings
2. **Configure PostHog API key** in settings
3. **Use the features** that trigger the events:
   - Press keyboard shortcuts
   - Drag and drop sessions/folders
4. **Verify in PostHog dashboard** that events are being tracked
5. **Check console logs** for any tracking errors

## Privacy Considerations

- ✅ No user-identifiable information is tracked
- ✅ All session IDs are hashed before sending
- ✅ Only event counts and categorical data are tracked
- ✅ Users can disable analytics in settings
- ✅ Analytics respect the user's privacy preferences

## Summary

| Event | Status | Implementation |
|-------|--------|---------------|
| `run_script_executed` | ✅ Complete | Backend (logsManager.ts) |
| `notification_shown` | ✅ Complete | Frontend (useNotifications.ts) |
| `keyboard_shortcut_used` | ⏳ Documentation Ready | Follow integration guide above |
| `drag_drop_used` | ⏳ Documentation Ready | Follow integration guide above |

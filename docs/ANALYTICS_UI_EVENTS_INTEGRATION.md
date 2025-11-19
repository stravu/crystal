# Analytics UI Events Integration Guide

This document describes how to integrate UI interaction event tracking into Crystal's frontend components.

## Overview

The analytics system has been implemented with:
1. Backend IPC handlers in `/main/src/ipc/analytics.ts`
2. AnalyticsManager service enhancements to support string arrays
3. Frontend service utility in `/frontend/src/services/analyticsService.ts`
4. Preload script exposure for secure IPC communication

## Backend Implementation

### IPC Handlers
- **File**: `/main/src/ipc/analytics.ts`
- **Registered**: In `/main/src/ipc/index.ts`
- **Service Integration**: AnalyticsManager added to AppServices in `/main/src/ipc/types.ts`

### IPC Endpoints

1. `analytics:track-ui-event` - Track UI interaction events
2. `analytics:categorize-result-count` - Helper to categorize search result counts
3. `analytics:hash-session-id` - Helper to hash session IDs for privacy

## Frontend Integration Points

### Using the AnalyticsService

Import the service:
```typescript
import { AnalyticsService } from '@/services/analyticsService';
```

### Event 1: view_switched

**Track when users switch between tabs (Output, Diff, Logs, Editor, etc.)**

**Where to implement:**
- Component: `/frontend/src/components/SessionView.tsx` or `/frontend/src/hooks/useSessionView.ts`
- Trigger: When user clicks on a tab to switch views
- Implementation example:

```typescript
const handleViewSwitch = async (fromView: string, toView: string, sessionId?: string) => {
  // Hash the session ID for privacy
  const sessionIdHash = sessionId
    ? await AnalyticsService.hashSessionId(sessionId)
    : undefined;

  await AnalyticsService.trackViewSwitched({
    from_view: fromView,
    to_view: toView,
    session_id_hash: sessionIdHash,
  });
};
```

**View names to use:**
- `output` - Main output view
- `diff` - Git diff view
- `logs` - Logs/terminal view
- `editor` - Editor view
- `dashboard` - Dashboard view

### Event 2: help_dialog_opened

**Track when users open the help dialog**

**Where to implement:**
- Component: `/frontend/src/components/Help.tsx` (or wherever the help dialog trigger is)
- Trigger: When the help button/icon is clicked
- Implementation example:

```typescript
const handleHelpOpen = async (location: string) => {
  await AnalyticsService.trackHelpDialogOpened({
    from_location: location,
  });

  // Then open the help dialog
  setShowHelp(true);
};
```

**Location values to use:**
- `sidebar` - From sidebar help button
- `toolbar` - From toolbar help button
- `settings` - From settings page
- `keyboard_shortcut` - From keyboard shortcut

### Event 3: settings_opened

**Track when users open settings**

**Where to implement:**
- Component: `/frontend/src/components/Settings.tsx` (or wherever settings trigger is)
- Trigger: When settings dialog/page is opened
- Implementation example:

```typescript
const handleSettingsOpen = async (location: string) => {
  await AnalyticsService.trackSettingsOpened({
    from_location: location,
  });

  // Then open settings
  setShowSettings(true);
};
```

**Location values to use:**
- `sidebar` - From sidebar settings button
- `menu` - From menu bar
- `keyboard_shortcut` - From keyboard shortcut

### Event 4: settings_saved

**Track when users save settings changes**

**Where to implement:**
- Component: `/frontend/src/components/Settings.tsx`
- Trigger: When user clicks "Save" or settings are persisted
- Implementation example:

```typescript
const handleSettingsSave = async (category: string, changedKeys: string[]) => {
  await AnalyticsService.trackSettingsSaved({
    category: category,
    setting_keys: changedKeys,
  });

  // Then save the settings
  await window.electronAPI.config.update(updatedSettings);
};
```

**Category values to use:**
- `general` - General settings
- `notifications` - Notification settings
- `project` - Project-specific settings
- `appearance` - UI/appearance settings
- `advanced` - Advanced settings

**Setting keys examples:**
- `verbose_logging`
- `api_key`
- `notification_enabled`
- `notification_sound`
- `custom_prompt`
- `main_branch`

### Event 5: sidebar_toggled

**Track when users show/hide the sidebar**

**Where to implement:**
- Component: Main layout component (likely in `/frontend/src/App.tsx` or similar)
- Trigger: When sidebar visibility changes
- Implementation example:

```typescript
const handleSidebarToggle = async (isVisible: boolean) => {
  await AnalyticsService.trackSidebarToggled({
    is_visible: isVisible,
  });

  // Then toggle sidebar
  setSidebarVisible(isVisible);
};
```

### Event 6: search_used

**Track when users use search functionality**

**Where to implement:**
- Component: Search components (likely in `/frontend/src/components/DraggableProjectTreeView.tsx` or search bar component)
- Trigger: When search is executed (on Enter or search button click)
- Implementation example:

```typescript
const handleSearch = async (searchTerm: string, searchType: string, resultCount: number) => {
  // Categorize the result count for privacy (don't track exact numbers)
  const resultCategory = await AnalyticsService.categorizeResultCount(resultCount);

  await AnalyticsService.trackSearchUsed({
    search_type: searchType,
    result_count_category: resultCategory,
  });

  // Note: Do NOT track the actual search term for privacy
};
```

**Search type values to use:**
- `sessions` - Searching sessions
- `prompts` - Searching prompts
- `files` - Searching files
- `projects` - Searching projects

**Result count categories** (automatically categorized by backend):
- `0-0` - No results
- `1-5` - Few results
- `6-10` - Some results
- `11-25` - Many results
- `26-50` - Lots of results
- `51-100` - Very many results
- `101+` - Tons of results

## Privacy Considerations

### Do NOT Track:
- ❌ Actual search terms
- ❌ File names or paths
- ❌ Prompt content
- ❌ User identifiable information
- ❌ Exact counts (use categories)
- ❌ Raw session IDs (always hash them)

### DO Track:
- ✅ Event types (which button was clicked)
- ✅ Categories and types
- ✅ Hashed/anonymized identifiers
- ✅ Boolean states (visible/hidden, enabled/disabled)
- ✅ Categorized counts (0-5, 6-10, etc.)

## Testing

To test analytics integration:

1. **Enable analytics** in settings
2. **Enable verbose logging** to see analytics events in the console
3. **Perform actions** that should trigger events
4. **Check logs** for messages like:
   ```
   [Analytics] Tracked event: view_switched { from_view: 'output', to_view: 'diff', ... }
   ```

## Type Safety

The `AnalyticsService` class provides type-safe methods for all events. TypeScript will enforce:
- Correct event names
- Required properties for each event type
- Proper value types for each property

If you try to pass invalid data, you'll get a TypeScript error at compile time.

## Error Handling

All analytics methods:
- Are non-blocking (use `async/await` but don't wait for responses)
- Fail silently (errors are logged but don't break functionality)
- Check if analytics is enabled before tracking
- Handle cases where the electronAPI is not available

## Example: Complete Integration

Here's a complete example of integrating view switching in a component:

```typescript
import React, { useState } from 'react';
import { AnalyticsService } from '@/services/analyticsService';

export function SessionView({ sessionId }: { sessionId: string }) {
  const [currentView, setCurrentView] = useState<'output' | 'diff' | 'logs' | 'editor'>('output');

  const switchView = async (newView: typeof currentView) => {
    // Track the view switch
    const sessionIdHash = await AnalyticsService.hashSessionId(sessionId);
    await AnalyticsService.trackViewSwitched({
      from_view: currentView,
      to_view: newView,
      session_id_hash: sessionIdHash,
    });

    // Update the view
    setCurrentView(newView);
  };

  return (
    <div>
      <div className="tabs">
        <button onClick={() => switchView('output')}>Output</button>
        <button onClick={() => switchView('diff')}>Diff</button>
        <button onClick={() => switchView('logs')}>Logs</button>
        <button onClick={() => switchView('editor')}>Editor</button>
      </div>
      {/* View content here */}
    </div>
  );
}
```

## Summary

All backend infrastructure is complete. Frontend developers should:

1. Import `AnalyticsService` from `/frontend/src/services/analyticsService.ts`
2. Call the appropriate tracking method when user actions occur
3. Follow the privacy guidelines (no PII, use hashing/categorization)
4. Test with verbose logging enabled to verify events are tracked

The tracking is opt-in (users can disable analytics in settings) and respects user privacy by design.

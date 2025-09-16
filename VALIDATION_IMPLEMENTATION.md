# Session Validation Implementation

This document describes the comprehensive session validation system implemented to prevent sessions from receiving wrong data and ensure proper event routing.

## Overview

The validation system consists of:

1. **Validation Helper Functions** (`main/src/utils/sessionValidation.ts`)
2. **IPC Handler Validation** (applied to all session and panel handlers)
3. **Event System Validation** (applied to all event handlers)  
4. **CLI Manager Validation** (applied to panel operations)
5. **Frontend Event Validation** (applied to IPC event reception)

## Core Validation Functions

### `validateSessionExists(sessionId: string)`
- Validates that a session exists in the database
- Checks that the session is not archived
- Returns validation result with error details

### `validatePanelExists(panelId: string)`
- Validates that a panel exists
- Returns the panel's session ID for further validation
- Used for panel-only operations

### `validatePanelSessionOwnership(panelId: string, expectedSessionId: string)`
- Validates that a panel belongs to the specified session
- Ensures session exists and is not archived
- Prevents cross-session panel access

### `validateSessionIsActive(sessionId: string)`
- Validates session exists and is in an active state
- Prevents operations on archived or invalid sessions
- Used for operations that modify session state

### `validateEventContext(eventData: any, expectedSessionId?: string)`
- Validates that events contain required session context
- Ensures events match expected session (if specified)
- Used for general session event validation

### `validatePanelEventContext(eventData: any, expectedPanelId?: string, expectedSessionId?: string)`
- Validates panel-specific events
- Ensures panel belongs to correct session
- Used for panel-based event validation

## Implementation Areas

### 1. IPC Session Handlers (`main/src/ipc/session.ts`)

**Added validation to:**
- `sessions:input` - Validates session is active before accepting input
- `sessions:continue` - Validates session is active before continuing
- `sessions:get-output` - Validates session exists before retrieving output
- `panels:send-input` - Validates panel exists and session is active
- `panels:continue` - Validates panel ownership and session state
- `panels:get-output` - Validates panel exists before retrieving output

**Example validation pattern:**
```typescript
// Validate session exists and is active
const sessionValidation = validateSessionIsActive(sessionId);
if (!sessionValidation.valid) {
  logValidationFailure('sessions:input', sessionValidation);
  return createValidationError(sessionValidation);
}
```

### 2. Event System Validation (`main/src/events.ts`)

**Added validation to:**
- `session-output` events - Validates event has correct session context
- `claudeCodeManager` output events - Validates panel/session context
- `claudeCodeManager` spawned events - Validates process context
- `claudeCodeManager` exit events - Validates process context  
- `claudeCodeManager` error events - Validates error context

**Example validation pattern:**
```typescript
// Validate the output has valid context
const validation = output.panelId 
  ? validatePanelEventContext(output, output.panelId, output.sessionId)
  : validateEventContext(output, output.sessionId);

if (!validation.valid) {
  logValidationFailure('claudeCodeManager output event', validation);
  return; // Don't process invalid events
}
```

### 3. CLI Manager Validation (`main/src/services/panels/cli/AbstractCliManager.ts`)

**Added validation to:**
- `sendInput()` method - Validates panel ID matches expected process
- Added process context logging for better debugging

**Example validation pattern:**
```typescript
// Validate that the process matches the expected panel and session context
if (cliProcess.panelId !== panelId) {
  this.logger?.error(`Panel ID mismatch: process has ${cliProcess.panelId}, expected ${panelId}`);
  throw new Error(`Panel ID mismatch: process belongs to different panel`);
}
```

### 4. ClaudeCodeManager Validation (`main/src/services/panels/claude/claudeCodeManager.ts`)

**Added validation to:**
- `startPanel()` method - Validates panel belongs to correct session
- `continuePanel()` method - Validates panel ownership before operations

**Example validation pattern:**
```typescript
// Validate panel ownership before starting
const { validatePanelSessionOwnership, logValidationFailure } = require('../../../utils/sessionValidation');
const validation = validatePanelSessionOwnership(panelId, sessionId);
if (!validation.valid) {
  logValidationFailure('ClaudeCodeManager.startPanel', validation);
  throw new Error(`Panel validation failed: ${validation.error}`);
}
```

### 5. Frontend Event Validation (`frontend/src/hooks/useIPCEvents.ts`)

**Added validation to:**
- Session output events - Validates sessionId is present
- Terminal output events - Validates session context
- Git status events - Validates session context
- Output available events - Validates session context

**Example validation pattern:**
```typescript
// Validate event has required session context
if (!validateEventSession(output)) {
  return; // Ignore invalid events
}
```

## Error Handling

### Validation Failures
- All validation failures are logged with context information
- Invalid events are dropped rather than processed
- IPC handlers return standardized error responses
- CLI operations throw descriptive errors

### Logging Pattern
```typescript
logValidationFailure('operation-name', validation);
```

Logs include:
- Operation context
- Validation error message
- Session ID (when available)
- Panel ID (when available)

### Error Response Pattern
```typescript
return createValidationError(validation);
```

Returns standardized structure:
```typescript
{
  success: false,
  error: string
}
```

## Benefits

### Security
- Prevents cross-session data leakage
- Ensures panels only receive data intended for them
- Validates all session/panel relationships

### Debugging
- Comprehensive logging of validation failures
- Clear error messages for troubleshooting
- Context information in all validation logs

### Reliability
- Early detection of data routing issues
- Prevents UI corruption from wrong data
- Ensures data consistency across the application

### Maintainability
- Centralized validation logic
- Consistent validation patterns
- Easy to add new validation rules

## Usage Guidelines

### When to Use Each Validation Function

1. **`validateSessionExists`** - For read-only operations that need basic session verification
2. **`validateSessionIsActive`** - For operations that modify session state or send input
3. **`validatePanelExists`** - For panel operations where session context isn't critical
4. **`validatePanelSessionOwnership`** - For panel operations that must verify session relationship
5. **`validateEventContext`** - For session-level events
6. **`validatePanelEventContext`** - For panel-level events

### Adding New Validation

1. Import validation functions: `import { validateX, logValidationFailure } from '../utils/sessionValidation'`
2. Call appropriate validation function early in handler/event processor
3. Log failure and return/exit on invalid data
4. Add descriptive context to failure logs

### Testing Validation

Validation can be tested by:
1. Providing invalid session IDs to IPC handlers
2. Using panels from different sessions
3. Sending events with wrong context
4. Verifying proper error responses and logging
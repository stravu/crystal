# Timestamp Handling Guidelines

⚠️ **IMPORTANT**: Proper timestamp handling is critical for the application to function correctly, especially for prompt duration calculations.

## Overview

Crystal uses timestamps throughout the application for tracking session activity, prompt execution times, and displaying time-based information. Due to the mix of SQLite database storage and JavaScript Date objects, special care must be taken to ensure timezone consistency.

## Key Principles

1. **Database Storage**: All timestamps are stored in UTC using SQLite's `CURRENT_TIMESTAMP` or `datetime()` functions
2. **Frontend Display**: Timestamps are parsed as UTC and converted to local time only for display
3. **Consistency**: Always use the timestamp utility functions instead of manual date parsing
4. **Validation**: Always validate timestamps before using them in calculations

## Timestamp Formats

- **SQLite DATETIME**: `YYYY-MM-DD HH:MM:SS` (stored in UTC without timezone indicator)
- **ISO 8601**: `YYYY-MM-DDTHH:MM:SS.sssZ` (with explicit UTC timezone)
- **JavaScript Date**: Local timezone by default (be careful!)

## Utility Functions

Crystal provides timestamp utilities in both frontend and backend:

### Backend (`main/src/utils/timestampUtils.ts`)

```typescript
import { formatForDatabase, getCurrentTimestamp } from '../utils/timestampUtils';

// For database storage
const timestamp = formatForDatabase(); // Returns ISO string
const now = getCurrentTimestamp();    // Alias for formatForDatabase()

// For display formatting
const displayTime = formatForDisplay(timestamp);
```

### Frontend (`frontend/src/utils/timestampUtils.ts`)

```typescript
import { parseTimestamp, formatDuration, getTimeDifference } from '../utils/timestampUtils';

// Parse SQLite timestamps correctly
const date = parseTimestamp("2024-01-01 12:00:00"); // Handles UTC conversion

// Calculate durations
const durationMs = getTimeDifference(startTime, endTime);
const formatted = formatDuration(durationMs); // "2m 34s"

// Display relative time
const ago = formatDistanceToNow(timestamp); // "5 minutes ago"
```

## Database Operations

When working with timestamps in SQLite:

```sql
-- Use datetime() for UTC timestamps
INSERT INTO prompt_markers (timestamp) VALUES (datetime('now'));

-- When selecting, append 'Z' for proper UTC parsing
SELECT datetime(timestamp) || 'Z' as timestamp FROM prompt_markers;

-- For completion timestamps with NULL handling
SELECT
  CASE
    WHEN completion_timestamp IS NOT NULL
    THEN datetime(completion_timestamp) || 'Z'
    ELSE NULL
  END as completion_timestamp
FROM prompt_markers;
```

## Common Patterns

### Creating a new timestamp

```typescript
// Backend - for database storage
const timestamp = formatForDatabase();

// Frontend - for immediate use
const now = new Date();
```

### Tracking prompt execution time

```typescript
// When prompt starts
db.addPromptMarker(sessionId, promptText, outputIndex);

// When prompt completes
db.updatePromptMarkerCompletion(sessionId);
```

### Calculating duration

```typescript
// With completion timestamp
if (prompt.completion_timestamp) {
  const duration = getTimeDifference(prompt.timestamp, prompt.completion_timestamp);
  return formatDuration(duration);
}

// For ongoing prompts
const duration = getTimeDifference(prompt.timestamp); // Uses current time as end
return formatDuration(duration) + ' (ongoing)';
```

## Common Pitfalls to Avoid

### 1. Never parse SQLite timestamps directly with `new Date()`

```typescript
// ❌ WRONG - treats UTC as local time
const date = new Date("2024-01-01 12:00:00");

// ✅ CORRECT - uses parseTimestamp utility
const date = parseTimestamp("2024-01-01 12:00:00");
```

### 2. Always validate timestamps before calculations

```typescript
if (!isValidTimestamp(timestamp)) {
  return 'Unknown duration';
}
```

### 3. Be careful with timezone conversions

```typescript
// Database stores UTC, display shows local
const dbTime = "2024-01-01 12:00:00";    // UTC
const parsed = parseTimestamp(dbTime);    // Correctly handled as UTC
const display = formatForDisplay(parsed); // Converts to local for display
```

### 4. Handle negative durations gracefully

```typescript
const duration = endTime - startTime;
if (duration < 0) {
  console.warn('Negative duration detected');
  return 'Invalid duration';
}
```

## Testing Timestamp Code

When testing timestamp-related features:

1. Test with different timezones (especially negative UTC offsets)
2. Test with daylight saving time transitions
3. Test with very old and future timestamps
4. Test with invalid/malformed timestamps
5. Verify duration calculations are always positive

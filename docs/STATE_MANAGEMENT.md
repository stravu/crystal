# State Management Guidelines

⚠️ **IMPORTANT**: Crystal follows a targeted update pattern for state management to minimize unnecessary re-renders and network requests.

## Overview

Crystal uses a combination of Zustand stores, IPC events, and targeted updates to manage application state efficiently. The application prioritizes specific, targeted updates over global refreshes to improve performance and user experience.

## Key Principles

1. **Targeted Updates**: Always update only the specific data that changed
2. **Event-Driven Updates**: Use IPC events to communicate changes between processes
3. **Avoid Global Refreshes**: Never reload entire lists when only one item changes
4. **Database as Source of Truth**: Frontend state should reflect backend state, not override it

## State Update Patterns

### Session Updates

```typescript
// ❌ BAD: Global refresh
const handleSessionCreated = () => {
  loadProjectsWithSessions(); // Reloads everything
};

// ✅ GOOD: Targeted update
const handleSessionCreated = (newSession: Session) => {
  setProjectsWithSessions(prevProjects => {
    return prevProjects.map(project => {
      if (project.id === newSession.projectId) {
        return {
          ...project,
          sessions: [...project.sessions, newSession]
        };
      }
      return project;
    });
  });
};
```

### Project Updates

```typescript
// ❌ BAD: Reload all projects
const handleProjectDeleted = () => {
  fetchProjects(); // Network request for all projects
};

// ✅ GOOD: Remove from local state
const handleProjectDeleted = () => {
  setProjects(prev => prev.filter(p => p.id !== deletedId));
};
```

## IPC Event Handling

The application uses IPC events to synchronize state between the main process and renderer:

### Session Events

- `session:created` - Add new session to appropriate project
- `session:updated` - Update specific session properties
- `session:deleted` - Remove session from project list

### Project Events (if implemented)

- `project:created` - Add new project to list
- `project:updated` - Update specific project properties
- `project:deleted` - Remove project from list

## When Global Refreshes Are Acceptable

- **Initial Load**: When component mounts for the first time
- **User-Triggered Refresh**: When user explicitly requests a refresh
- **Error Recovery**: After connection loss or critical errors
- **Complex State Changes**: When multiple interdependent items change

## Implementation Examples

### DraggableProjectTreeView.tsx

- Uses targeted updates for session creation, update, and deletion
- Only reloads all data on initial mount or when critical errors occur
- Maintains local state synchronized with backend through IPC events

### ProjectSelector.tsx

- Updates project list locally when projects are deleted
- Falls back to refresh only when necessary (e.g., complex updates)

## Best Practices

1. **Use State Setters with Callbacks**: Always use the callback form of setState to ensure you're working with the latest state
2. **Merge Updates**: When updating objects, spread existing properties to preserve data
3. **Handle Edge Cases**: Always check if the item exists before updating
4. **Log State Changes**: Add console logs for debugging state updates in development
5. **Validate IPC Data**: Ensure IPC events contain expected data structure

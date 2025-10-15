# Crystal Ordering/Sorting System Documentation

## Overview

Crystal uses a multi-layered ordering system to organize projects, sessions, and folders in the sidebar tree view. The system combines database-persisted `display_order` values with user-controlled sort direction preferences to provide flexible organization.

---

## Database Schema

### Tables with Ordering Support

#### 1. **Projects** (`main/src/database/models.ts:1-19`)
```typescript
interface Project {
  id: number;
  name: string;
  path: string;
  display_order?: number;  // Primary ordering field
  // ... other fields
}
```

- **Column**: `display_order` (INTEGER, nullable)
- **Migration**: `main/src/database/database.ts:382-402` - Added in migration, initialized based on `created_at`
- **Index**: `idx_projects_display_order` on `(display_order)`

#### 2. **Sessions** (`main/src/database/models.ts:40-70`)
```typescript
interface Session {
  id: string;
  name: string;
  project_id?: number;
  folder_id?: string;
  display_order?: number;  // Primary ordering field
  // ... other fields
}
```

- **Column**: `display_order` (INTEGER, nullable)
- **Migration**: `main/src/database/database.ts:405-422` - Added in migration, initialized per project based on `created_at`
- **Index**: `idx_sessions_display_order` on `(project_id, display_order)`

#### 3. **Folders** (`main/src/database/models.ts:30-38`)
```typescript
interface Folder {
  id: string;
  name: string;
  project_id: number;
  parent_folder_id?: string | null;
  display_order: number;  // Required field
  // ... other fields
}
```

- **Column**: `display_order` (INTEGER, NOT NULL, default 0)
- **Schema**: Defined in `main/src/database/schema.sql`
- **Index**: Indexed as part of folder queries

---

## Ordering Persistence

### Database Methods

#### Reorder Projects (`main/src/database/database.ts:2247-2261`)
```typescript
reorderProjects(projectOrders: Array<{ id: number; displayOrder: number }>): void {
  const stmt = this.db.prepare(`
    UPDATE projects
    SET display_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const updateMany = this.db.transaction((orders) => {
    for (const { id, displayOrder } of orders) {
      stmt.run(displayOrder, id);
    }
  });

  updateMany(projectOrders);
}
```

#### Reorder Sessions (`main/src/database/database.ts:2263-2277`)
```typescript
reorderSessions(sessionOrders: Array<{ id: string; displayOrder: number }>): void {
  const stmt = this.db.prepare(`
    UPDATE sessions
    SET display_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const updateMany = this.db.transaction((orders) => {
    for (const { id, displayOrder } of orders) {
      stmt.run(displayOrder, id);
    }
  });

  updateMany(sessionOrders);
}
```

#### Reorder Folders (`main/src/database/database.ts:1446-1460`)
```typescript
reorderFolders(projectId: number, folderIds: string[]): void {
  const stmt = this.db.prepare(`
    UPDATE folders
    SET display_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND project_id = ?
  `);

  const transaction = this.db.transaction(() => {
    folderIds.forEach((id, index) => {
      stmt.run(index, id, projectId);
    });
  });

  transaction();
}
```

**Note**: Folder reordering takes an ordered array of folder IDs, while projects and sessions take objects with explicit `displayOrder` values.

---

## IPC Handlers

### Project Reordering (`main/src/ipc/project.ts:266-274`)
```typescript
ipcMain.handle('projects:reorder', async (_event, projectOrders: Array<{ id: number; displayOrder: number }>) => {
  try {
    databaseService.reorderProjects(projectOrders);
    return { success: true };
  } catch (error) {
    console.error('Failed to reorder projects:', error);
    return { success: false, error: 'Failed to reorder projects' };
  }
});
```

### Session Reordering (`main/src/ipc/session.ts:1600-1608`)
```typescript
ipcMain.handle('sessions:reorder', async (_event, sessionOrders: Array<{ id: string; displayOrder: number }>) => {
  try {
    databaseService.reorderSessions(sessionOrders);
    return { success: true };
  } catch (error) {
    console.error('Failed to reorder sessions:', error);
    return { success: false, error: 'Failed to reorder sessions' };
  }
});
```

### Folder Reordering (`main/src/ipc/folders.ts:82-90`)
```typescript
ipcMain.handle('folders:reorder', async (_, projectId: number, folderIds: string[]) => {
  try {
    databaseService.reorderFolders(projectId, folderIds);
    return { success: true };
  } catch (error: unknown) {
    console.error('[IPC] Failed to reorder folders:', error);
    return { success: false, error: 'Failed to reorder folders' };
  }
});
```

---

## Frontend Ordering Logic

### Sort Direction Toggle

The user can toggle between ascending (oldest first) and descending (newest first) sort order via a button in the sidebar.

#### State Management (`frontend/src/components/Sidebar.tsx:24,70-80`)
```typescript
const [sessionSortAscending, setSessionSortAscending] = useState<boolean>(false); // Default to descending

const toggleSessionSortOrder = async () => {
  const newValue = !sessionSortAscending;
  setSessionSortAscending(newValue);

  // Save to database via electronAPI
  try {
    await window.electronAPI.uiState.saveSessionSortAscending(newValue);
  } catch (error) {
    console.error('Failed to save session sort order:', error);
  }
};
```

#### Persistence (`main/src/services/uiStateManager.ts:38-58`)
```typescript
getSessionSortAscending(): boolean {
  const value = this.db.getUIState('treeView.sessionSortAscending');
  if (!value) return false; // Default to descending (newest first)
  try {
    return JSON.parse(value);
  } catch {
    return false;
  }
}

saveSessionSortAscending(ascending: boolean): void {
  this.db.setUIState('treeView.sessionSortAscending', JSON.stringify(ascending));
}
```

- **Storage**: Saved in a key-value UI state table
- **Key**: `'treeView.sessionSortAscending'`
- **Default**: `false` (descending, newest first)

### Tree Item Comparator (`frontend/src/components/DraggableProjectTreeView.tsx:44-89`)

The comparator determines the sort order of sessions and folders within a project.

```typescript
type TreeItem =
  | { type: 'folder'; data: Folder; id: string; name: string; displayOrder: number; createdAtValue: number; }
  | { type: 'session'; data: Session; id: string; name: string; displayOrder: number; createdAtValue: number; };

const parseCreatedAt = (value?: string | null): number => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const createTreeItemComparator = (ascending: boolean) => {
  const direction = ascending ? 1 : -1;
  return (a: TreeItem, b: TreeItem): number => {
    // 1. Sort by display_order (primary)
    const orderDiff = a.displayOrder - b.displayOrder;
    if (orderDiff !== 0) {
      return direction * orderDiff;
    }

    // 2. Sort by created_at (secondary)
    const createdDiff = a.createdAtValue - b.createdAtValue;
    if (createdDiff !== 0) {
      return direction * createdDiff;
    }

    // 3. Sort by name (tertiary)
    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) {
      return direction * nameDiff;
    }

    // 4. Sort by ID (final tiebreaker)
    return direction * a.id.localeCompare(b.id);
  };
};
```

#### Sort Priority (Highest to Lowest)
1. **`display_order`** - User-defined manual ordering via drag-and-drop
2. **`created_at`** - Timestamp when the item was created
3. **`name`** - Alphabetical name comparison
4. **`id`** - Unique identifier (final tiebreaker)

---

## Drag-and-Drop Reordering

### How It Works

Users can drag projects, sessions, and folders to reorder them. The system calculates new `display_order` values based on the drop position.

### Project Reordering (`frontend/src/components/DraggableProjectTreeView.tsx:1175-1213`)

```typescript
const handleProjectDrop = async (e: React.DragEvent, targetProject: Project) => {
  // ... (drag validation)

  if (dragState.type === 'project' && dragState.projectId && dragState.projectId !== targetProject.id) {
    // Reorder projects
    const sourceIndex = projectsWithSessions.findIndex(p => p.id === dragState.projectId);
    const targetIndex = projectsWithSessions.findIndex(p => p.id === targetProject.id);

    if (sourceIndex !== -1 && targetIndex !== -1) {
      const newProjects = [...projectsWithSessions];
      const [removed] = newProjects.splice(sourceIndex, 1);
      newProjects.splice(targetIndex, 0, removed);

      // Update display order for all projects
      const projectOrders = newProjects.map((project, index) => ({
        id: project.id,
        displayOrder: index
      }));

      const response = await API.projects.reorder(projectOrders);
      if (response.success) {
        setProjectsWithSessions(newProjects);
      }
    }
  }
};
```

**Algorithm**:
1. Find the source and target indices in the current array
2. Remove the dragged project from its current position
3. Insert it at the target position
4. Recalculate `display_order` for all projects (0-indexed sequential)
5. Send all updated orders to the backend
6. Update local state on success

### Session Reordering (`frontend/src/components/DraggableProjectTreeView.tsx:1256-1363`)

Sessions are reordered alongside folders in a combined list to maintain their relative positions.

```typescript
const handleSessionDrop = async (e: React.DragEvent, targetSession: Session, projectId: number) => {
  // Only reorder at root level (not within folders)
  if (!targetSession.folderId && !dragState.folderId) {
    // Get root-level items (sessions and folders without parents)
    const rootSessions = project.sessions.filter(s => !s.folderId);
    const rootFolders = project.folders ? buildFolderTree(project.folders) : [];

    // Create combined list with current display orders
    const rootItems = [
      ...rootFolders.map(f => ({ type: 'folder', id: f.id, displayOrder: f.displayOrder ?? 0 })),
      ...rootSessions.map(s => ({ type: 'session', id: s.id, displayOrder: s.displayOrder ?? 0 }))
    ];

    // Sort to get current order
    rootItems.sort((a, b) => a.displayOrder - b.displayOrder);

    // Reorder by removing and inserting
    const sourceItemIndex = rootItems.findIndex(item => item.type === 'session' && item.id === dragState.sessionId);
    const insertIndex = rootItems.findIndex(item => item.type === 'session' && item.id === targetSession.id);

    const [removedItem] = rootItems.splice(sourceItemIndex, 1);
    rootItems.splice(insertIndex, 0, removedItem);

    // Reassign displayOrder values sequentially
    rootItems.forEach((item, index) => {
      item.displayOrder = index;
    });

    // Prepare updates for API
    const sessionOrders = rootItems.filter(item => item.type === 'session').map(...);
    const folderOrders = rootItems.filter(item => item.type === 'folder').map(...);

    // Update both sessions and folders
    await API.sessions.reorder(sessionOrders);
    if (folderOrders.length > 0) {
      const orderedFolderIds = folderOrders.sort((a, b) => a.displayOrder - b.displayOrder).map(f => f.id);
      await API.folders.reorder(projectId, orderedFolderIds);
    }
  }
};
```

**Key Points**:
- Sessions and folders share the same ordering space at the root level
- Both are reordered together to maintain their relative positions
- `display_order` is reassigned sequentially (0, 1, 2, ...)

### Folder Reordering (`frontend/src/components/DraggableProjectTreeView.tsx:1364-1444`)

Similar to session reordering, folders can be dragged to reorder among other root-level items.

```typescript
const handleFolderDrop = async (e: React.DragEvent, folder: Folder, projectId: number) => {
  // Move session into folder
  if (dragState.type === 'session' && dragState.sessionId) {
    await API.folders.moveSession(dragState.sessionId, folder.id);
    // Update local state and auto-expand folder
  }
  // Move folder into another folder (nesting)
  else if (dragState.type === 'folder' && dragState.folderId && dragState.folderId !== folder.id) {
    await API.folders.move(dragState.folderId, folder.id);
    // Update parent_folder_id
  }
};
```

---

## Hierarchy Rules

### Projects
- **Scope**: Global
- **Ordering**: Independent `display_order` values
- **Drag Behavior**: Can be reordered among other projects
- **Persistence**: All projects receive sequential `display_order` on reorder

### Folders
- **Scope**: Per-project
- **Ordering**: Shares ordering space with root-level sessions
- **Hierarchy**: Can be nested up to 5 levels deep (`main/src/ipc/folders.ts:146-149`)
- **Drag Behavior**:
  - Can be dropped on projects to move to root level
  - Can be dropped on other folders to nest
  - Can be reordered with sessions at the same level
- **Persistence**: `display_order` updated for all root-level folders and sessions together

### Sessions
- **Scope**: Per-project
- **Ordering**: Shares ordering space with root-level folders
- **Folder Assignment**: Sessions can be moved into/out of folders via drag-and-drop
- **Drag Behavior**:
  - Can be dropped on folders to move into the folder
  - Can be dropped on projects to move to root level
  - Can be reordered with folders at the root level
- **Persistence**: `display_order` updated for all root-level sessions and folders together

---

## User Preferences

### Session Sort Direction

- **Location**: Sidebar header button
- **UI Element**: `frontend/src/components/Sidebar.tsx:144-146`
  ```tsx
  <button
    aria-label={sessionSortAscending ? "Sort sessions: Oldest first (click to reverse)" : "Sort sessions: Newest first (click to reverse)"}
    onClick={toggleSessionSortOrder}
  >
  ```
- **States**:
  - `false` (default): Descending order - Newest first (low `display_order` = recent items)
  - `true`: Ascending order - Oldest first (low `display_order` = old items)
- **Persistence**: Stored in UI state table via `main/src/services/uiStateManager.ts`
- **Scope**: Global preference applied to all projects

---

## Calculation Formulas

### Initial Display Order Assignment

When items are first created without a `display_order`, they receive a default based on creation time.

#### Projects (`main/src/database/database.ts:392-400`)
```sql
UPDATE projects
SET display_order = (
  SELECT COUNT(*)
  FROM projects p2
  WHERE p2.created_at <= projects.created_at
    OR (p2.created_at = projects.created_at AND p2.id <= projects.id)
) - 1
WHERE display_order IS NULL
```

#### Sessions (`main/src/database/database.ts:410-420`)
```sql
UPDATE sessions
SET display_order = (
  SELECT COUNT(*)
  FROM sessions s2
  WHERE s2.project_id = sessions.project_id
    AND (s2.created_at < sessions.created_at
      OR (s2.created_at = sessions.created_at AND s2.id <= sessions.id))
) - 1
WHERE display_order IS NULL
```

**Formula**:
- `display_order = COUNT(items_created_before_or_at_same_time) - 1`
- Results in 0-indexed sequential ordering based on creation timestamp

### Manual Reordering

When users drag and drop items:

1. **Create a list** of all items at the same level (e.g., root sessions + root folders)
2. **Sort by current `display_order`**
3. **Remove** the dragged item from its current position
4. **Insert** at the target position
5. **Reassign** `display_order` values: `item.displayOrder = index` (0, 1, 2, ...)
6. **Persist** all updated orders to the database

**Example**:
- Initial: `[{ id: 'A', displayOrder: 0 }, { id: 'B', displayOrder: 1 }, { id: 'C', displayOrder: 2 }]`
- Drag 'C' before 'A'
- Result: `[{ id: 'C', displayOrder: 0 }, { id: 'A', displayOrder: 1 }, { id: 'B', displayOrder: 2 }]`

---

## Sort Direction Impact

The `sessionSortAscending` preference affects how the `display_order` is interpreted:

- **Ascending (`direction = 1`)**: Items with lower `display_order` appear first
  - 0 → 1 → 2 → 3 (oldest to newest if based on creation time)

- **Descending (`direction = -1`)**: Items with higher `display_order` appear first
  - 3 → 2 → 1 → 0 (newest to oldest if based on creation time)

**Note**: The `direction` multiplier is applied to all comparison results in the comparator function, reversing the entire sort order.

---

## Key Implementation Files

| File Path | Description | Lines |
|-----------|-------------|-------|
| `main/src/database/models.ts` | Type definitions for Project, Session, Folder with `display_order` | 1-70 |
| `main/src/database/database.ts` | Database migrations and reorder methods | 382-422, 1446-1460, 2247-2277 |
| `main/src/ipc/project.ts` | Project reordering IPC handler | 266-274 |
| `main/src/ipc/session.ts` | Session reordering IPC handler | 1600-1608 |
| `main/src/ipc/folders.ts` | Folder reordering and move IPC handlers | 82-90 |
| `main/src/ipc/uiState.ts` | UI state persistence IPC handlers | 1-82 |
| `main/src/services/uiStateManager.ts` | UI state manager (sort direction persistence) | 1-80 |
| `frontend/src/components/Sidebar.tsx` | Sort direction toggle and state | 24, 70-80, 144-146 |
| `frontend/src/components/DraggableProjectTreeView.tsx` | Tree comparator and drag-and-drop logic | 44-89, 1054-1553 |

---

## Summary

Crystal's ordering system provides:

1. **Manual Ordering**: Drag-and-drop reordering with persistent `display_order` values
2. **Automatic Fallback**: Creation timestamp-based ordering when `display_order` is not set
3. **Flexible Direction**: User-controlled ascending/descending sort preference
4. **Hierarchical Support**: Folders can be nested, sessions can be grouped in folders
5. **Unified Ordering**: Folders and sessions share the same ordering space at each level
6. **Multi-level Sorting**: `display_order` → `created_at` → `name` → `id` for deterministic results

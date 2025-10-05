# Rexical Implementation Guide for Crystal

## Overview

This guide provides comprehensive documentation for implementing Rexical (Stravu Editor) in Crystal for the Planner panel feature. Rexical is a rich text editor built on Meta's Lexical framework, featuring markdown support, extensible plugins, and comprehensive editing capabilities.

## Architecture Overview

### Core Components

Rexical follows a layered architecture:

```
StravuEditor (top-level wrapper)
  ├── ThemeProvider (theme context)
  └── StravuEditorInner
      ├── RuntimeSettingsProvider (runtime settings context)
      └── LexicalComposer (Lexical framework wrapper)
          ├── SharedHistoryContext (undo/redo)
          ├── TableContext (table editing)
          └── ToolbarContext (toolbar state)
              └── Editor (main editor component)
                  ├── ToolbarPlugin
                  ├── RichTextPlugin (or PlainTextPlugin)
                  ├── Built-in Plugins (50+ plugins)
                  └── PluginManager (custom dynamic plugins)
```

### Key Files in Preditor Reference Implementation

- **`packages/rexical/src/StravuEditor.tsx`**: Main entry point and wrapper
- **`packages/rexical/src/Editor.tsx`**: Core editor component with plugin initialization
- **`packages/rexical/src/EditorConfig.ts`**: Configuration interface and defaults
- **`packages/electron/src/renderer/components/EditorContainer/EditorContainer.tsx`**: Multi-instance editor manager
- **`packages/electron/src/renderer/App.tsx`**: Application integration example

## Installation

### Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "rexical": "^0.34.0",
    "@lexical/clipboard": "^0.34.0",
    "@lexical/code": "^0.34.0",
    "@lexical/code-shiki": "^0.34.0",
    "@lexical/file": "^0.34.0",
    "@lexical/hashtag": "^0.34.0",
    "@lexical/history": "^0.34.0",
    "@lexical/link": "^0.34.0",
    "@lexical/list": "^0.34.0",
    "@lexical/mark": "^0.34.0",
    "@lexical/markdown": "^0.34.0",
    "@lexical/overflow": "^0.34.0",
    "@lexical/plain-text": "^0.34.0",
    "@lexical/react": "^0.34.0",
    "@lexical/rich-text": "^0.34.0",
    "@lexical/selection": "^0.34.0",
    "@lexical/table": "^0.34.0",
    "@lexical/text": "^0.34.0",
    "@lexical/utils": "^0.34.0",
    "@lexical/yjs": "^0.34.0",
    "lexical": "^0.34.0"
  }
}
```

### CSS Import

Rexical requires CSS to be imported:

```typescript
// In your main component or app entry point
import 'rexical/styles';
```

## Basic Usage

### Simple Editor Instance

```typescript
import { StravuEditor } from 'rexical';
import 'rexical/styles';

function MyEditor() {
  return (
    <StravuEditor
      config={{
        initialContent: '# Hello World\n\nStart typing...',
        theme: 'auto',
        isRichText: true,
        onContentChange: (content) => {
          console.log('Content changed:', content);
        },
        onGetContent: (getContentFn) => {
          // Store function to retrieve content later
          contentGetterRef.current = getContentFn;
        }
      }}
    />
  );
}
```

### Configuration Options

Based on `EditorConfig` interface in `packages/rexical/src/EditorConfig.ts`:

```typescript
interface EditorConfig {
  // Core editor behavior
  isRichText?: boolean;                          // Default: true
  emptyEditor?: boolean;                          // Default: false

  // Features
  hasLinkAttributes?: boolean;                    // Open links in new tab, Default: false
  isCodeHighlighted?: boolean;                    // Syntax highlighting, Default: true
  selectionAlwaysOnDisplay?: boolean;             // Show selection when unfocused, Default: false
  shouldPreserveNewLinesInMarkdown?: boolean;     // Default: true

  // List behavior
  listStrictIndent?: boolean;                     // Strict or relaxed indentation, Default: false

  // UI options
  showTreeView?: boolean;                         // Debug node tree, Default: false
  markdownOnly?: boolean;                         // Hide non-markdown features, Default: true

  // Theme
  theme?: 'light' | 'dark' | 'crystal-dark' | 'auto';  // Default: 'auto'

  // Advanced
  markdownTransformers?: Transformer[];           // Custom markdown transformers
  disableBeforeInput?: boolean;                   // For testing, Default: false

  // Callbacks
  onContentChange?: (content: string) => void;
  onGetContent?: (getContentFn: () => string) => void;
  onEditorReady?: (editor: LexicalEditor) => void;
  onSaveRequest?: () => Promise<void>;            // Triggered by Cmd+S

  // Initial content
  initialContent?: string;                        // Markdown string to load
}
```

## Implementation Pattern from Preditor

### 1. EditorContainer Pattern (Multi-Instance Management)

Preditor uses an **EditorPool** pattern to manage multiple editor instances efficiently. Key insights from `EditorContainer.tsx`:

```typescript
// EditorContainer manages multiple StravuEditor instances
// - Creates one editor per tab
// - Shows only the active editor
// - Preserves state when switching tabs
// - Handles autosave per-editor
// - Saves before hiding/closing

<StravuEditor
  key={`${tab.filePath}-v${instance.reloadVersion ?? 0}-theme-${theme}`}
  config={{
    initialContent: instance.content,
    theme,
    onContentChange: () => {
      const currentContent = getContentFn();
      const isDirty = currentContent !== instance.initialContent;

      editorPool.update(tab.filePath, {
        content: currentContent,
        isDirty,
        lastChangeTime: Date.now(),
      });

      onContentChange?.(tab.id, isDirty);
    },
    onGetContent: (getContentFn) => {
      getContentFuncs.current.set(tab.id, getContentFn);
      if (isActive && onGetContent) {
        onGetContent(getContentFn);
      }
    },
    onEditorReady: (editor) => {
      if (isActive && onEditorReady) {
        onEditorReady(editor);
      }
    },
    onSaveRequest: handleManualSave,
  }}
/>
```

### 2. Content Loading and Saving

**Loading Markdown Content:**

```typescript
// Load content from file
const loadContent = async (filePath: string) => {
  const result = await window.electronAPI.readFileContent(filePath);
  return result?.content || '';
};

// Create editor with content
const content = await loadContent(filePath);
editorPool.create(filePath, content);
```

**Saving Content:**

```typescript
// Manual save (Cmd+S)
const handleManualSave = async () => {
  const getContentFn = getContentFuncs.current.get(activeTabId);
  const content = getContentFn();

  await window.electronAPI.saveFile(content, filePath);

  editorPool.update(filePath, {
    isDirty: false,
    initialContent: content,
    lastSaveTime: Date.now(),
  });
};

// Autosave timer
const timer = setInterval(async () => {
  const instance = editorPool.get(filePath);
  if (!instance.isDirty) return;

  // Debounce check
  if (Date.now() - instance.lastChangeTime < 200) return;

  const content = getContentFn();
  await saveWithHistory(filePath, content);

  editorPool.update(filePath, {
    isDirty: false,
    initialContent: content,
    lastSaveTime: Date.now(),
  });
}, 2000);
```

### 3. Theme Management

Preditor syncs theme across the app using React state:

```typescript
// In App.tsx
const [theme, setTheme] = useState<ConfigTheme>(() => {
  const savedTheme = localStorage.getItem('theme');
  return (savedTheme as ConfigTheme) || 'auto';
});

// Apply theme to document
useEffect(() => {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.classList.add('dark-theme');
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.classList.add('light-theme');
    root.setAttribute('data-theme', 'light');
  } else if (theme === 'crystal-dark') {
    root.classList.add('crystal-dark-theme');
    root.setAttribute('data-theme', 'crystal-dark');
  } else {
    // Auto theme
    root.classList.remove('dark-theme', 'light-theme', 'crystal-dark-theme');
    root.removeAttribute('data-theme');
  }

  localStorage.setItem('theme', theme);
}, [theme]);

// Pass theme to all editors
<StravuEditor config={{ theme }} />
```

### 4. Keyboard Shortcuts and Commands

Rexical provides commands that can be triggered externally:

```typescript
import { TOGGLE_SEARCH_COMMAND } from 'rexical';

// Store editor instance
const editorRef = useRef<LexicalEditor | null>(null);

// In onEditorReady callback
config.onEditorReady = (editor) => {
  editorRef.current = editor;
};

// Trigger search with Cmd+F
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault();
    if (editorRef.current) {
      editorRef.current.dispatchCommand(TOGGLE_SEARCH_COMMAND, undefined);
    }
  }
};
```

## Plugin System

### Built-in Plugins

Rexical includes 50+ built-in plugins (see `Editor.tsx` lines 208-344):

- **Core**: RichTextPlugin, PlainTextPlugin, HistoryPlugin
- **Markdown**: MarkdownShortcutPlugin, CodeHighlightPlugin
- **Formatting**: FloatingTextFormatToolbarPlugin, ToolbarPlugin
- **Content**: ImagesPlugin, LinkPlugin, TablesPlugin, ListPlugin
- **Advanced**: DiffPlugin, ExcalidrawPlugin, KanbanBoardPlugin
- **Search**: SearchReplacePlugin

### Custom Plugin Registration

Rexical uses a plugin registry for dynamic plugins. From `registerDocumentLinkPlugin.tsx`:

```typescript
import { pluginRegistry, type PluginPackage } from 'rexical';

// Define plugin package
const myPluginPackage: PluginPackage = {
  name: 'MyCustomPlugin',
  Component: MyPluginComponent,         // React component
  nodes: [CustomNode],                  // Lexical nodes
  transformers: [CustomTransformer],    // Markdown transformers
  enabledByDefault: true
};

// Register plugin (must happen before editor initialization)
export function registerMyPlugin(): void {
  pluginRegistry.register(myPluginPackage);
}

// In app entry point
registerMyPlugin();
```

### Plugin Component Example

```typescript
function MyPluginComponent() {
  const [editor] = useLexicalComposerContext();
  const anchorElem = useAnchorElem(); // From AnchorContext

  useEffect(() => {
    return editor.registerCommand(
      MY_COMMAND,
      (payload) => {
        // Handle command
        return true;
      },
      COMMAND_PRIORITY_NORMAL
    );
  }, [editor]);

  return null; // Or return UI elements
}
```

## Frontmatter Support

Rexical has built-in YAML frontmatter support:

```typescript
import {
  $getFrontmatter,
  $setFrontmatter,
  parseFrontmatter,
  serializeWithFrontmatter
} from 'rexical';

// Parse markdown with frontmatter
const parsed = parseFrontmatter(markdownString);
console.log(parsed.data);      // { title: 'My Doc', tags: ['foo', 'bar'] }
console.log(parsed.content);   // Markdown without frontmatter

// Within editor.update()
editor.update(() => {
  const frontmatter = $getFrontmatter();
  $setFrontmatter({ ...frontmatter, modified: new Date().toISOString() });
});

// Export with frontmatter
const content = getContentFn();
const withFrontmatter = serializeWithFrontmatter(content, frontmatterData);
```

## Advanced Features

### Diff/Replace Support

Rexical includes a DiffPlugin for showing inline diffs:

```typescript
import {
  applyMarkdownReplace,
  $approveDiffs,
  $rejectDiffs,
  type TextReplacement
} from 'rexical';

// Apply replacements (shows green/red diff highlighting)
const replacements: TextReplacement[] = [
  { search: 'old text', replace: 'new text' },
  { search: /regex pattern/, replace: 'replacement' }
];

editor.update(() => {
  applyMarkdownReplace(replacements);
});

// Approve or reject diffs
editor.update(() => {
  $approveDiffs();  // Accept changes
  // OR
  $rejectDiffs();   // Revert changes
});
```

### Markdown Normalization

Rexical normalizes markdown indentation automatically:

```typescript
import { normalizeMarkdown } from 'rexical';

const normalized = normalizeMarkdown(markdownContent, {
  targetIndentSize: 2,  // Convert all indents to 2 spaces
  preserveCodeBlocks: true,
  normalizeListMarkers: true
});
```

## Implementation Guide for Crystal Planner Panel

### Step 1: Add Dependencies

Update `frontend/package.json`:

```json
{
  "dependencies": {
    "rexical": "^0.34.0",
    "lexical": "^0.34.0",
    "@lexical/react": "^0.34.0",
    "@lexical/clipboard": "^0.34.0",
    "@lexical/code": "^0.34.0",
    "@lexical/hashtag": "^0.34.0",
    "@lexical/history": "^0.34.0",
    "@lexical/link": "^0.34.0",
    "@lexical/list": "^0.34.0",
    "@lexical/markdown": "^0.34.0",
    "@lexical/rich-text": "^0.34.0",
    "@lexical/selection": "^0.34.0",
    "@lexical/table": "^0.34.0",
    "@lexical/utils": "^0.34.0"
  }
}
```

### Step 2: Create Planner Panel Component

Create `frontend/src/components/PlannerPanel/PlannerPanel.tsx`:

```typescript
import React, { useRef, useState, useEffect } from 'react';
import { StravuEditor } from 'rexical';
import type { ConfigTheme, LexicalEditor } from 'rexical';
import 'rexical/styles';

interface PlannerPanelProps {
  sessionId: string;
  theme: ConfigTheme;
  onContentChange?: (content: string, isDirty: boolean) => void;
}

export const PlannerPanel: React.FC<PlannerPanelProps> = ({
  sessionId,
  theme,
  onContentChange
}) => {
  const [content, setContent] = useState<string>('');
  const [initialContent, setInitialContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const editorRef = useRef<LexicalEditor | null>(null);
  const getContentRef = useRef<(() => string) | null>(null);

  // Load planner content for session
  useEffect(() => {
    const loadPlanner = async () => {
      const result = await window.electronAPI.invoke(
        'planner:load',
        sessionId
      );
      if (result?.content) {
        setContent(result.content);
        setInitialContent(result.content);
      }
    };

    loadPlanner();
  }, [sessionId]);

  // Autosave
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(async () => {
      if (getContentRef.current) {
        const currentContent = getContentRef.current();
        await window.electronAPI.invoke(
          'planner:save',
          sessionId,
          currentContent
        );
        setInitialContent(currentContent);
        setIsDirty(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isDirty, sessionId]);

  return (
    <div className="planner-panel">
      <StravuEditor
        key={`planner-${sessionId}-${theme}`}
        config={{
          initialContent: content,
          theme,
          isRichText: true,
          isCodeHighlighted: true,
          markdownOnly: true,
          onContentChange: (newContent) => {
            const dirty = newContent !== initialContent;
            setIsDirty(dirty);
            onContentChange?.(newContent, dirty);
          },
          onGetContent: (getContentFn) => {
            getContentRef.current = getContentFn;
          },
          onEditorReady: (editor) => {
            editorRef.current = editor;
          },
          onSaveRequest: async () => {
            if (getContentRef.current) {
              const currentContent = getContentRef.current();
              await window.electronAPI.invoke(
                'planner:save',
                sessionId,
                currentContent
              );
              setInitialContent(currentContent);
              setIsDirty(false);
            }
          }
        }}
      />
    </div>
  );
};
```

### Step 3: Add IPC Handlers in Main Process

Create `main/src/ipc/planner.ts`:

```typescript
import { ipcMain } from 'electron';
import { getDatabase } from '../database';

export function setupPlannerHandlers() {
  // Load planner content for session
  ipcMain.handle('planner:load', async (event, sessionId: string) => {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT planner_content FROM sessions WHERE id = ?'
    ).get(sessionId);

    return {
      content: row?.planner_content || '# Planner\n\n'
    };
  });

  // Save planner content
  ipcMain.handle('planner:save', async (event, sessionId: string, content: string) => {
    const db = getDatabase();
    db.prepare(
      'UPDATE sessions SET planner_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(content, sessionId);

    return { success: true };
  });
}
```

### Step 4: Database Migration

Add planner column to sessions table:

```sql
ALTER TABLE sessions ADD COLUMN planner_content TEXT;
```

### Step 5: Integrate into Session View

Update `frontend/src/components/SessionView.tsx` to add Planner tab:

```typescript
// Add to tab list
const tabs = ['Output', 'Diff', 'Logs', 'Editor', 'Planner'];

// Render planner panel
{activeView === 'Planner' && (
  <PlannerPanel
    sessionId={sessionId}
    theme={theme}
    onContentChange={(content, isDirty) => {
      console.log('Planner content changed, isDirty:', isDirty);
    }}
  />
)}
```

## Best Practices

### 1. Key Prop Pattern

Always use a unique key that includes version/theme to force remount when needed:

```typescript
<StravuEditor
  key={`${uniqueId}-v${version}-theme-${theme}`}
  config={{ ... }}
/>
```

### 2. Content Getter Storage

Store the `getContent` function from `onGetContent` callback - don't call it on every render:

```typescript
const getContentRef = useRef<(() => string) | null>(null);

config.onGetContent = (getContentFn) => {
  getContentRef.current = getContentFn;
};

// Later when you need content:
const content = getContentRef.current?.();
```

### 3. Dirty State Tracking

Track dirty state by comparing current content to initial content:

```typescript
const isDirty = currentContent !== initialContent;
```

### 4. Autosave Debouncing

Use both time-based intervals and change-time tracking:

```typescript
// Check if enough time passed since last change
if (Date.now() - lastChangeTime < 200) return;
```

### 5. Theme Synchronization

Ensure theme is applied to document root and passed to all editors consistently:

```typescript
useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
}, [theme]);
```

## Common Patterns

### Loading State

```typescript
const [isLoading, setIsLoading] = useState(true);
const [content, setContent] = useState('');

useEffect(() => {
  loadContent().then(c => {
    setContent(c);
    setIsLoading(false);
  });
}, []);

return isLoading ? <Spinner /> : <StravuEditor config={{ initialContent: content }} />;
```

### Error Boundaries

```typescript
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary
  fallback={<div>Editor failed to load</div>}
  onError={(error) => console.error('Editor error:', error)}
>
  <StravuEditor config={...} />
</ErrorBoundary>
```

### Multiple Editors with Tabs

```typescript
// Show only active editor, but keep others in DOM (hidden)
{tabs.map(tab => (
  <div
    key={tab.id}
    className={tab.id === activeTabId ? 'visible' : 'hidden'}
  >
    <StravuEditor config={{ initialContent: tab.content }} />
  </div>
))}
```

## Troubleshooting

### Editor Not Rendering

- Ensure `rexical/styles` is imported
- Check that all peer dependencies are installed
- Verify theme classes are applied to document root

### Content Not Saving

- Check that `onGetContent` callback is storing the function
- Verify IPC handlers are registered in main process
- Use browser DevTools to inspect IPC communication

### Styling Issues

- Rexical requires specific CSS structure - don't override `.editor-shell`
- Use `data-theme` attribute on container for theme-specific styles
- Check for conflicting CSS from other components

### Performance Issues

- Use `key` prop to control when editor remounts
- Implement virtualization for many editors (show only visible ones)
- Debounce autosave and content change callbacks

## References

- **Lexical Documentation**: https://lexical.dev/
- **Rexical Package**: https://github.com/stravu/stravu-editor
- **Preditor Source**: `/Users/jordanbentley/git/stravu/preditor/packages/electron/src/renderer`
- **EditorContainer Pattern**: `packages/electron/src/renderer/components/EditorContainer/EditorContainer.tsx`
- **Plugin Registration**: `packages/electron/src/renderer/plugins/registerDocumentLinkPlugin.tsx`

## Next Steps

1. Install dependencies in Crystal frontend
2. Create `PlannerPanel.tsx` component
3. Add database migration for `planner_content` column
4. Implement IPC handlers for load/save
5. Integrate panel into session view tabs
6. Test with multiple sessions and theme switching
7. Implement autosave and dirty state tracking
8. Add keyboard shortcuts (Cmd+S to save)

---

**Document created for Crystal Planner Panel implementation**
**Source: Preditor repository at `/Users/jordanbentley/git/stravu/preditor`**
**Date: 2025-10-05**

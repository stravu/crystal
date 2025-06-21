# Auto-Save and Refresh Implementation in Crystal

This document explains how the auto-save and refresh functionality works in the Crystal diff viewer.

## Overview

The implementation consists of two main features:
1. **Auto-save**: Automatically saves file changes after a 1-second debounce period
2. **Auto-commit**: Automatically commits changes after each Claude Code prompt completion

## Auto-Save Implementation

### Components Involved

1. **MonacoDiffViewer.tsx** - The main component that handles file editing
   - Uses Monaco Editor's diff editor for side-by-side comparison
   - Implements auto-save with a 1-second debounce
   - Shows save status indicators (pending, saving, saved, error)

2. **debounce.ts** - Utility function for debouncing save operations
   - Prevents excessive save operations during rapid typing
   - Includes a `cancel` method to allow immediate saves (Cmd/Ctrl+S)

### How Auto-Save Works

1. **Change Detection**: When the user types in the Monaco editor:
   ```typescript
   modifiedEditor.onDidChangeModelContent(() => {
     const newContent = modifiedEditor.getValue();
     setCurrentContent(newContent);
     
     if (newContent !== file.newValue) {
       setSaveStatus('pending');
       setSaveError(null);
       debouncedSave(newContent);
     }
   });
   ```

2. **Debounced Save**: Changes are saved after 1 second of inactivity:
   ```typescript
   const debouncedSave = useMemo(
     () => debounce(performSave, 1000),
     [performSave]
   );
   ```

3. **Save Operation**: Files are written through Electron IPC:
   ```typescript
   const result = await window.electronAPI.invoke('file:write', {
     sessionId,
     filePath: file.path,
     content
   });
   ```

4. **Status Indicators**: Visual feedback shows save status:
   - Yellow spinner: "Saving..."
   - Green checkmark: "Saved"
   - Red alert: Error with message
   - Yellow text: "Auto-save pending..."

5. **Manual Save**: Cmd/Ctrl+S triggers immediate save, cancelling any pending debounced save

## Auto-Commit Implementation

### Components Involved

1. **CreateSessionDialog.tsx** - Session creation with auto-commit checkbox
   - Default enabled (true)
   - Stored in session configuration

2. **SessionInput.tsx** / **SessionInputWithImages.tsx** - Runtime toggle
   - Shows auto-commit checkbox in session input area
   - Allows toggling during active session

3. **ExecutionTracker.ts** - Backend auto-commit logic
   - Monitors Claude Code execution completion
   - Automatically commits changes when enabled

### How Auto-Commit Works

1. **Session Creation**: Auto-commit preference is set during session creation:
   ```typescript
   const [autoCommit, setAutoCommit] = useState(true); // Default to true
   ```

2. **Runtime Toggle**: Users can toggle auto-commit during session:
   ```typescript
   <input 
     type="checkbox" 
     checked={activeSession.autoCommit ?? true} 
     onChange={handleToggleAutoCommit}
   />
   ```

3. **Execution Tracking**: When Claude Code completes a prompt:
   ```typescript
   async endExecution(sessionId: string): Promise<void> {
     const autoCommitEnabled = session?.autoCommit ?? true;
     
     if (autoCommitEnabled) {
       const statusOutput = execSync('git status --porcelain', { cwd: context.worktreePath });
       
       if (statusOutput) {
         execSync('git add -A', { cwd: context.worktreePath });
         const commitMessage = context.prompt || `Claude Code execution ${context.executionSequence}`;
         execSync(`git commit -m ${JSON.stringify(commitMessage)}`, { cwd: context.worktreePath });
       }
     }
   }
   ```

4. **Error Handling**: If auto-commit fails (e.g., pre-commit hooks):
   - Error is logged and displayed in session output
   - Changes remain uncommitted for manual intervention
   - Session continues normally

## Refresh Implementation

### Components Involved

1. **CombinedDiffView.tsx** - Main diff view container
   - Tracks modified files
   - Refreshes uncommitted changes when files are saved

2. **DiffViewer.tsx** - File list and diff display
   - Receives `onFileSave` callback from parent
   - Triggers refresh of uncommitted changes

### How Refresh Works

1. **File Save Detection**: When a file is saved in the Monaco editor:
   ```typescript
   const handleFileSave = useCallback((filePath: string) => {
     setModifiedFiles(prev => {
       const newSet = new Set(prev);
       newSet.add(filePath);
       return newSet;
     });
     
     // Refresh only uncommitted changes when a file is saved
     if (selectedExecutions.includes(0)) {
       const loadUncommittedDiff = async () => {
         const response = await API.sessions.getCombinedDiff(sessionId, [0]);
         if (response.success) {
           setCombinedDiff(response.data);
         }
       };
       loadUncommittedDiff();
     }
   }, [sessionId, selectedExecutions]);
   ```

2. **Selective Refresh**: Only refreshes if viewing uncommitted changes (execution ID 0)

3. **Diff Update**: Fetches updated diff from backend and updates display

## Data Flow

1. **User edits file** → Monaco editor detects change
2. **Debounce timer starts** → Shows "Auto-save pending..."
3. **After 1 second** → File is saved via IPC
4. **Save completes** → Shows "Saved" status
5. **If viewing uncommitted changes** → Diff view refreshes
6. **When Claude completes prompt** → Auto-commit runs (if enabled)
7. **Commit success** → Execution list updates with new commit

## Configuration

- **Auto-save delay**: 1000ms (hardcoded in MonacoDiffViewer)
- **Auto-commit default**: true (in CreateSessionDialog)
- **Save status display duration**: 2000ms (shows "Saved" for 2 seconds)

## Error Handling

1. **Save Errors**: 
   - Displayed inline in the editor header
   - Prevents further auto-saves until resolved

2. **Commit Errors**:
   - Displayed in session output with detailed error message
   - Includes git command and error output
   - Changes remain uncommitted for manual resolution

## Performance Considerations

1. **Debouncing**: Prevents excessive file writes during rapid typing
2. **Selective Refresh**: Only refreshes diff when necessary
3. **Status Indicators**: Provide immediate feedback without blocking UI
4. **Error Recovery**: Graceful handling prevents session interruption
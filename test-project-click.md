# Test: Project Click Behavior

## Expected Behavior
When clicking on a project in the sidebar, the app should:
1. Navigate to the project view
2. Show the Dashboard tab by default
3. NOT create a "(Main)" session automatically
4. Only create a "(Main)" session when switching to Files, Terminal, or Output tabs

## Changes Made
Modified `frontend/src/components/ProjectView.tsx`:
- Added check in the useEffect to skip creating main repo session when `viewMode === 'dashboard'`
- This prevents automatic creation of "(Main)" session when just viewing the project dashboard

## Test Steps
1. Start the app: `pnpm electron-dev`
2. Click on a project in the sidebar
3. Verify that the Dashboard tab is shown
4. Check that no "(Main)" session appears in the session list
5. Switch to Files tab
6. Verify that a "(Main)" session is created only at this point
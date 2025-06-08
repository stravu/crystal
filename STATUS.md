# Frontend Improvements Implementation Status

| Change Name | Change Description | Change Completed | Change Tested | Flow of Test | Results of Test | Notes from Testing |
|-------------|-------------------|------------------|---------------|--------------|-----------------|-------------------|
| Collapse File Path | Collapse the long file-system path in the header behind a chevron or tooltip | ✅ | ✅ | 1. Run dev server 2. Create session 3. Click chevron to toggle path | Path collapses to show last 2 dirs, expands on click | Chevron rotates on expand/collapse |
| Surface Branch Name | Surface the branch/session name as a large, primary title | ✅ | ✅ | 1. Run dev server 2. Create session 3. Observe header | Session name shows in large bold font (text-xl) | Font is noticeably larger and bolder |
| Status Chips | Replace the tiny "Completed" dot with explicit status chips—Running, Success, Error—and animate while active | ❌ | ❌ | - | - | - |
| Git Action Pills | Convert the "Main → Worktree / Worktree → Main (FF)" buttons into icon-based "Git action" pills with tooltips | ❌ | ❌ | - | - | - |
| Auto-collapse Prompt History | Auto-collapse the empty "Prompt History" panel and reopen it only after a prompt exists | ❌ | ❌ | - | - | - |
| Unread Activity Badges | Display unread-activity badges on tabs that aren't in view | ❌ | ❌ | - | - | - |
| Side-by-side Diff Toggle | Offer a side-by-side diff toggle and remember the user's last choice | ❌ | ❌ | - | - | - |
| Auto-growing Textarea | Expand the bottom prompt input into an auto-growing textarea and send on ⌘↵ | ❌ | ❌ | - | - | - |
| Session Status Legend | Clarify the meaning of yellow vs. grey dots in the Sessions list with a tooltip legend or distinct icons | ❌ | ❌ | - | - | - |
| Plural Grammar Fix | Fix singular/plural grammar in the file-change stats | ❌ | ❌ | - | - | - |
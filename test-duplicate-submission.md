# Test Plan for Duplicate Submission Fix

## Bug Description
When CMD+Enter is pressed twice rapidly, two Claude Code interactions are kicked off. When Cancel is pressed, only one stops and the Cancel button changes back to "Continue" even though the second Claude instance keeps running.

## Changes Made

### Frontend Protection (Session Input Components)
1. **SessionInput.tsx**:
   - Added `isSubmitting` state to track submission status
   - Modified `onKeyDown` and `onClickSend` to check `isSubmitting` before processing
   - Added 500ms cooldown period after each submission
   - Visual feedback: button shows "Processing..." and becomes disabled during submission

2. **SessionInputWithImages.tsx**:
   - Same protection as SessionInput.tsx
   - Prevents duplicate submissions with images attached

### Backend Protection
1. **ipc/session.ts**:
   - Added check in `sessions:continue` handler to prevent duplicate starts
   - Returns error if Claude is already running for the session

2. **claudeCodeManager.ts**:
   - Enhanced `continueSession` to properly kill existing processes
   - Added 100ms delay after kill to ensure cleanup
   - Double-checks that process was actually killed before starting new one

## Test Steps

### Test 1: Rapid CMD+Enter Prevention
1. Open Crystal app
2. Create or select a session
3. Type a prompt in the input field
4. Press CMD+Enter twice rapidly (within 500ms)
5. **Expected**: Only one Claude instance should start, second press should be ignored
6. **Verify**: Console should show "Ignoring duplicate submission attempt"

### Test 2: Button Disable During Processing
1. Start a new session or continue an existing one
2. Type a prompt and click Continue/Send button
3. **Expected**: Button should show "Processing..." and be disabled (grayed out)
4. After submission completes, button should re-enable

### Test 3: Cancel Button Behavior
1. Start a Claude session with a long-running task
2. While it's running, click Cancel
3. **Expected**: Session should stop completely
4. **Verify**: Cancel button should not revert to Continue if Claude is still running

### Test 4: Backend Protection
1. Try to continue a session that's already processing
2. **Expected**: Backend should reject with "Session is already processing a request"
3. **Verify**: Check logs for "[IPC] Session X is already running, preventing duplicate continue"

## Verification Commands

Run the app in development mode to see console logs:
```bash
pnpm electron-dev
```

Check for protection messages in console:
- Frontend: "[SessionInput] Ignoring duplicate submission attempt"
- Backend: "[IPC] Session X is already running, preventing duplicate continue"
- Backend: "[ClaudeCodeManager] Killing existing process for session X before continuing"

## Success Criteria
- [ ] No duplicate Claude instances can be started from rapid CMD+Enter
- [ ] Button shows visual feedback during processing
- [ ] Cancel properly stops all running instances
- [ ] Backend rejects duplicate continue requests
- [ ] 500ms cooldown prevents accidental double-submissions
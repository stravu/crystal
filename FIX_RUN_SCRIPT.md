# Fix for Run Script Functionality

## Issue
The "run script" functionality is not working because script output events are not being forwarded through Socket.IO in the Electron main process.

## Solution
Add the following code to `main/src/server.ts` after line 179 (inside the `setupSocketIO` method):

```typescript
// Listen to script output events
sessionManager.on('script-output', (output) => {
  // Broadcast script output to all clients
  this.io.emit('script:output', output);
});
```

This code should be added right after the `claudeCodeManager.on('error', ...)` event handler.

## Context
- The frontend is already listening for `script:output` events in `useSocket.ts`
- The `sessionManager` already emits `script-output` events when running scripts
- The missing piece was forwarding these events through Socket.IO to the frontend

## Note
The `main/` directory is currently gitignored, which is why this fix cannot be committed directly. Consider removing `main/` from `.gitignore` to properly track the Electron main process source code.
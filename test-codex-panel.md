# Testing Codex Panel Integration

## Test Steps

1. **Create a New Session**
   - Click "Create Session" button
   - Enter a test prompt
   - Session should be created

2. **Add a Codex Panel**
   - In the session view, click "Add Tool" button
   - Select "Codex" from the dropdown
   - A new Codex panel tab should appear

3. **Test Codex Panel Functionality**
   - Click on the Codex panel tab
   - The panel should initialize and show Codex output
   - Enter a prompt like "Hello, what model are you?"
   - Codex should respond

## Expected Behavior

- The Codex panel should appear in the tool panel bar below the main view tabs
- The panel should show the Codex interface similar to Claude panels
- Codex should start with the `gpt-4o` model by default
- The approval policy should be set to `on-request` to avoid the previous error

## What to Check in Logs

Look for these log messages:
- `[CodexPanel IPC] Starting Codex panel`
- `Codex spawned successfully for panel`
- No errors about invalid `approval_policy` values

## Troubleshooting

If the Codex process fails to start, check:
1. OpenAI API key is set in environment or config
2. The `codex` CLI is installed (npm install -g @openai/codex)
3. No errors in the console about invalid configuration values
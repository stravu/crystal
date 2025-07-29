# Testing Autocommit Display

To see the autocommit display feature:

1. **Create a new session** with a project that has git initialized

2. **Check commit mode** - In the session input area, make sure the commit mode is set to:
   - "Checkpoint" mode (default) - Creates commits after each prompt
   - NOT "Disabled" mode - This won't create any commits

3. **Send a prompt that makes changes** - For example:
   - "Create a new file called test.js with a hello world function"
   - "Add a new function to an existing file"

4. **After Claude responds**, you should see a commit summary card between your prompt and Claude's response showing:
   - Commit message (e.g., "checkpoint: Create a new file...")
   - File stats (e.g., "1 file +5 -0")
   - Commit hash

5. **If you don't see it**, try:
   - Open DevTools Console and run: `localStorage.removeItem('richOutputSettings')`
   - Refresh the page
   - Check if the execution is actually creating commits (you can verify in the View Diff tab)

The commit summaries appear chronologically in the conversation flow, right after the user prompt that triggered them.
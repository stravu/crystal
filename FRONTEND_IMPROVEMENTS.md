1. **Collapse the long file-system path in the header behind a chevron or tooltip.**
   *Explanation:* The absolute path dominates the header and pushes the actual session title out of view. Hiding it until users need it keeps the focus on what matters most—the branch/run name.

2. **Surface the branch/session name (`hello-feature-1`, etc.) as a large, primary title.**
   *Explanation:* Prominent titles anchor users, making it clear which context they’re in when multiple sessions are open.

3. **Replace the tiny “Completed” dot with explicit status chips—`Running`, `Success`, `Error`—and animate while active.**
   *Explanation:* Clear language plus subtle motion eliminates ambiguity about whether an execution has finished or is still processing.

4. **Convert the “Main → Worktree / Worktree → Main (FF)” buttons into icon-based “Git action” pills with tooltips.**
   *Explanation:* Arrow-heavy labels are cryptic for new users; recognizable merge/rebase icons shorten the learning curve.

6. **Auto-collapse the empty “Prompt History” panel and reopen it only after a prompt exists.**
   *Explanation:* When blank, the panel wastes horizontal space and adds visual noise.

8. **Display unread-activity badges on tabs that aren’t in view (e.g., new terminal output).**
   *Explanation:* Users won’t miss important logs that appear while they’re reading a diff or output.

9. **Offer a side-by-side diff toggle and remember the user’s last choice.**
   *Explanation:* Inline diffs can feel cramped for large refactors; side-by-side improves scanability.

10. **Expand the bottom prompt input into an auto-growing textarea and send on `⌘↵`.**
    *Explanation:* Longer prompts (especially code snippets) need room; single-line inputs invite errors and scrolling pain.

11. **Clarify the meaning of yellow vs. grey dots in the Sessions list with a tooltip legend or distinct icons.**
    *Explanation:* Without guidance, users can’t decode the state of runs at a glance.

13. **Fix singular/plural grammar in the file-change stats (“1 file” vs. “3 files”).**
    *Explanation:* Small polish issues erode trust in a coding tool meant to automate precision work.
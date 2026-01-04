# Claude Code Rules for Crystal

## Git Remote Policy

**CRITICAL**: When creating pull requests or pushing branches, ALWAYS use `origin` as the remote - NEVER use `upstream`.

- Push branches to `origin`: `git push -u origin <branch-name>`
- Create PRs against `origin`: `gh pr create` (defaults to origin)
- If you need to explicitly specify: `gh pr create --repo origin`

This repository may be a fork with an `upstream` remote configured, but all PRs and pushes should go to `origin` (the fork), not `upstream` (the original repo).

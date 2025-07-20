## Summary

This PR introduces a new **Project Dashboard** view that fundamentally changes how users interact with projects in Crystal. Instead of showing a dialog to create sessions without worktrees, clicking on a project now displays a comprehensive dashboard with git status information.

## Key Changes

### 🎯 Replaces Non-Worktree Session Creation Dialog
- **Before**: Clicking a project showed a dialog asking if you want to create a session without a worktree
- **After**: Clicking a project displays a full dashboard with project status and existing sessions

### 📊 New Project Dashboard Features

#### Multi-Origin Git Status Display
- Visual cascade showing the flow: `upstream → origin/fork → local main → session branches`
- Automatically detects and displays multiple remotes
- Color-coded status indicators:
  - 🟢 Green = Synced
  - 🟡 Yellow = Behind
  - 🔵 Blue = Ahead  
  - 🔴 Red = Diverged
- Shows commit counts for ahead/behind status
- "Fork" badge when origin is a fork with an upstream

#### Session Management
- Comprehensive table showing all session branches
- Quick filtering options:
  - All Sessions
  - Stale Only
  - With Changes
  - With PR
- Click any session row to navigate directly to that session
- Full viewport scrolling for projects with many sessions

#### Status Summary Cards
- **Up to date**: Shows how many sessions are current (e.g., "8/12")
- **Stale**: Count of sessions behind their base branch
- **Changes**: Sessions with uncommitted changes

### 🐛 Fixes Included
- Project name now displays correctly in dashboard header
- Sessions table properly scrolls when there are many sessions
- Sidebar session clicking now correctly navigates to sessions
- Proper skeleton loading states when switching between projects

### 🏗️ Technical Implementation
- New IPC endpoint: `dashboard:get-project-status`
- Caching layer for dashboard data to improve performance
- Fetches from all git remotes to show complete status
- New navigation store to manage dashboard vs session views
- Responsive design with proper viewport utilization

## Screenshots

The dashboard provides immediate visibility into:
1. Is my fork behind the upstream?
2. Is my local main behind my fork's origin?
3. Which sessions are stale and need updating?

All this information is now available at a glance without needing to create a new session.

## Testing
- Click on any project in the sidebar to see the new dashboard
- Test with projects that have:
  - Single remote (origin only)
  - Multiple remotes (upstream + origin)
  - Many sessions to verify scrolling
- Use the filter dropdown to filter sessions
- Click on sessions to verify navigation works

This change significantly improves the UX by providing immediate project insights and making session management more intuitive.
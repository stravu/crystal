
All notable changes to Crystal will be documented in this file.

## [0.2.3] - 2025-08-25

### Fixed
- **Session completion status updates** - Fixed "Rebase to main" button not updating when a session completed
- **Session archiving performance** - Made session archiving operation much quicker

## [0.2.2] - 2025-08-23

### Added
- **Homebrew install** - Crystal can now be installed with `brew install --cask stravu-crystal` on OSX

### Changed
- **Performance improvements** - Optimized application performance for faster response times and smoother operation

## [0.2.1] - 2025-08-21

### Added
- **'Auto' model selection** - New automatic model selection option that lets Claude Code choose the best model
- **Sub-agent output visualization** - Enhanced UX for displaying sub-agent task outputs
- **Terminal/Logs separation** - Logs from run scripts now have their own dedicated tab with filter and search
- **Dev mode for debugging** - New developer mode to view raw Claude Code messages in the Messages tab
- **Canary channel publishing** - Automatic canary builds from main branch for early testing

### Changed
- **Performance improvements** - Various optimizations for better responsiveness
- **Auto-scroll reliability** - More reliable auto-scrolling behavior that only activates when at bottom of output
- **Project panel usage** - Now uses project panel instead of special (main) session
- **Git branch actions labeling** - Renamed "Branch Actions" to "Git Branch Actions" for clarity

### Fixed
- **Double prompt submission prevention** - Fixed issue where prompts could be submitted twice
- **Commit message display** - Fixed showing commit messages in diff viewer
- **Worktree file references** - Don't show worktree files when using @ to reference files
- **Git status indicators** - Fixed "Behind Only - No unique changes" status marker
- **Revert button backend** - Updated backend to use after_commit_hash for revert button functionality
- **Run script log clearing** - Clear logs on fresh run script execution
- **Canary build process** - Fixed canary build issues

### Documentation
- **Demo video updated** - Updated demo video to showcase latest features
- **Markdown cleanup** - Cleaned up and reorganized documentation structure

## [0.2.0] - 2025-08-05

### Added
- Rich Output for Claude Code to replace text-only output
- Light/Dark modes
- Compact context
- AWS Bedrock model support
- Git status indicators in session sidebar
- Always use the latest versions of Opus/Sonnet/Haiku, including Opus 4.1

### Changed
- Terminal scrollback increased to 100,000 lines for better debugging
- Project dashboard loading improvements
- Enhanced IDE integration with loading states and command validation

### Fixed
- Duplicate right-click context menus issue
- IDE button not opening IDE properly
- Context compaction now actually restarts conversations instead of just showing status
- GTK 3 forced on Linux to resolve Electron 36 compatibility issues

## [0.1.17] - 2025-07-23

### Added
- Project Dashboard view
- Multi-mode auto-commit system
- Visual refinements to Projects & Sessions sidebar with tree lines
- Slider to select session count when creating multiple sessions

### Changed
- Improved indentation levels in UI

### Fixed
- ReferenceError: ReadableStream is not defined
- Bug where navigation away from dashboard was blocked
- Index issue with session navigation
- Messages tab functionality restored for debugging Claude Code JSON output
- Subfolder creation issues

### Internal/Development
- Multiple code refactoring attempts (some reverted for stability)
- Build artifacts now show commit hash
- Added strict port checking for Vite dev server
- CI/CD improvements including GitHub Actions for testing and building
- Frontend console debugging for developing Crystal on Crystal

## [0.1.16] - 2025-07-18

Special thanks to eshaffer321 who contributed almost all the code in this release.

### Added
- Ability to rename folders
- Support for nested folders within projects
- Archive sessions and view archived sessions
- Persistent version display with git commit SHA

### Enhanced
- Improved prompt input bar UX
- Create Session dialog UX improvements

### Fixed
- prevents excessive notifications on startup
- Terminal output being cut off by 'Claude is working' status panel
- Auto-focus terminal when switching to terminal view
- Notification settings persistence and completion sound timing
- Notification settings toggle visual feedback

## [0.1.15] - 2025-07-17

### Added
- Model selection support for each session - users can now choose which Claude model to use
- Enhanced prompt history UX with modal dialogs for better readability
- Double-click to view full prompt text in a dedicated modal

### Fixed
- Fixed Node PATH issues on latest macOS versions (hopefully)

### Security
- Fixed potential command injection vulnerabilities in git operations (#36)
- Fixed potential XSS vulnerability in GitErrorDialog (#35)

### Changed
- Improved prompt navigation with better UI interactions
- Cleaned up legacy pre-Electron code

## [0.1.14] - 2025-07-11

### Fixed
- Fixed git main branch detection to properly detect the repository's actual main branch
- Fixed terminal and output screens auto-scrolling when user is not at the bottom
- Fixed delay in streaming new output to improve real-time responsiveness

### Improved
- Better handling of git commit list display
- Updated Crystal-on-Crystal instructions for improved self-hosting experience

## [0.1.13] - 2025-07-09

### Added
- Clear button for terminal tab to easily clear terminal output
- SQLite database documentation for better developer understanding

### Fixed
- Fixed duplicated output issue that was causing redundant display of messages
- Fixed reliability of Mermaid diagram rendering
- Main branch detection now properly uses the current project directory's actual branch

### Improved
- Better UX around @ file mentions with improved autocomplete and validation
- Settings dialogs now have sticky footers for better accessibility
- Session naming now requires manual input when no API key is set

## [0.1.12] - 2025-07-08

### Added
- File tree view is now resizable for better workspace customization
- Markdown file preview support for better documentation viewing
- Support for adding files using @<file-path> syntax for easier file references
- Ability to set a different worktree folder for each project, providing more flexibility in project organization

### Fixed
- Fixed bug where .gitignore files were incorrectly hidden in the file tree

## [0.1.11] - 2025-07-03

### Added
- File navigation support in diff viewer - Click on file paths in the diff to navigate directly to specific files

### Fixed
- Fixed infinite recursion logging bug that could cause performance issues
- Fixed run scripts not being properly terminated when stopping sessions
- Fixed continue button sizing issue in the UI
- Fixed diff viewer unmount errors
- Fixed Discord popup behavior for existing users
- Fixed event emitter memory leak in renderer process

### Improved
- Better process termination handling with appropriate timeouts
- More robust zombie process cleanup

## [0.1.10] - 2025-07-01

### Added
- Discord community popup to foster user engagement and support https://discord.gg/XrVa6q7DPY

### Changed
- Improved Claude thinking block parsing for better display of reasoning process
- Enhanced process termination with longer timeouts to ensure clean shutdown
- Better folder state persistence for improved user experience
- Improved zombie process handling to prevent orphaned processes
- Main branch detection now uses git folder's actual main branch instead of configuration

### Fixed
- Fixed double scrollbar issue in diff viewer for better UI consistency
- Improved folder deletion functionality

## [0.1.9] - 2025-06-27

### Changed
- Improved run script visibility
- Improved indentation in session list for better visual hierarchy
- Updated README with improved documentation

### Fixed
- Enhanced run script process termination to properly kill all child processes
- Reduced excessive logging when writing files for better performance

## [0.1.8] - 2025-06-25

### Added
- Ability to delete session folders for better session management
- Support for Intel Macs (x64 architecture)
- Linux AppImage build support in release process

### Fixed
- Git commit messages now truncate long prompts to prevent excessive commit message lengths
- Claude executable path override now properly uses the actual shell environment
- Various cleanup and stability improvements

## [0.1.7] - 2025-06-25

### Added
- Monaco-based file editor
- Support for subfolders in session organization

### Changed
- Improved terminal experience
- Enhanced visibility of "New Session" button for better user experience
- Sessions now default to 'Output' tab when switching between them

### Fixed
- Fixed output panel reload issue after git rebase operations
- Resolved diff panel unnecessary refreshes when making changes
- Fixed tab z-index layering issues
- Automatic process termination when removing projects to prevent orphaned processes

## [0.1.6] - 2025-06-24

### Fixed
- Resolved diff viewer scrollbar issues by simplifying CSS overflow handling
- Updated @anthropic-ai/claude-code package to version 1.0.33 to address security vulnerability

## [0.1.5] - 2025-06-19

### Added
- Toggle Auto-commit feature
- Editable diff viewer using Monaco Editor - make changes directly in the diff view with auto-save functionality
- Commit dialog - commit edited files directly from the diff viewer with a custom commit message

### Fixed
- Added Linux support for Claude Code process spawning
- Fixed diff viewer to properly display uncommitted changes
- Resolved performance issues with diff screen re-rendering

## [0.1.4] - 2025-06-18

### Added

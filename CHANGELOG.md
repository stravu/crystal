
All notable changes to Crystal will be documented in this file.

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

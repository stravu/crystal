import { X, GitBranch, Terminal, Folder, Zap, MessageSquare, Settings, Bell, History } from 'lucide-react';

interface HelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Help({ isOpen, onClose }: HelpProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Crystal Help</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-8">
            {/* Quick Start */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <Zap className="h-5 w-5 mr-2" />
                Quick Start
              </h3>
              <div className="space-y-3 text-gray-700 dark:text-gray-300">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="font-medium text-blue-900 dark:text-blue-200 mb-2">Prerequisites</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Claude Code must be installed with credentials configured</li>
                    <li>We recommend using a MAX plan for best performance</li>
                    <li>Crystal runs Claude Code with <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">--dangerously-ignore-permissions</code></li>
                  </ul>
                </div>
                
                <div>
                  <p className="font-medium mb-2">Getting Started:</p>
                  <ol className="list-decimal list-inside space-y-2">
                    <li><strong>Create or select a project:</strong>
                      <ul className="list-disc list-inside ml-4 mt-1 text-sm">
                        <li>Point to a new directory - Crystal will create it and initialize git</li>
                        <li>Or select an existing git repository</li>
                      </ul>
                    </li>
                    <li><strong>Create sessions:</strong>
                      <ul className="list-disc list-inside ml-4 mt-1 text-sm">
                        <li>Enter a prompt describing what you want Claude to do</li>
                        <li>Create multiple sessions with different prompts to explore various approaches</li>
                        <li>Or run the same prompt multiple times to choose the best result</li>
                      </ul>
                    </li>
                    <li><strong>Work with results:</strong>
                      <ul className="list-disc list-inside ml-4 mt-1 text-sm">
                        <li>View changes in the Changes tab</li>
                        <li>Continue conversations to refine the solution</li>
                        <li>Rebase back to your main branch when done</li>
                      </ul>
                    </li>
                  </ol>
                </div>
              </div>
            </section>

            {/* Session Management */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <Terminal className="h-5 w-5 mr-2" />
                Session Management
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Creating Sessions</h4>
                  <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1 space-y-1">
                    <li>Enter a prompt describing what you want Claude to do</li>
                    <li>Optionally specify a worktree name template</li>
                    <li>Create multiple sessions at once with the count field</li>
                    <li>Each session gets its own git worktree branch</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Session States</h4>
                  <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1 space-y-1">
                    <li><span className="text-yellow-600">Initializing</span> - Setting up git worktree</li>
                    <li><span className="text-blue-600">Running</span> - Claude is processing</li>
                    <li><span className="text-green-600">Waiting</span> - Waiting for your input</li>
                    <li><span className="text-gray-600">Stopped</span> - Session completed or stopped</li>
                    <li><span className="text-red-600">Error</span> - Something went wrong</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Continuing Conversations</h4>
                  <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1 space-y-1">
                    <li>Click on a stopped session to resume it</li>
                    <li>Use <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm">Cmd/Ctrl + Enter</kbd> to send input</li>
                    <li>Full conversation history is preserved</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Git Integration */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <GitBranch className="h-5 w-5 mr-2" />
                Git Worktree Integration
              </h3>
              <div className="space-y-3">
                <p className="text-gray-700 dark:text-gray-300">
                  Each session operates in its own git worktree, allowing parallel development without conflicts.
                </p>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Git Operations</h4>
                  <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1 space-y-1">
                    <li><strong>Rebase from main</strong> - Pull latest changes from main branch</li>
                    <li><strong>Squash and rebase to main</strong> - Combine commits and rebase onto main</li>
                    <li>View diffs in the Changes tab</li>
                    <li>Track changes per execution</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* View Tabs */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <MessageSquare className="h-5 w-5 mr-2" />
                View Tabs
              </h3>
              <div className="space-y-2">
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Output</h4>
                  <p className="text-gray-700 dark:text-gray-300">Formatted terminal output with syntax highlighting</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Messages</h4>
                  <p className="text-gray-700 dark:text-gray-300">Raw JSON messages for debugging</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Changes</h4>
                  <p className="text-gray-700 dark:text-gray-300">Git diffs showing all file changes</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Terminal</h4>
                  <p className="text-gray-700 dark:text-gray-300">Run project scripts (tests, builds, etc.)</p>
                </div>
              </div>
            </section>

            {/* Project Management */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <Folder className="h-5 w-5 mr-2" />
                Project Management
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Project Settings</h4>
                  <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1 space-y-1">
                    <li>Custom system prompts per project</li>
                    <li>Run scripts for testing/building</li>
                    <li>Main branch configuration</li>
                    <li>Auto-creates directories and initializes git if needed</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Prompts Tab */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <History className="h-5 w-5 mr-2" />
                Prompts History
              </h3>
              <div className="space-y-2 text-gray-700 dark:text-gray-300">
                <p>Access all prompts from the Prompts tab in the sidebar:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Search through all prompts and session names</li>
                  <li>Click "Use" to create a new session with that prompt</li>
                  <li>Click "Copy" to copy prompt to clipboard</li>
                  <li>Navigate to specific prompts within sessions</li>
                </ul>
              </div>
            </section>

            {/* Settings */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Settings
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200">Global Settings</h4>
                  <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1 space-y-1">
                    <li>Verbose logging for debugging</li>
                    <li>Anthropic API key for AI features</li>
                    <li>Global system prompt additions</li>
                    <li>Custom Claude executable path</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-gray-800 dark:text-gray-200 flex items-center">
                    <Bell className="h-4 w-4 mr-1" />
                    Notifications
                  </h4>
                  <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 mt-1 space-y-1">
                    <li>Desktop notifications for status changes</li>
                    <li>Sound alerts when sessions need input</li>
                    <li>Customizable notification triggers</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Keyboard Shortcuts */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Keyboard Shortcuts
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700 dark:text-gray-300">Send Input / Continue Conversation</span>
                  <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-sm">Cmd/Ctrl + Enter</kbd>
                </div>
              </div>
            </section>

            {/* Tips */}
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Tips & Tricks
              </h3>
              <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-2">
                <li>Run multiple sessions with different approaches to compare results</li>
                <li>Use descriptive worktree names to organize your experiments</li>
                <li>Check the Changes tab to review what Claude modified</li>
                <li>Use the Terminal tab to run tests after Claude makes changes</li>
                <li>Archive sessions you no longer need to keep your list clean</li>
                <li>Set up project-specific system prompts for consistent behavior</li>
                <li>Enable notifications to know when Claude needs your input</li>
              </ul>
            </section>
          </div>
        </div>
        
        <div className="p-4 border-t dark:border-gray-700 text-center text-sm text-gray-600 dark:text-gray-400">
          Crystal - Manage multiple Claude Code instances with git worktrees
        </div>
      </div>
    </div>
  );
}
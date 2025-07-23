import { GitBranch, Terminal, Folder, Zap, MessageSquare, Settings, Bell, History } from 'lucide-react';
import { Modal, ModalHeader, ModalBody } from './ui/Modal';

interface HelpProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Help({ isOpen, onClose }: HelpProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" showCloseButton={false}>
      <ModalHeader>Crystal Help</ModalHeader>
      <ModalBody>
        <div className="space-y-8">
            {/* Quick Start */}
            <section>
              <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center">
                <Zap className="h-5 w-5 mr-2" />
                Quick Start
              </h3>
              <div className="space-y-3 text-text-secondary">
                <div className="bg-interactive/10 border border-interactive/30 rounded-lg p-3">
                  <p className="font-medium text-interactive mb-2">Prerequisites</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Claude Code must be installed with credentials configured</li>
                    <li>We recommend using a MAX plan for best performance</li>
                    <li>Crystal runs Claude Code with <code className="bg-surface-tertiary px-1 rounded">--dangerously-ignore-permissions</code></li>
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
                        <li>View changes in the View Diff tab</li>
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
              <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center">
                <Terminal className="h-5 w-5 mr-2" />
                Session Management
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-text-primary">Creating Sessions</h4>
                  <ul className="list-disc list-inside text-text-secondary mt-1 space-y-1">
                    <li>Enter a prompt describing what you want Claude to do</li>
                    <li>Optionally specify a worktree name template</li>
                    <li>Create multiple sessions at once with the count field</li>
                    <li>Each session gets its own git worktree branch</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary">Session States</h4>
                  <ul className="list-disc list-inside text-text-secondary mt-1 space-y-1">
                    <li><span className="text-status-warning">Initializing</span> - Setting up git worktree</li>
                    <li><span className="text-interactive">Running</span> - Claude is processing</li>
                    <li><span className="text-status-success">Waiting</span> - Waiting for your input</li>
                    <li><span className="text-text-tertiary">Stopped</span> - Session completed or stopped</li>
                    <li><span className="text-status-error">Error</span> - Something went wrong</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary">Continuing Conversations</h4>
                  <ul className="list-disc list-inside text-text-secondary mt-1 space-y-1">
                    <li>Click on a stopped session to resume it</li>
                    <li>Use <kbd className="px-2 py-1 bg-surface-tertiary rounded text-sm">Cmd/Ctrl + Enter</kbd> to send input</li>
                    <li>Full conversation history is preserved</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Git Integration */}
            <section>
              <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center">
                <GitBranch className="h-5 w-5 mr-2" />
                Git Worktree Integration
              </h3>
              <div className="space-y-3">
                <p className="text-text-secondary">
                  Each session operates in its own git worktree, allowing parallel development without conflicts.
                </p>
                <div>
                  <h4 className="font-medium text-text-primary">Git Operations</h4>
                  <ul className="list-disc list-inside text-text-secondary mt-1 space-y-1">
                    <li><strong>Rebase from main</strong> - Pull latest changes from main branch</li>
                    <li><strong>Squash and rebase to main</strong> - Combine commits and rebase onto main</li>
                    <li>View diffs in the View Diff tab</li>
                    <li>Track changes per execution</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* View Tabs */}
            <section>
              <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center">
                <MessageSquare className="h-5 w-5 mr-2" />
                View Tabs
              </h3>
              <div className="space-y-2">
                <div>
                  <h4 className="font-medium text-text-primary">Output</h4>
                  <p className="text-text-secondary">Formatted terminal output with syntax highlighting</p>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary">Messages</h4>
                  <p className="text-text-secondary">Raw JSON messages for debugging</p>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary">View Diff</h4>
                  <p className="text-text-secondary">Git diffs showing all file changes</p>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary">Terminal</h4>
                  <p className="text-text-secondary">Run project scripts (tests, builds, etc.)</p>
                </div>
              </div>
            </section>

            {/* Project Management */}
            <section>
              <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center">
                <Folder className="h-5 w-5 mr-2" />
                Project Management
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-text-primary">Project Settings</h4>
                  <ul className="list-disc list-inside text-text-secondary mt-1 space-y-1">
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
              <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center">
                <History className="h-5 w-5 mr-2" />
                Prompts History
              </h3>
              <div className="space-y-2 text-text-secondary">
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
              <h3 className="text-lg font-semibold text-text-primary mb-3 flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Settings
              </h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-text-primary">Global Settings</h4>
                  <ul className="list-disc list-inside text-text-secondary mt-1 space-y-1">
                    <li>Verbose logging for debugging</li>
                    <li>Anthropic API key for AI features</li>
                    <li>Global system prompt additions</li>
                    <li>Custom Claude executable path</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-text-primary flex items-center">
                    <Bell className="h-4 w-4 mr-1" />
                    Notifications
                  </h4>
                  <ul className="list-disc list-inside text-text-secondary mt-1 space-y-1">
                    <li>Desktop notifications for status changes</li>
                    <li>Sound alerts when sessions need input</li>
                    <li>Customizable notification triggers</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Keyboard Shortcuts */}
            <section>
              <h3 className="text-lg font-semibold text-text-primary mb-3">
                Keyboard Shortcuts
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Send Input / Continue Conversation</span>
                  <kbd className="px-2 py-1 bg-surface-tertiary rounded text-sm">Cmd/Ctrl + Enter</kbd>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Open Prompt History</span>
                  <kbd className="px-2 py-1 bg-surface-tertiary rounded text-sm">Cmd/Ctrl + P</kbd>
                </div>
              </div>
            </section>

            {/* Tips */}
            <section>
              <h3 className="text-lg font-semibold text-text-primary mb-3">
                Tips & Tricks
              </h3>
              <ul className="list-disc list-inside text-text-secondary space-y-2">
                <li>Run multiple sessions with different approaches to compare results</li>
                <li>Use descriptive worktree names to organize your experiments</li>
                <li>Check the View Diff tab to review what Claude modified</li>
                <li>Use the Terminal tab to run tests after Claude makes changes</li>
                <li>Archive sessions you no longer need to keep your list clean</li>
                <li>Set up project-specific system prompts for consistent behavior</li>
                <li>Enable notifications to know when Claude needs your input</li>
              </ul>
            </section>
          </div>
      </ModalBody>
      
      <div className="p-4 border-t border-border-primary text-center text-sm text-text-muted">
        Crystal - Manage multiple Claude Code instances with git worktrees
      </div>
    </Modal>
  );
}